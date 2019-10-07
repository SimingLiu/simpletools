function hasTab(name) {
    let has = false;
    let tester = RegExp(`^${name}\\W?$`)
    let x = document.querySelectorAll("#tab-titles li");
    let xl = x.length;
    for (let i = 0; i < xl; i++) {
        let element = x[i];
        let title = element.innerText;
        if (tester.test(title)) {
            has = true;
            break;
        }
    }
    return has;
}

function initTableInCurentTab(tid) {
    let tableId = tid.replace(".", "");
    layui.use(['element', 'table'], function () {
        let $ = layui.jquery
            , table = layui.table;
        let layBodyHeight = $(".layui-body")[0].clientHeight;
        let layTabHeight = $(".layui-tab-title")[0].clientHeight;
        let contentHeight = layBodyHeight - layTabHeight - 43;
        let container = $(".container");
        container.css("height", `${contentHeight}px`);
        let tableContainer = $("#tab-content .layui-show .table-container")[0];
        tableContainer.innerHTML = `<table id="${tableId}" lay-filter="${tableId}"  class="ctable"></table>`;
        let newTable = table.render({
            elem: `#${tableId}`
            , data: [{ id: 1, name: "no data" }]
            , toolbar: true //开启头部工具栏
            , defaultToolbar: ['filter', 'exports']
            , cols: [[{ field: 'id', title: '序号' },
            { field: 'name', title: '内容' }]]
            , page: true
            , limit:30
        });
        tableMap[tableId] = newTable;
    });
}

function getDefaultTableContent(tableId) {
    return {
        elem: `#${tableId}`
        , data: [{ id: 1, name: "no data" }]
        , toolbar: true //开启头部工具栏
        , defaultToolbar: ['filter', 'exports']
        , cols: [[{ field: 'id', title: '序号' },
        { field: 'name', title: '内容' }]]
        , page: true
        , limit:30
    }
}

function getCurrentTableId() {
    let tid = "";
    let currentTable = document.querySelectorAll("#tab-content .layui-show .ctable")[0];
    if (currentTable) {
        tid = currentTable.id;
    }
    return tid;
}

function reheightTable(height, width) {
    let tid = getCurrentTableId();
    if (tid === "") {
        return;
    }
    
    let tableView = document.querySelectorAll(`div[lay-id='${tid}']`);
    if (tableView) {
        tableView = tableView[0];
        tableView.style.height = `${height}px`;
        tableView.style.width = `${width-25}px`;
    }
    let currentTable = tableMap[tid];
    currentTable.config.height = height;
    if (width) {
        currentTable.config.width = width;
    }
    currentTable.resize();
}
