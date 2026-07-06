// Loaded after structures-shared.js and the individual Structures tool modules.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-structures] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-structures/index.js.');
    return;
  }

  if (!window.SitePlanStructuresShared) {
    console.error('[tools-structures] SitePlanStructuresShared is missing. ' +
      'Make sure js/tools-structures/structures-shared.js is loaded before js/tools-structures/index.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(() => {
    const SS = window.SitePlanStructuresShared;
    const section = document.getElementById('tools-structures');

    function mountRegisteredTools() {
      if (!section) {
        console.warn('[tools-structures] Sidebar section #tools-structures not found.');
        return;
      }

      SS.getTools().forEach(tool => {
        if (!tool) return;
        if (typeof tool.mount === 'function') {
          tool.mount(section);
          return;
        }

        const elements = typeof SS.getToolElements === 'function'
          ? SS.getToolElements(tool)
          : (typeof tool.buildButton === 'function' ? [tool.buildButton()].filter(Boolean) : []);

        elements.forEach(el => {
          if (el && el.parentNode !== section) section.appendChild(el);
        });

        if (typeof tool.wireControls === 'function') tool.wireControls();
      });
    }

    mountRegisteredTools();

    window.SitePlanStructures = {
      shared: SS,
      getTool: typeof SS.getTool === 'function' ? SS.getTool.bind(SS) : function () { return null; },
      getTools: typeof SS.getTools === 'function' ? SS.getTools.bind(SS) : function () { return []; },
      cancelAllExcept: typeof SS.cancelAllExcept === 'function' ? SS.cancelAllExcept.bind(SS) : function () {},
      clearActiveAllExcept: typeof SS.clearActiveAllExcept === 'function' ? SS.clearActiveAllExcept.bind(SS) : function () {},
      mountRegisteredTools
    };
  }).catch(err => {
    console.error('[tools-structures] Failed to initialize Structures coordinator:', err);
  });
})();
