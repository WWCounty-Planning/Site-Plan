// Driveway centerline tool with generated textured-width surface.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/driveway] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-access/access-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const AS = window.SitePlanAccessShared = window.SitePlanAccessShared || {};

    const TOOL_ID = 'driveway';
    const BUTTON_ID = 'btn-driveway';
    const WIDTH_ID = 'driveway-width';
    const MATERIAL_ID = 'driveway-material';
    const DEFAULT_WIDTH_FT = 12;
    const MIN_WIDTH_FT = 1;
    const ROUND_JOIN_STEP_RADIANS = Math.PI / 14;
    const JUNCTION_TOLERANCE_FT = 2;
    const BORDER_COLOR = [100, 111, 91, 1]; // #646F5B
    const CATEGORY = 'access';

    const TOOL_CAPABILITIES = {
      reshape: true,
      resize: false,
      rotate: false,
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
      delete: false,
      toolbar: false
    };

    let buttonEl = null;
    let materialControlsEl = null;
    let controlsEl = null;
    let controlsWired = false;
    let activeTool = false;
    let pendingCreate = false;
    let unregisterDrivewayIcon = null;

    function parseWidth() {
      const input = document.getElementById(WIDTH_ID);
      const value = Number.parseFloat(input && input.value);
      return Number.isFinite(value) && value >= MIN_WIDTH_FT ? value : DEFAULT_WIDTH_FT;
    }

    function markValidity() {
      const input = document.getElementById(WIDTH_ID);
      const value = Number.parseFloat(input && input.value);
      const valid = Number.isFinite(value) && value >= MIN_WIDTH_FT;
      if (input) input.classList.toggle('invalid', !valid);
      return valid;
    }

    function clearValidation() {
      const input = document.getElementById(WIDTH_ID);
      if (input) input.classList.remove('invalid');
    }

    function centerOfPath(path) {
      if (!path || !path.length) return null;
      const sum = path.reduce((acc, point) => {
        acc.x += point[0];
        acc.y += point[1];
        return acc;
      }, { x: 0, y: 0 });
      return { x: sum.x / path.length, y: sum.y / path.length };
    }

    function mapUnitsForWidth(widthFt, path, spatialReference) {
      const center = centerOfPath(path);
      if (!center) return widthFt;
      return AS.feetToMapScalar(widthFt, center, spatialReference);
    }

    function cleanPath(geometry) {
      if (!geometry || geometry.type !== 'polyline' || !geometry.paths || !geometry.paths.length) return [];
      const source = geometry.paths[0] || [];
      const cleaned = [];
      source.forEach(point => {
        if (!point || point.length < 2) return;
        const next = [point[0], point[1]];
        const prev = cleaned[cleaned.length - 1];
        if (!prev || Math.hypot(next[0] - prev[0], next[1] - prev[1]) > 1e-9) cleaned.push(next);
      });
      return cleaned;
    }

    function offsetPoint(point, seg, side, halfWidth) {
      const sign = side === 'left' ? 1 : -1;
      return [point[0] + seg.nx * halfWidth * sign, point[1] + seg.ny * halfWidth * sign];
    }

    function normalizeAngleDelta(delta) {
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return delta;
    }

    function roundJoinPoints(center, startPoint, endPoint) {
      const startAngle = Math.atan2(startPoint[1] - center[1], startPoint[0] - center[0]);
      const endAngle = Math.atan2(endPoint[1] - center[1], endPoint[0] - center[0]);
      const delta = normalizeAngleDelta(endAngle - startAngle);
      const radius = Math.hypot(startPoint[0] - center[0], startPoint[1] - center[1]);
      if (!Number.isFinite(delta) || !Number.isFinite(radius) || radius <= 0) return [startPoint, endPoint];
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / ROUND_JOIN_STEP_RADIANS));
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + delta * (i / steps);
        points.push([
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius
        ]);
      }
      return points;
    }

    function offsetVertex(path, segments, index, side, halfWidth) {
      if (index === 0) return [offsetPoint(path[0], segments[0], side, halfWidth)];
      if (index === path.length - 1) return [offsetPoint(path[index], segments[segments.length - 1], side, halfWidth)];

      const prev = segments[index - 1];
      const next = segments[index];
      const sign = side === 'left' ? 1 : -1;
      const basePrev = {
        x: path[index][0] + prev.nx * halfWidth * sign,
        y: path[index][1] + prev.ny * halfWidth * sign
      };
      const baseNext = {
        x: path[index][0] + next.nx * halfWidth * sign,
        y: path[index][1] + next.ny * halfWidth * sign
      };
      const turn = prev.ux * next.uy - prev.uy * next.ux;
      const isOuterSide = side === 'left' ? turn < 0 : turn > 0;
      if (!isOuterSide) {
        const intersection = AS.lineIntersection(
          basePrev,
          { x: prev.ux, y: prev.uy },
          baseNext,
          { x: next.ux, y: next.uy }
        );
        if (intersection) return [intersection];
        return [[basePrev.x, basePrev.y], [baseNext.x, baseNext.y]];
      }
      return roundJoinPoints(path[index], [basePrev.x, basePrev.y], [baseNext.x, baseNext.y]);
    }

    function drivewayVisualParts(centerlineGeometry, widthFt) {
      const path = cleanPath(centerlineGeometry);
      if (path.length < 2) return null;
      const sr = centerlineGeometry.spatialReference;
      const widthUnits = mapUnitsForWidth(widthFt, path, sr);
      const halfWidth = widthUnits / 2;
      if (!Number.isFinite(halfWidth) || halfWidth <= 0) return null;

      const segments = [];
      for (let i = 0; i < path.length - 1; i++) {
        const seg = AS.segmentInfo(path[i], path[i + 1]);
        if (seg) segments.push(seg);
      }
      if (segments.length !== path.length - 1) return null;

      const left = [];
      const right = [];
      for (let i = 0; i < path.length; i++) {
        offsetVertex(path, segments, i, 'left', halfWidth).forEach(point => left.push(point));
        offsetVertex(path, segments, i, 'right', halfWidth).forEach(point => right.push(point));
      }

      const ring = left.concat(right.slice().reverse());
      if (ring.length < 3) return null;
      ring.push(ring[0].slice());

      const surface = {
        type: 'polygon',
        rings: [ring],
        spatialReference: AS.spatialReferenceJSON(sr)
      };
      const leftEdge = {
        type: 'polyline',
        paths: [left.map(point => point.slice())],
        spatialReference: AS.spatialReferenceJSON(sr)
      };
      const rightEdge = {
        type: 'polyline',
        paths: [right.map(point => point.slice())],
        spatialReference: AS.spatialReferenceJSON(sr)
      };
      const startCap = {
        type: 'polyline',
        paths: [[[left[0][0], left[0][1]], [right[0][0], right[0][1]]]],
        spatialReference: AS.spatialReferenceJSON(sr)
      };
      const endCap = {
        type: 'polyline',
        paths: [[[left[left.length - 1][0], left[left.length - 1][1]], [right[right.length - 1][0], right[right.length - 1][1]]]],
        spatialReference: AS.spatialReferenceJSON(sr)
      };

      return { surface, leftEdge, rightEdge, startCap, endCap };
    }

    function drivewaySurfaceGeometry(centerlineGeometry, widthFt) {
      const parts = drivewayVisualParts(centerlineGeometry, widthFt);
      return parts ? parts.surface : null;
    }

    function selectedMaterialId() {
      const select = document.getElementById(MATERIAL_ID);
      if (select && select.value) return select.value;
      return AS.selectedDrivewayMaterialId || 'asphalt';
    }

    function materialOptionsHtml() {
      const materials = AS && typeof AS.getDrivewayMaterials === 'function' ? AS.getDrivewayMaterials() : [];
      const materialList = materials.length ? materials : [
        { id: 'gravel', label: 'Gravel' },
        { id: 'asphalt', label: 'Asphalt' }
      ];
      const selected = AS.selectedDrivewayMaterialId || 'asphalt';
      return materialList.map(material => {
        const id = material.id || '';
        const label = material.label || id;
        const active = id === selected ? ' selected' : '';
        return '<option value="' + id + '"' + active + '>' + label + '</option>';
      }).join('');
    }

    function drivewayIconPattern(materialId) {
      const asphalt = materialId === 'asphalt';
      return '<defs>' +
        '<pattern id="driveway-material-pat" patternUnits="userSpaceOnUse" width="10" height="10" x="2" y="2">' +
          (asphalt
            ? '<g stroke="#646F5B" stroke-width="0.40" stroke-linecap="round">' +
              '<line x1="1.92" y1="0.54" x2="1.92" y2="2.54" transform="rotate(-8 1.92 1.54)"/>' +
              '<line x1="5.77" y1="0.15" x2="5.77" y2="2.15" transform="rotate(5 5.77 1.15)"/>' +
              '<line x1="8.46" y1="1.31" x2="8.46" y2="3.31" transform="rotate(-12 8.46 2.31)"/>' +
              '<line x1="3.46" y1="2.85" x2="3.46" y2="4.85" transform="rotate(10 3.46 3.85)"/>' +
              '<line x1="7.69" y1="3.23" x2="7.69" y2="5.23" transform="rotate(-6 7.69 4.23)"/>' +
              '<line x1="1.15" y1="5.15" x2="1.15" y2="7.15" transform="rotate(8 1.15 6.15)"/>' +
              '<line x1="5.00" y1="4.38" x2="5.00" y2="6.38" transform="rotate(12 5.00 5.38)"/>' +
              '<line x1="8.85" y1="6.31" x2="8.85" y2="8.31" transform="rotate(-10 8.85 7.31)"/>' +
              '<line x1="2.69" y1="6.69" x2="2.69" y2="8.69" transform="rotate(-7 2.69 7.69)"/>' +
              '<line x1="6.54" y1="7.08" x2="6.54" y2="9.08" transform="rotate(6 6.54 8.08)"/>' +
              '<line x1="4.62" y1="7.85" x2="4.62" y2="9.85" transform="rotate(-15 4.62 8.85)"/>' +
            '</g>'
            : '<g fill="none" stroke="#646F5B" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round">' +
              '<ellipse cx="2.5" cy="2.0" rx="1.40" ry="0.80" transform="rotate(20 2.5 2.0)"/>' +
              '<ellipse cx="7.5" cy="1.8" rx="0.70" ry="0.45" transform="rotate(-15 7.5 1.8)"/>' +
              '<ellipse cx="7.8" cy="5.5" rx="1.00" ry="0.65" transform="rotate(35 7.8 5.5)"/>' +
              '<ellipse cx="1.5" cy="7.0" rx="0.70" ry="0.50" transform="rotate(-20 1.5 7.0)"/>' +
              '<ellipse cx="5.0" cy="5.0" rx="1.50" ry="0.95" transform="rotate(10 5.0 5.0)"/>' +
              '<ellipse cx="3.8" cy="8.5" rx="0.70" ry="0.45" transform="rotate(40 3.8 8.5)"/>' +
              '<ellipse cx="8.2" cy="8.5" rx="0.90" ry="0.60" transform="rotate(-8 8.2 8.5)"/>' +
            '</g>'
          ) +
        '</pattern>' +
      '</defs>';
    }

    function drivewayIcon(materialId) {
      const pattern = drivewayIconPattern(materialId);
      const field =
        '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E9DDCC" fill-opacity="0.30"/>' +
        '<rect x="2" y="2" width="32" height="18" rx="1" fill="url(#driveway-material-pat)"/>';
      const proposedBorder =
        '<g fill="none" stroke="#646F5B" stroke-width="1" stroke-linecap="butt">' +
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
        '<g fill="none" stroke="#646F5B" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
          '<path d="M 5 2 H 3 Q 2 2 2 3 V 5"/>' +
          '<path d="M 31 2 H 33 Q 34 2 34 3 V 5"/>' +
          '<path d="M 34 17 V 19 Q 34 20 33 20 H 31"/>' +
          '<path d="M 5 20 H 3 Q 2 20 2 19 V 17"/>' +
        '</g>';
      return '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        pattern +
        '<g class="dm-existing">' +
          field +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="none" stroke="#646F5B" stroke-width="1"/>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          field +
          proposedBorder +
        '</g>' +
      '</svg>';
    }

    function refreshDrivewayIcon() {
      const btn = buttonEl || document.getElementById(BUTTON_ID);
      if (!btn) return;
      const icon = btn.querySelector('.tool-icon');
      if (!icon) return;
      if (typeof unregisterDrivewayIcon === 'function') unregisterDrivewayIcon();
      icon.innerHTML = drivewayIcon(selectedMaterialId());
      const svg = icon.querySelector('svg');
      if (svg && window.SitePlanDrawingMode) {
        unregisterDrivewayIcon = window.SitePlanDrawingMode.registerIcon(svg, {
          category: CATEGORY,
          apply: window.SitePlanDrawingMode.iconSwapApply
        });
      }
    }

    function drawingModeForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      if (attrs.drawingMode === 'proposed' || attrs.drawingMode === 'existing') return attrs.drawingMode;
      return window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode(CATEGORY) : 'existing';
    }

    function borderLineSymbol(mode) {
      return {
        type: 'simple-line',
        color: BORDER_COLOR,
        width: 2.5,
        style: mode === 'proposed' ? 'long-dash' : 'solid',
        cap: 'butt',
        join: 'round'
      };
    }

    function surfaceSymbol(materialId) {
      const symbol = AS.drivewaySurfaceSymbol
        ? AS.drivewaySurfaceSymbol(materialId || selectedMaterialId())
        : {
            type: 'simple-fill',
            color: [80, 80, 80, 0.35],
            outline: { type: 'simple-line', color: [80, 80, 80, 0.9], width: 1.1 }
          };
      return Object.assign({}, symbol, {
        outline: { type: 'simple-line', color: [80, 80, 80, 0], width: 0 }
      });
    }

    function supportLayer() {
      return RT.drawingShadowLayer || RT.labelLayer || RT.drawLayer;
    }

    function centerlineSymbol() {
      return {
        type: 'simple-line',
        color: [0, 0, 0, 0],
        width: 1
      };
    }

    function sketchSymbol() {
      return {
        type: 'simple-line',
        color: [80, 80, 80, 0.85],
        width: 2,
        style: 'short-dash',
        cap: 'butt',
        join: 'round'
      };
    }

    function isParent(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === TOOL_ID || attrs.toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID) &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    }

    function applyMetadata(graphic) {
      if (!graphic) return graphic;
      const parentId = AS.ensureSitePlanId(graphic, 'driveway');
      const widthFt = Number.parseFloat((graphic.attributes || {}).widthFt) || parseWidth();
      const materialId = (graphic.attributes && graphic.attributes.drivewayMaterial) || selectedMaterialId();
      const drawingMode = drawingModeForGraphic(graphic);
      graphic.__toolType = TOOL_ID;
      graphic.__label = 'Driveway';
      graphic.__measureLabel = 'Driveway';
      graphic.__preferredEditMode = 'reshape';
      graphic.__skipEdgeLabels = true;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType: TOOL_ID,
        sitePlanTool: TOOL_ID,
        sitePlanCategory: CATEGORY,
        sitePlanId: parentId,
        drawingMode,
        label: 'Driveway',
        measureLabel: 'Driveway',
        preferredEditMode: 'reshape',
        skipEdgeLabels: true,
        widthFt,
        drivewayMaterial: materialId,
        toolCapabilities: Object.assign({}, TOOL_CAPABILITIES)
      });
      graphic.symbol = centerlineSymbol();
      AS.applyToolCapabilities(graphic, TOOL_CAPABILITIES);
      return graphic;
    }

    function isSupportGraphic(graphic, parentId) {
      if (!graphic) return false;
      const attrs = graphic.attributes || {};
      const supportFor = graphic.__supportFor || attrs.supportFor || attrs.parentSitePlanId;
      const role = graphic.__supportRole || attrs.supportRole;
      return supportFor && supportFor === parentId &&
        (role === 'driveway-surface' || role === 'driveway-junction' ||
         role === 'driveway-border');
    }

    function removeSupport(parentId) {
      if (!parentId) return;
      [RT.drawingShadowLayer, RT.labelLayer, RT.drawLayer].filter(Boolean).forEach(layer => {
        AS.graphicsInLayer(layer)
          .filter(graphic => isSupportGraphic(graphic, parentId))
          .forEach(graphic => {
            try { layer.remove(graphic); } catch (err) {}
          });
      });
    }

    function supportGraphic(parent, surfaceGeometry, role, symbol) {
      const parentId = parent && parent.__sitePlanId;
      const materialId = (parent && parent.attributes && parent.attributes.drivewayMaterial) || selectedMaterialId();
      const supportRole = role || 'driveway-surface';
      const drawingMode = drawingModeForGraphic(parent);
      const graphic = new RT.Graphic({
        geometry: surfaceGeometry,
        symbol: symbol || surfaceSymbol(materialId),
        attributes: {
          sitePlanTool: supportRole === 'driveway-junction'
            ? 'drivewayJunction'
            : (supportRole === 'driveway-border' ? 'drivewayBorder' : 'drivewaySurface'),
          sitePlanCategory: 'access-support',
          parentSitePlanId: parentId,
          selectParentId: parentId,
          supportFor: parentId,
          supportRole,
          drawingMode,
          drivewayMaterial: materialId,
          toolCapabilities: Object.assign({}, SUPPORT_CAPABILITIES)
        }
      });
      graphic.__supportFor = parentId;
      graphic.__supportRole = supportRole;
      graphic.__selectParentId = parentId;
      graphic.__nonSelectable = true;
      graphic.__skipMeasure = true;
      graphic.__toolCapabilities = Object.assign({}, SUPPORT_CAPABILITIES);
      return graphic;
    }

    function parentIdForGraphic(graphic) {
      return graphic && (graphic.__sitePlanId || (graphic.attributes && graphic.attributes.sitePlanId));
    }

    function culvertTool() {
      return AS && typeof AS.getTool === 'function' ? AS.getTool('culvert') : window.SitePlanCulvertTool;
    }

    function isCulvertParent(graphic) {
      const tool = culvertTool();
      return !!(tool && typeof tool.isParent === 'function' && tool.isParent(graphic));
    }

    function pointDistance(a, b) {
      if (!a || !b) return Infinity;
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function culvertParts(graphic) {
      if (!isCulvertParent(graphic)) return null;
      const path = cleanPath(graphic.geometry);
      if (path.length < 2) return null;
      const start = path[0];
      const end = path[path.length - 1];
      const seg = AS.segmentInfo(start, end);
      if (!seg) return null;
      return {
        start,
        end,
        sr: graphic.geometry.spatialReference,
        widthFt: Number.parseFloat((graphic.attributes || {}).widthFt) || 12,
        ux: seg.ux,
        uy: seg.uy,
        nx: seg.nx,
        ny: seg.ny
      };
    }

    function drivewayEndpointParts(parent) {
      const path = cleanPath(parent && parent.geometry);
      if (path.length < 2) return null;
      const sr = parent.geometry.spatialReference;
      const startSeg = AS.segmentInfo(path[0], path[1]);
      const endSeg = AS.segmentInfo(path[path.length - 2], path[path.length - 1]);
      if (!startSeg || !endSeg) return null;
      return {
        sr,
        start: {
          point: path[0],
          ux: startSeg.ux,
          uy: startSeg.uy,
          nx: startSeg.nx,
          ny: startSeg.ny
        },
        end: {
          point: path[path.length - 1],
          ux: endSeg.ux,
          uy: endSeg.uy,
          nx: endSeg.nx,
          ny: endSeg.ny
        }
      };
    }

    function endpointFace(center, nx, ny, halfWidth) {
      return [
        [center[0] + nx * halfWidth, center[1] + ny * halfWidth],
        [center[0] - nx * halfWidth, center[1] - ny * halfWidth]
      ];
    }

    function sortedRing(points) {
      const center = points.reduce((acc, point) => {
        acc.x += point[0];
        acc.y += point[1];
        return acc;
      }, { x: 0, y: 0 });
      center.x /= points.length;
      center.y /= points.length;
      const ring = points
        .slice()
        .sort((a, b) => Math.atan2(a[1] - center.y, a[0] - center.x) -
                        Math.atan2(b[1] - center.y, b[0] - center.x));
      ring.push(ring[0].slice());
      return ring;
    }

    function culvertEndpointCandidates() {
      const tool = culvertTool();
      if (!tool || typeof tool.isParent !== 'function' || typeof tool.endpointPoints !== 'function') return [];
      return AS.graphicsInLayer(RT.drawLayer)
        .filter(graphic => tool.isParent(graphic))
        .flatMap(graphic => {
          const endpoints = tool.endpointPoints(graphic);
          const parts = culvertParts(graphic);
          if (!endpoints || !parts) return [];
          return [
            { point: endpoints.start, endpointName: 'start', parent: graphic, parts },
            { point: endpoints.end, endpointName: 'end', parent: graphic, parts }
          ].filter(candidate => !!candidate.point);
        });
    }

    function matchingCulvertEndpoint(point, tolerance) {
      let best = null;
      culvertEndpointCandidates().forEach(candidate => {
        const distance = pointDistance(point, candidate.point);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = Object.assign({ distance }, candidate);
        }
      });
      return best;
    }

    function culvertConnectedEndpoints(parent) {
      const connected = { start: false, end: false };
      const parts = drivewayEndpointParts(parent);
      if (!parts) return connected;
      const path = cleanPath(parent.geometry);
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const drivewayWidth = mapUnitsForWidth(widthFt, path, parts.sr);
      const tolerance = mapUnitsForWidth(JUNCTION_TOLERANCE_FT, path, parts.sr);
      if (!Number.isFinite(drivewayWidth) || drivewayWidth <= 0 ||
          !Number.isFinite(tolerance) || tolerance <= 0) return connected;

      ['start', 'end'].forEach(endpointName => {
        const endpoint = parts[endpointName];
        const point = {
          type: 'point',
          x: endpoint.point[0],
          y: endpoint.point[1],
          spatialReference: AS.spatialReferenceJSON(parts.sr)
        };
        connected[endpointName] = !!matchingCulvertEndpoint(point, tolerance);
      });
      return connected;
    }

    function drivewayEndpointCandidates(parent) {
      const parentId = parentIdForGraphic(parent);
      return AS.graphicsInLayer(RT.drawLayer)
        .filter(graphic => isParent(graphic) && parentIdForGraphic(graphic) !== parentId)
        .flatMap(graphic => {
          const endpoints = endpointPoints(graphic);
          const parts = drivewayEndpointParts(graphic);
          if (!endpoints || !parts) return [];
          return [
            { point: endpoints.start, endpointName: 'start', parent: graphic, parts },
            { point: endpoints.end, endpointName: 'end', parent: graphic, parts }
          ].filter(candidate => !!candidate.point);
        });
    }

    function matchingDrivewayEndpoint(parent, point, tolerance) {
      const ownerId = parentIdForGraphic(parent);
      let best = null;
      drivewayEndpointCandidates(parent).forEach(candidate => {
        const otherId = parentIdForGraphic(candidate.parent);
        if (!ownerId || !otherId || String(ownerId) > String(otherId)) return;
        const distance = pointDistance(point, candidate.point);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = Object.assign({ distance }, candidate);
        }
      });
      return best;
    }

    function junctionPatchGeometries(parent) {
      const parts = drivewayEndpointParts(parent);
      if (!parts) return [];
      const path = cleanPath(parent.geometry);
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const drivewayWidth = mapUnitsForWidth(widthFt, path, parts.sr);
      const tolerance = mapUnitsForWidth(JUNCTION_TOLERANCE_FT, path, parts.sr);
      if (!Number.isFinite(drivewayWidth) || drivewayWidth <= 0 ||
          !Number.isFinite(tolerance) || tolerance <= 0) return [];

      return ['start', 'end'].map(endpointName => {
        const endpoint = parts[endpointName];
        const point = {
          type: 'point',
          x: endpoint.point[0],
          y: endpoint.point[1],
          spatialReference: AS.spatialReferenceJSON(parts.sr)
        };
        const culvert = matchingCulvertEndpoint(point, tolerance);
        if (!culvert || !culvert.parts) return null;

        const culvertCenter = culvert.endpointName === 'start'
          ? culvert.parts.start
          : culvert.parts.end;
        const culvertWidth = mapUnitsForWidth(culvert.parts.widthFt, [culvert.parts.start, culvert.parts.end], culvert.parts.sr);
        if (!Number.isFinite(culvertWidth) || culvertWidth <= 0) return null;

        const drivewayFace = endpointFace(endpoint.point, endpoint.nx, endpoint.ny, drivewayWidth / 2);
        const culvertFace = endpointFace(culvertCenter, culvert.parts.nx, culvert.parts.ny, culvertWidth / 2);
        return {
          type: 'polygon',
          rings: [sortedRing(drivewayFace.concat(culvertFace))],
          spatialReference: AS.spatialReferenceJSON(parts.sr)
        };
      }).filter(Boolean);
    }

    function drivewayJunctionPatchGeometries(parent) {
      const parts = drivewayEndpointParts(parent);
      if (!parts) return [];
      const path = cleanPath(parent.geometry);
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const drivewayWidth = mapUnitsForWidth(widthFt, path, parts.sr);
      const tolerance = mapUnitsForWidth(JUNCTION_TOLERANCE_FT, path, parts.sr);
      if (!Number.isFinite(drivewayWidth) || drivewayWidth <= 0 ||
          !Number.isFinite(tolerance) || tolerance <= 0) return [];

      return ['start', 'end'].map(endpointName => {
        const endpoint = parts[endpointName];
        const point = {
          type: 'point',
          x: endpoint.point[0],
          y: endpoint.point[1],
          spatialReference: AS.spatialReferenceJSON(parts.sr)
        };
        const other = matchingDrivewayEndpoint(parent, point, tolerance);
        if (!other || !other.parts) return null;

        const otherEndpoint = other.parts[other.endpointName];
        if (!otherEndpoint) return null;
        const otherPath = cleanPath(other.parent.geometry);
        const otherWidthFt = Number.parseFloat((other.parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
        const otherWidth = mapUnitsForWidth(otherWidthFt, otherPath, other.parts.sr);
        if (!Number.isFinite(otherWidth) || otherWidth <= 0) return null;

        const drivewayFace = endpointFace(endpoint.point, endpoint.nx, endpoint.ny, drivewayWidth / 2);
        const otherFace = endpointFace(otherEndpoint.point, otherEndpoint.nx, otherEndpoint.ny, otherWidth / 2);
        return {
          type: 'polygon',
          rings: [sortedRing(drivewayFace.concat(otherFace))],
          spatialReference: AS.spatialReferenceJSON(parts.sr)
        };
      }).filter(Boolean);
    }

    function bringParentToFront(parent) {
      if (!parent || !RT.drawLayer || !RT.drawLayer.graphics) return;
      const graphics = RT.drawLayer.graphics;
      try {
        if (typeof graphics.reorder === 'function') graphics.reorder(parent, graphics.length - 1);
      } catch (err) {}
    }

    function rebuildSupport(parent) {
      if (!isParent(parent)) return;
      applyMetadata(parent);
      const parentId = parent.__sitePlanId;
      removeSupport(parentId);
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const visualParts = drivewayVisualParts(parent.geometry, widthFt);
      if (!visualParts || !visualParts.surface) return;
      const layer = supportLayer();
      layer.add(supportGraphic(parent, visualParts.surface, 'driveway-surface'));
      junctionPatchGeometries(parent).forEach(geometry => {
        layer.add(supportGraphic(parent, geometry, 'driveway-junction'));
      });
      drivewayJunctionPatchGeometries(parent).forEach(geometry => {
        layer.add(supportGraphic(parent, geometry, 'driveway-junction'));
      });
      const drawingMode = drawingModeForGraphic(parent);
      const borderSymbol = borderLineSymbol(drawingMode);
      const connectedToCulvert = culvertConnectedEndpoints(parent);
      [visualParts.leftEdge, visualParts.rightEdge].filter(Boolean).forEach(geometry => {
        layer.add(supportGraphic(parent, geometry, 'driveway-border', borderSymbol));
      });
      if (!connectedToCulvert.start && visualParts.startCap) {
        layer.add(supportGraphic(parent, visualParts.startCap, 'driveway-border', borderSymbol));
      }
      if (!connectedToCulvert.end && visualParts.endCap) {
        layer.add(supportGraphic(parent, visualParts.endCap, 'driveway-border', borderSymbol));
      }
      bringParentToFront(parent);
    }

    function rebuildAllDriveways(excludeGraphic) {
      const excludeId = parentIdForGraphic(excludeGraphic);
      AS.graphicsInLayer(RT.drawLayer)
        .filter(graphic => isParent(graphic) && parentIdForGraphic(graphic) !== excludeId)
        .forEach(graphic => rebuildSupport(graphic));
    }

    let materialTileRefreshTimer = null;
    function scheduleMaterialTileRefresh() {
      if (materialTileRefreshTimer) window.clearTimeout(materialTileRefreshTimer);
      materialTileRefreshTimer = window.setTimeout(() => {
        materialTileRefreshTimer = null;
        rebuildAllDriveways();
      }, 80);
    }

    function endpointPoints(graphic) {
      if (!isParent(graphic)) return null;
      const path = cleanPath(graphic.geometry);
      if (path.length < 2) return null;
      const sr = graphic.geometry.spatialReference;
      return {
        start: { type: 'point', x: path[0][0], y: path[0][1], spatialReference: AS.spatialReferenceJSON(sr) },
        end: { type: 'point', x: path[path.length - 1][0], y: path[path.length - 1][1], spatialReference: AS.spatialReferenceJSON(sr) }
      };
    }

    function setActiveButton(active) {
      activeTool = !!active;
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(btn => btn.classList.remove('active'));
      const btn = document.getElementById(BUTTON_ID);
      if (btn) btn.classList.toggle('active', activeTool);
    }

    function clearActiveButton() {
      setActiveButton(false);
    }

    function cancelPlacement(clearButtonState) {
      pendingCreate = false;
      if (window.__sitePlanPendingToolType === TOOL_ID) window.__sitePlanPendingToolType = null;
      try { if (RT.sketch && RT.sketch.state !== 'idle') RT.sketch.cancel(); } catch (err) {}
      if (clearButtonState) clearActiveButton();
    }

    function start() {
      if (!markValidity()) return;
      if (AS.announceToolActivated) AS.announceToolActivated(TOOL_ID);
      if (AS.cancelAllExcept) AS.cancelAllExcept(TOOL_ID, false);
      if (AS.clearActiveAllExcept) AS.clearActiveAllExcept(TOOL_ID);
      if (RT.clearSelection) RT.clearSelection();
      if (RT.sketch && RT.sketch.state === 'active') {
        try { RT.sketch.cancel(); } catch (err) {}
      }
      window.__sitePlanSuppressLiveSideLabels = false;
      window.__sitePlanPendingToolType = TOOL_ID;
      pendingCreate = true;
      setActiveButton(true);
      RT.sketch.create('polyline', { mode: 'click', symbol: sketchSymbol() });
    }

    function buildButton() {
      if (buttonEl) return buttonEl;
      buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.id = BUTTON_ID;
      buttonEl.className = 'tool-btn draw-tool-btn icon-btn';
      buttonEl.title = 'Draw a driveway with a fixed width';
      buttonEl.innerHTML = '<span class="tool-icon">' + drivewayIcon(selectedMaterialId()) + '</span>' +
                           '<span class="tool-label">Driveway</span>';
      refreshDrivewayIcon();
      buttonEl.addEventListener('click', start);
      return buttonEl;
    }

    function buildControls() {
      if (controlsEl) return controlsEl;
      controlsEl = document.createElement('div');
      controlsEl.className = 'size-row driveway-width-row';
      controlsEl.innerHTML =
        '<span class="size-lbl">Width (ft)</span>' +
        '<input id="' + WIDTH_ID + '" type="number" min="' + MIN_WIDTH_FT + '" step="1" value="' + DEFAULT_WIDTH_FT + '" class="dim-input" aria-label="Driveway width in feet">';
      return controlsEl;
    }

    function buildMaterialControls() {
      if (materialControlsEl) return materialControlsEl;
      materialControlsEl = document.createElement('div');
      materialControlsEl.className = 'size-row driveway-material-select-row';
      materialControlsEl.innerHTML =
        '<label for="' + MATERIAL_ID + '" class="size-lbl">Material</label>' +
        '<select id="' + MATERIAL_ID + '" class="dim-input driveway-material-select" aria-label="Driveway material">' +
          materialOptionsHtml() +
        '</select>';
      return materialControlsEl;
    }

    function wireControls() {
      if (controlsWired) return;
      const input = document.getElementById(WIDTH_ID);
      if (input) {
        input.addEventListener('input', markValidity);
        input.addEventListener('keydown', event => event.stopPropagation());
      }
      const material = document.getElementById(MATERIAL_ID);
      if (material) {
        material.addEventListener('change', () => {
          if (AS && typeof AS.setSelectedDrivewayMaterial === 'function') {
            AS.setSelectedDrivewayMaterial(material.value);
          } else {
            AS.selectedDrivewayMaterialId = material.value;
          }
          refreshDrivewayIcon();
        });
        material.addEventListener('keydown', event => event.stopPropagation());
      }
      controlsWired = true;
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === AS.source && detail.tool === TOOL_ID) return;
      if (pendingCreate) cancelPlacement(false);
      clearActiveButton();
      clearValidation();
    });

    RT.sketch.on('create', event => {
      if (!pendingCreate && window.__sitePlanPendingToolType !== TOOL_ID) return;
      if (event.state === 'cancel') {
        pendingCreate = false;
        clearActiveButton();
        if (window.__sitePlanPendingToolType === TOOL_ID) window.__sitePlanPendingToolType = null;
        return;
      }
      if (event.state !== 'complete' || !event.graphic || !event.graphic.geometry) return;
      const graphic = event.graphic;
      pendingCreate = false;
      if (window.__sitePlanPendingToolType === TOOL_ID) window.__sitePlanPendingToolType = null;
      clearActiveButton();
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        widthFt: parseWidth(),
        drivewayMaterial: selectedMaterialId()
      });
      applyMetadata(graphic);
      rebuildAllDriveways();
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      try { RT.selectGraphic(graphic); } catch (err) {}
    });

    RT.onGraphicCreated(graphic => {
      if (isCulvertParent(graphic)) {
        rebuildAllDriveways();
        return;
      }
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      rebuildAllDriveways();
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
    });

    RT.onGraphicUpdated((graphic, event) => {
      if (isCulvertParent(graphic)) {
        rebuildAllDriveways();
        return;
      }
      if (!isParent(graphic)) return;
      if (event && event.state === 'complete') rebuildAllDriveways();
      else rebuildSupport(graphic);
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
    });

    RT.onGraphicDeleted(graphic => {
      if (isCulvertParent(graphic)) {
        rebuildAllDriveways();
        return;
      }
      if (!isParent(graphic)) return;
      const parentId = AS.ensureSitePlanId(graphic, 'driveway');
      removeSupport(parentId);
      rebuildAllDriveways(graphic);
    });

    if (RT.view && typeof RT.view.watch === 'function') {
      RT.view.watch('scale', scheduleMaterialTileRefresh);
    }

    const api = {
      id: TOOL_ID,
      order: 10,
      label: 'Driveway',
      buildButton,
      buildControls,
      wireControls,
      getElements: function getElements() {
        return [buildButton(), buildMaterialControls(), buildControls()].filter(Boolean);
      },
      start,
      cancel: cancelPlacement,
      clearActive: clearActiveButton,
      isParent,
      applyMetadata,
      rebuildSupport,
      drivewaySurfaceGeometry,
      endpointPoints
    };

    window.startDrivewayTool = start;
    window.SitePlanDrivewayTool = Object.assign({}, window.SitePlanDrivewayTool || {}, api);
    if (typeof AS.registerTool === 'function') AS.registerTool(window.SitePlanDrivewayTool);
  }).catch(err => {
    console.error('[tools-access/driveway] Failed to initialize after runtime ready:', err);
  });
})();
