// Shared measurement, measurement-label, and side-label helpers for runtime.js.
(function () {
  'use strict';

  window.SitePlanMeasurementUtils = {
    create
  };

  function create(options) {
    const Graphic = options.Graphic;
    const geometryEngine = options.geometryEngine;
    const labelLayer = options.labelLayer;
    const measureLayer = options.measureLayer;
    const previewLayer = options.previewLayer;
    const assignGraphicId = options.assignGraphicId;
    const getSelectedEditMode = typeof options.getSelectedEditMode === 'function'
      ? options.getSelectedEditMode
      : () => 'reshape';

    let liveMeasureLabel = null;
    let measureGraphicCounter = 1;
    let livePreviewToolType = null;

    const measureLineSymbol = {
      type: 'simple-line',
      color: [0, 0, 0, 1],
      width: 2,
      style: 'dash'
    };
    const measureFillSymbol = {
      type: 'simple-fill',
      color: [255, 255, 255, 0.12],
      outline: { type: 'simple-line', color: [0, 0, 0, 1], width: 2, style: 'dash' }
    };
    const liveMeasureLabelSymbol = {
      type: 'text',
      text: '',
      color: [0, 0, 0, 1],
      haloColor: [255, 255, 255, 0.95],
      haloSize: 1.5,
      yoffset: 10,
      font: { family: 'Arial', size: 12 }
    };
    const sideLabelSymbol = {
      type: 'text',
      text: '',
      color: [0, 0, 0, 1],
      haloColor: [255, 255, 255, 0.95],
      haloSize: 1.5,
      font: { family: 'Arial', size: 9 }
    };

    const sideLabelMap = new Map();
    const rectangleUpdateStartShapes = new WeakMap();
    const rectangleUpdateStartDimensions = new WeakMap();

    function numberWithCommas(value, decimals = 0) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function geometryLengthFeet(geometry) {
      if (!geometry) return 0;
      try {
        const len = geometryEngine.geodesicLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      } catch (err) {}
      try {
        const len = geometryEngine.planarLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      } catch (err) {}
      return 0;
    }

    function geometryAreaSqFt(geometry) {
      if (!geometry) return 0;
      try {
        const area = geometryEngine.geodesicArea(geometry, 'square-feet');
        if (Number.isFinite(area)) return Math.abs(area);
      } catch (err) {}
      try {
        const area = geometryEngine.planarArea(geometry, 'square-feet');
        if (Number.isFinite(area)) return Math.abs(area);
      } catch (err) {}
      return 0;
    }

    function formatDistance(geometryOrFeet) {
      const feet = typeof geometryOrFeet === 'number' ? geometryOrFeet : geometryLengthFeet(geometryOrFeet);
      if (!Number.isFinite(feet) || feet <= 0) return '0 ft';
      if (feet >= 5280) return numberWithCommas(feet / 5280, 2) + ' mi';
      return numberWithCommas(feet, feet < 100 ? 1 : 0) + ' ft';
    }

    function formatArea(geometryOrSqFt) {
      const sqFt = typeof geometryOrSqFt === 'number' ? geometryOrSqFt : geometryAreaSqFt(geometryOrSqFt);
      if (!Number.isFinite(sqFt) || sqFt <= 0) return '0 sq ft / 0.00 ac';
      return numberWithCommas(sqFt, 0) + ' sq ft / ' + numberWithCommas(sqFt / 43560, 2) + ' ac';
    }

    function pointFromXY(x, y, spatialReference) {
      return { type: 'point', x, y, spatialReference };
    }

    function pathMidpoint(path, spatialReference) {
      if (!path || !path.length) return null;
      if (path.length === 1) return pointFromXY(path[0][0], path[0][1], spatialReference);
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        total += Math.sqrt(dx * dx + dy * dy);
      }
      if (!Number.isFinite(total) || total <= 0) {
        const coord = path[Math.floor((path.length - 1) / 2)];
        return pointFromXY(coord[0], coord[1], spatialReference);
      }
      const halfway = total / 2;
      let traveled = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const seg = Math.sqrt(dx * dx + dy * dy);
        if (traveled + seg >= halfway) {
          const ratio = seg > 0 ? (halfway - traveled) / seg : 0;
          return pointFromXY(a[0] + dx * ratio, a[1] + dy * ratio, spatialReference);
        }
        traveled += seg;
      }
      const last = path[path.length - 1];
      return pointFromXY(last[0], last[1], spatialReference);
    }

    function polylineMidpoint(polyline) {
      if (!polyline || !polyline.paths || !polyline.paths.length) return null;
      let longestPath = polyline.paths[0];
      let longestLength = -1;
      polyline.paths.forEach(path => {
        let len = 0;
        if (path && path.length > 1) {
          for (let i = 1; i < path.length; i++) {
            const dx = path[i][0] - path[i - 1][0];
            const dy = path[i][1] - path[i - 1][1];
            len += Math.sqrt(dx * dx + dy * dy);
          }
        }
        if (len > longestLength) {
          longestLength = len;
          longestPath = path;
        }
      });
      return pathMidpoint(longestPath, polyline.spatialReference);
    }

    function measureLabelAnchor(geometry) {
      if (!geometry) return null;
      if (geometry.type === 'point') return geometry;
      if (geometry.type === 'polyline') return polylineMidpoint(geometry) || (geometry.extent ? geometry.extent.center : null);
      if (geometry.type === 'polygon') return geometry.centroid || (geometry.extent ? geometry.extent.center : null);
      return geometry.extent ? geometry.extent.center : null;
    }

    function assignMeasureId(graphic) {
      if (graphic && !graphic.__measureId) graphic.__measureId = 'measure-' + (measureGraphicCounter++);
      return graphic ? graphic.__measureId : null;
    }

    function findMeasureLabel(measureId, targetLayer) {
      if (!measureId) return null;
      const layer = targetLayer || measureLayer;
      return layer.graphics.find(g => g.__measureId === measureId && g.__measureRole === 'label') || null;
    }

    function createMeasureLabel(geometry, text, targetLayer, measureId) {
      const anchor = measureLabelAnchor(geometry);
      if (!anchor || !text) return null;
      const symbol = Object.assign({}, liveMeasureLabelSymbol, { text });
      let label = measureId ? findMeasureLabel(measureId, targetLayer) : null;
      if (!label) {
        label = new Graphic({ geometry: anchor.clone ? anchor.clone() : anchor, symbol });
        label.__nonSelectable = true;
        label.__isMeasurementLabel = true;
        label.__measureRole = 'label';
        if (measureId) label.__measureId = measureId;
        (targetLayer || measureLayer).add(label);
      } else {
        label.geometry = anchor.clone ? anchor.clone() : anchor;
        label.symbol = symbol;
      }
      return label;
    }

    function measurementTextForGeometry(geometry) {
      if (!geometry) return '';
      if (geometry.type === 'polyline') return formatDistance(geometry);
      if (geometry.type === 'polygon') return formatArea(geometry);
      return '';
    }

    function createOrUpdateMeasureLabelForGraphic(graphic, targetLayer) {
      if (!graphic || !graphic.geometry) return null;
      const measureId = assignMeasureId(graphic);
      const text = measurementTextForGeometry(graphic.geometry);
      if (!text) return null;
      return createMeasureLabel(graphic.geometry, text, targetLayer || measureLayer, measureId);
    }

    function removeMeasureLabelForGraphic(graphic, targetLayer) {
      const measureId = graphic && graphic.__measureId;
      if (!measureId) return;
      const layers = targetLayer ? [targetLayer] : [measureLayer, previewLayer, labelLayer];
      layers.forEach(layer => {
        layer.graphics.filter(g => g.__measureId === measureId && g.__measureRole === 'label').toArray().forEach(g => layer.remove(g));
      });
    }

    function clearPreviewGraphics(predicate) {
      if (!previewLayer || !previewLayer.graphics || typeof predicate !== 'function') return;
      const graphics = typeof previewLayer.graphics.toArray === 'function'
        ? previewLayer.graphics.toArray()
        : (Array.isArray(previewLayer.graphics.items) ? previewLayer.graphics.items.slice() : []);
      graphics.forEach(graphic => {
        if (predicate(graphic)) previewLayer.remove(graphic);
      });
    }

    function polygonSegmentMidpoints(geometry) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
      const ring = geometry.rings[0];
      const sr = geometry.spatialReference;
      if (!ring || ring.length < 2) return [];

      const ringClosed = ring.length > 2 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
      const pts = ringClosed ? ring.slice(0, -1) : ring.slice();
      const out = [];

      function addSegment(a, b, isClosing) {
        if (!a || !b) return;
        const mid = pointFromXY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, sr);
        const segGeom = { type: 'polyline', paths: [[a, b]], spatialReference: sr };
        let lengthFt = 0;
        try {
          lengthFt = Math.abs(geometryEngine.geodesicLength(segGeom, 'feet') || 0);
        } catch (err) {}
        if (!Number.isFinite(lengthFt) || lengthFt <= 0) {
          try {
            lengthFt = Math.abs(geometryEngine.planarLength(segGeom, 'feet') || 0);
          } catch (err) {}
        }
        if (lengthFt > 0.5) {
          out.push({ mid, lengthFt, __closing: !!isClosing });
        }
      }

      for (let i = 0; i < pts.length - 1; i++) {
        addSegment(pts[i], pts[i + 1], false);
      }
      if (pts.length >= 3) {
        addSegment(pts[pts.length - 1], pts[0], true);
      }
      return out;
    }

    function buildSideLabelGraphics(geometry, labelOnlyTwoRectangleSides, fixedSizeLabelValues) {
      const segments = polygonSegmentMidpoints(geometry);
      if (!segments.length) return [];
      const toLabel = labelOnlyTwoRectangleSides ? segments.slice(0, 2) : segments;
      return toLabel.map((seg, index) => {
        let labelText = formatDistance(seg.lengthFt);
        if (fixedSizeLabelValues && index === 0 && Number.isFinite(fixedSizeLabelValues.lengthFt)) {
          labelText = formatDistance(fixedSizeLabelValues.lengthFt);
        } else if (fixedSizeLabelValues && index === 1 && Number.isFinite(fixedSizeLabelValues.widthFt)) {
          labelText = formatDistance(fixedSizeLabelValues.widthFt);
        }
        const symbol = Object.assign({}, sideLabelSymbol, { text: labelText });
        const label = new Graphic({ geometry: seg.mid, symbol });
        label.__nonSelectable = true;
        label.__isSideLabel = true;
        return label;
      });
    }

    function isRectangleGraphic(graphic) {
      return !!(graphic && graphic.__toolType === 'rectangle');
    }

    function rectangleUsesAllSideLabels(graphic) {
      return !!(
        graphic &&
        (graphic.__rectangleAllSideLabels ||
          (graphic.attributes && graphic.attributes.rectangleMeasurementMode === 'allSides'))
      );
    }

    function rectangleUsesTwoSideLabels(graphic) {
      return isRectangleGraphic(graphic) && !rectangleUsesAllSideLabels(graphic);
    }

    function fixedSizeLabelValuesForGraphic(graphic) {
      if (!isRectangleGraphic(graphic) || rectangleUsesAllSideLabels(graphic)) return null;
      const attrs = graphic.attributes || {};
      const fixedSize = graphic.__fixedSize || attrs.fixedSize;
      const useFixedLabels = graphic.__useFixedSizeLabels || attrs.useFixedSizeLabels;
      const lengthFt = Number.parseFloat(graphic.__fixedLengthFt != null ? graphic.__fixedLengthFt : attrs.fixedLengthFt);
      const widthFt = Number.parseFloat(graphic.__fixedWidthFt != null ? graphic.__fixedWidthFt : attrs.fixedWidthFt);
      if (!fixedSize || !useFixedLabels) return null;
      if (!Number.isFinite(lengthFt) || !Number.isFinite(widthFt)) return null;
      return { lengthFt, widthFt };
    }

    function disableFixedSizeLabels(graphic) {
      if (!graphic) return false;
      const attrs = graphic.attributes || {};
      if (!graphic.__useFixedSizeLabels && !attrs.useFixedSizeLabels) return false;
      graphic.__useFixedSizeLabels = false;
      graphic.attributes = Object.assign({}, attrs, { useFixedSizeLabels: false });
      return true;
    }

    function markRectangleAllSideLabels(graphic) {
      if (!isRectangleGraphic(graphic)) return false;
      if (rectangleUsesAllSideLabels(graphic)) return false;
      disableFixedSizeLabels(graphic);
      graphic.__rectangleAllSideLabels = true;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        rectangleMeasurementMode: 'allSides'
      });
      return true;
    }

    function geometryOuterRingPoints(geometry) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
      const ring = geometry.rings[0] || [];
      if (ring.length > 2) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) {
          return ring.slice(0, -1);
        }
      }
      return ring.slice();
    }

    function rectangleShapeSignature(geometry) {
      const pts = geometryOuterRingPoints(geometry);
      if (pts.length < 3) return null;
      const origin = pts[0];
      return pts.map(pt => [pt[0] - origin[0], pt[1] - origin[1]]);
    }

    function shapeSignaturesMatch(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      let maxAbs = 0;
      a.forEach(pt => {
        maxAbs = Math.max(maxAbs, Math.abs(pt[0]), Math.abs(pt[1]));
      });
      b.forEach(pt => {
        maxAbs = Math.max(maxAbs, Math.abs(pt[0]), Math.abs(pt[1]));
      });
      const tolerance = Math.max(0.001, maxAbs * 1e-8);
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i][0] - b[i][0]) > tolerance) return false;
        if (Math.abs(a[i][1] - b[i][1]) > tolerance) return false;
      }
      return true;
    }

    function rectangleDimensionSignature(geometry) {
      const segments = polygonSegmentMidpoints(geometry);
      if (segments.length < 2) return null;
      return [segments[0].lengthFt, segments[1].lengthFt];
    }

    function rememberRectangleUpdateStart(graphic) {
      if (!isRectangleGraphic(graphic) || !graphic.geometry) return;
      const sig = rectangleShapeSignature(graphic.geometry);
      if (sig) rectangleUpdateStartShapes.set(graphic, sig);
      const dimSig = rectangleDimensionSignature(graphic.geometry);
      if (dimSig) rectangleUpdateStartDimensions.set(graphic, dimSig);
    }

    function clearRectangleUpdateStart(graphic) {
      if (!graphic) return;
      try { rectangleUpdateStartShapes.delete(graphic); } catch (err) {}
      try { rectangleUpdateStartDimensions.delete(graphic); } catch (err) {}
    }

    function rectangleShapeChangedSinceUpdateStart(graphic) {
      if (!isRectangleGraphic(graphic) || !graphic.geometry) return false;
      const startSig = rectangleUpdateStartShapes.get(graphic);
      const currentSig = rectangleShapeSignature(graphic.geometry);
      if (!startSig || !currentSig) return false;
      return !shapeSignaturesMatch(startSig, currentSig);
    }

    function rectangleDimensionsChangedSinceUpdateStart(graphic) {
      if (!isRectangleGraphic(graphic) || !graphic.geometry) return false;
      const startSig = rectangleUpdateStartDimensions.get(graphic);
      const currentSig = rectangleDimensionSignature(graphic.geometry);
      if (!startSig || !currentSig || startSig.length !== currentSig.length) return false;
      const maxDim = Math.max(Math.abs(startSig[0]), Math.abs(startSig[1]), Math.abs(currentSig[0]), Math.abs(currentSig[1]), 1);
      const toleranceFt = Math.max(0.05, maxDim * 0.002);
      return Math.abs(startSig[0] - currentSig[0]) > toleranceFt ||
        Math.abs(startSig[1] - currentSig[1]) > toleranceFt;
    }

    function shouldDisableFixedSizeLabelsFromUpdate(event, graphic) {
      if (!event || !fixedSizeLabelValuesForGraphic(graphic)) return false;
      const info = event.toolEventInfo || {};
      const type = info.type ? String(info.type).toLowerCase() : '';
      if (type && (/vertex|reshape|scale|resize/.test(type))) return true;
      if (type && (/move|rotate/.test(type))) return false;
      const selectedEditMode = getSelectedEditMode();
      if (selectedEditMode === 'reshape') return rectangleShapeChangedSinceUpdateStart(graphic);
      if (selectedEditMode === 'resize') return rectangleDimensionsChangedSinceUpdateStart(graphic);
      return false;
    }

    function shouldMarkRectangleAllSidesFromUpdate(event, graphic) {
      if (!event || !isRectangleGraphic(graphic) || getSelectedEditMode() !== 'reshape') return false;
      if (rectangleUsesAllSideLabels(graphic)) return false;
      const info = event.toolEventInfo || {};
      const type = info.type ? String(info.type).toLowerCase() : '';
      if (type && /move/.test(type) && !/vertex|reshape/.test(type)) return false;
      if (type && (/reshape|vertex/.test(type))) return true;
      return rectangleShapeChangedSinceUpdateStart(graphic);
    }

    function refreshSideLabelsForGraphic(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polygon') return;
      const attrs = graphic.attributes || {};
      if (graphic.__skipEdgeLabels || attrs.skipEdgeLabels || graphic.__skipSideLabels || attrs.skipSideLabels) {
        removeSideLabelsForGraphic(graphic);
        return;
      }
      const id = assignGraphicId(graphic) && graphic.__sitePlanId;
      if (!id) return;
      removeSideLabelsForGraphic(graphic);
      const labels = buildSideLabelGraphics(
        graphic.geometry,
        rectangleUsesTwoSideLabels(graphic),
        fixedSizeLabelValuesForGraphic(graphic)
      );
      if (!labels.length) return;
      labels.forEach(l => {
        l.__sideLabelOf = id;
        labelLayer.add(l);
      });
      sideLabelMap.set(id, labels);
    }

    function removeSideLabelsForGraphic(graphic) {
      const id = graphic && graphic.__sitePlanId;
      if (!id) return;
      const existing = sideLabelMap.get(id);
      if (existing) {
        existing.forEach(l => labelLayer.remove(l));
        sideLabelMap.delete(id);
      }
    }

    function clearSideLabelMap() {
      sideLabelMap.clear();
    }

    function beginLiveSideLabelPreview(toolType) {
      livePreviewToolType = toolType || null;
    }

    function refreshLiveSideLabels(geometry, toolType) {
      clearPreviewGraphics(g => g && g.__isLivePreview);
      if (window.__sitePlanSuppressLiveSideLabels) return;
      if (!geometry || geometry.type !== 'polygon') return;
      const effectiveToolType = toolType || livePreviewToolType;
      const labelOnlyTwoRectangleSides = effectiveToolType === 'rectangle';
      const labels = buildSideLabelGraphics(geometry, labelOnlyTwoRectangleSides);
      labels.forEach(l => {
        l.__isLivePreview = true;
        previewLayer.add(l);
      });
    }

    function clearLiveSideLabels() {
      clearPreviewGraphics(g => g && g.__isLivePreview);
      livePreviewToolType = null;
    }

    function updateLiveMeasurePreview(geometry) {
      clearLiveMeasurePreview();
      if (!geometry) return;
      const text = measurementTextForGeometry(geometry);
      if (!text) return;
      liveMeasureLabel = createMeasureLabel(geometry, text, previewLayer);
    }

    function clearLiveMeasurePreview() {
      if (liveMeasureLabel) {
        try { previewLayer.remove(liveMeasureLabel); } catch (err) {}
      }
      clearPreviewGraphics(g => g && g.__isMeasurementLabel && g.__measureRole === 'label' && !g.__measureId);
      liveMeasureLabel = null;
    }

    return {
      measureLineSymbol,
      measureFillSymbol,
      numberWithCommas,
      geometryAreaSqFt,
      formatDistance,
      formatArea,
      measurementTextForGeometry,
      measureLabelAnchor,
      assignMeasureId,
      createMeasureLabel,
      createOrUpdateMeasureLabelForGraphic,
      removeMeasureLabelForGraphic,
      rememberRectangleUpdateStart,
      clearRectangleUpdateStart,
      shouldDisableFixedSizeLabelsFromUpdate,
      disableFixedSizeLabels,
      shouldMarkRectangleAllSidesFromUpdate,
      markRectangleAllSideLabels,
      refreshSideLabelsForGraphic,
      removeSideLabelsForGraphic,
      clearSideLabelMap,
      beginLiveSideLabelPreview,
      refreshLiveSideLabels,
      clearLiveSideLabels,
      updateLiveMeasurePreview,
      clearLiveMeasurePreview
    };
  }
})();
