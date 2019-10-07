function connectionCallback(index, operation, data) {
    layui.use(['element', 'layer'], async function () {
        var $ = layui.jquery
            , layer = layui.layer;

        if (["ok", "test"].indexOf(operation.trim()) !== -1) {
            let connectionInfo = JSON.stringify(data);

            if (operation.trim() === "test") {
                try {
                    var influxdb = await ConnectToInfluxdb(data);
                } catch (error) {
                    layer.msg("golang backend has not connect to front end.");
                    return
                }
                if (!influxdb) {
                    layer.msg("can not connect to server");
                } else if (influxdb.constructor === String) {
                    layer.msg(influxdb);
                }
                let ok = await Ping();
                if (ok) {
                    layer.msg("connected success!");
                } else {
                    layer.msg("connected failed!");
                }
                return
            } else {
                let dbid = await SaveConnection(connectionInfo);
                $("#loadsMenuTree").trigger("click");
            }
        }
        layer.close(index);
    })
}


function visor() {

    /**
     *  function in golang end as following:
     *  ConnectToInfluxdb()
     */
    layui.use(['element', 'tree', 'layer'], function () {
        var element = layui.element
            , tree = layui.tree
            , $ = layui.jquery
            , layer = layui.layer;

        $("#newconnection").on("click", function () {
            let index = layer.open({
                type: 2,
                btnAlign: 'c',
                shade: 0.8,
                title: false,
                area: ['700px;', '550px;'],
                content: 'newConnection.html', //这里content是一个URL，如果你不想让iframe出现滚动条，你还可以content: ['http://sentsin.com', 'no']
                success: function (layero, index) {
                    var iframeWin = window[layero.find('iframe')[0]['name']]; //得到iframe页的窗口对象，执行iframe页的方法：
                    iframeWin.setCallback(connectionCallback, index);
                }
            });
        });

        $("#connection_info").on("click", function () {
            if (!currentNode) {
                layer.msg("please select a connection node!");
                return;
            }
            let nodeType = currentNode["type"];
            if (nodeType !== "connection") {
                layer.msg("you select a connection but not " + nodeType);
                return;
            }
            currentNode["hide"] = true;
            layer.open({
                type: 2,
                btnAlign: 'c',
                shade: 0.8,
                title: false,
                area: ['700px;', '550px;'],
                content: 'newConnection.html', //这里content是一个URL，如果你不想让iframe出现滚动条，你还可以content: ['http://sentsin.com', 'no']
                success: function (layero, index) {
                    var iframeWin = window[layero.find('iframe')[0]['name']]; //得到iframe页的窗口对象，执行iframe页的方法：
                    iframeWin.initFormData(currentNode);
                }
            });
        });

        $("#disconnection").on("click", async function () {
            if (!currentNode) {
                layer.msg("please select a connection node!");
                return;
            }
            let nodeType = currentNode["type"];
            if (nodeType !== "connection") {
                layer.msg("you select a connection but not " + nodeType);
                return;
            }
            let connectId = currentNode["id"];
            await Disconnect(connectId);
        });

        $("#UD").on("click", function () {  // 上下分窗
            let container = $("#tab-content .layui-show .container");
            if (!container) {
                container = $("#tab-content .layui-show .container-ud");
                if (!container) {
                    return;
                }
            }
            let eid = getCurrentEditorId();
            let layBodyHeight = $(".layui-body")[0].clientHeight;
            let layBodyWidth = $(".layui-body")[0].clientWidth;
            let layTabHeight = $(".layui-tab-title")[0].clientHeight;
            let contentHeight = layBodyHeight - layTabHeight - 40;
            reheightTable(20);
            container.css("height", `${contentHeight}px`);
            container.removeClass("container");
            container.addClass("container-ud");
            resizeEditor(eid);
            let eHeight = document.getElementById(eid).parentNode.clientHeight;
            reheightTable(contentHeight - eHeight, layBodyWidth);
            console.log(contentHeight - eHeight, layBodyWidth);
        });

        $("#LR").on("click", function () { // 左右分窗
            let container = $("#tab-content .layui-show .container-ud");
            if (!container) {
                container = $("#tab-content .layui-show .container");
                if (!container) {
                    return;
                }
            }
            let layBodyHeight = $(".layui-body")[0].clientHeight;
            let layBodyWidth = $(".layui-body")[0].clientWidth;
            let layTabHeight = $(".layui-tab-title")[0].clientHeight;
            let contentHeight = layBodyHeight - layTabHeight - 40;
            container.css("height", `${contentHeight}px`);
            container.removeClass("container-ud");
            container.addClass("container");
            let eid = getCurrentEditorId();
            resizeEditor(eid);
            let eWidth = document.getElementById(eid).parentNode.clientWidth;
            reheightTable(contentHeight, layBodyWidth - eWidth - 10);
        });

        $("#taggle_lock").on("click", function () { // 切换标签锁
            let bodyTab = $("#bodyTab");
            let allowClose = bodyTab.attr("lay-allowClose");
            if (allowClose) {
                bodyTab.removeAttr("lay-allowClose");
                $("#tab-titles i").remove();
                $(this).html("&#9711;");
                $(this).attr("title", "解锁标签");
            } else {
                bodyTab.attr("lay-allowClose", "true");
                $(this).html("&#x2B59;");
                $(this).attr("title", "锁定标签");
            }
            element.render("bodyTab");
        });

        $("#console").on("click", function () {  //  控制台
            if (!currentConnectionName) {
                layer.msg("please choose a connection!", { "offset": "lt" });
                return;
            }
            if (!currentDBName) {
                layer.msg("please choose a database!", { "offset": "lt" });
                return;
            }
            let usefullIndex = getMinUseIndex(currentConnectionName);
            let name = `${currentConnectionName}(${usefullIndex})`;
            // 添加tab
            element.tabAdd('bodyTab', {
                title: name
                , content: `<div class="container">
                <div class="editor-container"></div>
                <div class="table-container"></div>
            </div>`
                , id: name
            });
            // 切换到新添加的 tab
            element.tabChange('bodyTab', name);
            initEditorInCurentTab(currentConnectionName + usefullIndex + "-editor");
            initTableInCurentTab(currentConnectionName + usefullIndex + "-table");
            let x = document.querySelectorAll("#tab-titles .layui-this")[0];
            x.setAttribute("db-name", currentDBName);
        });

        document.getElementById("history").addEventListener("click", async function () {  //  请求查询历史
            let name = "console-history";
            if (hasTab(name)) {
                element.tabChange('bodyTab', name);
                await loadsHistory();
                return;
            }
            element.tabAdd('bodyTab', {
                title: name
                , content: `<div class="container" id="history-container">
                <div class="editor-container"></div>
            </div>`
                , id: name
            });
            // 切换到新添加的 tab
            element.tabChange('bodyTab', name);
            initEditorInCurentTab(name + "-editor");
            await loadsHistory();
        });
        element.on('tab(bodyTab)', function (obj) {
            focusEditor();
        });

        $("#run_query").on("click", async function () {
            await runCurrentQuery();
        });
    });
}

