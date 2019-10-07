function resizeEditor(eid) {
    if (!eid) {
        return
    }
    let eHeight = document.getElementById(eid).parentNode.clientHeight;
    document.getElementById(eid).style.height = `${eHeight - 8}px`;
    let thisEditor = ace.edit(eid);
    thisEditor.resize();
    thisEditor.focus();
}

function focusEditor() {
    let eid = getCurrentEditorId();
    if (!eid) {
        return
    }
    let thisEditor = ace.edit(eid);
    thisEditor.focus();
}

function getCurrentEditorId() {
    let ceid = "";
    let currentEditor = document.querySelectorAll("#tab-content .layui-show .editor")[0];
    if (currentEditor) {
        ceid = currentEditor.id;
    }
    return ceid;
}

function initEditorInCurentTab(editorId) {
    let layBodyHeight = document.querySelectorAll(".layui-body")[0].clientHeight;
    let layTabHeight = document.querySelectorAll(".layui-tab-title")[0].clientHeight;
    let contentHeight = layBodyHeight - layTabHeight - 43;
    let container = document.querySelectorAll("#tab-content .layui-show .container")[0];
    container.style.height = `${contentHeight}px`;
    let editorContainer = document.querySelectorAll("#tab-content .layui-show .editor-container")[0];
    editorContainer.innerHTML = `<div id="${editorId}" class="editor"></div>`;
    let neweditor = ace.edit(editorId);
    neweditor.setTheme("ace/theme/monokai");
    neweditor.session.setUseSoftTabs(true);
    neweditor.setShowPrintMargin(false);
    resizeEditor(editorId);
}

async function runCurrentQuery() {
    let eid = getCurrentEditorId();
    if (!eid) {
        return
    }
    let thisEditor = ace.edit(eid);
    if (!thisEditor.isFocused()) {
        thisEditor.focus();
    }
    let position = thisEditor.getCursorPosition();
    let currentLine = position.row;
    let thisSession = thisEditor.getSession();
    let query = thisSession.getLine(currentLine).trim();
    let cnid = getConnectionIdByTab()
        , dbName = getCurrentTabDBName();
    if (!cnid) {
        return
    }
    let tableId = getCurrentTableId();
    if (!tableId) {
        return
    }
    let results = []
    if (query.match(/^(select|insert)/i)) {
        results = await ExecQuery(cnid, query, dbName);
    } else {
        results = await ExecCommand(cnid, query);
    }
    layoutData(tableId, results);
}

function runSelectedQuery() {
    let eid = getCurrentEditorId();
    if (!eid) {
        return
    }
    let thisEditor = ace.edit(eid);
    if (!thisEditor.isFocused()) {
        thisEditor.focus();
    }
    let querys = thisEditor.getSelectedText();
    let cnid = getConnectionIdByTab()
        , dbName = getCurrentTabDBName();
    if (!cnid) {
        return
    }
    ExecQuerys(cnid, querys, dbName);;
}

function layoutData(tableId, results) {
    let config = getDefaultTableContent(tableId);
    if (results && results.length > 0) {
        if (hasError(results[0])) {
            return;
        }
        let headers = Object.keys(results[0]);
        let cols = [];
        headers.forEach(x => {
            if (x === "time") {
                cols.unshift({ field: x, title: x, sort: true, fixed: "left" });
            } else {
                let hide = x.length === 1 ? true : false;
                cols.push({ field: x, title: x, sort: true, hide: hide });
            }
        });
        config.cols = [cols];
        config.data = results;
    }


    let tHeight = document.getElementById(tableId).parentNode.clientHeight;
    let tWidth = document.getElementById(tableId).parentNode.clientWidth;
    config.height = tHeight;
    config.width = tWidth;
    layui.use(['element', 'table'], function () {
        let table = layui.table;
        let newTable = table.render(config);
        tableMap[tableId] = newTable;
    });
}

function hasError(result) {
    let keys = Object.keys(result);
    if (keys.length === 1 && keys[0] === "err") {
        let msg = result.err;
        if (msg.constructor === Object) {
            mgs = JSON.stringify(msg);
        }
        layui.use('layer', function () {
            let layer = layui.layer;
            layer.open({
                title: false
                , content: msg
                , shade: 0
                , btnAlign: 'c'
            });
        });
        return true;
    }
    return false;
}

function getConnectionIdByTab() {
    let title = getCurrentTabTitle();
    if (!title) {
        return
    }
    let cnid = menuNodeMap[title];
    return cnid;
}