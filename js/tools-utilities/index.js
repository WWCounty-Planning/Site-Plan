// js/tools-utilities/index.js
// Utilities coordinator and sidebar mount.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-utilities/index.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(() => {
    const US = window.SitePlanUtilitiesShared || {};
    const section = document.getElementById('tools-utilities');
    if (!section) {
      console.warn('[tools-utilities] Sidebar section #tools-utilities not found.');
      return;
    }

    function mountRegisteredTools() {
      const tools = US && typeof US.getTools === 'function'
        ? US.getTools()
        : [window.SitePlanWaterLineTool].filter(Boolean);

      tools.forEach(tool => {
        const elements = US && typeof US.getToolElements === 'function'
          ? US.getToolElements(tool)
          : (typeof tool.buildButton === 'function' ? [tool.buildButton()].filter(Boolean) : []);

        elements.forEach(node => {
          if (node && node.parentNode !== section) section.appendChild(node);
        });

        if (typeof tool.wireControls === 'function' && !tool.__utilitiesControlsWired) {
          tool.wireControls();
          tool.__utilitiesControlsWired = true;
        }
      });
    }

    mountRegisteredTools();

    window.SitePlanUtilities = Object.assign({}, window.SitePlanUtilities || {}, {
      mountRegisteredTools
    });
  }).catch(err => {
    console.error('[tools-utilities] Failed to initialize after runtime ready:', err);
  });
})();
