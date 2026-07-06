// Standard Parking Stall tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking/standard-stall] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanParkingShared) {
    console.error('[tools-parking/standard-stall] SitePlanParkingShared is missing. Make sure parking-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-parking/standard-stall] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const PS = window.SitePlanParkingShared;

    const TOOL_ID      = 'standardParkingStall';
    const EVENT_SOURCE = 'tools-parking:standardParkingStall';
    const PARKING_TYPE = 'standardStall';

    // ── Icon ──────────────────────────────────────────────────────────────
    const stallIcon =
      '<svg viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g class="dm-existing">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#2E3035"/>' +
          '<path d="M3.5 2 H32 M32 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2" fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round"/>' +
          '<path d="M3.5 2 H32 M32 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round"/>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#2E3035"/>' +
          '<g fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M6.5 2 H3.5 Q2 2 2 3.5 V6.5"/>' +
            '<line x1="10.5" y1="2" x2="15" y2="2"/>' +
            '<line x1="19" y1="2" x2="23.5" y2="2"/>' +
            '<line x1="27.5" y1="2" x2="32" y2="2"/>' +
            '<path d="M6.5 20 H3.5 Q2 20 2 18.5 V15.5"/>' +
            '<line x1="10.5" y1="20" x2="15" y2="20"/>' +
            '<line x1="19" y1="20" x2="23.5" y2="20"/>' +
            '<line x1="27.5" y1="20" x2="32" y2="20"/>' +
            '<line x1="2" y1="9" x2="2" y2="13"/>' +
          '</g>' +
          '<g fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M6.5 2 H3.5 Q2 2 2 3.5 V6.5"/>' +
            '<line x1="10.5" y1="2" x2="15" y2="2"/>' +
            '<line x1="19" y1="2" x2="23.5" y2="2"/>' +
            '<line x1="27.5" y1="2" x2="32" y2="2"/>' +
            '<path d="M6.5 20 H3.5 Q2 20 2 18.5 V15.5"/>' +
            '<line x1="10.5" y1="20" x2="15" y2="20"/>' +
            '<line x1="19" y1="20" x2="23.5" y2="20"/>' +
            '<line x1="27.5" y1="20" x2="32" y2="20"/>' +
            '<line x1="2" y1="9" x2="2" y2="13"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

    // ── Symbols ───────────────────────────────────────────────────────────
    const stallSymbol = {
      type: 'picture-fill',
      url: PS.parkingSpeckleDataUrl,
      width: 40, height: 40,
      outline: { type: 'simple-line', color: [102, 101, 97, 0], width: 0 }
    };

    const stallBorderShadowSymbol = {
      type: 'simple-line', color: [17, 17, 17, 0.72], width: 4, cap: 'butt', join: 'miter'
    };

    const stallBorderSymbol = {
      type: 'simple-line', color: [255, 255, 255, 1], width: 2, cap: 'butt', join: 'miter'
    };

    // ── Support identification ─────────────────────────────────────────────
    const supportManager = PS.makeRectangleSupportManager(RT, {
      toolId: TOOL_ID,
      supportRoles: ['standardParkingStallBorder', 'standardParkingStallBorderShadow'],
      borderMode: 'open',
      borderShadowSymbol: stallBorderShadowSymbol,
      borderShadowRole: 'standardParkingStallBorderShadow',
      borderSymbol: PS.modeAwareBorder(stallBorderSymbol),
      borderRole: 'standardParkingStallBorder'
    });

    // ── Parent predicate (mirrors factory's attribute checks) ──────────────
    const internalRebuildSupport = supportManager.rebuildSupport;

    // ── Border geometry (U-shape: bottom open) ─────────────────────────────
    // ── Support helpers ────────────────────────────────────────────────────
    // ── Coordinator ────────────────────────────────────────────────────────
    let coordinator = {};

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId:          TOOL_ID,
      buttonId:        'btn-standard-parking-stall',
      checkboxId:      'chk-standard-parking-stall-fixed',
      widthId:         'standard-parking-stall-width',
      lengthId:        'standard-parking-stall-length',
      category:        'parking',
      label:           'Standard Parking stall',
      order:           10,
      symbol:          stallSymbol,
      symbols:         { existing: stallSymbol, proposed: stallSymbol },
      toolCapabilities: {
        reshape: false, resize: false, rotate: true,
        label: false, duplicate: true, delete: true, toolbar: true
      },
      makeGeometry:    (center, widthFt, lengthFt) =>
        PS.makeNorthSouthRectangleGeometry(center, widthFt, lengthFt),
      fixedOnly:        true,
      defaultChecked:   true,
      defaultWidthFt:   10,
      defaultLengthFt:  20,
      widthAriaLabel:  'Standard parking stall width in feet',
      lengthAriaLabel: 'Standard parking stall length in feet',
      toolTypeKey:     TOOL_ID,
      pendingKey:      TOOL_ID,
      onAnnounce:      () => PS.announceToolActivated(TOOL_ID, { source: EVENT_SOURCE }),
      isOwnEvent:      detail => detail.source === EVENT_SOURCE,
      applyExtraMetadata: graphic => {
        graphic.__preferredEditMode = 'rotate';
        graphic.__skipSideLabels    = true;
        graphic.attributes = Object.assign({}, graphic.attributes || {}, { parkingType: PARKING_TYPE });
        PS.stampParkingMode(graphic);
      },
      onPlaceFixed: graphic => {
        const fn = coordinator.applySideSnap;
        if (typeof fn === 'function') fn(graphic);
      },
      onPointerMove: probe => {
        const fn = coordinator.updateSideSnapPreview;
        if (typeof fn === 'function') fn(probe);
      },
      onCancelPlacement: () => {
        const fn = coordinator.clearSideSnapPreview;
        if (typeof fn === 'function') fn();
      },
      onGraphicCreated: (graphic, { createdByTool }) => {
        internalRebuildSupport(graphic);
        if (createdByTool) {
          const fn = coordinator.applySideSnap;
          if (typeof fn === 'function') fn(graphic);
        }
      },
      onGraphicUpdated: graphic => {
        internalRebuildSupport(graphic);
      },
      onGraphicDeleted: graphic => {
        supportManager.removeSupport(graphic);
      },
      iconHtml:    stallIcon,
      iconClass:   'icon-parking-standard dm-line36',
      iconApply:   window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      buttonTitle: 'Place or draw a standard parking stall',
      logPrefix:   '[tools-parking/standard-stall]'
    });

    tool.rebuildSupport = internalRebuildSupport;
    tool.setCoordinator = ctx => { coordinator = ctx || {}; return tool; };

    // ── Register ───────────────────────────────────────────────────────────
    PS.registerTool(tool);
    window.startStandardParkingStallTool    = tool.start;
    window.SitePlanStandardParkingStallTool = tool;

  }).catch(err => {
    console.error('[tools-parking/standard-stall] Failed to initialize after runtime ready:', err);
  });
}());
