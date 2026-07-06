// Utility pole point marker tool — uses js/utils/point-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/utility-pole] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-utilities/utilities-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const US = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};

    const TOOL_ID    = 'utilityPole';
    const BUTTON_ID  = 'btn-utility-pole';
    const MARKER_COLOR = '#3F3F46';

    const TOOL_CAPABILITIES = {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const utilityPoleSvg =
      '<svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<circle cx="20" cy="20" r="7.5" fill="#fff" stroke="' + MARKER_COLOR + '" stroke-width="2.6"/>' +
        '<path d="M5.5 20 H34.5" fill="none" stroke="' + MARKER_COLOR + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '</svg>';

    const utilityPoleSvgUrl = US.svgDataUrl(utilityPoleSvg);

    function symbol() {
      const size = US.markerSize();
      return { type: 'picture-marker', url: utilityPoleSvgUrl, width: size, height: size };
    }

    // Utility poles must sit above power/water lines.
    let bringToFrontFrame = null;

    function bringAllToFront() {
      bringToFrontFrame = null;
      if (!RT.drawLayer || !RT.drawLayer.graphics) return;
      RT.drawLayer.graphics.forEach(g => {
        if (utilityPoleTool.isParent(g)) US.bringToFront(g);
      });
    }

    function scheduleBringAllToFront() {
      if (bringToFrontFrame != null) return;
      bringToFrontFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(bringAllToFront)
        : window.setTimeout(bringAllToFront, 16);
    }

    const utilityPoleTool = window.SitePlanPointTool.create({
      RT,
      toolId:           TOOL_ID,
      buttonId:         BUTTON_ID,
      category:         'utilities',
      label:            'Utility pole',
      idPrefix:         'utilitypole',
      logPrefix:        '[tools-utilities/utility-pole]',
      toolCapabilities: TOOL_CAPABILITIES,
      symbol,
      refreshSymbolOnZoom: true,
      onAnnounce: function () { if (US.announceToolActivated) US.announceToolActivated(TOOL_ID); },
      onGraphicCreated: function (graphic) { US.bringToFront(graphic); },
      onGraphicUpdated: function (graphic) { US.bringToFront(graphic); },
      iconHtml:    '<span class="tool-icon" style="color:' + MARKER_COLOR + ';">' + utilityPoleSvg + '</span>',
      buttonTitle: 'Place a utility pole',
      order:       30
    });

    // Bring all poles to front whenever a utility line is added or moved.
    RT.onGraphicCreated(graphic => { if (US.isUtilityLine(graphic)) scheduleBringAllToFront(); });
    RT.onGraphicUpdated(graphic => { if (US.isUtilityLine(graphic)) scheduleBringAllToFront(); });

    window.startUtilityPoleTool = utilityPoleTool.start;
    window.SitePlanUtilityPoleTool = Object.assign({}, window.SitePlanUtilityPoleTool || {}, utilityPoleTool);

    if (typeof US.registerTool === 'function') {
      US.registerTool(window.SitePlanUtilityPoleTool);
    } else {
      console.warn('[tools-utilities/utility-pole] Utilities registry unavailable.');
    }
  }).catch(err => {
    console.error('[tools-utilities/utility-pole] Failed to initialize after runtime ready:', err);
  });
}());
