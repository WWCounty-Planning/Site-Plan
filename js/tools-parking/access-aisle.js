// Parking Access Aisle tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking/access-aisle] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanParkingShared) {
    console.error('[tools-parking/access-aisle] SitePlanParkingShared is missing. Make sure parking-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-parking/access-aisle] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const PS = window.SitePlanParkingShared;

    const TOOL_ID      = 'parkingAccessAisle';
    const EVENT_SOURCE = 'tools-parking:parkingAccessAisle';
    const PARKING_TYPE = 'accessAisle';

    // ── Icon ──────────────────────────────────────────────────────────────
    const aisleIcon =
      '<svg viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<defs>' +
          '<clipPath id="parking-access-aisle-icon-clip">' +
            '<path d="M3.5 2 H32.5 Q34 2 34 3.5 V18.5 Q34 20 32.5 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z"/>' +
          '</clipPath>' +
        '</defs>' +
        '<g class="dm-existing">' +
          '<path d="M3.5 2 H32.5 Q34 2 34 3.5 V18.5 Q34 20 32.5 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#2E3035"/>' +
          '<g clip-path="url(#parking-access-aisle-icon-clip)" fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2.6" stroke-linecap="butt">' +
            '<line x1="4.9" y1="2" x2="13.2" y2="20"/>' +
            '<line x1="13.2" y1="2" x2="22.2" y2="20"/>' +
            '<line x1="22.2" y1="2" x2="30.5" y2="20"/>' +
          '</g>' +
          '<g clip-path="url(#parking-access-aisle-icon-clip)" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="butt">' +
            '<line x1="4.9" y1="2" x2="13.2" y2="20"/>' +
            '<line x1="13.2" y1="2" x2="22.2" y2="20"/>' +
            '<line x1="22.2" y1="2" x2="30.5" y2="20"/>' +
          '</g>' +
          '<path d="M3.5 2 H32.5 Q34 2 34 3.5 V18.5 Q34 20 32.5 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M3.5 2 H32.5 Q34 2 34 3.5 V18.5 Q34 20 32.5 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round"/>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<path d="M3.5 2 H32.5 Q34 2 34 3.5 V18.5 Q34 20 32.5 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#2E3035"/>' +
          '<g fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2.55" stroke-linecap="butt">' +
            '<line x1="5.1" y1="2" x2="13.6" y2="20"/>' +
            '<line x1="13.6" y1="2" x2="22.6" y2="20"/>' +
            '<line x1="22.6" y1="2" x2="30.9" y2="20"/>' +
          '</g>' +
          '<g fill="none" stroke="#FFFFFF" stroke-width="1.55" stroke-linecap="butt">' +
            '<line x1="5.1" y1="2" x2="13.6" y2="20"/>' +
            '<line x1="13.6" y1="2" x2="22.6" y2="20"/>' +
            '<line x1="22.6" y1="2" x2="30.9" y2="20"/>' +
          '</g>' +
          '<g fill="none" stroke="#111111" stroke-opacity="0.72" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M7 2 H3.5 Q2 2 2 3.5 V7"/>' +
            '<line x1="11" y1="2" x2="16" y2="2"/>' +
            '<line x1="20" y1="2" x2="25" y2="2"/>' +
            '<path d="M29 2 H32.5 Q34 2 34 3.5 V7"/>' +
            '<line x1="2" y1="9" x2="2" y2="13"/>' +
            '<line x1="34" y1="9" x2="34" y2="13"/>' +
            '<path d="M7 20 H3.5 Q2 20 2 18.5 V15"/>' +
            '<line x1="11" y1="20" x2="16" y2="20"/>' +
            '<line x1="20" y1="20" x2="25" y2="20"/>' +
            '<path d="M29 20 H32.5 Q34 20 34 18.5 V15"/>' +
          '</g>' +
          '<g fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M7 2 H3.5 Q2 2 2 3.5 V7"/>' +
            '<line x1="11" y1="2" x2="16" y2="2"/>' +
            '<line x1="20" y1="2" x2="25" y2="2"/>' +
            '<path d="M29 2 H32.5 Q34 2 34 3.5 V7"/>' +
            '<line x1="2" y1="9" x2="2" y2="13"/>' +
            '<line x1="34" y1="9" x2="34" y2="13"/>' +
            '<path d="M7 20 H3.5 Q2 20 2 18.5 V15"/>' +
            '<line x1="11" y1="20" x2="16" y2="20"/>' +
            '<line x1="20" y1="20" x2="25" y2="20"/>' +
            '<path d="M29 20 H32.5 Q34 20 34 18.5 V15"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

    // ── Symbols ───────────────────────────────────────────────────────────
    const aisleSymbol = {
      type: 'picture-fill',
      url: PS.parkingSpeckleDataUrl,
      width: 40, height: 40,
      outline: { type: 'simple-line', color: [17, 17, 17, 0], width: 0 }
    };

    const aisleHatchSymbol = {
      type: 'simple-fill',
      style: 'forward-diagonal',
      color: [255, 255, 255, 1],
      outline: { type: 'simple-line', color: [255, 255, 255, 0], width: 0 }
    };

    const aisleBorderShadowSymbol = {
      type: 'simple-line', color: [17, 17, 17, 0.72], width: 4, cap: 'butt', join: 'miter'
    };

    const aisleBorderSymbol = {
      type: 'simple-line', color: [255, 255, 255, 1], width: 2, cap: 'butt', join: 'miter'
    };

    // ── Support identification ─────────────────────────────────────────────
    const supportManager = PS.makeRectangleSupportManager(RT, {
      toolId: TOOL_ID,
      supportRoles: [
        'parkingAccessAisleBorder',
        'parkingAccessAisleBorderShadow',
        'parkingAccessAisleHatch'
      ],
      borderMode: 'closed',
      borderShadowSymbol: aisleBorderShadowSymbol,
      borderShadowRole: 'parkingAccessAisleBorderShadow',
      borderSymbol: PS.modeAwareBorder(aisleBorderSymbol),
      borderRole: 'parkingAccessAisleBorder',
      extraSupportPosition: 'beforeBorder',
      extraSupportItems: graphic => [{
        geometry: graphic.geometry,
        symbol: aisleHatchSymbol,
        role: 'parkingAccessAisleHatch'
      }]
    });
    const internalRebuildSupport = supportManager.rebuildSupport;

    // ── Custom snap sides (3 sides with snapKind tags) ─────────────────────
    // The factory passes isParent as the second argument when calling this override.
    function getSnapSides(graphic, isParent) {
      if (!isParent(graphic)) return [];
      const points = PS.ringWithoutDuplicateClose(graphic.geometry);
      if (points.length < 4) return [];
      const sr = PS.spatialReferenceJSON(graphic.geometry.spatialReference);
      function side(name, a, b, opposite, snapKind) {
        const s = PS.sideFromPoints(name, a, b, sr, opposite);
        return s ? Object.assign(s, { snapKind }) : null;
      }
      return [
        side('left',  points[3], points[0], 'right', 'aisleSide'),
        side('right', points[1], points[2], 'left',  'aisleSide'),
        side('top',   points[2], points[3], 'top',   'aisleTop')
      ].filter(Boolean);
    }

    // ── Coordinator ────────────────────────────────────────────────────────
    let coordinator = {};

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId:          TOOL_ID,
      buttonId:        'btn-parking-access-aisle',
      checkboxId:      'chk-parking-access-aisle-fixed',
      widthId:         'parking-access-aisle-width',
      lengthId:        'parking-access-aisle-length',
      category:        'parking',
      label:           'Access aisle',
      order:           40,
      symbol:          aisleSymbol,
      symbols:         { existing: aisleSymbol, proposed: aisleSymbol },
      toolCapabilities: {
        reshape: false, resize: false, rotate: true,
        label: false, duplicate: true, delete: true, toolbar: true
      },
      makeGeometry:    (center, widthFt, lengthFt) =>
        PS.makeNorthSouthRectangleGeometry(center, widthFt, lengthFt),
      fixedOnly:        true,
      defaultChecked:   true,
      defaultWidthFt:   5,
      defaultLengthFt:  20,
      widthAriaLabel:  'Parking access aisle width in feet',
      lengthAriaLabel: 'Parking access aisle length in feet',
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
      getSnapSides,
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
      iconHtml:    aisleIcon,
      iconClass:   'icon-parking-access-aisle dm-line36',
      iconApply:   window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      buttonTitle: 'Place or draw a parking access aisle',
      logPrefix:   '[tools-parking/access-aisle]'
    });

    tool.rebuildSupport = internalRebuildSupport;
    tool.setCoordinator = ctx => { coordinator = ctx || {}; return tool; };

    // ── Register ───────────────────────────────────────────────────────────
    PS.registerTool(tool);
    window.startParkingAccessAisleTool    = tool.start;
    window.SitePlanParkingAccessAisleTool = tool;

  }).catch(err => {
    console.error('[tools-parking/access-aisle] Failed to initialize after runtime ready:', err);
  });
}());
