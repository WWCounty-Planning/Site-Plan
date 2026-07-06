// Individual draw modules register their own buttons/control rows.

(function () {
  const DS = window.SitePlanDrawShared;

  if (!DS) {
    console.error('[tools-draw/index] SitePlanDrawShared is missing. Make sure js/tools-draw/draw-shared.js loads first.');
    return;
  }

  function orderedCoreElements() {
    return DS.getTools().flatMap(tool => {
      if (!tool) return [];
      if (typeof DS.getToolElements === 'function') return DS.getToolElements(tool);
      if (tool.button) return [tool.button];
      if (typeof tool.buildButton === 'function') return [tool.buildButton()].filter(Boolean);
      return [];
    }).filter(Boolean);
  }

  function mountRegisteredTools() {
    const section = DS.sectionEl && DS.sectionEl();
    if (!section) return;

    const seen = new Set();
    orderedCoreElements().forEach(el => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      if (el.parentNode !== section) section.appendChild(el);
      else section.appendChild(el);
    });

    DS.getTools().forEach(tool => {
      if (tool && typeof tool.wireControls === 'function') tool.wireControls();
    });
  }

  function exposeApi(RT) {
    mountRegisteredTools();
    window.SitePlanDrawTools = Object.assign({}, window.SitePlanDrawTools || {}, {
      shared: DS,
      runtime: RT || null,
      getTool: DS.getTool,
      getTools: DS.getTools,
      registerTool: DS.registerTool,
      cancelAllExcept: DS.cancelAllExcept,
      clearActiveAllExcept: DS.clearActiveAllExcept,
      mountRegisteredTools,
      reorderCoreDrawControls: mountRegisteredTools
    });
  }

  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-draw/index] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads before Draw Tools.');
    exposeApi(null);
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    if (!DS.sectionEl()) {
      console.warn('[tools-draw/index] Sidebar section #tools-draw not found.');
    }
    exposeApi(RT);
  }).catch(err => {
    console.error('[tools-draw/index] Failed to initialize after runtime ready:', err);
    exposeApi(null);
  });
})();
