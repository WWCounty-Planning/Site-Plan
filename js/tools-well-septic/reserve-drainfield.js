// Reserve Drainfield module. Generic rectangle placement is delegated to js/utils/rectangle-tool.js

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/reserve-drainfield] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};
    const RECT = window.SitePlanRectangleTool;

    const TOOL_ID = 'reserveDrainfield';
    const DRAINFIELD_TOOL_TYPE = 'drainfield';
    const DEFAULT_DRAINFIELD_LATERALS = 3;
    const RESERVE_DRAINFIELD_BUTTON_ID = 'btn-reserve-drainfield';
    const RESERVE_DRAINFIELD_CHECKBOX_ID = 'chk-reserve-drainfield-fixed';
    const RESERVE_DRAINFIELD_LENGTH_ID = 'reserve-drainfield-l';
    const RESERVE_DRAINFIELD_WIDTH_ID = 'reserve-drainfield-w';
    const RESERVE_DRAINFIELD_LATERALS_ID = 'reserve-drainfield-laterals';

    if (!RECT || typeof RECT.create !== 'function') {
      console.error('[tools-well-septic/reserve-drainfield] SitePlanRectangleTool.create is missing.');
      return;
    }

    const TOOL_CAPABILITIES = {
      reshape: false,
      resize: true,
      rotate: true,
      rotationSnapDegrees: 5,
      rotationGuideMode: 'delta',
      label: false,
      duplicate: true,
      delete: true
    };

    const SUPPORT_CAPABILITIES = {
      reshape: false,
      resize: false,
      rotate: false,
      label: false,
      duplicate: false,
      delete: false
    };

    const reserveDrainfieldGlyph =
      '<g fill="none" stroke="#3F5A36" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M 12 5 H 8 V 8"></path>' +
        '<path d="M 15.5 5 H 20.5 M 18 5 V 8"></path>' +
        '<path d="M 24 5 H 28 V 8"></path>' +
        '<line x1="8" y1="10.5" x2="8" y2="12.5"></line>' +
        '<line x1="8" y1="15" x2="8" y2="17"></line>' +
        '<line x1="18" y1="10.5" x2="18" y2="12.5"></line>' +
        '<line x1="18" y1="15" x2="18" y2="17"></line>' +
        '<line x1="28" y1="10.5" x2="28" y2="12.5"></line>' +
        '<line x1="28" y1="15" x2="28" y2="17"></line>' +
      '</g>';

    const reserveDrainfieldIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' + reserveDrainfieldGlyph + '</g>' +
        '<g class="dm-proposed" style="display:none">' + reserveDrainfieldGlyph + '</g>' +
      '</svg>';

    let coordinator = {};
    let rectangleTool = null;
    let reserveDrainfieldToolApi = null;
    let lateralRowEl = null;
    let lateralControlsWired = false;

    function setCoordinator(ctx) {
      coordinator = ctx || {};
      return reserveDrainfieldToolApi;
    }

    function callCoordinator(name) {
      const fn = coordinator && coordinator[name];
      if (typeof fn !== 'function') return undefined;
      const args = Array.prototype.slice.call(arguments, 1);
      return fn.apply(null, args);
    }

    function getDrainfieldsTool() {
      if (WS && typeof WS.getTool === 'function') {
        const registeredTool = WS.getTool(DRAINFIELD_TOOL_TYPE) || WS.getTool('drainfield') || WS.getTool('drainfields');
        if (registeredTool) return registeredTool;
      }
      return window.SitePlanDrainfieldTool || window.SitePlanDrainfieldsTool || null;
    }

    function callDrainfieldsTool(names, args, fallback) {
      const tool = getDrainfieldsTool();
      if (tool) {
        for (const name of names) {
          if (typeof tool[name] === 'function') return tool[name].apply(tool, args || []);
        }
      }
      return typeof fallback === 'function' ? fallback() : undefined;
    }

    function clampDrainfieldLateralCount(value) {
      return callDrainfieldsTool(['clampLateralCount'], [value], () => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return DEFAULT_DRAINFIELD_LATERALS;
        return Math.max(2, Math.min(9, parsed));
      });
    }

    function drainfieldParentSymbol() {
      return callDrainfieldsTool(['symbol'], [], () => ({
        type: 'simple-fill',
        color: [0, 110, 45, 0.001],
        outline: { type: 'simple-line', color: [0, 110, 45, 0], width: 0 }
      }));
    }

    function reserveDrainfieldLateralSymbol() {
      return {
        type: 'simple-line',
        color: [63, 90, 54, 1], // #3F5A36
        width: 1.5,
        style: 'dash',
        cap: 'round',
        join: 'round'
      };
    }

    function drainfieldMeasurementLabelSymbol(text, angleDegrees) {
      return callDrainfieldsTool(['measurementLabelSymbol'], [text, angleDegrees], () => ({
        type: 'text',
        text: text || '',
        color: [0, 85, 35, 1],
        haloColor: [255, 255, 255, 0.9],
        haloSize: 1,
        font: { size: 10, family: 'Arial' },
        angle: Number.isFinite(angleDegrees) ? angleDegrees : 0
      }));
    }

    function drainfieldAxisMetadata(graphic) {
      return callDrainfieldsTool(['axisMetadata'], [graphic], () => null);
    }

    function drainfieldAxisInfo(graphic) {
      return callDrainfieldsTool(['axisInfo'], [graphic], () => null);
    }

    function isParent(graphic) {
      return rectangleTool.isParent(graphic);
    }

    function reserveDrainfieldLateralInput() {
      return document.getElementById(RESERVE_DRAINFIELD_LATERALS_ID);
    }

    function reserveDrainfieldLateralCount() {
      const laterals = reserveDrainfieldLateralInput();
      const raw = laterals ? Number.parseInt(laterals.value, 10) : DEFAULT_DRAINFIELD_LATERALS;
      return clampDrainfieldLateralCount(raw);
    }

    function reserveDrainfieldDimensions() {
      const dims = rectangleTool && typeof rectangleTool.dimensions === 'function'
        ? rectangleTool.dimensions()
        : { widthFt: NaN, lengthFt: NaN, valid: false };
      return {
        lengthFt: dims.lengthFt,
        widthFt: dims.widthFt,
        valid: !!dims.valid
      };
    }

    function applyMetadata(parent) {
      if (!parent) return parent;
      const parentId = WS.ensureSitePlanId(parent, 'reserve');
      parent.__toolType = TOOL_ID;
      parent.__label = 'Reserve drainfield';
      parent.__measureLabel = 'Reserve drainfield';
      parent.__skipEdgeLabels = true;
      parent.__preferredEditMode = 'transform';
      parent.__useFixedSizeLabels = false;

      const existingAttrs = parent.attributes || {};
      const lateralCount = clampDrainfieldLateralCount(
        parent.__lateralCount != null ? parent.__lateralCount :
          (existingAttrs.lateralCount != null ? existingAttrs.lateralCount : reserveDrainfieldLateralCount())
      );
      if (parent.__drainfieldAxisEdgeIndex == null && existingAttrs.drainfieldAxisEdgeIndex == null) {
        parent.__drainfieldAxisEdgeIndex = 0;
      }
      if (parent.__drainfieldAxisReverse == null && existingAttrs.drainfieldAxisReverse == null) {
        parent.__drainfieldAxisReverse = false;
      }

      // Capture the section mode the graphic was drawn in (print legend
      // bucketing); preserve the stamp on re-apply so later edits with the
      // toggle flipped never re-badge it.
      const stampedMode = existingAttrs.drawingMode;
      const drawingMode = (stampedMode === 'existing' || stampedMode === 'proposed')
        ? stampedMode
        : (window.SitePlanDrawingMode
            ? window.SitePlanDrawingMode.getDrawingMode('well-septic')
            : 'existing');

      parent.attributes = Object.assign({}, existingAttrs, {
        toolType: TOOL_ID,
        drawingMode,
        sitePlanTool: TOOL_ID,
        sitePlanCategory: 'well-septic',
        sitePlanId: parentId,
        label: 'Reserve drainfield',
        measureLabel: 'Reserve drainfield',
        skipEdgeLabels: true,
        preferredEditMode: 'transform',
        useFixedSizeLabels: false,
        lateralCount,
        drainfieldAxisEdgeIndex: parent.__drainfieldAxisEdgeIndex != null
          ? parent.__drainfieldAxisEdgeIndex
          : existingAttrs.drainfieldAxisEdgeIndex,
        drainfieldAxisReverse: parent.__drainfieldAxisReverse != null
          ? parent.__drainfieldAxisReverse
          : existingAttrs.drainfieldAxisReverse,
        toolCapabilities: Object.assign({}, TOOL_CAPABILITIES)
      });
      parent.__lateralCount = lateralCount;
      WS.applyToolCapabilities(parent, TOOL_CAPABILITIES);
      drainfieldAxisMetadata(parent);
      return parent;
    }

    function areaSqFt(parent) {
      if (!parent || !parent.geometry) return NaN;
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.geodesicArea === 'function') {
          const v = RT.geometryEngine.geodesicArea(parent.geometry, 'square-feet');
          if (Number.isFinite(v)) return Math.abs(v);
        }
      } catch (err) {}
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.planarArea === 'function') {
          const v = RT.geometryEngine.planarArea(parent.geometry, 'square-feet');
          if (Number.isFinite(v)) return Math.abs(v);
        }
      } catch (err) {}
      return NaN;
    }

    function labelPoint(parent) {
      if (!parent || !parent.geometry) return null;
      try {
        const c = parent.geometry.centroid;
        if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return c;
      } catch (err) {}
      return parent.geometry.extent ? parent.geometry.extent.center : null;
    }

    function rebuildSupport(parent) {
      if (!isParent(parent)) return;
      applyMetadata(parent);
      const parentId = parent.__sitePlanId;
      WS.removeSupportGraphics(parentId);

      const info = drainfieldAxisInfo(parent);
      if (!info) return;

      const lateralCount = clampDrainfieldLateralCount(parent.__lateralCount || (parent.attributes && parent.attributes.lateralCount));
      const lateralSupport = WS.buildDrainfieldLateralSupports({
        parentId,
        axisInfo: info,
        lateralCount,
        symbol: reserveDrainfieldLateralSymbol,
        lateralRole: 'reserve-drainfield-lateral',
        manifoldRole: 'reserve-drainfield-manifold',
        supportCapabilities: SUPPORT_CAPABILITIES
      });
      const supports = lateralSupport.supports;

      const area = areaSqFt(parent);
      const areaText = Number.isFinite(area) ? Math.round(area).toLocaleString() + ' sq ft' : '';
      const lp = labelPoint(parent);
      if (areaText && lp) {
        supports.push(WS.tagSupportGraphic(new RT.Graphic({
          geometry: lp,
          symbol: drainfieldMeasurementLabelSymbol(areaText, 0)
        }), parentId, 'reserve-drainfield-area-label', null, SUPPORT_CAPABILITIES));
      }

      if (supports.length) RT.labelLayer.addMany(supports);
    }

    function announceReserveDrainfieldTool() {
      callCoordinator('announceToolActivated', TOOL_ID);
      callCoordinator('cancelSepticPlacement', false);
      callCoordinator('clearSepticButton');
      callCoordinator('cancelDboxPlacement', false);
      callCoordinator('clearDboxButton');
      callCoordinator('cancelDrainfieldPlacement', false);
      callCoordinator('clearDrainfieldButton');
      callCoordinator('cancelSepticLinePlacement', false);
      callCoordinator('clearSepticLineButton');
      callCoordinator('clearSepticValidation');
      callCoordinator('clearDboxValidation');
      callCoordinator('clearDrainfieldValidation');
    }

    function removeReserveSideLabels(graphic) {
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
    }

    function buildReserveDrainfieldLateralRow() {
      if (lateralRowEl) return lateralRowEl;
      const row = document.createElement('div');
      row.className = 'size-row drainfield-lateral-row';
      row.innerHTML =
        '<span class="lateral-checkbox-spacer" aria-hidden="true"></span>' +
        '<label for="' + RESERVE_DRAINFIELD_LATERALS_ID + '" class="size-lbl lateral-label">Number of Laterals (Pipes)</label>' +
        '<span class="lateral-placeholder-input" aria-hidden="true"></span>' +
        '<span class="dim-sep lateral-placeholder-sep" aria-hidden="true">x</span>' +
        '<input id="' + RESERVE_DRAINFIELD_LATERALS_ID + '" type="number" min="2" max="9" step="1" value="' + DEFAULT_DRAINFIELD_LATERALS + '" class="dim-input lateral-input" aria-label="Number of reserve drainfield laterals">';
      lateralRowEl = row;
      return lateralRowEl;
    }

    function wireLateralControls() {
      if (lateralControlsWired) return;
      const laterals = reserveDrainfieldLateralInput();
      if (!laterals) return;

      laterals.addEventListener('input', () => {
        const count = clampDrainfieldLateralCount(laterals.value);
        callDrainfieldsTool(['updateSelectedDrainfieldLateralCount'], [count, { source: 'sidebar', onlyIfReserve: true }]);
        if (rectangleTool && rectangleTool.isActive && rectangleTool.isActive()) {
          rectangleTool.restartIfActive({ force: false });
        }
      });
      laterals.addEventListener('change', () => {
        const count = clampDrainfieldLateralCount(laterals.value);
        laterals.value = count;
        callDrainfieldsTool(['updateSelectedDrainfieldLateralCount'], [count, { source: 'sidebar', normalize: true, onlyIfReserve: true }]);
        if (rectangleTool && rectangleTool.isActive && rectangleTool.isActive()) {
          rectangleTool.restartIfActive({ force: false });
        }
      });
      laterals.addEventListener('keydown', event => event.stopPropagation());
      lateralControlsWired = true;
    }

    function wireControls() {
      if (rectangleTool && typeof rectangleTool.wireControls === 'function') {
        rectangleTool.wireControls();
      }
      wireLateralControls();
    }

    function getElements() {
      const elements = rectangleTool && typeof rectangleTool.getElements === 'function'
        ? rectangleTool.getElements()
        : [];
      return elements.concat(buildReserveDrainfieldLateralRow()).filter(Boolean);
    }

    rectangleTool = RECT.create({
      RT,
      toolId: TOOL_ID,
      buttonId: RESERVE_DRAINFIELD_BUTTON_ID,
      checkboxId: RESERVE_DRAINFIELD_CHECKBOX_ID,
      widthId: RESERVE_DRAINFIELD_WIDTH_ID,
      lengthId: RESERVE_DRAINFIELD_LENGTH_ID,
      category: 'well-septic',
      label: 'Reserve drainfield',
      order: 45,
      symbol: drainfieldParentSymbol(),
      toolCapabilities: TOOL_CAPABILITIES,
      makeGeometry: (center, widthFt, lengthFt) => WS.makeRectGeometryFromCenter(center, lengthFt, widthFt),
      onAnnounce: announceReserveDrainfieldTool,
      isOwnEvent: detail => detail && detail.source === 'tools-well-septic' && detail.tool === TOOL_ID,
      logPrefix: '[tools-well-septic/reserve-drainfield]',
      buttonTitle: 'Place or draw a reserve drainfield',
      iconHtml: reserveDrainfieldIcon,
      iconApply: window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      iconClass: 'dm-line36',
      minWidthFt: 0.1,
      minLengthFt: 0.1,
      widthStep: 0.1,
      lengthStep: 0.1,
      dimensionOrder: 'length-width',
      widthAriaLabel: 'Reserve drainfield width in feet',
      lengthAriaLabel: 'Reserve drainfield length in feet',
      toolTypeKey: TOOL_ID,
      pendingKey: TOOL_ID,
      suppressLiveSideLabelsDuringManual: true,
      extraSettingsSignature: () => reserveDrainfieldLateralCount(),
      applyExtraMetadata: applyMetadata,
      onActiveChanged: active => {
        callCoordinator('onReserveDrainfieldActiveChanged', !!active);
        if (active) callCoordinator('clearOtherActiveButtons', TOOL_ID);
      },
      onPendingChanged: pending => {
        callCoordinator('onReserveDrainfieldPendingChanged', !!pending);
      },
      onPlaceFixed: parent => {
        removeReserveSideLabels(parent);
      },
      onGraphicCreated: graphic => {
        rebuildSupport(graphic);
        removeReserveSideLabels(graphic);
      },
      onGraphicUpdated: graphic => {
        rebuildSupport(graphic);
        removeReserveSideLabels(graphic);
      },
      onGraphicDeleted: graphic => {
        const parentId = WS.ensureSitePlanId(graphic, 'reserve');
        WS.removeSupportGraphics(parentId);
      }
    });

    reserveDrainfieldToolApi = Object.assign({}, rectangleTool, {
      id: TOOL_ID,
      order: 45,
      capabilities: Object.assign({}, TOOL_CAPABILITIES),
      supportCapabilities: Object.assign({}, SUPPORT_CAPABILITIES),
      ownsLifecycle: true,

      setCoordinator,
      buildLateralRow: buildReserveDrainfieldLateralRow,
      getElements,
      wireControls,
      dimensions: reserveDrainfieldDimensions,
      lateralCount: reserveDrainfieldLateralCount,

      isParent,
      applyMetadata,
      areaSqFt,
      labelPoint,
      lateralSymbol: reserveDrainfieldLateralSymbol,
      rebuildSupport
    });

    window.SitePlanReserveDrainfieldTool = Object.assign({}, window.SitePlanReserveDrainfieldTool || {}, reserveDrainfieldToolApi);

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanReserveDrainfieldTool);
    } else {
      console.warn('[tools-well-septic/reserve-drainfield] Well & Septic registry is unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/reserve-drainfield] Failed to initialize after runtime ready:', err);
  });
})();
