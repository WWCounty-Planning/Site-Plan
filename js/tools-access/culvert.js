// Independent culvert / bridge marker. 

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/culvert] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-access/culvert] SitePlanPolylineTool is missing. Make sure js/utils/polyline-tool.js loads before culvert.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const AS = window.SitePlanAccessShared = window.SitePlanAccessShared || {};
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID = 'culvert';
    const BUTTON_ID = 'btn-culvert';
    const WIDTH_ID = 'culvert-width';
    const SNAP_TOLERANCE_PX = 18;
    const DEFAULT_WIDTH_FT = 12;
    const MIN_WIDTH_FT = 1;
    const HEADWALL_WIDTH_FT = 0.75;
    const WING_EXTEND_FT = 1.5;
    const WING_ANGLE_DEGREES = 60;
    const LENGTH_LABEL_CLEARANCE_FT = 1.25;
    const CATEGORY = 'access';
    const CULVERT_GREEN = [100, 111, 91, 1]; // #646F5B

    const culvertConcreteTile =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 60 60">' +
        '<rect width="60" height="60" fill="#C8C8C8"/>' +
        '<circle cx="7" cy="10" r="0.9" fill="#B8B8B5" fill-opacity="0.65"/>' +
        '<circle cx="15" cy="8" r="0.8" fill="#C4C4C1" fill-opacity="0.55"/>' +
        '<circle cx="25" cy="13" r="1.0" fill="#AFAFAD" fill-opacity="0.55"/>' +
        '<circle cx="38" cy="9" r="0.8" fill="#C7C7C4" fill-opacity="0.5"/>' +
        '<circle cx="49" cy="14" r="1.1" fill="#A9A9A6" fill-opacity="0.6"/>' +
        '<circle cx="10" cy="24" r="0.8" fill="#BDBDBA" fill-opacity="0.55"/>' +
        '<circle cx="19" cy="20" r="1.1" fill="#AFAFAD" fill-opacity="0.5"/>' +
        '<circle cx="30" cy="27" r="0.9" fill="#C5C5C2" fill-opacity="0.55"/>' +
        '<circle cx="44" cy="22" r="0.8" fill="#B4B4B1" fill-opacity="0.5"/>' +
        '<circle cx="54" cy="26" r="1.0" fill="#A6A6A3" fill-opacity="0.55"/>' +
        '<circle cx="6" cy="38" r="0.9" fill="#C3C3C0" fill-opacity="0.5"/>' +
        '<circle cx="16" cy="34" r="1.0" fill="#AEAEAB" fill-opacity="0.55"/>' +
        '<circle cx="27" cy="41" r="0.8" fill="#C9C9C6" fill-opacity="0.5"/>' +
        '<circle cx="39" cy="36" r="1.1" fill="#B2B2AF" fill-opacity="0.6"/>' +
        '<circle cx="50" cy="40" r="0.9" fill="#A8A8A5" fill-opacity="0.5"/>' +
        '<circle cx="11" cy="50" r="0.8" fill="#BEBEBA" fill-opacity="0.55"/>' +
        '<circle cx="22" cy="53" r="1.0" fill="#AAAAA7" fill-opacity="0.5"/>' +
        '<circle cx="34" cy="49" r="0.9" fill="#C6C6C3" fill-opacity="0.5"/>' +
        '<circle cx="45" cy="52" r="0.8" fill="#B5B5B2" fill-opacity="0.55"/>' +
        '<circle cx="55" cy="48" r="1.0" fill="#A4A4A1" fill-opacity="0.5"/>' +
        '<ellipse cx="13" cy="16" rx="1.6" ry="1.1" fill="#9F9F9C" fill-opacity="0.35"/>' +
        '<ellipse cx="35" cy="31" rx="1.8" ry="1.2" fill="#B1B1AE" fill-opacity="0.35"/>' +
        '<ellipse cx="47" cy="18" rx="1.5" ry="1.0" fill="#979794" fill-opacity="0.3"/>' +
      '</svg>';

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
    let controlsEl = null;
    let controlsWired = false;

    const culvertIcon =
      '<svg viewBox="0 0 40 26" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' +
          '<pattern id="culvert-asphalt-pat" patternUnits="userSpaceOnUse" width="10" height="10" x="4" y="4">' +
            '<g stroke="#646F5B" stroke-width="0.40" stroke-linecap="round">' +
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
            '</g>' +
          '</pattern>' +
        '</defs>' +
        '<g class="dm-existing">' +
          '<rect x="4" y="4" width="32" height="18" fill="#E9DDCC" fill-opacity="0.30"/>' +
          '<rect x="4" y="4" width="32" height="18" fill="url(#culvert-asphalt-pat)"/>' +
          '<rect x="4" y="4" width="32" height="18" fill="none" stroke="#646F5B" stroke-width="1"/>' +
          '<g stroke="#646F5B" stroke-width="1.2" stroke-linecap="round">' +
            '<line x1="4" y1="4" x2="1.9" y2="1.9"/>' +
            '<line x1="36" y1="4" x2="38.1" y2="1.9"/>' +
            '<line x1="4" y1="22" x2="1.9" y2="24.1"/>' +
            '<line x1="36" y1="22" x2="38.1" y2="24.1"/>' +
          '</g>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<rect x="4" y="4" width="32" height="18" fill="#E9DDCC" fill-opacity="0.30"/>' +
          '<rect x="4" y="4" width="32" height="18" fill="url(#culvert-asphalt-pat)"/>' +
          '<rect x="4" y="4" width="32" height="18" fill="none" stroke="#646F5B" stroke-width="1" stroke-dasharray="3,2"/>' +
          '<g stroke="#646F5B" stroke-width="1.2" stroke-linecap="round">' +
            '<line x1="4" y1="4" x2="1.9" y2="1.9"/>' +
            '<line x1="36" y1="4" x2="38.1" y2="1.9"/>' +
            '<line x1="4" y1="22" x2="1.9" y2="24.1"/>' +
            '<line x1="36" y1="22" x2="38.1" y2="24.1"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

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

    function isParent(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === TOOL_ID || attrs.toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID) &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    }

    function parentIdForGraphic(graphic) {
      return graphic && (graphic.__sitePlanId || (graphic.attributes && graphic.attributes.sitePlanId));
    }

    function lineSymbol(alpha) {
      return {
        type: 'simple-line',
        color: [63, 63, 70, alpha == null ? 0 : alpha],
        width: 1,
        cap: 'butt',
        join: 'miter'
      };
    }

    function previewSymbol() {
      return {
        type: 'simple-line',
        color: [63, 63, 70, 0.72],
        width: 1.6,
        style: 'short-dash',
        cap: 'butt',
        join: 'miter'
      };
    }

    function floatingPointSymbol() {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [255, 255, 255, 0.95],
        size: 7,
        outline: { type: 'simple-line', color: [63, 63, 70, 1], width: 1.2 }
      };
    }

    function snapPointSymbol() {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [247, 148, 30, 1],
        size: 9,
        outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 }
      };
    }

    function labelSymbol() {
      return {
        type: 'text',
        text: '',
        color: [31, 41, 55, 1],
        haloColor: [255, 255, 255, 0.96],
        haloSize: 2,
        yoffset: -10,
        font: { family: 'Arial', size: 9 }
      };
    }

    function drivewayTool() {
      return AS && typeof AS.getTool === 'function' ? AS.getTool('driveway') : window.SitePlanDrivewayTool;
    }

    function drivewayEndpointCandidates() {
      const tool = drivewayTool();
      if (!tool || typeof tool.isParent !== 'function' || typeof tool.endpointPoints !== 'function') return [];
      return AS.graphicsInLayer(RT.drawLayer)
        .filter(graphic => tool.isParent(graphic))
        .flatMap(graphic => {
          const endpoints = tool.endpointPoints(graphic);
          if (!endpoints) return [];
          return [
            { point: endpoints.start, parent: graphic, snapType: 'driveway-start' },
            { point: endpoints.end, parent: graphic, snapType: 'driveway-end' }
          ].filter(candidate => !!candidate.point);
        });
    }

    function getSnapPoint(mapPoint) {
      return SH.connectionPointSnap(RT.view, drivewayEndpointCandidates(), mapPoint, SNAP_TOLERANCE_PX) ||
        { point: mapPoint, snapped: false };
    }

    function cleanPath(geometry) {
      if (!geometry || geometry.type !== 'polyline' || !geometry.paths || !geometry.paths.length) return [];
      const path = geometry.paths[0] || [];
      return path.filter(point => point && point.length >= 2).map(point => [point[0], point[1]]);
    }

    function normalizeTwoPointGeometry(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polyline') return false;
      const path = cleanPath(graphic.geometry);
      if (path.length <= 2) return false;
      const first = path[0];
      const last = path[path.length - 1];
      graphic.geometry = {
        type: 'polyline',
        paths: [[first, last]],
        spatialReference: AS.spatialReferenceJSON(graphic.geometry.spatialReference)
      };
      return true;
    }

    function lineGeometry(a, b, spatialReference) {
      return {
        type: 'polyline',
        paths: [[[a.x, a.y], [b.x, b.y]]],
        spatialReference: AS.spatialReferenceJSON(spatialReference)
      };
    }

    function supportLayer() {
      return RT.labelLayer || RT.drawingShadowLayer || RT.drawLayer;
    }

    function surfaceSymbol() {
      if (AS.drivewaySurfaceSymbol) {
        const asphalt = AS.drivewaySurfaceSymbol('asphalt');
        if (asphalt) {
          return Object.assign({}, asphalt, {
            outline: { type: 'simple-line', color: [128, 125, 125, 0], width: 0 }
          });
        }
      }
      return {
        type: 'picture-fill',
        url: AS.svgDataUrl ? AS.svgDataUrl(culvertConcreteTile) : 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(culvertConcreteTile),
        width: 40,
        height: 40,
        outline: { type: 'simple-line', color: [128, 125, 125, 0], width: 0 }
      };
    }

    function drawingModeForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      if (attrs.drawingMode === 'proposed' || attrs.drawingMode === 'existing') return attrs.drawingMode;
      return window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode(CATEGORY) : 'existing';
    }

    function concreteSymbol(mode) {
      const proposed = mode === 'proposed';
      return {
        type: 'simple-fill',
        color: [100, 111, 91, proposed ? 0.08 : 0.22],
        outline: {
          type: 'simple-line',
          color: CULVERT_GREEN,
          width: 2,
          style: proposed ? 'long-dash' : 'solid'
        }
      };
    }

    function isSupportGraphic(graphic, parentId) {
      if (!graphic) return false;
      const attrs = graphic.attributes || {};
      const supportFor = graphic.__supportFor || attrs.supportFor || attrs.parentSitePlanId;
      return supportFor && supportFor === parentId &&
        (graphic.__supportRole === 'culvert-headwall' || attrs.supportRole === 'culvert-headwall' ||
         graphic.__supportRole === 'culvert-surface' || attrs.supportRole === 'culvert-surface' ||
         graphic.__supportRole === 'culvert-measure' || attrs.supportRole === 'culvert-measure');
    }

    function removeSupport(parentId) {
      if (!parentId) return;
      [RT.labelLayer, RT.drawingShadowLayer, RT.drawLayer].filter(Boolean).forEach(layer => {
        AS.graphicsInLayer(layer)
          .filter(graphic => isSupportGraphic(graphic, parentId) || graphic.__polylineLabelFor === parentId)
          .forEach(graphic => {
            try { layer.remove(graphic); } catch (err) {}
          });
      });
    }

    function supportGraphic(parent, geometry, role, symbol) {
      const parentId = parentIdForGraphic(parent);
      const drawingMode = drawingModeForGraphic(parent);
      const graphic = new RT.Graphic({
        geometry,
        symbol,
        attributes: {
          sitePlanTool: role === 'culvert-surface'
            ? 'culvertSurface'
            : (role === 'culvert-measure' ? 'culvertMeasure' : 'culvertHeadwall'),
          sitePlanCategory: 'access-support',
          parentSitePlanId: parentId,
          selectParentId: parentId,
          supportFor: parentId,
          supportRole: role,
          drawingMode,
          toolCapabilities: Object.assign({}, SUPPORT_CAPABILITIES)
        }
      });
      graphic.__supportFor = parentId;
      graphic.__supportRole = role;
      graphic.__selectParentId = parentId;
      graphic.__nonSelectable = true;
      graphic.__skipMeasure = true;
      graphic.__toolCapabilities = Object.assign({}, SUPPORT_CAPABILITIES);
      return graphic;
    }

    function centerlineParts(parent) {
      const path = cleanPath(parent && parent.geometry);
      if (path.length < 2) return null;
      const start = path[0];
      const end = path[path.length - 1];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const len = Math.hypot(dx, dy);
      if (!Number.isFinite(len) || len <= 1e-9) return null;

      const sr = parent.geometry.spatialReference;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      return { start, end, sr, ux, uy, nx, ny, len };
    }

    function formatFeet(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '';
      return n.toFixed(1) + ' ft';
    }

    function textAngleDegreesFromPoints(a, b, spatialReference) {
      let angle = null;
      try {
        const start = RT.view && RT.view.toScreen
          ? RT.view.toScreen(AS.pointFromXY(a[0], a[1], spatialReference))
          : null;
        const end = RT.view && RT.view.toScreen
          ? RT.view.toScreen(AS.pointFromXY(b[0], b[1], spatialReference))
          : null;
        if (start && end &&
            Number.isFinite(start.x) && Number.isFinite(start.y) &&
            Number.isFinite(end.x) && Number.isFinite(end.y)) {
          angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        }
      } catch (err) {}
      if (!Number.isFinite(angle)) {
        angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      }
      while (angle > 90) angle -= 180;
      while (angle < -90) angle += 180;
      return angle;
    }

    function textPoint(x, y, spatialReference) {
      return {
        type: 'point',
        x,
        y,
        spatialReference: AS.spatialReferenceJSON(spatialReference)
      };
    }

    function culvertMeasureTextSymbol(text, angle) {
      return {
        type: 'text',
        text,
        angle,
        color: [31, 41, 55, 1],
        haloColor: [255, 255, 255, 0.96],
        haloSize: 2,
        yoffset: 0,
        font: { family: 'Arial', size: 7 }
      };
    }

    function culvertWidthGuideSymbol() {
      return {
        type: 'simple-line',
        color: [128, 125, 125, 0.95],
        width: 0.9,
        style: 'short-dash',
        cap: 'butt',
        join: 'miter'
      };
    }

    function calculateLengthFt(geometry) {
      if (!geometry || !RT.geometryEngine) return 0;
      try {
        const len = Math.abs(RT.geometryEngine.geodesicLength(geometry, 'feet') || 0);
        if (Number.isFinite(len) && len > 0) return len;
      } catch (err) {}
      try {
        const len = Math.abs(RT.geometryEngine.planarLength(geometry, 'feet') || 0);
        if (Number.isFinite(len) && len > 0) return len;
      } catch (err) {}
      return 0;
    }

    function culvertMeasurementGraphics(parent) {
      const parts = centerlineParts(parent);
      if (!parts) return [];
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const widthUnits = AS.feetToMapScalar(widthFt, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      const wallUnits = AS.feetToMapScalar(HEADWALL_WIDTH_FT, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      const labelClearance = AS.feetToMapScalar(LENGTH_LABEL_CLEARANCE_FT, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      if (!Number.isFinite(widthUnits) || widthUnits <= 0 ||
          !Number.isFinite(wallUnits) || wallUnits <= 0 ||
          !Number.isFinite(labelClearance) || labelClearance < 0) return [];

      const half = widthUnits / 2;
      const mid = [
        (parts.start[0] + parts.end[0]) / 2,
        (parts.start[1] + parts.end[1]) / 2
      ];
      const widthStart = AS.pointFromXY(mid[0] + parts.nx * half, mid[1] + parts.ny * half, parts.sr);
      const widthEnd = AS.pointFromXY(mid[0] - parts.nx * half, mid[1] - parts.ny * half, parts.sr);
      const lengthOffset = half + wallUnits + labelClearance;
      const lengthAnchor = textPoint(
        mid[0] + parts.nx * lengthOffset,
        mid[1] + parts.ny * lengthOffset,
        parts.sr
      );
      const widthAnchor = textPoint(mid[0], mid[1], parts.sr);
      const lengthFt = calculateLengthFt(parent.geometry);
      const lengthAngle = textAngleDegreesFromPoints(parts.start, parts.end, parts.sr);
      const widthAngle = textAngleDegreesFromPoints(
        [mid[0] + parts.nx * half, mid[1] + parts.ny * half],
        [mid[0] - parts.nx * half, mid[1] - parts.ny * half],
        parts.sr
      );

      return [
        supportGraphic(parent, lineGeometry(widthStart, widthEnd, parts.sr), 'culvert-measure', culvertWidthGuideSymbol()),
        supportGraphic(parent, lengthAnchor, 'culvert-measure',
          culvertMeasureTextSymbol(formatFeet(lengthFt), lengthAngle)),
        supportGraphic(parent, widthAnchor, 'culvert-measure',
          culvertMeasureTextSymbol(formatFeet(widthFt), widthAngle))
      ];
    }

    function offsetStripGeometry(path, widthUnits, spatialReference) {
      if (!path || path.length < 2 || !Number.isFinite(widthUnits) || widthUnits <= 0) return null;
      const halfWidth = widthUnits / 2;
      const segments = [];
      for (let i = 0; i < path.length - 1; i++) {
        const seg = AS.segmentInfo(path[i], path[i + 1]);
        if (!seg) return null;
        segments.push(seg);
      }

      function offsetPoint(index, side) {
        const seg = segments[Math.min(index, segments.length - 1)];
        const sign = side === 'left' ? 1 : -1;
        return [
          path[index][0] + seg.nx * halfWidth * sign,
          path[index][1] + seg.ny * halfWidth * sign
        ];
      }

      function offsetVertex(index, side) {
        if (index === 0 || index === path.length - 1) return offsetPoint(index, side);
        const prev = segments[index - 1];
        const next = segments[index];
        const sign = side === 'left' ? 1 : -1;
        const p = {
          x: path[index][0] + prev.nx * halfWidth * sign,
          y: path[index][1] + prev.ny * halfWidth * sign
        };
        const q = {
          x: path[index][0] + next.nx * halfWidth * sign,
          y: path[index][1] + next.ny * halfWidth * sign
        };
        return AS.lineIntersection(
          p,
          { x: prev.ux, y: prev.uy },
          q,
          { x: next.ux, y: next.uy }
        ) || [q.x, q.y];
      }

      const left = [];
      const right = [];
      for (let i = 0; i < path.length; i++) {
        left.push(offsetVertex(i, 'left'));
        right.push(offsetVertex(i, 'right'));
      }
      const ring = left.concat(right.reverse());
      ring.push(ring[0].slice());
      return {
        type: 'polygon',
        rings: [ring],
        spatialReference: AS.spatialReferenceJSON(spatialReference)
      };
    }

    function culvertSurfaceGeometry(parent) {
      const parts = centerlineParts(parent);
      if (!parts) return null;
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const widthUnits = AS.feetToMapScalar(widthFt, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      const half = widthUnits / 2;
      if (!Number.isFinite(half) || half <= 0) return null;

      const aLeft = [parts.start[0] + parts.nx * half, parts.start[1] + parts.ny * half];
      const bLeft = [parts.end[0] + parts.nx * half, parts.end[1] + parts.ny * half];
      const bRight = [parts.end[0] - parts.nx * half, parts.end[1] - parts.ny * half];
      const aRight = [parts.start[0] - parts.nx * half, parts.start[1] - parts.ny * half];
      return {
        type: 'polygon',
        rings: [[aLeft, bLeft, bRight, aRight, aLeft.slice()]],
        spatialReference: AS.spatialReferenceJSON(parts.sr)
      };
    }

    function headwallGeometries(parent) {
      const parts = centerlineParts(parent);
      if (!parts) return [];
      const widthFt = Number.parseFloat((parent.attributes || {}).widthFt) || DEFAULT_WIDTH_FT;
      const widthUnits = AS.feetToMapScalar(widthFt, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      const half = widthUnits / 2;
      const wallWidthFt = Math.min(HEADWALL_WIDTH_FT, Math.max(widthFt / 4, 0));
      const wallUnits = AS.feetToMapScalar(wallWidthFt, {
        x: (parts.start[0] + parts.end[0]) / 2,
        y: (parts.start[1] + parts.end[1]) / 2
      }, parts.sr);
      const wing = AS.feetToMapScalar(WING_EXTEND_FT, { x: parts.start[0], y: parts.start[1] }, parts.sr);
      if (!Number.isFinite(half) || half <= 0 ||
          !Number.isFinite(wallUnits) || wallUnits <= 0 ||
          !Number.isFinite(wing) || wing <= 0) return [];

      const centerOffset = half + wallUnits / 2;
      const along = wing;
      const flare = Math.max(wallUnits * 1.5, wing * Math.tan(WING_ANGLE_DEGREES * Math.PI / 180));

      function p(base, normalOffset, alongOffset) {
        return [
          base[0] + parts.nx * normalOffset + parts.ux * alongOffset,
          base[1] + parts.ny * normalOffset + parts.uy * alongOffset
        ];
      }

      function headwall(side) {
        const center = side * centerOffset;
        const flareOffset = side * (centerOffset + flare);
        const wallPath = [
          p(parts.start, flareOffset, -along),
          p(parts.start, center, 0),
          p(parts.end, center, 0),
          p(parts.end, flareOffset, along)
        ];
        return offsetStripGeometry(wallPath, wallUnits, parts.sr);
      }

      return [headwall(1), headwall(-1)].filter(Boolean);
    }

    function applyMetadata(graphic) {
      if (!graphic) return graphic;
      const id = AS.ensureSitePlanId(graphic, 'culvert');
      graphic.__toolType = TOOL_ID;
      graphic.__label = 'Culvert';
      graphic.__measureLabel = 'Culvert';
      normalizeTwoPointGeometry(graphic);
      graphic.__preferredEditMode = 'reshape';
      graphic.__skipEdgeLabels = true;
      const widthFt = Number.parseFloat((graphic.attributes || {}).widthFt) || parseWidth();
      const drawingMode = drawingModeForGraphic(graphic);
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType: TOOL_ID,
        sitePlanTool: TOOL_ID,
        sitePlanCategory: CATEGORY,
        sitePlanId: id,
        drawingMode,
        label: 'Culvert',
        measureLabel: 'Culvert',
        preferredEditMode: 'reshape',
        skipEdgeLabels: true,
        widthFt,
        toolCapabilities: Object.assign({}, TOOL_CAPABILITIES)
      });
      graphic.symbol = lineSymbol(0);
      AS.applyToolCapabilities(graphic, TOOL_CAPABILITIES);
      return graphic;
    }

    function rebuildSupport(parent) {
      if (!isParent(parent)) return;
      applyMetadata(parent);
      const parentId = parentIdForGraphic(parent);
      removeSupport(parentId);
      const layer = supportLayer();
      const drawingMode = drawingModeForGraphic(parent);
      const surface = culvertSurfaceGeometry(parent);
      if (surface) layer.add(supportGraphic(parent, surface, 'culvert-surface', surfaceSymbol()));
      headwallGeometries(parent).forEach(geometry => {
        layer.add(supportGraphic(parent, geometry, 'culvert-headwall', concreteSymbol(drawingMode)));
      });
      culvertMeasurementGraphics(parent).forEach(graphic => layer.add(graphic));
      bringLabelToFront(parentId);
    }

    function rebuildAllCulverts() {
      AS.graphicsInLayer(RT.drawLayer)
        .filter(graphic => isParent(graphic))
        .forEach(graphic => rebuildSupport(graphic));
    }

    let materialTileRefreshTimer = null;
    function scheduleMaterialTileRefresh() {
      if (materialTileRefreshTimer) window.clearTimeout(materialTileRefreshTimer);
      materialTileRefreshTimer = window.setTimeout(() => {
        materialTileRefreshTimer = null;
        rebuildAllCulverts();
      }, 80);
    }

    function endpointPoints(graphic) {
      if (!isParent(graphic)) return null;
      const path = cleanPath(graphic.geometry);
      if (path.length < 2) return null;
      const sr = graphic.geometry.spatialReference;
      return {
        start: AS.pointFromXY(path[0][0], path[0][1], sr),
        end: AS.pointFromXY(path[path.length - 1][0], path[path.length - 1][1], sr)
      };
    }

    function bringLabelToFront(parentId) {
      if (!parentId || !RT.labelLayer || !RT.labelLayer.graphics) return;
      const label = RT.labelLayer.graphics.find(graphic => graphic.__polylineLabelFor === parentId);
      if (!label || typeof RT.labelLayer.graphics.reorder !== 'function') return;
      try { RT.labelLayer.graphics.reorder(label, RT.labelLayer.graphics.length - 1); } catch (err) {}
    }

    function onSketchUpdate(graphic, event) {
      const state = event && event.state;
      if (state !== 'complete' && state !== 'cancel') return;
      normalizeTwoPointGeometry(graphic);
      rebuildSupport(graphic);
    }

    const drawing = window.SitePlanPolylineTool.create({
      RT,
      toolId: TOOL_ID,
      buttonId: BUTTON_ID,
      category: 'access',
      label: 'Culvert',
      idPrefix: 'culvert',
      toolCapabilities: TOOL_CAPABILITIES,

      symbol: () => lineSymbol(1),
      previewSymbol,
      floatingPointSymbol,
      snapPointSymbol,
      getSnapPoint,
      showLengthLabel: false,
      labelSymbol,

      applyExtraMetadata: applyMetadata,
      onAnnounce: () => { if (AS.announceToolActivated) AS.announceToolActivated(TOOL_ID); },
      onCancelOthers: clearButton => {
        if (AS.cancelAllExcept) AS.cancelAllExcept(TOOL_ID, clearButton);
        if (AS.clearActiveAllExcept) AS.clearActiveAllExcept(TOOL_ID);
      },
      onAfterCommit: rebuildSupport,
      onSketchUpdate,
      onGraphicCreated: rebuildSupport,
      onGraphicUpdated: rebuildSupport,
      onGraphicDeleted: graphic => removeSupport(parentIdForGraphic(graphic))
    });

    function start() {
      if (!markValidity()) return;
      drawing.start();
    }

    function buildButton() {
      if (buttonEl) return buttonEl;
      buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.id = BUTTON_ID;
      buttonEl.className = 'tool-btn draw-tool-btn icon-btn';
      buttonEl.title = 'Draw a culvert. Endpoints snap to driveway endpoints.';
      buttonEl.innerHTML = '<span class="tool-icon">' + culvertIcon + '</span>' +
                           '<span class="tool-label">Culvert</span>';
      if (window.SitePlanDrawingMode) {
        const svg = buttonEl.querySelector('.tool-icon svg');
        if (svg) {
          window.SitePlanDrawingMode.registerIcon(svg, {
            category: CATEGORY,
            apply: window.SitePlanDrawingMode.iconSwapApply
          });
        }
      }
      buttonEl.addEventListener('click', start);
      return buttonEl;
    }

    function buildControls() {
      if (controlsEl) return controlsEl;
      controlsEl = document.createElement('div');
      controlsEl.className = 'size-row culvert-width-row';
      controlsEl.innerHTML =
        '<span class="size-lbl">Width (ft)</span>' +
        '<input id="' + WIDTH_ID + '" type="number" min="' + MIN_WIDTH_FT + '" step="1" value="' + DEFAULT_WIDTH_FT + '" class="dim-input" aria-label="Culvert width in feet">';
      return controlsEl;
    }

    function wireControls() {
      if (controlsWired) return;
      const input = document.getElementById(WIDTH_ID);
      if (input) {
        input.addEventListener('input', markValidity);
        input.addEventListener('keydown', event => event.stopPropagation());
      }
      controlsWired = true;
    }

    const culvertTool = Object.assign({}, drawing, {
      id: TOOL_ID,
      order: 20,
      label: 'Culvert',
      buildButton,
      buildControls,
      wireControls,
      getElements: () => [buildButton(), buildControls()].filter(Boolean),
      start,
      symbol: () => lineSymbol(1),
      isParent,
      applyMetadata,
      rebuildSupport,
      endpointPoints,
      culvertSurfaceGeometry
    });

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === AS.source && detail.tool === TOOL_ID) return;
      clearValidation();
    });

    if (RT.view && typeof RT.view.watch === 'function') {
      RT.view.watch('scale', scheduleMaterialTileRefresh);
    }

    AS.registerTool(culvertTool);
    window.startCulvertTool = start;
    window.SitePlanCulvertTool = culvertTool;
  }).catch(err => {
    console.error('[tools-access/culvert] Failed to initialize after runtime ready:', err);
  });
})();
