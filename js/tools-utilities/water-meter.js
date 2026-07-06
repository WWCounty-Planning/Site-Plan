// js/tools-utilities/water-meter.js
// Water meter point marker tool — uses js/utils/point-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/water-meter] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-utilities/utilities-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const US = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};

    const TOOL_ID        = 'waterMeter';
    const BUTTON_ID      = 'btn-water-meter';
    const COORD_CHECKBOX_ID = 'chk-water-meter-place-coordinates';
    const COORD_X_ID     = 'water-meter-coordinate-x';
    const COORD_Y_ID     = 'water-meter-coordinate-y';

    const TOOL_CAPABILITIES = {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const COORDINATE_ROW = {
      checkboxId:        COORD_CHECKBOX_ID,
      xId:               COORD_X_ID,
      yId:               COORD_Y_ID,
      checkboxLabelHtml: 'Place by<br>coordinates',
      xPlaceholder:      'X, Long',
      yPlaceholder:      'Y, Lat',
      xAriaLabel:        'Water meter X or longitude coordinate',
      yAriaLabel:        'Water meter Y or latitude coordinate',
      rowClassName:      'size-row coordinate-placement-row water-meter-coordinate-row'
    };

    const waterMeterIconPath =
      'M3 17h4.1q-.425-.425-.787-.925T5.675 15H3zm9 0q2.075 0 3.538-1.463T17 12t-1.463-3.537T12 7T8.463 8.463T7 12t1.463 3.538T12 17m6.325-8H21V7h-4.1q.425.425.788.925T18.325 9M1 20v-8h2v1h2.075q-.05-.25-.062-.488T5 12q0-2.925 2.038-4.962T12 5h9V4h2v8h-2v-1h-2.075q.05.25.063.488T19 12q0 2.925-2.037 4.963T12 19H3v1zm2-3v-2zm18-8V7zm-9 6q-.825 0-1.412-.587T10 13q0-.575.238-1.137t.912-1.613L12 9l.85 1.25q.675 1.05.913 1.613T14 13q0 .825-.587 1.413T12 15';

    const waterMeterGlyph =
      '<svg x="12.4" y="5.4" width="11.2" height="11.2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path fill="#023681" d="' + waterMeterIconPath + '"/>' +
      '</svg>';

    const waterMeterExistingSvg =
      '<svg viewBox="5 3 26 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1"/>' +
        waterMeterGlyph +
      '</svg>';

    const waterMeterProposedSvg =
      '<svg viewBox="5 3 26 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1.2" stroke-linecap="round" pathLength="100" stroke-dasharray="6.5 3.5" transform="rotate(-90 18 11)"/>' +
        waterMeterGlyph +
      '</svg>';

    const waterMeterIcon =
      '<svg viewBox="5 3 26 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1"/>' +
          waterMeterGlyph +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1.2" stroke-linecap="round" pathLength="100" stroke-dasharray="6.5 3.5" transform="rotate(-90 18 11)"/>' +
          waterMeterGlyph +
        '</g>' +
      '</svg>';

    const waterMeterSvgUrl = US.svgDataUrl(waterMeterExistingSvg);
    const waterMeterProposedSvgUrl = US.svgDataUrl(waterMeterProposedSvg);

    const WATER_METER_MIN_MARKER_SIZE = 8;
    const WATER_METER_DEFAULT_MARKER_SIZE = 12;
    const WATER_METER_MAX_MARKER_SIZE = 18;

    function waterMeterMarkerSize() {
      const zoom = RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom == null) return WATER_METER_DEFAULT_MARKER_SIZE;
      return Math.max(WATER_METER_MIN_MARKER_SIZE, Math.min(WATER_METER_MAX_MARKER_SIZE,
        Math.round(WATER_METER_DEFAULT_MARKER_SIZE + (zoom - 18) * 1.2)));
    }

    function waterMeterDrawnMode(graphic) {
      const stamped = graphic && graphic.attributes && graphic.attributes.drawingMode;
      if (stamped === 'existing' || stamped === 'proposed') return stamped;
      return window.SitePlanDrawingMode
        ? window.SitePlanDrawingMode.getDrawingMode('utilities')
        : 'existing';
    }

    function symbol(graphic) {
      const size = waterMeterMarkerSize();
      const url = waterMeterDrawnMode(graphic) === 'proposed' ? waterMeterProposedSvgUrl : waterMeterSvgUrl;
      return { type: 'picture-marker', url, width: size * 1.625, height: size };
    }

    function applyExtraMetadata(graphic) {
      const stamped = graphic && graphic.attributes && graphic.attributes.drawingMode;
      const mode = (stamped === 'existing' || stamped === 'proposed')
        ? stamped
        : (window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode('utilities') : 'existing');
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { drawingMode: mode });
    }

    // ── Bring-to-front helpers ────────────────────────────────────────────
    // Water meters must sit above utility lines. We bring each meter to front
    // on creation/update, and do a full pass whenever a utility line changes.
    let bringToFrontFrame = null;

    function bringAllToFront() {
      bringToFrontFrame = null;
      if (!RT.drawLayer || !RT.drawLayer.graphics) return;
      RT.drawLayer.graphics.forEach(g => {
        if (waterMeterTool.isParent(g)) US.bringToFront(g);
      });
    }

    function scheduleBringAllToFront() {
      if (bringToFrontFrame != null) return;
      bringToFrontFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(bringAllToFront)
        : window.setTimeout(bringAllToFront, 16);
    }

    // ── Create via factory ────────────────────────────────────────────────
    const waterMeterTool = window.SitePlanPointTool.create({
      RT,
      toolId:           TOOL_ID,
      buttonId:         BUTTON_ID,
      category:         'utilities',
      label:            'Water meter',
      idPrefix:         'watermeter',
      logPrefix:        '[tools-utilities/water-meter]',
      toolCapabilities: TOOL_CAPABILITIES,
      symbol,
      refreshSymbolOnZoom: true,
      proposedMode:     true,
      iconApply:        window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      applyExtraMetadata,
      coordinateRow:    COORDINATE_ROW,
      onAnnounce:  function () { if (US.announceToolActivated) US.announceToolActivated(TOOL_ID); },
      onGraphicCreated: function (graphic) { US.bringToFront(graphic); },
      onGraphicUpdated: function (graphic) { US.bringToFront(graphic); },
      iconHtml:    '<span class="tool-icon dm-line36">' + waterMeterIcon + '</span>',
      buttonTitle: 'Place a water meter',
      order:       15
    });

    // Bring all meters to front whenever a utility line is added or moved.
    RT.onGraphicCreated(graphic => { if (US.isUtilityLine(graphic)) scheduleBringAllToFront(); });
    RT.onGraphicUpdated(graphic => { if (US.isUtilityLine(graphic)) scheduleBringAllToFront(); });

    window.startWaterMeterTool = waterMeterTool.start;
    window.SitePlanWaterMeterTool = Object.assign({}, window.SitePlanWaterMeterTool || {}, waterMeterTool);

    if (typeof US.registerTool === 'function') {
      US.registerTool(window.SitePlanWaterMeterTool);
    } else {
      console.warn('[tools-utilities/water-meter] Utilities registry unavailable.');
    }
  }).catch(err => {
    console.error('[tools-utilities/water-meter] Failed to initialize after runtime ready:', err);
  });
}());
