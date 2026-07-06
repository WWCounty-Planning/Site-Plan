// Access / Driveway coordinator and sidebar mount.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(() => {
    const AS = window.SitePlanAccessShared || {};
    const section = document.getElementById('tools-access');
    if (!section) {
      console.warn('[tools-access] Sidebar section #tools-access not found.');
      return;
    }

    function mountRegisteredTools() {
      const tools = AS && typeof AS.getTools === 'function'
        ? AS.getTools()
        : [window.SitePlanDrivewayTool].filter(Boolean);

      tools.forEach(tool => {
        const elements = AS && typeof AS.getToolElements === 'function'
          ? AS.getToolElements(tool)
          : (typeof tool.buildButton === 'function' ? [tool.buildButton()].filter(Boolean) : []);

        elements.forEach(node => {
          if (node && node.parentNode !== section) section.appendChild(node);
        });

        if (typeof tool.wireControls === 'function' && !tool.__accessControlsWired) {
          tool.wireControls();
          tool.__accessControlsWired = true;
        }
      });
    }

    mountRegisteredTools();

    window.SitePlanAccess = Object.assign({}, window.SitePlanAccess || {}, {
      mountRegisteredTools
    });
  }).catch(err => {
    console.error('[tools-access] Failed to initialize after runtime ready:', err);
  });
})();
