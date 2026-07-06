// Rotation snap and guide graphics for eligible selected polygon tools.
(function () {
  'use strict';

  window.SitePlanRotationGuides = {
    create
  };

  function create(options) {
    const Graphic = options.Graphic;
    const previewLayer = options.previewLayer;
    const getGraphicCapabilities = options.getGraphicCapabilities;
    const preferredEditModeForGraphic = options.preferredEditModeForGraphic;
    const getSelectedEditMode = options.getSelectedEditMode;
    const getSelectedGraphic = options.getSelectedGraphic;
    const rotateGraphicGeometry = options.rotateGraphicGeometry;
    const createOrUpdateObjectLabel = options.createOrUpdateObjectLabel;
    const rawObjectLabelText = options.rawObjectLabelText;
    const refreshSideLabelsForGraphic = options.refreshSideLabelsForGraphic;
    const updateSelectedShapeBox = options.updateSelectedShapeBox;
    const fireGraphicUpdated = options.fireGraphicUpdated;
    const startSketchUpdate = options.startSketchUpdate;
    const showSelectionToolbar = options.showSelectionToolbar;
    const positionSelectionToolbar = options.positionSelectionToolbar;

    window.__sitePlanRotationGuidesEnabled = true;
    window.rotationGuidesEnabled = function () {
      return window.__sitePlanRotationGuidesEnabled !== false;
    };
    window.toggleRotationGuides = function (enabled) {
      window.__sitePlanRotationGuidesEnabled = !!enabled;
      try {
        window.dispatchEvent(new CustomEvent('siteplan:rotation-guides-changed', {
          detail: { enabled: window.__sitePlanRotationGuidesEnabled }
        }));
      } catch (err) {}
    };

    const rotationGuideGraphics = [];
    let rotationSnapUpdateStart = null;

    function normalizeAngleDegrees(angle) {
      return ((Number(angle || 0) % 360) + 360) % 360;
    }

    function shortestAngleDeltaDegrees(fromDegrees, toDegrees) {
      return ((toDegrees - fromDegrees + 540) % 360) - 180;
    }

    function snapAngleDegrees(angle, increment) {
      const step = Number(increment || 0);
      if (!Number.isFinite(step) || step <= 0) return normalizeAngleDegrees(angle);
      return normalizeAngleDegrees(Math.round(angle / step) * step);
    }

    function polygonRingPoints(graphic) {
      const geom = graphic && graphic.geometry;
      if (!geom || geom.type !== 'polygon' || !geom.rings || !geom.rings.length) return [];
      const ring = (geom.rings[0] || []).slice();
      if (ring.length > 1) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) ring.pop();
      }
      return ring.filter(pt => pt && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])));
    }

    function polygonReferenceInfo(graphic, preferredIndex) {
      const points = polygonRingPoints(graphic);
      if (points.length < 2) return null;
      const stableIndex = Number(preferredIndex);
      if (Number.isInteger(stableIndex) && stableIndex >= 0 && stableIndex < points.length) {
        const a = points[stableIndex];
        const b = points[(stableIndex + 1) % points.length];
        if (a && b) {
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > 0) {
            return { angle: normalizeAngleDegrees(Math.atan2(dy, dx) * 180 / Math.PI), index: stableIndex, length };
          }
        }
      }
      let bestAngle = null;
      let bestLength = -1;
      let bestIndex = null;
      points.forEach((a, index) => {
        const b = points[(index + 1) % points.length];
        if (!b) return;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > bestLength && length > 0) {
          bestLength = length;
          bestAngle = Math.atan2(dy, dx) * 180 / Math.PI;
          bestIndex = index;
        }
      });
      return bestAngle == null ? null : {
        angle: normalizeAngleDegrees(bestAngle),
        index: bestIndex,
        length: bestLength
      };
    }

    function polygonReferenceAngleDegrees(graphic, preferredIndex) {
      const info = polygonReferenceInfo(graphic, preferredIndex);
      return info ? info.angle : null;
    }

    function polygonGuideCenter(graphic, session) {
      if (session && session.center) return session.center;
      const geom = graphic && graphic.geometry;
      return geom && geom.extent ? geom.extent.center : null;
    }

    function polygonGuideSpan(graphic) {
      const points = polygonRingPoints(graphic);
      let span = 0;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          span = Math.max(span, Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
      }
      return span;
    }

    function rotationSnapDegreesForGraphic(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polygon') return 0;
      const caps = getGraphicCapabilities(graphic);
      if (caps.rotate === false) return 0;
      const degrees = Number(caps.rotationSnapDegrees);
      if (!Number.isFinite(degrees) || degrees <= 0) return 0;
      if (typeof window.rotationGuidesEnabled === 'function' && !window.rotationGuidesEnabled()) return 0;
      const effectiveMode = preferredEditModeForGraphic(graphic, getSelectedEditMode());
      if (effectiveMode === 'reshape' || effectiveMode === 'move') return 0;
      return degrees;
    }

    function rotationGuideModeForGraphic(graphic) {
      const caps = getGraphicCapabilities(graphic);
      return caps.rotationGuideMode === 'delta' ? 'delta' : 'edge';
    }

    function clearGuideGraphics() {
      while (rotationGuideGraphics.length) {
        const graphic = rotationGuideGraphics.pop();
        try { previewLayer.remove(graphic); } catch (err) {}
      }
    }

    function makeRotationGuideLine(center, angleDegrees, halfLength, spatialReference, symbol) {
      const radians = angleDegrees * Math.PI / 180;
      const dx = Math.cos(radians) * halfLength;
      const dy = Math.sin(radians) * halfLength;
      return new Graphic({
        geometry: {
          type: 'polyline',
          paths: [[[center.x - dx, center.y - dy], [center.x + dx, center.y + dy]]],
          spatialReference
        },
        symbol
      });
    }

    function makeRotationGuideArc(center, endDegrees, radius, spatialReference, symbol, startDegrees) {
      const start = Number.isFinite(Number(startDegrees)) ? Number(startDegrees) : 0;
      const delta = shortestAngleDeltaDegrees(start, endDegrees);
      const steps = Math.max(8, Math.ceil(Math.abs(delta) / 7.5));
      const path = [];
      for (let i = 0; i <= steps; i++) {
        const angle = (start + delta * (i / steps)) * Math.PI / 180;
        path.push([center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius]);
      }
      return new Graphic({
        geometry: { type: 'polyline', paths: [path], spatialReference },
        symbol
      });
    }

    function guideAngleForGraphic(graphic, mode, startAngle, preferredIndex, increment) {
      const angle = polygonReferenceAngleDegrees(graphic, preferredIndex);
      if (angle == null) return null;
      if (mode !== 'delta' || startAngle == null) {
        return {
          currentAngle: angle,
          guideAngle: snapAngleDegrees(angle, increment),
          arcStartAngle: 0
        };
      }
      const delta = shortestAngleDeltaDegrees(startAngle, angle);
      const snappedDelta = Math.round(delta / increment) * increment;
      return {
        currentAngle: angle,
        guideAngle: normalizeAngleDegrees(90 + snappedDelta),
        arcStartAngle: 90
      };
    }

    function updateGuideGraphic(graphic, session) {
      const increment = rotationSnapDegreesForGraphic(graphic);
      const geom = graphic && graphic.geometry;
      if (!increment || !geom || !geom.extent) {
        clearGuideGraphics();
        return;
      }
      const mode = session && session.mode ? session.mode : rotationGuideModeForGraphic(graphic);
      const guide = guideAngleForGraphic(
        graphic,
        mode,
        session && session.angle,
        session && session.edgeIndex,
        increment
      );
      if (!guide) {
        clearGuideGraphics();
        return;
      }
      const center = polygonGuideCenter(graphic, session);
      const spatialReference = geom.spatialReference;
      const span = polygonGuideSpan(graphic);
      if (!center || !Number.isFinite(span) || span <= 0) {
        clearGuideGraphics();
        return;
      }
      const half = Math.max(span * 0.62, 1);
      const arcRadius = Math.max(span * 0.28, 1);

      const axisSymbol = {
        type: 'simple-line',
        color: [40, 40, 40, 0.42],
        width: 1.5,
        style: 'dash',
        cap: 'butt',
        join: 'miter'
      };
      const snapSymbol = {
        type: 'simple-line',
        color: [234, 179, 8, 0.95],
        width: 2.5,
        style: 'dash',
        cap: 'butt',
        join: 'miter'
      };
      const arcSymbol = {
        type: 'simple-line',
        color: [234, 179, 8, 0.85],
        width: 2,
        style: 'short-dot',
        cap: 'round',
        join: 'round'
      };

      const items = [
        { geometry: makeRotationGuideLine(center, 0, half, spatialReference, axisSymbol).geometry, symbol: axisSymbol },
        { geometry: makeRotationGuideLine(center, 90, half, spatialReference, axisSymbol).geometry, symbol: axisSymbol },
        { geometry: makeRotationGuideArc(center, guide.guideAngle, arcRadius, spatialReference, arcSymbol, guide.arcStartAngle).geometry, symbol: arcSymbol },
        { geometry: makeRotationGuideLine(center, guide.guideAngle, half, spatialReference, snapSymbol).geometry, symbol: snapSymbol }
      ].filter(Boolean);
      if (rotationGuideGraphics.length !== items.length) {
        clearGuideGraphics();
        items.forEach(item => {
          const guideGraphic = new Graphic({ geometry: item.geometry, symbol: item.symbol });
          guideGraphic.__runtimeRotationGuide = true;
          guideGraphic.__nonSelectable = true;
          guideGraphic.__skipMeasure = true;
          rotationGuideGraphics.push(guideGraphic);
        });
        if (typeof previewLayer.addMany === 'function') previewLayer.addMany(rotationGuideGraphics);
        else rotationGuideGraphics.forEach(g => previewLayer.add(g));
        return;
      }
      rotationGuideGraphics.forEach((guideGraphic, index) => {
        guideGraphic.geometry = items[index].geometry;
        guideGraphic.symbol = items[index].symbol;
      });
    }

    function beginUpdate(graphic) {
      const increment = rotationSnapDegreesForGraphic(graphic);
      const info = increment ? polygonReferenceInfo(graphic) : null;
      const mode = rotationGuideModeForGraphic(graphic);
      const center = graphic && graphic.geometry && graphic.geometry.extent ? graphic.geometry.extent.center : null;
      rotationSnapUpdateStart = increment && info && info.angle != null
        ? { sitePlanId: graphic.__sitePlanId || null, angle: info.angle, edgeIndex: info.index, mode, center, isRotating: false }
        : null;
      clearGuideGraphics();
    }

    function updateDuringSketch(graphic, event) {
      if (!rotationSnapUpdateStart) return;
      const startId = rotationSnapUpdateStart.sitePlanId;
      const currentId = graphic && graphic.__sitePlanId;
      if (startId && currentId && startId !== currentId) return;
      const angle = polygonReferenceAngleDegrees(graphic, rotationSnapUpdateStart.edgeIndex);
      if (angle == null) return;
      const changed = Math.abs(shortestAngleDeltaDegrees(rotationSnapUpdateStart.angle, angle));
      const updateType = event && event.toolEventInfo && String(event.toolEventInfo.type || '').toLowerCase();
      if (updateType && updateType !== 'rotate') {
        rotationSnapUpdateStart.center = graphic && graphic.geometry && graphic.geometry.extent
          ? graphic.geometry.extent.center
          : rotationSnapUpdateStart.center;
        rotationSnapUpdateStart.isRotating = false;
        clearGuideGraphics();
        return;
      }
      const isRotateUpdate = updateType === 'rotate' || changed >= 0.5;
      if (!isRotateUpdate && !rotationSnapUpdateStart.isRotating) {
        rotationSnapUpdateStart.center = graphic && graphic.geometry && graphic.geometry.extent
          ? graphic.geometry.extent.center
          : rotationSnapUpdateStart.center;
        clearGuideGraphics();
        return;
      }
      rotationSnapUpdateStart.isRotating = true;
      updateGuideGraphic(graphic, rotationSnapUpdateStart);
    }

    function applyCorrection(graphic, started) {
      if (!started || !graphic || !graphic.geometry) return;
      const startId = started.sitePlanId;
      const currentId = graphic.__sitePlanId;
      if (startId && currentId && startId !== currentId) return;
      const increment = rotationSnapDegreesForGraphic(graphic);
      if (!increment) return;
      const angle = polygonReferenceAngleDegrees(graphic, started.edgeIndex);
      if (angle == null) return;
      const changed = Math.abs(shortestAngleDeltaDegrees(started.angle, angle));
      if (changed < 0.5) return;
      const correction = started.mode === 'delta'
        ? (Math.round(shortestAngleDeltaDegrees(started.angle, angle) / increment) * increment) -
          shortestAngleDeltaDegrees(started.angle, angle)
        : shortestAngleDeltaDegrees(angle, snapAngleDegrees(angle, increment));
      if (Math.abs(correction) < 0.01) return;
      if (!rotateGraphicGeometry(graphic, correction)) return;
      if (graphic.__labelText || graphic.__labelRawText) createOrUpdateObjectLabel(graphic, rawObjectLabelText(graphic));
      if (graphic.geometry && graphic.geometry.type === 'polygon') refreshSideLabelsForGraphic(graphic);
      updateSelectedShapeBox();
      fireGraphicUpdated(graphic, {
        state: 'complete',
        toolEventInfo: {
          type: 'rotation-snap',
          snapDegrees: increment,
          correctionDegrees: correction
        }
      });
      startSketchUpdate(graphic);
      requestAnimationFrame(() => {
        showSelectionToolbar(graphic);
        positionSelectionToolbar();
      });
    }

    function completeUpdate(graphic, event) {
      const started = rotationSnapUpdateStart;
      rotationSnapUpdateStart = null;
      clearGuideGraphics();
      const infoType = event && event.toolEventInfo && event.toolEventInfo.type;
      if (infoType === 'rotation-snap') return;
      applyCorrection(graphic, started);
    }

    function resetAfterRelease() {
      if (!rotationSnapUpdateStart || !rotationSnapUpdateStart.isRotating) return;
      const graphic = getSelectedGraphic();
      const reset = () => {
        if (!rotationSnapUpdateStart || !graphic || graphic !== getSelectedGraphic()) return;
        const started = rotationSnapUpdateStart;
        applyCorrection(graphic, started);
        const increment = rotationSnapDegreesForGraphic(graphic);
        const info = increment ? polygonReferenceInfo(graphic, started.edgeIndex) : null;
        if (!info || info.angle == null) {
          rotationSnapUpdateStart = null;
          clearGuideGraphics();
          return;
        }
        rotationSnapUpdateStart = {
          sitePlanId: graphic.__sitePlanId || null,
          angle: info.angle,
          edgeIndex: info.index,
          mode: rotationGuideModeForGraphic(graphic),
          center: graphic.geometry && graphic.geometry.extent ? graphic.geometry.extent.center : null,
          isRotating: false
        };
        clearGuideGraphics();
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.setTimeout(reset, 0));
      else window.setTimeout(reset, 0);
    }

    function cancelUpdate() {
      rotationSnapUpdateStart = null;
      clearGuideGraphics();
    }

    window.addEventListener('siteplan:rotation-guides-changed', event => {
      if (!event || !event.detail || event.detail.enabled !== true) clearGuideGraphics();
    });
    window.addEventListener('pointerup', resetAfterRelease, true);
    window.addEventListener('mouseup', resetAfterRelease, true);
    window.addEventListener('touchend', resetAfterRelease, true);

    return {
      beginUpdate,
      updateDuringSketch,
      completeUpdate,
      cancelUpdate
    };
  }
})();
