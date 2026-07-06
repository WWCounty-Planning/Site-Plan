// Well + 100' Buffer tool — uses js/utils/point-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/well] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};

    const WELL_TOOL_TYPE       = 'well';
    const WELL_BUTTON_ID       = 'btn-well-buffer';
    const WELL_COORD_CHECKBOX_ID = 'chk-well-place-coordinates';
    const WELL_COORD_X_ID      = 'well-coordinate-x';
    const WELL_COORD_Y_ID      = 'well-coordinate-y';
    const WELL_BUFFER_RADIUS_FT = 100;
    const WELL_HIT_RADIUS_FT   = 10;
    const WELL_BUFFER_SEGMENTS  = 72;

    const WELL_TOOL_CAPABILITIES = {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const SUPPORT_CAPABILITIES = {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: false, delete: false
    };

    function wellSvgDataUrl(svg) {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    // Shared water-drop glyph used by both modes.
    const wellDropGlyph =
      '<g transform="translate(11.4 17.34) scale(0.0132)">' +
        '<path d="M478-467Zm222-333q70 62 105 114.5t35 97.5q0 60-40 104t-100 44q-60 0-100-44t-40-104q0-42 37-98t103-114Zm0 111q-27 29-43.5 56.5T640-588q0 27 17 47.5t43 20.5q26 0 43-20.5t17-47.5q0-17-16.5-44.5T700-689ZM480-80q-137 0-228.5-94T160-408q0-100 79.5-217.5T480-880q54 46 99 90t81 86q-7 9-25 34t-23 33q-27-32-59.5-66.5T480-774Q361-665 300.5-573T240-408q0 107 68 177.5T480-160q52 0 96-19t76-52q32-33 50-78.5t18-98.5q0-17-3.5-36T706-483q9-5 35.5-19t35.5-19q11 29 17 57.5t6 55.5q0 140-91.5 234T480-80Zm11-120q12-1 20.5-9.5T520-230q0-14-9-22.5t-23-7.5q-41 3-87-22.5T343-375q-2-11-10.5-18t-19.5-7q-14 0-23 10.5t-6 24.5q17 91 80 130t127 35Zm209-405Z" fill="#023681"></path>' +
      '</g>';

    // Existing = solid circle; Proposed = dashed circle (same drop on both).
    const wellGlyph =
      '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1"></circle>' + wellDropGlyph;
    const wellGlyphProposed =
      '<circle cx="18" cy="11" r="7" fill="#FEFDF9" stroke="#023681" stroke-width="1.2" stroke-linecap="round" pathLength="100" stroke-dasharray="6.5 3.5" transform="rotate(-90 18 11)"></circle>' + wellDropGlyph;

    // Button icon embeds both; iconSwapApply shows the active one.
    const wellIcon =
      '<svg viewBox="5 3 26 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' + wellGlyph + '</g>' +
        '<g class="dm-proposed" style="display:none">' + wellGlyphProposed + '</g>' +
      '</svg>';

    // Square-cropped versions for the drawn point marker.
    const wellMarkerSvgUrl = wellSvgDataUrl(
      '<svg viewBox="10 3 16 16" xmlns="http://www.w3.org/2000/svg">' + wellGlyph + '</svg>'
    );
    const wellMarkerProposedUrl = wellSvgDataUrl(
      '<svg viewBox="10 3 16 16" xmlns="http://www.w3.org/2000/svg">' + wellGlyphProposed + '</svg>'
    );

    const WELL_COORDINATE_ROW = {
      checkboxId:       WELL_COORD_CHECKBOX_ID,
      xId:              WELL_COORD_X_ID,
      yId:              WELL_COORD_Y_ID,
      checkboxLabelHtml: 'Place by<br>coordinates',
      xPlaceholder:     'X, Long',
      yPlaceholder:     'Y, Lat',
      xAriaLabel:       'Well X or longitude coordinate',
      yAriaLabel:       'Well Y or latitude coordinate',
      rowClassName:     'size-row coordinate-placement-row well-coordinate-row'
    };

    // ── Symbol functions ──────────────────────────────────────────────────
    // Zoom-responsive marker size, clamped so it stays readable at any zoom.
    const WELL_MIN_MARKER_SIZE = 9;
    const WELL_DEFAULT_MARKER_SIZE = 15;
    const WELL_MAX_MARKER_SIZE = 22;
    function wellMarkerSize() {
      const zoom = RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom == null) return WELL_DEFAULT_MARKER_SIZE;
      return Math.max(WELL_MIN_MARKER_SIZE, Math.min(WELL_MAX_MARKER_SIZE,
        Math.round(WELL_DEFAULT_MARKER_SIZE + (zoom - 18) * 1.2)));
    }

    // A placed well locks to the mode it was drawn in (stamped on its
    // attributes); only brand-new graphics fall back to the live section mode.
    function wellDrawnMode(graphic) {
      const stamped = graphic && graphic.attributes && graphic.attributes.drawingMode;
      if (stamped === 'existing' || stamped === 'proposed') return stamped;
      return window.SitePlanDrawingMode
        ? window.SitePlanDrawingMode.getDrawingMode('well-septic')
        : 'existing';
    }

    function wellCenterSymbol(graphic) {
      const size = wellMarkerSize();
      const url = wellDrawnMode(graphic) === 'proposed' ? wellMarkerProposedUrl : wellMarkerSvgUrl;
      return { type: 'picture-marker', url: url, width: size, height: size };
    }

    function wellHitAreaSymbol() {
      return {
        type: 'simple-fill', color: [0, 0, 0, 0.001],
        outline: { type: 'simple-line', color: [0, 0, 0, 0], width: 0 }
      };
    }

    // Existing = solid buffer ring; Proposed = dashed buffer ring.
    function wellBufferSymbol(mode) {
      return {
        type: 'simple-fill', color: [255, 255, 255, 0],
        outline: {
          type: 'simple-line', color: [2, 54, 129, 1], width: 1.2, // #023681
          style: mode === 'proposed' ? 'long-dash' : 'solid'
        }
      };
    }

    function wellSpokeSymbol() {
      return { type: 'simple-line', color: [2, 54, 129, 1], width: 1, style: 'long-dash' }; // #023681
    }

    function wellBufferLabelSymbol() {
      return {
        type: 'text', text: "R100' Well Buffer",
        color: [0, 0, 0, 1], haloColor: [255, 255, 255, 1], haloSize: 1,
        angle: 90, horizontalAlignment: 'center', xoffset: 10,
        font: { family: 'Arial', size: 7 }
      };
    }

    // ── Geometry helpers ──────────────────────────────────────────────────
    function circlePolygon(center, radiusFt) {
      if (!center) return null;
      const offsets = WS.feetToLocalMapOffsets(radiusFt, center);
      const ring = [];
      for (let i = 0; i < WELL_BUFFER_SEGMENTS; i++) {
        const theta = (2 * Math.PI * i) / WELL_BUFFER_SEGMENTS;
        ring.push([center.x + offsets.dx * Math.cos(theta),
                   center.y + offsets.dy * Math.sin(theta)]);
      }
      ring.push(ring[0].slice());
      return { type: 'polygon', rings: [ring],
               spatialReference: WS.spatialReferenceJSON(center.spatialReference) };
    }

    function northSpokePolyline(center, radiusFt) {
      if (!center) return null;
      const offsets = WS.feetToLocalMapOffsets(radiusFt, center);
      return { type: 'polyline',
               paths: [[[center.x, center.y], [center.x, center.y + offsets.dy]]],
               spatialReference: WS.spatialReferenceJSON(center.spatialReference) };
    }

    function northSpokeLabelPoint(center, radiusFt) {
      if (!center) return null;
      const offsets = WS.feetToLocalMapOffsets(radiusFt, center);
      return WS.pointFromXY(center.x, center.y + offsets.dy * 0.52,
                            WS.spatialReferenceJSON(center.spatialReference));
    }

    // ── Support graphics ──────────────────────────────────────────────────
    function rebuildSupport(parent) {
      if (!parent || !parent.__sitePlanId) return;
      const parentId = parent.__sitePlanId;
      const center   = parent.geometry;
      WS.removeSupportGraphics(parentId);

      const hitArea = WS.tagSupportGraphic(new RT.Graphic({
        geometry: circlePolygon(center, WELL_HIT_RADIUS_FT),
        symbol: wellHitAreaSymbol()
      }), parentId, 'well-hit-area', { selectParent: true }, SUPPORT_CAPABILITIES);

      const buffer = WS.tagSupportGraphic(new RT.Graphic({
        geometry: circlePolygon(center, WELL_BUFFER_RADIUS_FT),
        symbol: wellBufferSymbol(wellDrawnMode(parent))
      }), parentId, 'well-buffer', {}, SUPPORT_CAPABILITIES);

      const spoke = WS.tagSupportGraphic(new RT.Graphic({
        geometry: northSpokePolyline(center, WELL_BUFFER_RADIUS_FT),
        symbol: wellSpokeSymbol()
      }), parentId, 'well-spoke', {}, SUPPORT_CAPABILITIES);

      const lbl = WS.tagSupportGraphic(new RT.Graphic({
        geometry: northSpokeLabelPoint(center, WELL_BUFFER_RADIUS_FT),
        symbol: wellBufferLabelSymbol()
      }), parentId, 'well-buffer-label', {}, SUPPORT_CAPABILITIES);

      const support = [hitArea, buffer, lbl].filter(g => g && g.geometry);
      if (support.length) RT.labelLayer.addMany(support);

      // Spoke goes on the draw layer beneath the well marker so the marker glyph
      // draws on top of it (the rest of the support stays on the label layer).
      if (spoke && spoke.geometry) {
        RT.drawLayer.add(spoke);
        try { RT.drawLayer.graphics.reorder(spoke, 0); } catch (e) {}
      }
    }

    function removeSupport(parent) {
      if (parent && parent.__sitePlanId) WS.removeSupportGraphics(parent.__sitePlanId);
    }

    // ── Coordinate placement ──────────────────────────────────────────────
    // ── Create via factory ────────────────────────────────────────────────
    const wellTool = window.SitePlanPointTool.create({
      RT,
      toolId:       WELL_TOOL_TYPE,
      buttonId:     WELL_BUTTON_ID,
      category:     'well-septic',
      label:        'Well',
      toolLabel:    "Well + 100' buffer",
      idPrefix:     'well',
      logPrefix:    '[tools-well-septic/well]',
      toolCapabilities: WELL_TOOL_CAPABILITIES,
      symbol:       wellCenterSymbol,
      refreshSymbolOnZoom: true,
      proposedMode: true,
      iconApply:    window.SitePlanDrawingMode.iconSwapApply,
      applyExtraMetadata: function (graphic) {
        graphic.__label        = 'Well';
        graphic.__measureLabel = 'Well';
        // Lock the drawing mode at creation; preserve it if already stamped
        // (e.g. on duplicate) so existing wells never re-skin on toggle.
        const stamped = graphic.attributes && graphic.attributes.drawingMode;
        const mode = (stamped === 'existing' || stamped === 'proposed')
          ? stamped
          : (window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode('well-septic') : 'existing');
        graphic.attributes = Object.assign({}, graphic.attributes || {}, {
          label: 'Well', measureLabel: 'Well', drawingMode: mode
        });
        WS.applyToolCapabilities(graphic, WELL_TOOL_CAPABILITIES, WELL_TOOL_CAPABILITIES);
      },
      rebuildSupport,
      removeSupport,
      coordinateRow: WELL_COORDINATE_ROW,
      onAnnounce: function () { WS.announceToolActivated(WELL_TOOL_TYPE); },
      iconHtml:    '<span class="tool-icon dm-line36">' + wellIcon + '</span>',
      buttonTitle: "Place a well with a 100' buffer",
      order:       10
    });

    window.startWellTool = wellTool.start;

    window.SitePlanWellTool = Object.assign({}, window.SitePlanWellTool || {}, wellTool);

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanWellTool);
    } else {
      console.warn('[tools-well-septic/well] Well & Septic registry unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/well] Failed to initialize after runtime ready:', err);
  });
}());
