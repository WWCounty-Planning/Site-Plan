// Structure tool - thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[structure] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-structures/structure.js.');
    return;
  }
  if (!window.SitePlanStructuresShared) {
    console.error('[structure] SitePlanStructuresShared is missing. ' +
      'Make sure js/tools-structures/structures-shared.js is loaded before structure.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const SS = window.SitePlanStructuresShared;

    const TOOL_ID      = 'structure';
    const EVENT_SOURCE = 'tools-structures:structure';

    // Per-mode symbology. Existing = solid outline; Proposed = dashed outline.
    // Fill #E8E8EA, border #2C3539. The section toggle picks at draw time.
    const FILL    = [232, 232, 234, 255];
    const OUTLINE = [44, 53, 57, 1];
    const symbols = {
      existing: {
        type: 'simple-fill',
        color: FILL,
        outline: { type: 'simple-line', color: OUTLINE, width: 2 }
      },
      proposed: {
        type: 'simple-fill',
        color: FILL,
        outline: { type: 'simple-line', color: OUTLINE, width: 2, style: 'dash' }
      }
    };

    // Button icon: both variants as groups; iconApply() shows the active one.
    const iconHtml =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        // Existing: solid bordered box
        '<g class="structure-icon-existing">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E8E8EA"/>' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="none" stroke="#2C3539" stroke-width="1"/>' +
        '</g>' +
        // Proposed: dashed edges with solid rounded corner turns
        '<g class="structure-icon-proposed" style="display:none">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E8E8EA"/>' +
          '<g fill="none" stroke="#2C3539" stroke-width="1" stroke-linecap="butt">' +
            '<line x1="9" y1="2" x2="12" y2="2"/>' +
            '<line x1="14" y1="2" x2="17" y2="2"/>' +
            '<line x1="19" y1="2" x2="22" y2="2"/>' +
            '<line x1="24" y1="2" x2="27" y2="2"/>' +
            '<line x1="9" y1="20" x2="12" y2="20"/>' +
            '<line x1="14" y1="20" x2="17" y2="20"/>' +
            '<line x1="19" y1="20" x2="22" y2="20"/>' +
            '<line x1="24" y1="20" x2="27" y2="20"/>' +
            '<line x1="2" y1="7" x2="2" y2="10"/>' +
            '<line x1="2" y1="12" x2="2" y2="15"/>' +
            '<line x1="34" y1="7" x2="34" y2="10"/>' +
            '<line x1="34" y1="12" x2="34" y2="15"/>' +
          '</g>' +
          '<g fill="none" stroke="#2C3539" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M 5 2 H 3 Q 2 2 2 3 V 5"/>' +
            '<path d="M 31 2 H 33 Q 34 2 34 3 V 5"/>' +
            '<path d="M 34 17 V 19 Q 34 20 33 20 H 31"/>' +
            '<path d="M 5 20 H 3 Q 2 20 2 19 V 17"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

    function structureIconApply(svg, mode) {
      const proposed = mode === 'proposed';
      const ex = svg.querySelector('.structure-icon-existing');
      const pr = svg.querySelector('.structure-icon-proposed');
      if (ex) ex.style.display = proposed ? 'none' : '';
      if (pr) pr.style.display = proposed ? '' : 'none';
    }

    const structureTool = window.SitePlanRectangleTool.create({
      RT,
      toolId:       TOOL_ID,
      buttonId:     'btn-structure',
      checkboxId:   'chk-structure-fixed',
      widthId:      'structure-w',
      lengthId:     'structure-l',
      category:     'structure',
      label:        'Structure',
      order:        10,
      symbols,
      toolCapabilities: {
        reshape: true, resize: true, rotate: true,
        rotationSnapDegrees: 5, rotationGuideMode: 'delta',
        label: true, duplicate: true, delete: true
      },
      // factory calls makeGeometry(center, widthFt, lengthFt);
      // SS.makeRectangleGeometryFromCenter(RT, center, lengthFt, widthFt) - length=horizontal
      makeGeometry: (center, widthFt, lengthFt) =>
        SS.makeRectangleGeometryFromCenter(RT, center, lengthFt, widthFt),
      toolTypeKey:  'rectangle',
      pendingKey:   'rectangle',
      onAnnounce:   () => SS.announceToolActivated(TOOL_ID, { source: EVENT_SOURCE }),
      isOwnEvent:   detail => detail.source === EVENT_SOURCE,
      validateOnCreate: (rt, graphic, lp) => SS.replaceInvalidRectangleIfNeeded(rt, graphic, lp),
      onPlaceFixed: graphic => {
        if (typeof RT.refreshSideLabelsForGraphic === 'function') RT.refreshSideLabelsForGraphic(graphic);
      },
      onGraphicCreated: graphic => {
        if (typeof RT.refreshSideLabelsForGraphic === 'function') RT.refreshSideLabelsForGraphic(graphic);
      },
      iconHtml,
      iconApply:    structureIconApply,
      iconClass:    'icon-structure',
      buttonTitle: 'Draw a structure',
      logPrefix:   '[structure]'
    });

    SS.registerTool(structureTool);

    window.startStructureTool = structureTool.start;
    window.SitePlanStructureTool = structureTool;

  }).catch(err => {
    console.error('[structure] Failed to initialize after runtime ready:', err);
  });
}());
