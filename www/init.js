let currentNode;
let currentConnectionName = "C";
let currentDBName = "T";
let titleRegex = /(.+)\((\d+)\)/;
let tableMap = {};
let menuNodeMap = {};

function layouts() {
    layui.use(['element', 'tree'], function () {
        var element = layui.element
            , $ = layui.jquery
            , tree = layui.tree;

        var inst1 = null;

        async function getMenuTreeData() {
            let connections = await LoadConnections();
            if (connections.length < 1) {
                return null;
            }
            connections = JSON.parse(connections);
            return connections;
        }

        function buildTreeNode(params, parent) {
            let name = params["name"];
            let parentName = parent ? parent : params["group"];
            if (parent) {
                params["title"] = `<i class="${parent}"></i>${name}`;
                params["pn"] = parentName;
                params["type"] = parentName;
            } else if (!name && parentName) {
                params["title"] = `<i class="db"></i>${parentName}`;
                params["type"] = "group";
                params["pn"] = "";
            } else {
                params["title"] = `<i class="connection"></i>${name}`;
                params["type"] = "connection";
                params["pn"] = parentName;
            }
            params["id"] = generateUUID();
            menuNodeMap[name] = params.id;
            return params
        }

        function getChildren(treeMap, groupName) {
            let sbl = [];
            let nodes = treeMap[groupName];
            if (!nodes) {
                return sbl;
            }
            nodes.forEach(element => {
                let title = element["title"];
                element["children"] = getChildren(treeMap, title);
                sbl.push(element);
            });
            return sbl;
        }

        function formatMenuData(menuData) {
            if (!menuData) {
                return;
            }
            let treeNodes = [];
            let treeMap = {};
            if (menuData.constructor === Array) {
                menuData.forEach(element => {
                    let treeNode = buildTreeNode(element);
                    let parentList = treeMap[treeNode["pn"]];
                    if (!parentList) {
                        parentList = [];
                        treeMap[treeNode["pn"]] = parentList;
                    }
                    parentList.push(treeNode);
                });
                treeNodes = getChildren(treeMap, "");
            }
            return treeNodes;
        }

        function filterConnections(source, receive) {
            source.forEach(x => {
                if (x.type === "connection") {
                    receive.push(x);
                } else {
                    let children = x.children;
                    if (children && children.length > 0) {
                        filterConnections(children, receive);
                    }
                }
            });
        }

        function setConnectionId(data, connectionId) {
            data.forEach(element => {
                element["ccid"] = connectionId;
            })
        }

        function remartTree(id, data) {
            let rerender = false;
            let preData = inst1.config.data;
            if (!preData) {
                preData = [];
            } else {
                let allConnections = [];
                filterConnections(preData, allConnections);
                allConnections.forEach(connection => {
                    if (connection.id !== id) {
                        let children = connection.children;
                        if (children) {
                            children.forEach(database => {
                                if (database.id !== id) {
                                    return true;
                                }
                                database["spread"] = true;
                                setConnectionId(data, connection.id);
                                database["children"] = data; // table
                                rerender = true;
                                return false;
                            });
                        }
                        return true;
                    }
                    connection["spread"] = true;
                    setConnectionId(data, connection.id);
                    connection["children"] = data; // database
                    rerender = true;
                    return false;
                });
            }

            if (rerender) {
                renderTree(preData);
            } else {
                tree.reload('menu_tree', preData);
            }

        }

        function renderTree(data) {
            inst1 = tree.render({
                elem: '#menu_tree'  //绑定元素
                , id: 'menu_tree'
                , edit: ['add', 'update', 'del'] // 操作节点
                , touchOpen: function (obj) {
                    // 展开状态：open、close、normal处理
                    let node_data = obj.data;
                    let status = obj.state;
                    if (status === "close") {
                        node_data.spread = false;
                    } else if (status === "open") {
                        node_data.spread = true;
                    }
                }
                , click: async function (obj) {
                    let node_data = obj.data;
                    cacheCurrentNodeData(node_data);
                    // 展开状态：open、close、normal处理
                    let status = obj.state;
                    if (status === "close") {
                        return
                    }

                    let data_type = node_data.type;
                    let current_elem = $(obj.elem.find(".layui-tree-txt")[0]);
                    let old_children = current_elem.html();
                    if (["connection", "db"].indexOf(data_type) > -1) {
                        current_elem.append('<i class="waiting"></i>');
                    }

                    obj.elem.attr("disabled", "disabled");
                    if (data_type === "connection") {
                        currentConnectionName = node_data.name
                        let newData = await ShowDatabases(node_data);
                        current_elem.empty().append(old_children);
                        obj.elem.removeAttr("disabled");
                        if (!newData) {
                            return
                        }
                        newData = JSON.parse(newData);
                        newNodes = [];
                        newData.forEach(element => {
                            let treeNode = buildTreeNode(element, "db");
                            newNodes.push(treeNode);
                        });
                        remartTree(node_data.id, newNodes);
                    } else if (data_type === "db") {
                        let newData = await ShowTables(node_data.ccid, node_data.name);
                        current_elem.empty().append(old_children);
                        obj.elem.removeAttr("disabled");
                        if (!newData) {
                            return
                        }
                        newData = JSON.parse(newData);
                        newNodes = [];
                        newData.forEach(element => {
                            let treeNode = buildTreeNode(element, "table");
                            newNodes.push(treeNode);
                        });
                        remartTree(node_data.id, newNodes);
                    }
                }
                , data: data
                , operate: function (obj) {
                    var type = obj.type; //得到操作类型：add、edit、del
                    var data = obj.data; //得到当前节点的数据
                    var elem = obj.elem; //得到当前节点元素

                    //Ajax 操作
                    var id = data.id; //得到节点索引
                    if (type === 'add') { //增加节点
                        //返回 key 值
                        $(id).remove();
                        return false;
                    } else if (type === 'update') { //修改节点
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
                                iframeWin.initFormData(data);
                            }
                        });
                    } else if (type === 'del') { //删除节点
                        let node_type = data.type;
                        if (node_type === "connection") {//删除连接
                            RemoveConnection(data);
                        } else if (node_type === "db") {//删除数据库

                        } else if (node_type === "table") {//删除表

                        } else if (node_type === "group") {// 删除分组

                        }
                    }
                }
            });
        }

        function initMenuTree(menudata) {
            let data = formatMenuData(menudata);
            renderTree(data);
        }

        function loadsMenuTree() {
            getMenuTreeData().then(initMenuTree);
        }

        loadsMenuTree();
        $("#loadsMenuTree").on("click", function () {
            loadsMenuTree();
        });
    });
}

function cacheCurrentNodeData(nodeData) {
    currentNode = nodeData;
    if (nodeData.type === "db") {
        currentDBName = nodeData.name
    }
}

function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxxxxxxxxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
}

