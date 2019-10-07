if (document.readyState === 'loading') {
    document.onkeydown = async function () {
        var oEvent = window.event;
        if (oEvent.ctrlKey && oEvent.keyCode == 120) {
            // "ctrl + F9"
            runSelectedQuery();
        } else if (oEvent.keyCode == 120) {
            // "F9"
            await runCurrentQuery();
        }
    }
}