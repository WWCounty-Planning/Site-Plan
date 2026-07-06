// Primary Drainfield/common drainfield module. Owns Primary Drainfield behavior

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/drainfield] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};
    const RECT = window.SitePlanRectangleTool;

    const DRAINFIELD_TOOL_TYPE = 'drainfield';
    const RESERVE_DRAINFIELD_TOOL_TYPE = 'reserveDrainfield';
    const DEFAULT_DRAINFIELD_LATERALS = 3;
    const DBOX_DRAINFIELD_SNAP_TOLERANCE_PX = 18;
    const DRAINFIELD_BUTTON_ID = 'btn-drainfield';
    const DRAINFIELD_CHECKBOX_ID = 'chk-drainfield-fixed';
    const DRAINFIELD_LENGTH_ID = 'drainfield-l';
    const DRAINFIELD_WIDTH_ID = 'drainfield-w';
    const DRAINFIELD_LATERALS_ID = 'drainfield-laterals';

    const RESERVE_DRAINFIELD_LATERALS_ID = 'reserve-drainfield-laterals';

    const drainfieldGlyph =
      '<rect x="8" y="5" width="20" height="2" rx="0.35" fill="#3F5A36"></rect>' +
      '<rect x="8" y="5" width="2" height="12" rx="0.35" fill="#3F5A36"></rect>' +
      '<rect x="17" y="5" width="2" height="12" rx="0.35" fill="#3F5A36"></rect>' +
      '<rect x="26" y="5" width="2" height="12" rx="0.35" fill="#3F5A36"></rect>';

    const drainfieldIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' + drainfieldGlyph + '</g>' +
        '<g class="dm-proposed" style="display:none">' + drainfieldGlyph + '</g>' +
      '</svg>';

    if (!RECT || typeof RECT.create !== 'function') {
      console.error('[tools-well-septic/drainfield] SitePlanRectangleTool.create is missing.');
      return;
    }

    let rectangleTool = null;
    let lateralRowEl = null;
    let lateralControlsWired = false;

    let selectedDrainfieldGraphic = null;
    let drainfieldToolbarWrap = null;
    let drainfieldToolbarCount = null;
    let drainfieldToolbarMenu = null;

    const DRAINFIELD_TOOL_CAPABILITIES = {
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

    let coordinator = {};

    function setCoordinator(ctx) {
      coordinator = ctx || {};
      return drainfieldToolApi;
    }

    function callCoordinator(name) {
      const fn = coordinator && coordinator[name];
      if (typeof fn !== 'function') return undefined;
      const args = Array.prototype.slice.call(arguments, 1);
      return fn.apply(null, args);
    }

    function getSepticTankTool() {
      if (WS && typeof WS.getTool === 'function') {
        const registeredTool = WS.getTool('septicTank');
        if (registeredTool) return registeredTool;
      }
      return window.SitePlanSepticTankTool || null;
    }

    function septicConnectionSnapSymbol() {
      const septicTankTool = getSepticTankTool();
      const fn = septicTankTool && septicTankTool.connectionSnapSymbol;
      if (typeof fn === 'function') return fn();
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [0, 0, 0, 0.001],
        size: 10,
        outline: { type: 'simple-line', color: [0, 0, 0, 0], width: 0 }
      };
    }

    function drainfieldParentSymbol() {
      return {
        type: 'simple-fill',
        color: [0, 110, 45, 0.001],
        outline: { type: 'simple-line', color: [0, 110, 45, 0], width: 0 }
      };
    }

    function drainfieldLateralSymbol() {
      return {
        type: 'simple-line',
        color: [63, 90, 54, 1], // #3F5A36
        width: 1.5,
        cap: 'round',
        join: 'round'
      };
    }

    function drainfieldMeasurementLabelSymbol(text, angleDegrees) {
      return {
        type: 'text',
        text: text || '',
        color: [0, 0, 0, 1],
        haloColor: [255, 255, 255, 0.95],
        haloSize: 1,
        angle: Number.isFinite(angleDegrees) ? angleDegrees : 0,
        horizontalAlignment: 'center',
        verticalAlignment: 'bottom',
        yoffset: 2,
        font: {
          family: 'Arial',
          size: 9,
          weight: 'normal'
        }
      };
    }

    function clampDrainfieldLateralCount(value) {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n)) return DEFAULT_DRAINFIELD_LATERALS;
      return Math.max(2, Math.min(9, n));
    }

    function currentDrainfieldLateralCount() {
      const current = callCoordinator('currentDrainfieldLateralCount');
      return clampDrainfieldLateralCount(current != null ? current : DEFAULT_DRAINFIELD_LATERALS);
    }

    function isDrainfieldParent(graphic) {
      return rectangleTool.isParent(graphic);
    }

    function isReserveDrainfieldParent(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === RESERVE_DRAINFIELD_TOOL_TYPE || attrs.toolType === RESERVE_DRAINFIELD_TOOL_TYPE || attrs.sitePlanTool === RESERVE_DRAINFIELD_TOOL_TYPE) &&
        graphic.geometry && graphic.geometry.type === 'polygon');
    }

    function isDrainfieldLikeParent(graphic) {
      return isDrainfieldParent(graphic) || isReserveDrainfieldParent(graphic);
    }

    function applyDrainfieldParentMetadata(parent) {
      if (!parent) return parent;
      const parentId = WS.ensureSitePlanId(parent, 'drainfield');
      parent.__toolType = DRAINFIELD_TOOL_TYPE;
      parent.__label = 'Drainfield';
      parent.__measureLabel = 'Drainfield';
      parent.__skipEdgeLabels = true;
      parent.__preferredEditMode = 'transform';
      parent.__useFixedSizeLabels = false;
      const existingAttrs = parent.attributes || {};
      const lateralCount = clampDrainfieldLateralCount(
        parent.__lateralCount != null ? parent.__lateralCount :
          (existingAttrs.lateralCount != null ? existingAttrs.lateralCount : currentDrainfieldLateralCount())
      );
      const isFixed = !!(parent.__fixedSize || existingAttrs.fixedSize);
      if (isFixed && parent.__useFixedDrainfieldLengthLabel == null && existingAttrs.useFixedDrainfieldLengthLabel == null) {
        parent.__useFixedDrainfieldLengthLabel = true;
      }
      if (isFixed && parent.__drainfieldAxisEdgeIndex == null && existingAttrs.drainfieldAxisEdgeIndex == null) {
        parent.__drainfieldAxisEdgeIndex = 0;
      }
      if (isFixed && parent.__drainfieldAxisReverse == null && existingAttrs.drainfieldAxisReverse == null) {
        parent.__drainfieldAxisReverse = false;
      }
      const stampedMode = existingAttrs.drawingMode;
      const drawingMode = (stampedMode === 'existing' || stampedMode === 'proposed')
        ? stampedMode
        : (window.SitePlanDrawingMode
            ? window.SitePlanDrawingMode.getDrawingMode('well-septic')
            : 'existing');
      parent.attributes = Object.assign({}, existingAttrs, {
        toolType: DRAINFIELD_TOOL_TYPE,
        drawingMode,
        sitePlanTool: DRAINFIELD_TOOL_TYPE,
        sitePlanCategory: 'well-septic',
        sitePlanId: parentId,
        label: 'Drainfield',
        measureLabel: 'Drainfield',
        skipEdgeLabels: true,
        preferredEditMode: 'transform',
        useFixedSizeLabels: false,
        useFixedDrainfieldLengthLabel: !!(parent.__useFixedDrainfieldLengthLabel || existingAttrs.useFixedDrainfieldLengthLabel),
        lateralCount,
        drainfieldAxisEdgeIndex: parent.__drainfieldAxisEdgeIndex != null
          ? parent.__drainfieldAxisEdgeIndex
          : existingAttrs.drainfieldAxisEdgeIndex,
        drainfieldAxisReverse: parent.__drainfieldAxisReverse != null
          ? parent.__drainfieldAxisReverse
          : existingAttrs.drainfieldAxisReverse,
        toolCapabilities: Object.assign({}, DRAINFIELD_TOOL_CAPABILITIES)
      });
      parent.__lateralCount = lateralCount;
      WS.applyToolCapabilities(parent, DRAINFIELD_TOOL_CAPABILITIES);
      drainfieldAxisMetadata(parent);
      return parent;
    }

    function pickDrainfieldAxisMetadata(graphic) {
      if (!isDrainfieldLikeParent(graphic) || !graphic.geometry) return null;
      const pts = WS.ringWithoutDuplicateClose(graphic.geometry);
      if (pts.length < 4) return null;

      let best = null;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const d = Math.hypot(vx, vy);
        if (!Number.isFinite(d) || d <= 0) continue;

        const ux = vx / d;
        const score = d * 1000 + Math.max(0, ux);
        if (!best || score > best.score) {
          best = { index: i, reverse: ux < 0 || (Math.abs(ux) < 1e-9 && (vy / d) < 0), score };
        }
      }
      if (!best) return null;

      graphic.__drainfieldAxisEdgeIndex = best.index;
      graphic.__drainfieldAxisReverse = !!best.reverse;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        drainfieldAxisEdgeIndex: best.index,
        drainfieldAxisReverse: !!best.reverse
      });
      return best;
    }

    function drainfieldAxisMetadata(graphic) {
      if (!isDrainfieldLikeParent(graphic)) return null;
      const attrs = graphic.attributes || {};
      let edgeIndex = Number.parseInt(
        graphic.__drainfieldAxisEdgeIndex != null ? graphic.__drainfieldAxisEdgeIndex : attrs.drainfieldAxisEdgeIndex,
        10
      );
      let reverse = graphic.__drainfieldAxisReverse != null ? !!graphic.__drainfieldAxisReverse : !!attrs.drainfieldAxisReverse;

      if (!Number.isFinite(edgeIndex)) {
        const picked = pickDrainfieldAxisMetadata(graphic);
        if (!picked) return null;
        edgeIndex = picked.index;
        reverse = !!picked.reverse;
      } else {
        graphic.__drainfieldAxisEdgeIndex = edgeIndex;
        graphic.__drainfieldAxisReverse = reverse;
        graphic.attributes = Object.assign({}, attrs, {
          drainfieldAxisEdgeIndex: edgeIndex,
          drainfieldAxisReverse: reverse
        });
      }
      return { edgeIndex, reverse };
    }

    function drainfieldAxisInfo(graphic) {
      if (!isDrainfieldLikeParent(graphic) || !graphic.geometry) return null;
      const pts = WS.ringWithoutDuplicateClose(graphic.geometry);
      if (pts.length < 4) return null;
      const center = WS.polygonCenterFromRing(pts);
      if (!center) return null;

      const meta = drainfieldAxisMetadata(graphic);
      if (!meta) return null;
      let edgeIndex = meta.edgeIndex;
      if (edgeIndex < 0 || edgeIndex >= pts.length) edgeIndex = 0;

      const a = pts[edgeIndex];
      const b = pts[(edgeIndex + 1) % pts.length];
      if (!a || !b) return null;

      let vx = b[0] - a[0];
      let vy = b[1] - a[1];
      if (meta.reverse) {
        vx = -vx;
        vy = -vy;
      }
      const length = Math.hypot(vx, vy);
      if (!Number.isFinite(length) || length <= 0) return null;

      const ux = vx / length;
      const uy = vy / length;
      const px = -uy;
      const py = ux;
      const projectionsU = pts.map(p => (p[0] - center.x) * ux + (p[1] - center.y) * uy);
      const projectionsP = pts.map(p => (p[0] - center.x) * px + (p[1] - center.y) * py);
      const minU = Math.min.apply(null, projectionsU);
      const maxU = Math.max.apply(null, projectionsU);
      const minP = Math.min.apply(null, projectionsP);
      const maxP = Math.max.apply(null, projectionsP);
      const span = maxU - minU;
      const widthSpan = maxP - minP;
      if (!Number.isFinite(span) || !Number.isFinite(widthSpan) || span <= 0 || widthSpan <= 0) return null;
      return { center, ux, uy, px, py, span, widthSpan, spatialReference: graphic.geometry.spatialReference };
    }

    function lengthPolylineFt(polyline) {
      if (!polyline) return NaN;
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.geodesicLength === 'function') {
          const v = RT.geometryEngine.geodesicLength(polyline, 'feet');
          if (Number.isFinite(v)) return Math.abs(v);
        }
      } catch (err) {}
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.planarLength === 'function') {
          const v = RT.geometryEngine.planarLength(polyline, 'feet');
          if (Number.isFinite(v)) return Math.abs(v);
        }
      } catch (err) {}
      const path = polyline.paths && polyline.paths[0];
      if (!path || path.length < 2) return NaN;
      const dx = path[path.length - 1][0] - path[0][0];
      const dy = path[path.length - 1][1] - path[0][1];
      return Math.hypot(dx, dy);
    }

    function drainfieldConnectionPoint(parent) {
      if (!isDrainfieldParent(parent) || !parent.geometry) return null;
      const info = drainfieldAxisInfo(parent);
      if (!info) return null;
      const halfLength = info.span / 2;
      return WS.pointFromXY(
        info.center.x + info.ux * halfLength,
        info.center.y + info.uy * halfLength,
        WS.spatialReferenceJSON(info.spatialReference)
      );
    }

    function rebuildDrainfieldSupport(parent) {
      if (!isDrainfieldParent(parent)) return;
      applyDrainfieldParentMetadata(parent);
      const parentId = parent.__sitePlanId;
      WS.removeSupportGraphics(parentId);

      const info = drainfieldAxisInfo(parent);
      if (!info) return;

      const lateralCount = clampDrainfieldLateralCount(parent.__lateralCount || (parent.attributes && parent.attributes.lateralCount));
      const lateralSupport = WS.buildDrainfieldLateralSupports({
        parentId,
        axisInfo: info,
        lateralCount,
        symbol: drainfieldLateralSymbol,
        lateralRole: 'drainfield-lateral',
        manifoldRole: 'drainfield-manifold',
        supportCapabilities: SUPPORT_CAPABILITIES
      });
      const supports = lateralSupport.supports;
      const positions = lateralSupport.positions;
      const sr = lateralSupport.spatialReference;

      const labelOffset = positions.length ? positions[positions.length - 1] : 0;
      const firstLine = supports.find(g => g.__supportRole === 'drainfield-lateral');
      let lengthFt = firstLine ? lengthPolylineFt(firstLine.geometry) : NaN;
      const attrs = parent.attributes || {};
      if ((parent.__useFixedDrainfieldLengthLabel || attrs.useFixedDrainfieldLengthLabel) &&
          Number.isFinite(Number.parseFloat(parent.__fixedLengthFt != null ? parent.__fixedLengthFt : attrs.fixedLengthFt))) {
        lengthFt = Number.parseFloat(parent.__fixedLengthFt != null ? parent.__fixedLengthFt : attrs.fixedLengthFt);
      }
      const lengthText = Number.isFinite(lengthFt) ? (lengthFt.toFixed(1) + ' ft') : '';
      const labelPoint = WS.pointFromXY(
        info.center.x + info.px * labelOffset,
        info.center.y + info.py * labelOffset,
        sr
      );
      if (lengthText) {
        supports.push(WS.tagSupportGraphic(new RT.Graphic({
          geometry: labelPoint,
          symbol: drainfieldMeasurementLabelSymbol(lengthText, 0)
        }), parentId, 'drainfield-length-label', null, SUPPORT_CAPABILITIES));
      }

      if (supports.length) RT.labelLayer.addMany(supports);

      const connection = drainfieldConnectionPoint(parent);
      if (connection) {
        WS.addConnectionSnapSupports({
          parentId,
          point: connection,
          role: 'drainfield-connection-snap',
          symbol: septicConnectionSnapSymbol,
          indexProperty: '__drainfieldConnectionIndex',
          indexAttribute: 'drainfieldConnectionIndex',
          supportCapabilities: SUPPORT_CAPABILITIES
        });
      }
    }

    function rebuildReserveDrainfieldSupport(parent) {
      const tool = WS && typeof WS.getTool === 'function'
        ? (WS.getTool(RESERVE_DRAINFIELD_TOOL_TYPE) || WS.getTool('reserveDrainfield'))
        : null;
      const reserveTool = tool || window.SitePlanReserveDrainfieldTool || null;
      if (reserveTool && typeof reserveTool.rebuildSupport === 'function') {
        return reserveTool.rebuildSupport(parent);
      }
      return undefined;
    }

    function pointInRingXY(x, y, ring) {
      if (!ring || ring.length < 3 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function pointInPolygonFallback(point, polygon) {
      if (!point || !polygon || !polygon.rings || !polygon.rings.length) return false;
      return pointInRingXY(point.x, point.y, polygon.rings[0]);
    }

    function pointWithinPrimaryDrainfield(point, drainfield) {
      if (!point || !isDrainfieldParent(drainfield) || !drainfield.geometry) return false;
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.contains === 'function') {
          if (RT.geometryEngine.contains(drainfield.geometry, point)) return true;
        }
      } catch (err) {}
      try {
        if (RT.geometryEngine && typeof RT.geometryEngine.intersects === 'function') {
          if (RT.geometryEngine.intersects(drainfield.geometry, point)) return true;
        }
      } catch (err) {}
      return pointInPolygonFallback(point, drainfield.geometry);
    }

    function screenDistanceBetweenPoints(a, b) {
      if (!a || !b || !RT.view) return Infinity;
      try {
        const as = RT.view.toScreen(a);
        const bs = RT.view.toScreen(b);
        if (!as || !bs || !Number.isFinite(as.x) || !Number.isFinite(as.y) ||
            !Number.isFinite(bs.x) || !Number.isFinite(bs.y)) return Infinity;
        return Math.hypot(as.x - bs.x, as.y - bs.y);
      } catch (err) {
        return Infinity;
      }
    }

    function findPrimaryDrainfieldForDboxPoint(point) {
      if (!point) return null;
      const drainfields = WS.graphicsInLayer(RT.drawLayer).filter(g => isDrainfieldParent(g));
      for (const df of drainfields) {
        if (pointWithinPrimaryDrainfield(point, df)) return df;
      }

      let best = null;
      drainfields.forEach(df => {
        const connection = drainfieldConnectionPoint(df);
        const distancePx = screenDistanceBetweenPoints(point, connection);
        if (distancePx <= DBOX_DRAINFIELD_SNAP_TOLERANCE_PX &&
            (!best || distancePx < best.distancePx)) {
          best = { drainfield: df, distancePx };
        }
      });
      return best ? best.drainfield : null;
    }


    function drainfieldEls() {
      return {
        checkbox: document.getElementById(DRAINFIELD_CHECKBOX_ID),
        length: document.getElementById(DRAINFIELD_LENGTH_ID),
        width: document.getElementById(DRAINFIELD_WIDTH_ID),
        laterals: document.getElementById(DRAINFIELD_LATERALS_ID)
      };
    }

    function reserveDrainfieldEls() {
      return {
        laterals: document.getElementById(RESERVE_DRAINFIELD_LATERALS_ID)
      };
    }

    function drainfieldLateralCount() {
      const els = drainfieldEls();
      const raw = els.laterals ? Number.parseInt(els.laterals.value, 10) : DEFAULT_DRAINFIELD_LATERALS;
      return clampDrainfieldLateralCount(raw);
    }

    function drainfieldDimensions() {
      const dims = rectangleTool && typeof rectangleTool.dimensions === 'function'
        ? rectangleTool.dimensions()
        : { widthFt: NaN, lengthFt: NaN, valid: false };
      return {
        lengthFt: dims.lengthFt,
        widthFt: dims.widthFt,
        valid: !!dims.valid
      };
    }

    function reserveDrainfieldLateralCount() {
      const els = reserveDrainfieldEls();
      const raw = els.laterals ? Number.parseInt(els.laterals.value, 10) : DEFAULT_DRAINFIELD_LATERALS;
      return clampDrainfieldLateralCount(raw);
    }

    function clearPeerButtonsForDrainfield() {
      callCoordinator('clearSepticButton');
      callCoordinator('clearDboxButton');
      callCoordinator('clearSepticLineButton');
    }

    function announceDrainfieldTool() {
      callCoordinator('announceToolActivated', DRAINFIELD_TOOL_TYPE);
      callCoordinator('cancelSepticPlacement', false);
      callCoordinator('clearSepticButton');
      callCoordinator('cancelDboxPlacement', false);
      callCoordinator('clearDboxButton');
      callCoordinator('cancelSepticLinePlacement', false);
      callCoordinator('clearSepticLineButton');
      callCoordinator('clearSepticValidation');
      callCoordinator('clearDboxValidation');
      callCoordinator('cancelReserveDrainfieldPlacement', false);
      callCoordinator('clearReserveDrainfieldButton');
      callCoordinator('clearDrainfieldValidation');
    }

    function syncAttachedDboxesForDrainfield(parent) {
      callCoordinator('syncAttachedDboxesForDrainfield', parent);
    }

    function detachDboxesForDrainfield(parent) {
      callCoordinator('detachDboxesForDrainfield', parent);
    }

    function buildDrainfieldLateralRow() {
      if (lateralRowEl) return lateralRowEl;
      const row = document.createElement('div');
      row.className = 'size-row drainfield-lateral-row';
      row.innerHTML =
        '<span class="lateral-checkbox-spacer" aria-hidden="true"></span>' +
        '<label for="' + DRAINFIELD_LATERALS_ID + '" class="size-lbl lateral-label">Number of Laterals (Pipes)</label>' +
        '<span class="lateral-placeholder-input" aria-hidden="true"></span>' +
        '<span class="dim-sep lateral-placeholder-sep" aria-hidden="true">x</span>' +
        '<input id="' + DRAINFIELD_LATERALS_ID + '" type="number" min="2" max="9" step="1" value="' + DEFAULT_DRAINFIELD_LATERALS + '" class="dim-input lateral-input" aria-label="Number of drainfield laterals">';
      lateralRowEl = row;
      return lateralRowEl;
    }

    function ensureDrainfieldLateralToolbar() {
      if (drainfieldToolbarWrap && drainfieldToolbarCount && drainfieldToolbarMenu) return;
      const toolbar = document.getElementById('selection-toolbar');
      if (!toolbar) return;

      drainfieldToolbarWrap = document.createElement('div');
      drainfieldToolbarWrap.id = 'df-lateral-tool-wrap';
      drainfieldToolbarWrap.className = 'df-lateral-tool-wrap';
      drainfieldToolbarWrap.setAttribute('aria-label', 'Change number of laterals');

      const optionsHtml = Array.from({ length: 8 }, (_, i) => {
        const value = i + 2;
        return '<button type="button" class="df-lateral-option" data-count="' + value + '">' + value + '</button>';
      }).join('');

      drainfieldToolbarWrap.innerHTML =
        '<button type="button" class="selection-tool-btn df-lateral-menu-btn" title="Change number of laterals" aria-label="Change number of laterals">' +
          '<span class="df-lateral-count">' + DEFAULT_DRAINFIELD_LATERALS + '</span>' +
          '<span class="df-lateral-caret" aria-hidden="true">▾</span>' +
        '</button>' +
        '<div class="df-lateral-menu" role="menu" aria-label="Drainfield laterals">' + optionsHtml + '</div>';

      const deleteBtn = document.getElementById('btn-delete-tool');
      if (deleteBtn && deleteBtn.parentNode === toolbar) toolbar.insertBefore(drainfieldToolbarWrap, deleteBtn);
      else toolbar.appendChild(drainfieldToolbarWrap);

      drainfieldToolbarCount = drainfieldToolbarWrap.querySelector('.df-lateral-count');
      drainfieldToolbarMenu = drainfieldToolbarWrap.querySelector('.df-lateral-menu');
      const menuButton = drainfieldToolbarWrap.querySelector('.df-lateral-menu-btn');

      if (menuButton) {
        menuButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          drainfieldToolbarWrap.classList.toggle('open');
        });
        menuButton.addEventListener('pointerdown', event => event.stopPropagation());
        menuButton.addEventListener('keydown', event => event.stopPropagation());
      }

      drainfieldToolbarWrap.querySelectorAll('.df-lateral-option').forEach(option => {
        option.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const count = clampDrainfieldLateralCount(option.getAttribute('data-count'));
          updateSelectedDrainfieldLateralCount(count, { source: 'toolbar', normalize: true });
          drainfieldToolbarWrap.classList.remove('open');
        });
      });

      document.addEventListener('click', () => {
        if (drainfieldToolbarWrap) drainfieldToolbarWrap.classList.remove('open');
      });
    }

    function currentSelectedDrainfieldLateralCount(graphic) {
      if (!isDrainfieldLikeParent(graphic)) return DEFAULT_DRAINFIELD_LATERALS;
      return clampDrainfieldLateralCount(graphic.__lateralCount || (graphic.attributes && graphic.attributes.lateralCount));
    }

    function syncDrainfieldLateralInputs(count, options) {
      const normalized = clampDrainfieldLateralCount(count);
      const opts = options || {};
      const els = isReserveDrainfieldParent(selectedDrainfieldGraphic) ? reserveDrainfieldEls() : drainfieldEls();
      if (els.laterals && opts.source !== 'sidebar') els.laterals.value = normalized;
      if (drainfieldToolbarCount) drainfieldToolbarCount.textContent = String(normalized);
      if (drainfieldToolbarWrap) {
        drainfieldToolbarWrap.querySelectorAll('.df-lateral-option').forEach(option => {
          option.classList.toggle('active', clampDrainfieldLateralCount(option.getAttribute('data-count')) === normalized);
        });
      }
      if (opts.normalize && els.laterals) els.laterals.value = normalized;
    }

    function updateSelectedDrainfieldLateralCount(value, options) {
      const opts = options || {};
      if (!isDrainfieldLikeParent(selectedDrainfieldGraphic)) return;
      if (opts.onlyIfReserve && !isReserveDrainfieldParent(selectedDrainfieldGraphic)) return;
      if (opts.onlyIfPrimary && !isDrainfieldParent(selectedDrainfieldGraphic)) return;
      const count = clampDrainfieldLateralCount(value);
      selectedDrainfieldGraphic.__lateralCount = count;
      selectedDrainfieldGraphic.attributes = Object.assign({}, selectedDrainfieldGraphic.attributes || {}, {
        lateralCount: count
      });
      if (isReserveDrainfieldParent(selectedDrainfieldGraphic)) {
        rebuildReserveDrainfieldSupport(selectedDrainfieldGraphic);
      } else {
        rebuildDrainfieldSupport(selectedDrainfieldGraphic);
      }
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(selectedDrainfieldGraphic);
      syncDrainfieldLateralInputs(count, Object.assign({ normalize: true }, opts));
    }

    function setDrainfieldToolbarVisible(visible) {
      ensureDrainfieldLateralToolbar();
      if (!drainfieldToolbarWrap) return;
      drainfieldToolbarWrap.classList.toggle('visible', !!visible);
      drainfieldToolbarWrap.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function handleSelectionChangedForDrainfield(graphic) {
      ensureDrainfieldLateralToolbar();
      if (isDrainfieldLikeParent(graphic)) {
        selectedDrainfieldGraphic = graphic;
        const count = currentSelectedDrainfieldLateralCount(graphic);
        syncDrainfieldLateralInputs(count, { normalize: true });
        setDrainfieldToolbarVisible(true);
        return;
      }
      selectedDrainfieldGraphic = null;
      setDrainfieldToolbarVisible(false);
    }

    function wireLateralControls() {
      if (lateralControlsWired) return;
      const els = drainfieldEls();
      if (!els.laterals) return;

      els.laterals.addEventListener('input', () => {
        const count = clampDrainfieldLateralCount(els.laterals.value);
        if (isDrainfieldParent(selectedDrainfieldGraphic)) {
          updateSelectedDrainfieldLateralCount(count, { source: 'sidebar' });
        } else if (rectangleTool && rectangleTool.isActive && rectangleTool.isActive()) {
          rectangleTool.restartIfActive({ force: false });
        }
      });
      els.laterals.addEventListener('change', () => {
        const count = clampDrainfieldLateralCount(els.laterals.value);
        els.laterals.value = count;
        if (isDrainfieldParent(selectedDrainfieldGraphic)) {
          updateSelectedDrainfieldLateralCount(count, { source: 'sidebar', normalize: true });
        } else if (rectangleTool && typeof rectangleTool.restartIfActive === 'function') {
          rectangleTool.restartIfActive({ force: false });
        }
      });
      els.laterals.addEventListener('keydown', event => event.stopPropagation());
      lateralControlsWired = true;
    }

    function wireControls() {
      if (rectangleTool && typeof rectangleTool.wireControls === 'function') {
        rectangleTool.wireControls();
      }
      wireLateralControls();
      ensureDrainfieldLateralToolbar();
    }

    function getElements() {
      const elements = rectangleTool && typeof rectangleTool.getElements === 'function'
        ? rectangleTool.getElements()
        : [];
      return elements.concat(buildDrainfieldLateralRow()).filter(Boolean);
    }

    rectangleTool = RECT.create({
      RT,
      toolId: DRAINFIELD_TOOL_TYPE,
      buttonId: DRAINFIELD_BUTTON_ID,
      checkboxId: DRAINFIELD_CHECKBOX_ID,
      widthId: DRAINFIELD_WIDTH_ID,
      lengthId: DRAINFIELD_LENGTH_ID,
      category: 'well-septic',
      label: 'Drainfield',
      order: 40,
      symbol: drainfieldParentSymbol(),
      toolCapabilities: DRAINFIELD_TOOL_CAPABILITIES,
      makeGeometry: (center, widthFt, lengthFt) => WS.makeRectGeometryFromCenter(center, lengthFt, widthFt),
      onAnnounce: announceDrainfieldTool,
      isOwnEvent: detail => detail && detail.source === 'tools-well-septic' && detail.tool === DRAINFIELD_TOOL_TYPE,
      logPrefix: '[tools-well-septic/drainfield]',
      buttonTitle: 'Place or draw a drainfield',
      iconHtml: drainfieldIcon,
      iconApply: window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      iconClass: 'dm-line36',
      minWidthFt: 0.1,
      minLengthFt: 0.1,
      widthStep: 0.1,
      lengthStep: 0.1,
      dimensionOrder: 'length-width',
      widthAriaLabel: 'Drainfield width in feet',
      lengthAriaLabel: 'Drainfield length in feet',
      toolTypeKey: DRAINFIELD_TOOL_TYPE,
      pendingKey: DRAINFIELD_TOOL_TYPE,
      suppressLiveSideLabelsDuringManual: true,
      extraSettingsSignature: () => drainfieldLateralCount(),
      applyExtraMetadata: applyDrainfieldParentMetadata,
      onActiveChanged: active => {
        callCoordinator('onDrainfieldActiveChanged', !!active);
        if (active) callCoordinator('clearOtherActiveButtons', DRAINFIELD_TOOL_TYPE);
      },
      onPendingChanged: pending => {
        callCoordinator('onDrainfieldPendingChanged', !!pending);
      },
      onPlaceFixed: parent => {
        clearPeerButtonsForDrainfield();
        syncAttachedDboxesForDrainfield(parent);
        if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(parent);
      },
      onGraphicCreated: (graphic, context) => {
        if (context && context.createdByTool) {
          graphic.__lateralCount = drainfieldLateralCount();
          graphic.attributes = Object.assign({}, graphic.attributes || {}, { lateralCount: graphic.__lateralCount });
          pickDrainfieldAxisMetadata(graphic);
        }
        rebuildDrainfieldSupport(graphic);
        syncAttachedDboxesForDrainfield(graphic);
        if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      },
      onGraphicUpdated: (graphic, event) => {
        if (event && event.toolEventInfo && String(event.toolEventInfo.type || '').toLowerCase().indexOf('scale') >= 0) {
          graphic.__useFixedDrainfieldLengthLabel = false;
          graphic.attributes = Object.assign({}, graphic.attributes || {}, { useFixedDrainfieldLengthLabel: false });
        }
        rebuildDrainfieldSupport(graphic);
        syncAttachedDboxesForDrainfield(graphic);
        if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      },
      onGraphicDeleted: graphic => {
        detachDboxesForDrainfield(graphic);
        const parentId = WS.ensureSitePlanId(graphic, 'drainfield');
        WS.removeSupportGraphics(parentId);
      }
    });

    const drainfieldToolApi = Object.assign({}, rectangleTool, {
      id: DRAINFIELD_TOOL_TYPE,
      order: 40,
      capabilities: Object.assign({}, DRAINFIELD_TOOL_CAPABILITIES),
      supportCapabilities: Object.assign({}, SUPPORT_CAPABILITIES),
      ownsLifecycle: true,

      setCoordinator,
      buildLateralRow: buildDrainfieldLateralRow,
      getElements,
      wireControls,
      dimensions: drainfieldDimensions,
      ensureDrainfieldLateralToolbar,
      handleSelectionChangedForDrainfield,
      updateSelectedDrainfieldLateralCount,

      lateralCount: drainfieldLateralCount,

      clampLateralCount: clampDrainfieldLateralCount,
      symbol: drainfieldParentSymbol,
      lateralSymbol: drainfieldLateralSymbol,
      measurementLabelSymbol: drainfieldMeasurementLabelSymbol,

      isParent: isDrainfieldParent,
      isReserveParent: isReserveDrainfieldParent,
      isLikeParent: isDrainfieldLikeParent,
      applyMetadata: applyDrainfieldParentMetadata,
      pickAxisMetadata: pickDrainfieldAxisMetadata,
      axisMetadata: drainfieldAxisMetadata,
      axisInfo: drainfieldAxisInfo,
      connectionPoint: drainfieldConnectionPoint,
      rebuildSupport: rebuildDrainfieldSupport,
      pointWithinPrimary: pointWithinPrimaryDrainfield,
      findPrimaryForDboxPoint: findPrimaryDrainfieldForDboxPoint
    });

    window.SitePlanDrainfieldTool = Object.assign({}, window.SitePlanDrainfieldTool || {}, drainfieldToolApi);
    window.SitePlanDrainfieldsTool = window.SitePlanDrainfieldTool;

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanDrainfieldTool);
    } else {
      console.warn('[tools-well-septic/drainfield] Well & Septic registry is unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/drainfield] Failed to initialize after runtime ready:', err);
  });
})();
