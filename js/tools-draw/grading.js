// Proposed Grading draw tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-draw/grading] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanDrawShared) {
    console.error('[tools-draw/grading] SitePlanDrawShared is missing. Make sure js/tools-draw/draw-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-draw/grading] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const DS = window.SitePlanDrawShared;

    // Replicates a textures.lines() pattern: ~67.5° (the library's "3/8"),
    const GRADING_COLOR = [255, 140, 0, 255]; // #FF8C00 darkorange

    function gradingHatchLayer(dashed) {
      const stroke = { type: 'CIMSolidStroke', enable: true, width: 2, color: GRADING_COLOR };
      if (dashed) {
        stroke.effects = [
          { type: 'CIMGeometricEffectDashes', dashTemplate: [6, 4], lineDashEnding: 'NoConstraint' }
        ];
      }
      return {
        type: 'CIMHatchFill',
        enable: true,
        rotation: 67.5,
        separation: 11,
        lineSymbol: { type: 'CIMLineSymbol', symbolLayers: [stroke] }
      };
    }

    function makeGradingFill(opts) {
      const dashed = !!(opts && opts.dashed);
      const border = { type: 'CIMSolidStroke', enable: true, width: 2.5, color: GRADING_COLOR };
      if (dashed) {
        border.effects = [
          { type: 'CIMGeometricEffectDashes', dashTemplate: [6, 4], lineDashEnding: 'NoConstraint' }
        ];
      }
      return {
        type: 'cim',
        data: {
          type: 'CIMSymbolReference',
          symbol: {
            type: 'CIMPolygonSymbol',
            symbolLayers: [
              border,                       // bold border (dashed when proposed)
              gradingHatchLayer(dashed)
            ]
          }
        }
      };
    }

    const symbols = {
      existing: makeGradingFill({ dashed: false }),
      proposed: makeGradingFill({ dashed: true })
    };

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      // toolId matches the sitePlanTool attribute used by measurement and
      // selection helpers.
      toolId:          'proposedGrading',
      buttonId:        'btn-proposed-grading',
      checkboxId:      'chk-grading-fixed',
      widthId:         'grading-w',
      lengthId:        'grading-l',
      category:        'draw',
      label:           'Grading',
      order:           30,
      symbols,
      iconApply:       window.SitePlanDrawingMode.iconSwapApply,
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
      widthAriaLabel:  'Grading width in feet',
      lengthAriaLabel: 'Grading length in feet',
      toolTypeKey:     'proposedGrading',
      // Manual draw uses polygon sketch (freeform vertices), not click-drag rectangle.
      sketchType:      'polygon',
      // Keep pendingKey as 'polygon' so runtime click handling treats manual
      // grading placement like other polygon sketch tools.
      pendingKey:      'polygon',
      onAnnounce:      () => DS.announceToolActivated('proposedGrading'),
      isOwnEvent:      detail =>
        detail.source === 'tools-draw' && detail.tool === 'proposedGrading',
      // Keep __toolType aligned with polygon measurement and side-label helpers.
      applyExtraMetadata: graphic => {
        graphic.__toolType = 'polygon';
      },
      onPlaceFixed: graphic => {
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      onGraphicCreated: graphic => {
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      onGraphicUpdated: graphic => {
        if (typeof RT.refreshSideLabelsForGraphic === 'function') {
          RT.refreshSideLabelsForGraphic(graphic);
        }
      },
      iconHtml:
        '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<pattern id="grad-existing" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(67.5)">' +
              '<line x1="0" y1="0" x2="0" y2="5" stroke="#FF8C00" stroke-width="2"></line>' +
            '</pattern>' +
            '<pattern id="grad-proposed" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(67.5)">' +
              '<line x1="0" y1="0" x2="0" y2="5" stroke="#FF8C00" stroke-width="2" stroke-dasharray="2 2"></line>' +
            '</pattern>' +
          '</defs>' +
          '<g class="dm-existing">' +
            '<rect x="2" y="2" width="32" height="18" rx="1" fill="url(#grad-existing)" stroke="#FF8C00" stroke-width="2"></rect>' +
          '</g>' +
          '<g class="dm-proposed" style="display:none">' +
            '<rect x="2" y="2" width="32" height="18" rx="1" fill="url(#grad-proposed)" stroke="#FF8C00" stroke-width="2" stroke-dasharray="3 2"></rect>' +
          '</g>' +
        '</svg>',
      iconClass:   'icon-grading dm-line36',
      buttonTitle: 'Draw a grading area',
      logPrefix:   '[tools-draw/grading]'
    });

    // ── Register ───────────────────────────────────────────────────────────
    DS.registerTool(tool);
    window.startProposedGradingTool    = tool.start;
    window.SitePlanProposedGradingTool = tool;

  }).catch(err => {
    console.error('[tools-draw/grading] Failed to initialize after runtime ready:', err);
  });
}());