function historyFormater(h) {
    let time = h.Time.replace(/[A-Z]/g, ' ');
    let connectionName = h.ConnectionName ? h.ConnectionName : "";
    connectionName = connectionName.padEnd(16);
    let dbName = h.DbName ? h.DbName : "";
    dbName = dbName.padEnd(16);
    let param = h.Param ? h.Param : " ";
    let mark = h.Mark ? h.Mark : " ";
    return time + connectionName + dbName + h.Query + param + mark;
}

async function loadsHistory(params) {
    let allHistory = await ShowHistory(params);
    if (!allHistory) {
        return
    }
    let historEditor = ace.edit("console-history-editor");
    historEditor.setReadOnly(true);
    historEditor.selectAll();
    historEditor.removeLines();
    let value = ""
    allHistory.forEach(h => {
        value += `\n` + historyFormater(h)
    });
    historEditor.setValue(value);
    historEditor.clearSelection();
}

function getMinUseIndex(connectName) {
    let minUseIndex = 1;
    let x = document.querySelectorAll("#tab-titles li");
    let xl = x.length;
    let cache = [];
    for (let i = 0; i < xl; i++) {
        let title = x[i].innerText;
        let exeResult = titleRegex.exec(title);
        if (!exeResult) {
            continue;
        }
        let name = exeResult[1];
        if (name !== connectName) {
            continue;
        }
        let index = parseInt(exeResult[2]);
        cache[index - 1] = true;
    }
    for (let i = 0; i < 100; i++) {
        let has = cache[i];
        if (!has) {
            minUseIndex = i + 1;
            break;
        }
    }
    return minUseIndex;
}

function getCurrentTabTitle() {
    let x = document.querySelectorAll("#tab-titles .layui-this")[0];
    let name = x.getAttribute("lay-id");
    if (!name) {
        return
    }
    let exeResult = /^(.*)\(\d+\)$/.exec(name);
    if (!exeResult) {
        return
    }
    return exeResult[1];
}
function getCurrentTabDBName() {
    let x = document.querySelectorAll("#tab-titles .layui-this")[0];
    let name = x.getAttribute("db-name");
    return name;
}
