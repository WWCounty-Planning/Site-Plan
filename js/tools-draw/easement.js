// Easement draw tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-draw/easement] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanDrawShared) {
    console.error('[tools-draw/easement] SitePlanDrawShared is missing. Make sure js/tools-draw/draw-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-draw/easement] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const DS = window.SitePlanDrawShared;

    // ── Symbols (tiled "×" cross texture) ──────────────────────────────────
    const EASE_BORDER    = [37, 33, 30, 1];     // #25211e
    const EASE_CROSS_HEX = '#25211e';
    const EASE_FIELD_HEX = '#f6f6ee';
    const EASE_TILE_MIN  = 14;
    const EASE_TILE_PREF = 16;
    const EASE_TILE_MAX  = 20;
    function easeTileSize() {
      const zoom = RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom == null) return EASE_TILE_PREF;
      return Math.max(EASE_TILE_MIN, Math.min(EASE_TILE_MAX,
        Math.round(EASE_TILE_PREF + (zoom - 18) * 3)));
    }

    function easeTileUrl(tilePx) {
      const c = tilePx / 2;
      const a = tilePx * 0.27; // × arm half-length (scales with the tile)
      const sw = Math.max(1.4, tilePx * 0.11).toFixed(2);
      return DS.svgDataUrl(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + tilePx + '" height="' + tilePx + '">' +
          '<rect width="100%" height="100%" fill="' + EASE_FIELD_HEX + '" fill-opacity="0"/>' +
          '<g stroke="' + EASE_CROSS_HEX + '" stroke-width="' + sw + '" stroke-linecap="round">' +
            '<line x1="' + (c - a) + '" y1="' + (c - a) + '" x2="' + (c + a) + '" y2="' + (c + a) + '"></line>' +
            '<line x1="' + (c + a) + '" y1="' + (c - a) + '" x2="' + (c - a) + '" y2="' + (c + a) + '"></line>' +
          '</g>' +
        '</svg>'
      );
    }

    function makeEasementFill(opts) {
      const dashed = !!(opts && opts.dashed);
      const tilePx = (opts && opts.tilePx) || easeTileSize();
      return {
        type: 'picture-fill',
        url: easeTileUrl(tilePx),
        width: tilePx, height: tilePx,
        outline: { type: 'simple-line', color: EASE_BORDER, width: 2.5, style: dashed ? 'dash' : 'solid' }
      };
    }

    const symbols = {
      existing: makeEasementFill({ dashed: false }),
      proposed: makeEasementFill({ dashed: true })
    };

    // Apply the current zoom-clamped tile to one easement graphic (honoring its
    // drawn existing/proposed mode).
    function applyEaseTile(g, tilePx) {
      if (!g || !g.attributes || g.attributes.toolType !== 'easement') return;
      const dashed = g.attributes.drawingMode === 'proposed';
      g.symbol = makeEasementFill({ dashed: dashed, tilePx: tilePx });
    }
    // Re-tile all easements when the zoom-clamped size actually changes.
    let lastEaseTile = null;
    function refreshEaseTilesOnZoom() {
      const tilePx = easeTileSize();
      if (tilePx === lastEaseTile) return;
      lastEaseTile = tilePx;
      if (RT.drawLayer && RT.drawLayer.graphics) {
        RT.drawLayer.graphics.forEach(g => applyEaseTile(g, tilePx));
      }
    }

    const easeIconXs =
      '<g fill="none" stroke="#25211E" stroke-width="1.6" stroke-linecap="round">' +
        '<line x1="9.2" y1="5.2" x2="11.8" y2="7.8"></line>' +
        '<line x1="11.8" y1="5.2" x2="9.2" y2="7.8"></line>' +
        '<line x1="24.2" y1="5.2" x2="26.8" y2="7.8"></line>' +
        '<line x1="26.8" y1="5.2" x2="24.2" y2="7.8"></line>' +
        '<line x1="16.7" y1="9.7" x2="19.3" y2="12.3"></line>' +
        '<line x1="19.3" y1="9.7" x2="16.7" y2="12.3"></line>' +
        '<line x1="9.2" y1="14.2" x2="11.8" y2="16.8"></line>' +
        '<line x1="11.8" y1="14.2" x2="9.2" y2="16.8"></line>' +
        '<line x1="24.2" y1="14.2" x2="26.8" y2="16.8"></line>' +
        '<line x1="26.8" y1="14.2" x2="24.2" y2="16.8"></line>' +
      '</g>';

    const easementIconHtml =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        // Existing: solid bordered box + × marks
        '<g class="dm-existing">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E9DDCC" fill-opacity="0.30"></rect>' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="none" stroke="#25211E" stroke-width="1"></rect>' +
          easeIconXs +
        '</g>' +
        // Proposed: dashed edges with rounded corner turns + × marks
        '<g class="dm-proposed" style="display:none">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E9DDCC" fill-opacity="0.30"></rect>' +
          '<g fill="none" stroke="#25211E" stroke-width="1" stroke-linecap="butt">' +
            '<line x1="9" y1="2" x2="12" y2="2"></line>' +
            '<line x1="14" y1="2" x2="17" y2="2"></line>' +
            '<line x1="19" y1="2" x2="22" y2="2"></line>' +
            '<line x1="24" y1="2" x2="27" y2="2"></line>' +
            '<line x1="9" y1="20" x2="12" y2="20"></line>' +
            '<line x1="14" y1="20" x2="17" y2="20"></line>' +
            '<line x1="19" y1="20" x2="22" y2="20"></line>' +
            '<line x1="24" y1="20" x2="27" y2="20"></line>' +
            '<line x1="2" y1="7" x2="2" y2="10"></line>' +
            '<line x1="2" y1="12" x2="2" y2="15"></line>' +
            '<line x1="34" y1="7" x2="34" y2="10"></line>' +
            '<line x1="34" y1="12" x2="34" y2="15"></line>' +
          '</g>' +
          '<g fill="none" stroke="#25211E" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M 5 2 H 3 Q 2 2 2 3 V 5"></path>' +
            '<path d="M 31 2 H 33 Q 34 2 34 3 V 5"></path>' +
            '<path d="M 34 17 V 19 Q 34 20 33 20 H 31"></path>' +
            '<path d="M 5 20 H 3 Q 2 20 2 19 V 17"></path>' +
          '</g>' +
          easeIconXs +
        '</g>' +
      '</svg>';

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId:          'easement',
      buttonId:        'btn-easement',
      checkboxId:      'chk-easement',
      widthId:         'easement-w',
      lengthId:        'easement-l',
      category:        'draw',
      label:           'Easement',
      order:           40,
      symbols,
      iconApply:       window.SitePlanDrawingMode.iconSwapApply,
      onZoomRefresh:   refreshEaseTilesOnZoom,
      toolCapabilities: {
        reshape:             true,
        resize:              true,
        rotate:              true,
        rotationSnapDegrees: 5,
        rotationGuideMode:   'delta',
        label:               true,
        duplicate:           true,
        delete:              true
      },
      // DS.makeRectangleGeometryFromCenter(center, lengthFt, widthFt, RT):
      //   first dim  → horizontal (X / length)
      //   second dim → vertical   (Y / width)
      // Factory calls makeGeometry(center, widthFt, lengthFt), so we swap.
      makeGeometry: (center, widthFt, lengthFt) =>
        DS.makeRectangleGeometryFromCenter(center, lengthFt, widthFt, RT),
      defaultChecked:   false,
      widthAriaLabel:  'Easement width in feet',
      lengthAriaLabel: 'Easement length in feet',
      toolTypeKey:     'easement',
      // Manual draw uses polygon sketch (freeform vertices), not click-drag rectangle.
      sketchType:      'polygon',
      // Keep pendingKey as 'polygon' so runtime click handling treats manual
      // easement placement like other polygon sketch tools.
      pendingKey:      'polygon',
      onAnnounce:      () => DS.announceToolActivated('easement'),
      isOwnEvent:      detail =>
        detail.source === 'tools-draw' && detail.tool === 'easement',
      // Keep __toolType aligned with polygon measurement and side-label helpers.
      applyExtraMetadata: graphic => {
        graphic.__toolType = 'polygon';
      },
      onPlaceFixed: graphic => {
        applyEaseTile(graphic, easeTileSize());
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      onGraphicCreated: graphic => {
        applyEaseTile(graphic, easeTileSize());
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      onGraphicUpdated: graphic => {
        applyEaseTile(graphic, easeTileSize());
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      iconHtml:    easementIconHtml,
      iconClass:   'icon-easement',
      buttonTitle: 'Draw an easement area',
      logPrefix:   '[tools-draw/easement]'
    });

    // ── Register ───────────────────────────────────────────────────────────
    DS.registerTool(tool);
    window.startEasementTool    = tool.start;
    window.SitePlanEasementTool = tool;

  }).catch(err => {
    console.error('[tools-draw/easement] Failed to initialize after runtime ready:', err);
  });
}());
