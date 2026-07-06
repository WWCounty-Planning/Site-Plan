// Test hole point marker tool — uses js/utils/point-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/test-hole] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};

    const TOOL_TYPE          = 'testHole';
    const BUTTON_ID          = 'btn-test-hole';
    const COORD_CHECKBOX_ID  = 'chk-test-hole-place-coordinates';
    const COORD_X_ID         = 'test-hole-coordinate-x';
    const COORD_Y_ID         = 'test-hole-coordinate-y';

    const MIN_MARKER_SIZE    = 8;
    const DEFAULT_MARKER_SIZE = 10;
    const MAX_MARKER_SIZE    = 16;

    const TOOL_CAPABILITIES = {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const TEST_HOLE_COORDINATE_ROW = {
      checkboxId:        COORD_CHECKBOX_ID,
      xId:               COORD_X_ID,
      yId:               COORD_Y_ID,
      checkboxLabelHtml: 'Place by<br>coordinates',
      xPlaceholder:      'X, Long',
      yPlaceholder:      'Y, Lat',
      xAriaLabel:        'Test hole X or longitude coordinate',
      yAriaLabel:        'Test hole Y or latitude coordinate',
      rowClassName:      'size-row coordinate-placement-row test-hole-coordinate-row'
    };

    const testHoleSvg =
      '<svg viewBox="0 0 32 32" width="24" height="24" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="16" cy="16" r="14" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="3, 3" fill="none"/>' +
        '<line x1="16" y1="8" x2="16" y2="24" stroke="#111111" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="8" y1="16" x2="24" y2="16" stroke="#111111" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="16" cy="16" r="3.5" fill="#FFFFFF" stroke="#111111" stroke-width="2.5"/>' +
      '</svg>';

    function svgDataUrl(svg) {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }
    const testHoleSvgUrl = svgDataUrl(testHoleSvg);

    // ── Zoom-responsive symbol ────────────────────────────────────────────
    function markerSize() {
      const zoom = RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom != null) {
        return Math.max(MIN_MARKER_SIZE, Math.min(MAX_MARKER_SIZE,
          Math.round(DEFAULT_MARKER_SIZE + (zoom - 18) * 1.2)));
      }
      const scale = RT.view && Number.isFinite(RT.view.scale) ? RT.view.scale : null;
      if (!scale || scale <= 0) return DEFAULT_MARKER_SIZE;
      const lowScale = 18056, midScale = 4514, highScale = 1128;
      if (scale >= lowScale) return MIN_MARKER_SIZE;
      if (scale <= highScale) return MAX_MARKER_SIZE;
      if (scale >= midScale) {
        const t = (lowScale - scale) / (lowScale - midScale);
        return Math.round(MIN_MARKER_SIZE + t * (DEFAULT_MARKER_SIZE - MIN_MARKER_SIZE));
      }
      const t = (midScale - scale) / (midScale - highScale);
      return Math.round(DEFAULT_MARKER_SIZE + t * (MAX_MARKER_SIZE - DEFAULT_MARKER_SIZE));
    }

    function testHoleSymbol() {
      const size = markerSize();
      return { type: 'picture-marker', url: testHoleSvgUrl, width: size, height: size };
    }

    // ── Coordinate placement ──────────────────────────────────────────────
    // ── Create via factory ────────────────────────────────────────────────
    const testHoleTool = window.SitePlanPointTool.create({
      RT,
      toolId:           TOOL_TYPE,
      buttonId:         BUTTON_ID,
      category:         'well-septic',
      label:            'Test hole',
      idPrefix:         'testhole',
      logPrefix:        '[tools-well-septic/test-hole]',
      toolCapabilities: TOOL_CAPABILITIES,
      symbol:           testHoleSymbol,
      refreshSymbolOnZoom: true,
      coordinateRow: TEST_HOLE_COORDINATE_ROW,
      onAnnounce:  function () { WS.announceToolActivated(TOOL_TYPE); },
      iconHtml:    '<span class="tool-icon">' + testHoleSvg + '</span>',
      buttonTitle: 'Place a test hole',
      order:       15
    });

    window.startTestHoleTool = testHoleTool.start;

    window.SitePlanTestHoleTool = Object.assign({}, window.SitePlanTestHoleTool || {}, testHoleTool);

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanTestHoleTool);
    } else {
      console.warn('[tools-well-septic/test-hole] Well & Septic registry unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/test-hole] Failed to initialize after runtime ready:', err);
  });
}());
