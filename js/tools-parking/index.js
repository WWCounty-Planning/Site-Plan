// Parking tool group coordinator.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }

  if (!window.SitePlanParkingShared) {
    console.error('[tools-parking] SitePlanParkingShared is missing. Make sure parking-shared.js loads before index.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const PS = window.SitePlanParkingShared;
    const section = document.getElementById('tools-parking');
    const SIDE_SNAP_TOLERANCE_PX = 18;
    const SIDE_CONTACT_TOLERANCE_PX = 3;
    const SIDE_PARALLEL_DOT_MIN = 0.92;
    const ROTATION_SNAP_DEGREES = 5;
    const SNAP_GROUP_PREFIX = 'parking-snap-group';
    let sideSnapPreview = [];
    let rotationSnapGuide = [];
    let rotationSnapSession = null;
    let activeGroupMove = null;
    let toolbarRotationGroup = null;
    let suppressNextToolbarRotationForId = null;

    function callTool(tool, name, args, fallback) {
      const fn = tool && name && tool[name];
      if (typeof fn === 'function') return fn.apply(tool, args || []);
      return typeof fallback === 'function' ? fallback() : undefined;
    }

    function graphicsInLayer(layer) {
      return PS.graphicsInLayer ? PS.graphicsInLayer(layer) : [];
    }

    function sideMidpoint(side) {
      return PS.sideMidpoint ? PS.sideMidpoint(side) : null;
    }

    function screenDistanceBetweenPoints(a, b) {
      return PS.screenDistanceBetweenPoints ? PS.screenDistanceBetweenPoints(a, b) : Infinity;
    }

    function rotationGuidesEnabled() {
      if (typeof window.rotationGuidesEnabled === 'function') return !!window.rotationGuidesEnabled();
      return window.__sitePlanRotationGuidesEnabled !== false;
    }

    function parentId(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__sitePlanId || attrs.sitePlanId || null);
    }

    function snapGroupId(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__parkingSnapGroupId || attrs.parkingSnapGroupId || null);
    }

    function setSnapGroupId(graphic, groupId) {
      if (!graphic) return graphic;
      graphic.__parkingSnapGroupId = groupId || null;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        parkingSnapGroupId: groupId || null
      });
      return graphic;
    }

    function clearSnapGroup(graphic) {
      return setSnapGroupId(graphic, null);
    }

    function newSnapGroupId() {
      return SNAP_GROUP_PREFIX + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function toolForGraphic(graphic) {
      const tools = PS.getTools ? PS.getTools() : [];
      return tools.find(tool => !!callTool(tool, 'isParent', [graphic], () => false)) || null;
    }

    function sideSnapTools() {
      const tools = PS.getTools ? PS.getTools() : [];
      return tools.filter(tool =>
        tool &&
        typeof tool.isParent === 'function' &&
        typeof tool.getSnapSides === 'function' &&
        typeof tool.moveByOffset === 'function'
      );
    }

    function sideSnapParents(excludeGraphic) {
      const excludeId = parentId(excludeGraphic);
      const excludeGroupId = snapGroupId(excludeGraphic);
      return graphicsInLayer(RT.drawLayer).filter(graphic => {
        if (!graphic || graphic === excludeGraphic || graphic.__nonSelectable) return false;
        if (excludeId && parentId(graphic) === excludeId) return false;
        if (excludeGroupId && snapGroupId(graphic) === excludeGroupId) return false;
        return !!toolForGraphic(graphic);
      });
    }

    function allSideSnapParents() {
      return graphicsInLayer(RT.drawLayer).filter(graphic => {
        if (!graphic || graphic.__nonSelectable) return false;
        return !!toolForGraphic(graphic);
      });
    }

    function groupMembers(groupId, excludeGraphic) {
      if (!groupId) return [];
      const excludeId = parentId(excludeGraphic);
      return allSideSnapParents().filter(graphic => {
        if (graphic === excludeGraphic) return false;
        if (excludeId && parentId(graphic) === excludeId) return false;
        return snapGroupId(graphic) === groupId;
      });
    }

    function mergeSnapGroups(source, target) {
      if (!source || !target) return null;
      const sourceGroupId = snapGroupId(source);
      const targetGroupId = snapGroupId(target);
      const groupId = targetGroupId || sourceGroupId || newSnapGroupId();

      allSideSnapParents().forEach(graphic => {
        const currentGroupId = snapGroupId(graphic);
        if (graphic === source || graphic === target ||
            currentGroupId === sourceGroupId || currentGroupId === targetGroupId) {
          setSnapGroupId(graphic, groupId);
          rememberGraphicAngle(graphic);
        }
      });
      return groupId;
    }

    function centerPointForGraphic(graphic) {
      const geometry = graphic && graphic.geometry;
      const ring = PS.ringWithoutDuplicateClose ? PS.ringWithoutDuplicateClose(geometry) : [];
      if (!ring.length) return null;
      const sum = ring.reduce((acc, pt) => {
        if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return acc;
        acc.x += pt[0];
        acc.y += pt[1];
        acc.count += 1;
        return acc;
      }, { x: 0, y: 0, count: 0 });
      if (!sum.count) return null;
      return PS.pointFromXY
        ? PS.pointFromXY(sum.x / sum.count, sum.y / sum.count, geometry.spatialReference)
        : { type: 'point', x: sum.x / sum.count, y: sum.y / sum.count, spatialReference: geometry.spatialReference };
    }

    function cloneGeometry(geometry) {
      if (!geometry) return null;
      let json = null;
      if (geometry.toJSON) {
        try { json = geometry.toJSON(); } catch (err) {}
      }
      if (!json) {
        try { json = JSON.parse(JSON.stringify(geometry)); }
        catch (err) { json = geometry; }
      }
      if (json && !json.type) {
        if (json.rings) json.type = 'polygon';
        else if (json.paths) json.type = 'polyline';
        else if (json.x != null && json.y != null) json.type = 'point';
      }
      if (json && !json.spatialReference && geometry.spatialReference) {
        json.spatialReference = geometry.spatialReference.toJSON ? geometry.spatialReference.toJSON() : geometry.spatialReference;
      }
      return json;
    }

    function rotatePointAround(point, center, radians) {
      const x = point[0] - center.x;
      const y = point[1] - center.y;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return [
        center.x + x * cos - y * sin,
        center.y + x * sin + y * cos
      ];
    }

    function transformCoordinates(coords, center, radians, dx, dy) {
      if (!coords) return coords;
      if (typeof coords[0] === 'number') {
        const rotated = rotatePointAround(coords, center, radians);
        return [rotated[0] + dx, rotated[1] + dy];
      }
      return coords.map(part => transformCoordinates(part, center, radians, dx, dy));
    }

    function transformGeometry(geometry, center, radians, dx, dy) {
      const json = cloneGeometry(geometry);
      if (!json || !center) return json;
      if (json.rings) json.rings = transformCoordinates(json.rings, center, radians, dx, dy);
      if (json.paths) json.paths = transformCoordinates(json.paths, center, radians, dx, dy);
      if (json.x != null && json.y != null) {
        const pt = transformCoordinates([json.x, json.y], center, radians, dx, dy);
        json.x = pt[0];
        json.y = pt[1];
      }
      return json;
    }

    function angleForGraphic(graphic) {
      const tool = toolForGraphic(graphic);
      const sides = tool && typeof tool.getSnapSides === 'function' ? tool.getSnapSides(graphic) || [] : [];
      const top = sides.find(side => side && side.name === 'top') || sides[0];
      if (!top || !Number.isFinite(top.ux) || !Number.isFinite(top.uy)) return null;
      return Math.atan2(top.uy, top.ux);
    }

    function angleDelta(fromAngle, toAngle) {
      if (!Number.isFinite(fromAngle) || !Number.isFinite(toAngle)) return 0;
      let delta = toAngle - fromAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return delta;
    }

    function rememberGraphicAngle(graphic) {
      const angle = angleForGraphic(graphic);
      if (Number.isFinite(angle)) graphic.__parkingLastAngle = angle;
      return angle;
    }

    function nearestRotationSnapDelta(graphic, session) {
      const angle = angleForGraphic(graphic);
      if (!Number.isFinite(angle)) return 0;
      if (session && Number.isFinite(session.angle)) {
        const deltaDegrees = angleDelta(session.angle, angle) * 180 / Math.PI;
        const snappedDelta = Math.round(deltaDegrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
        return (snappedDelta - deltaDegrees) * Math.PI / 180;
      }
      const angleDegrees = angle * 180 / Math.PI;
      const snappedDegrees = Math.round(angleDegrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
      return (snappedDegrees - angleDegrees) * Math.PI / 180;
    }

    function nearestRotationSnapAngle(graphic, session) {
      const angle = angleForGraphic(graphic);
      if (!Number.isFinite(angle)) return null;
      if (session && Number.isFinite(session.angle)) {
        const deltaDegrees = angleDelta(session.angle, angle) * 180 / Math.PI;
        const snappedDelta = Math.round(deltaDegrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
        return Math.PI / 2 + snappedDelta * Math.PI / 180;
      }
      const angleDegrees = angle * 180 / Math.PI;
      const snappedDegrees = Math.round(angleDegrees / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
      return snappedDegrees * Math.PI / 180;
    }

    function moveGraphicToGeometry(graphic, geometry) {
      if (!graphic || !geometry) return false;
      graphic.geometry = geometry;
      const tool = toolForGraphic(graphic);
      if (tool) callTool(tool, 'rebuildSupport', [graphic]);
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      return true;
    }

    function graphicSpan(graphic) {
      const ring = PS.ringWithoutDuplicateClose ? PS.ringWithoutDuplicateClose(graphic && graphic.geometry) : [];
      if (!ring.length) return 0;
      let span = 0;
      for (let i = 0; i < ring.length; i += 1) {
        for (let j = i + 1; j < ring.length; j += 1) {
          const a = ring[i];
          const b = ring[j];
          if (!a || !b || !Number.isFinite(a[0]) || !Number.isFinite(a[1]) ||
              !Number.isFinite(b[0]) || !Number.isFinite(b[1])) continue;
          span = Math.max(span, Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
      }
      return span;
    }

    function rotationSnapGuideSymbol() {
      return {
        type: 'simple-line',
        color: [234, 179, 8, 0.95],
        width: 2.5,
        style: 'dash',
        cap: 'butt',
        join: 'miter'
      };
    }

    function rotationCrosshairSymbol() {
      return {
        type: 'simple-line',
        color: [40, 40, 40, 0.42],
        width: 1.5,
        style: 'dash',
        cap: 'butt',
        join: 'miter'
      };
    }

    function rotationArcSymbol() {
      return {
        type: 'simple-line',
        color: [234, 179, 8, 0.9],
        width: 2,
        style: 'short-dot',
        cap: 'round',
        join: 'round'
      };
    }

    function clearRotationSnapGuide() {
      if (rotationSnapGuide.length && RT.previewLayer) {
        if (typeof RT.previewLayer.removeMany === 'function') {
          try { RT.previewLayer.removeMany(rotationSnapGuide); } catch (err) {}
        } else {
          rotationSnapGuide.forEach(graphic => {
            try { RT.previewLayer.remove(graphic); } catch (err) {}
          });
        }
      }
      rotationSnapGuide = [];
    }

    function lineGeometry(center, angle, halfLength, spatialReference) {
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      return {
        type: 'polyline',
        paths: [[
          [center.x - ux * halfLength, center.y - uy * halfLength],
          [center.x + ux * halfLength, center.y + uy * halfLength]
        ]],
        spatialReference
      };
    }

    function arcGeometry(center, radius, endAngle, spatialReference, startAngle) {
      const start = Number.isFinite(startAngle) ? startAngle : 0;
      const delta = angleDelta(start, endAngle);
      const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 24)));
      const points = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = start + delta * (i / steps);
        points.push([
          center.x + Math.cos(angle) * radius,
          center.y + Math.sin(angle) * radius
        ]);
      }
      return {
        type: 'polyline',
        paths: [points],
        spatialReference
      };
    }

    function updateRotationSnapGuide(graphic, session) {
      if (!rotationGuidesEnabled()) {
        clearRotationSnapGuide();
        return;
      }
      const center = (session && session.center) || centerPointForGraphic(graphic);
      const angle = nearestRotationSnapAngle(graphic, session);
      if (!center || !Number.isFinite(angle) || !RT.previewLayer) {
        clearRotationSnapGuide();
        return;
      }
      const span = graphicSpan(graphic);
      const half = Math.max(span * 0.62, 1);
      const sr = center.spatialReference || (graphic.geometry && graphic.geometry.spatialReference);
      const arcRadius = Math.max(span * 0.28, 1);
      const items = [
        { geometry: lineGeometry(center, 0, half, sr), symbol: rotationCrosshairSymbol() },
        { geometry: lineGeometry(center, Math.PI / 2, half, sr), symbol: rotationCrosshairSymbol() },
        { geometry: arcGeometry(center, arcRadius, angle, sr, session ? Math.PI / 2 : 0), symbol: rotationArcSymbol() },
        { geometry: lineGeometry(center, angle, half, sr), symbol: rotationSnapGuideSymbol() }
      ];

      if (rotationSnapGuide.length !== items.length) {
        clearRotationSnapGuide();
        rotationSnapGuide = items.map(item => {
          const guide = new RT.Graphic({ geometry: item.geometry, symbol: item.symbol });
          guide.__nonSelectable = true;
          guide.__skipMeasure = true;
          return guide;
        });
        RT.previewLayer.addMany(rotationSnapGuide);
        return;
      }
      rotationSnapGuide.forEach((guide, index) => {
        guide.geometry = items[index].geometry;
        guide.symbol = items[index].symbol;
      });
    }

    function snapParkingRotation(graphic, session) {
      if (!rotationGuidesEnabled()) {
        clearRotationSnapGuide();
        rememberGraphicAngle(graphic);
        return false;
      }
      const radians = nearestRotationSnapDelta(graphic, session);
      if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) {
        rememberGraphicAngle(graphic);
        return false;
      }
      const center = centerPointForGraphic(graphic);
      if (!center) return false;
      const groupId = snapGroupId(graphic);
      const targets = groupId ? [graphic].concat(groupMembers(groupId, graphic)) : [graphic];
      targets.forEach(target => {
        const nextGeometry = transformGeometry(target.geometry, center, radians, 0, 0);
        moveGraphicToGeometry(target, nextGeometry);
        rememberGraphicAngle(target);
      });
      return true;
    }

    function beginRotationSnapSession(graphic) {
      const angle = angleForGraphic(graphic);
      const center = centerPointForGraphic(graphic);
      rotationSnapSession = Number.isFinite(angle)
        ? {
            graphic,
            id: parentId(graphic),
            angle,
            center,
            isRotating: false
          }
        : null;
      clearRotationSnapGuide();
    }

    function updateRotationSnapSession(graphic, event) {
      if (!rotationSnapSession) return;
      if (rotationSnapSession.graphic !== graphic || rotationSnapSession.id !== parentId(graphic)) {
        beginRotationSnapSession(graphic);
        if (!rotationSnapSession) return;
      }
      const angle = angleForGraphic(graphic);
      if (!Number.isFinite(angle)) return;
      const changed = Math.abs(angleDelta(rotationSnapSession.angle, angle) * 180 / Math.PI);
      const updateType = event && event.toolEventInfo && String(event.toolEventInfo.type || '').toLowerCase();
      if (updateType && updateType !== 'rotate') {
        rotationSnapSession.center = centerPointForGraphic(graphic) || rotationSnapSession.center;
        rotationSnapSession.isRotating = false;
        clearRotationSnapGuide();
        return;
      }
      const isRotateUpdate = updateType === 'rotate' || changed >= 0.5;
      if (!isRotateUpdate && !rotationSnapSession.isRotating) {
        rotationSnapSession.center = centerPointForGraphic(graphic) || rotationSnapSession.center;
        clearRotationSnapGuide();
        return;
      }
      rotationSnapSession.isRotating = true;
      updateRotationSnapGuide(graphic, rotationSnapSession);
    }

    function resetRotationSnapSession(graphic) {
      const angle = angleForGraphic(graphic);
      rotationSnapSession = Number.isFinite(angle)
        ? {
            graphic,
            id: parentId(graphic),
            angle,
            center: centerPointForGraphic(graphic),
            isRotating: false
          }
        : null;
      clearRotationSnapGuide();
    }

    function moveGraphicWithTool(graphic, dx, dy) {
      const tool = toolForGraphic(graphic);
      if (!tool) return false;
      return !!callTool(tool, 'moveByOffset', [graphic, dx, dy], () => false);
    }

    function moveSnapGroup(graphic, dx, dy, options) {
      if (!graphic || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
      const opts = options || {};
      const groupId = snapGroupId(graphic);
      const targets = groupId ? groupMembers(groupId, opts.excludeSource ? graphic : null) : [];
      if (!opts.excludeSource) targets.unshift(graphic);
      let moved = false;
      targets.forEach(target => {
        moved = moveGraphicWithTool(target, dx, dy) || moved;
      });
      return moved;
    }

    function isAccessAisleTool(tool) {
      return !!(tool && tool.id === 'parkingAccessAisle');
    }

    function compatibleSides(sourceSide, targetSide, sourceTool, targetTool) {
      if (!sourceSide || !targetSide) return false;
      const sourceIsAisle = isAccessAisleTool(sourceTool);
      const targetIsAisle = isAccessAisleTool(targetTool);
      if (sourceIsAisle || targetIsAisle) {
        if (sourceIsAisle && targetIsAisle) {
          if (sourceSide.name !== 'top' || targetSide.name !== 'top') return false;
        } else if (!((sourceSide.name === 'left' && targetSide.name === 'right') ||
                     (sourceSide.name === 'right' && targetSide.name === 'left'))) {
          return false;
        }
        const dot = Math.abs((sourceSide.ux || 0) * (targetSide.ux || 0) + (sourceSide.uy || 0) * (targetSide.uy || 0));
        return Number.isFinite(dot) && dot >= SIDE_PARALLEL_DOT_MIN;
      }
      const allowedPairs = {
        left: { right: true },
        right: { left: true },
        top: { top: true }
      };
      if (!allowedPairs[sourceSide.name] || !allowedPairs[sourceSide.name][targetSide.name]) return false;
      const dot = Math.abs((sourceSide.ux || 0) * (targetSide.ux || 0) + (sourceSide.uy || 0) * (targetSide.uy || 0));
      return Number.isFinite(dot) && dot >= SIDE_PARALLEL_DOT_MIN;
    }

    function sidesAreTouching(sourceSide, targetSide, sourceTool, targetTool) {
      if (!compatibleSides(sourceSide, targetSide, sourceTool, targetTool)) return false;
      const sourceMid = sideMidpoint(sourceSide);
      const targetMid = sideMidpoint(targetSide);
      if (!sourceMid || !targetMid) return false;
      return screenDistanceBetweenPoints(sourceMid, targetMid) <= SIDE_CONTACT_TOLERANCE_PX;
    }

    function graphicsAreSideConnected(a, b) {
      const aTool = toolForGraphic(a);
      const bTool = toolForGraphic(b);
      if (!aTool || !bTool || typeof aTool.getSnapSides !== 'function' || typeof bTool.getSnapSides !== 'function') return false;
      const aSides = aTool.getSnapSides(a) || [];
      const bSides = bTool.getSnapSides(b) || [];
      for (let i = 0; i < aSides.length; i += 1) {
        for (let j = 0; j < bSides.length; j += 1) {
          if (sidesAreTouching(aSides[i], bSides[j], aTool, bTool)) return true;
        }
      }
      return false;
    }

    function rebuildSnapGroupsFromContacts() {
      const graphics = allSideSnapParents();
      if (!graphics.length) return;
      const visited = new Set();

      graphics.forEach(graphic => clearSnapGroup(graphic));

      graphics.forEach(start => {
        if (visited.has(start)) return;
        const component = [];
        const stack = [start];
        visited.add(start);

        while (stack.length) {
          const current = stack.pop();
          component.push(current);
          graphics.forEach(candidate => {
            if (visited.has(candidate) || candidate === current) return;
            if (!graphicsAreSideConnected(current, candidate)) return;
            visited.add(candidate);
            stack.push(candidate);
          });
        }

        if (component.length > 1) {
          const groupId = newSnapGroupId();
          component.forEach(member => {
            setSnapGroupId(member, groupId);
            rememberGraphicAngle(member);
          });
        } else {
          clearSnapGroup(component[0]);
          rememberGraphicAngle(component[0]);
        }
      });
    }

    function findSideSnapCandidate(graphic) {
      const sourceTool = toolForGraphic(graphic);
      if (!sourceTool || typeof sourceTool.getSnapSides !== 'function') return null;
      const sourceSides = sourceTool.getSnapSides(graphic) || [];
      if (!sourceSides.length) return null;

      let best = null;
      sideSnapParents(graphic).forEach(target => {
        const targetTool = toolForGraphic(target);
        if (!targetTool || typeof targetTool.getSnapSides !== 'function') return;
        const targetSides = targetTool.getSnapSides(target) || [];
        sourceSides.forEach(sourceSide => {
          const sourceMid = sideMidpoint(sourceSide);
          if (!sourceMid) return;
          targetSides.forEach(targetSide => {
            if (!compatibleSides(sourceSide, targetSide, sourceTool, targetTool)) return;
            const targetMid = sideMidpoint(targetSide);
            if (!targetMid) return;
            const distancePx = screenDistanceBetweenPoints(sourceMid, targetMid);
            if (distancePx > SIDE_SNAP_TOLERANCE_PX) return;
            if (best && distancePx >= best.distancePx) return;
            best = {
              graphic,
              sourceTool,
              target,
              targetTool,
              sourceSide,
              targetSide,
              sourceMid,
              targetMid,
              distancePx,
              dx: targetMid.x - sourceMid.x,
              dy: targetMid.y - sourceMid.y
            };
          });
        });
      });
      return best;
    }

    function clearSideSnapPreview() {
      if (sideSnapPreview.length && RT.previewLayer) {
        if (typeof RT.previewLayer.removeMany === 'function') {
          try { RT.previewLayer.removeMany(sideSnapPreview); } catch (err) {}
        } else {
          sideSnapPreview.forEach(graphic => {
            try { RT.previewLayer.remove(graphic); } catch (err) {}
          });
        }
      }
      sideSnapPreview = [];
    }

    function sidePreviewGeometry(side, dx, dy) {
      if (!side || !side.a || !side.b) return null;
      const ox = Number.isFinite(dx) ? dx : 0;
      const oy = Number.isFinite(dy) ? dy : 0;
      return {
        type: 'polyline',
        paths: [[[side.a.x + ox, side.a.y + oy], [side.b.x + ox, side.b.y + oy]]],
        spatialReference: side.spatialReference || side.a.spatialReference || side.b.spatialReference
      };
    }

    function sidePreviewSymbol(role) {
      const isMoving = role === 'moving';
      return {
        type: 'simple-line',
        color: isMoving ? [255, 255, 255, 0.95] : [234, 179, 8, 1],
        width: isMoving ? 3 : 5,
        cap: 'butt',
        join: 'miter',
        style: isMoving ? 'dash' : 'solid'
      };
    }

    function showSideSnapPreview(candidate) {
      const targetGeometry = candidate && sidePreviewGeometry(candidate.targetSide);
      const movingGeometry = candidate && sidePreviewGeometry(candidate.sourceSide, candidate.dx, candidate.dy);
      if (!targetGeometry || !movingGeometry || !RT.previewLayer) {
        clearSideSnapPreview();
        return;
      }
      const previewItems = [
        { geometry: targetGeometry, symbol: sidePreviewSymbol('target') },
        { geometry: movingGeometry, symbol: sidePreviewSymbol('moving') }
      ];

      if (sideSnapPreview.length !== previewItems.length) {
        clearSideSnapPreview();
        sideSnapPreview = previewItems.map(item => {
          const graphic = new RT.Graphic({ geometry: item.geometry, symbol: item.symbol });
          graphic.__nonSelectable = true;
          graphic.__skipMeasure = true;
          return graphic;
        });
        RT.previewLayer.addMany(sideSnapPreview);
        return;
      }

      sideSnapPreview.forEach((graphic, index) => {
        graphic.geometry = previewItems[index].geometry;
        graphic.symbol = previewItems[index].symbol;
      });
    }

    function updateSideSnapPreview(graphic) {
      const candidate = findSideSnapCandidate(graphic);
      if (candidate) showSideSnapPreview(candidate);
      else clearSideSnapPreview();
      return candidate;
    }

    function applySideSnap(graphic) {
      const candidate = findSideSnapCandidate(graphic);
      if (!candidate) {
        clearSideSnapPreview();
        return false;
      }
      const moved = moveSnapGroup(graphic, candidate.dx, candidate.dy);
      mergeSnapGroups(graphic, candidate.target);
      clearSideSnapPreview();
      return !!candidate || !!moved;
    }

    function beginGroupMove(graphic) {
      const groupId = snapGroupId(graphic);
      const members = groupId ? groupMembers(groupId, null) : [];
      const selectedCenter = centerPointForGraphic(graphic);
      activeGroupMove = {
        graphic,
        id: parentId(graphic),
        groupId,
        selectedStartCenter: selectedCenter,
        selectedStartAngle: angleForGraphic(graphic),
        snapshots: members.map(member => ({
          graphic: member,
          id: parentId(member),
          geometry: cloneGeometry(member.geometry)
        }))
      };
    }

    function updateGroupMove(graphic) {
      const groupId = snapGroupId(graphic);
      if (!groupId) return;
      const center = centerPointForGraphic(graphic);
      if (!center) return;
      if (!activeGroupMove || activeGroupMove.graphic !== graphic || activeGroupMove.groupId !== groupId) {
        beginGroupMove(graphic);
        if (!activeGroupMove || !activeGroupMove.selectedStartCenter) return;
      }
      const startCenter = activeGroupMove.selectedStartCenter;
      const startAngle = activeGroupMove.selectedStartAngle;
      const currentAngle = angleForGraphic(graphic);
      const radians = angleDelta(startAngle, currentAngle);
      const rotatedStartCenter = rotatePointAround([startCenter.x, startCenter.y], startCenter, radians);
      const dx = center.x - rotatedStartCenter[0];
      const dy = center.y - rotatedStartCenter[1];
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(radians) < 1e-9) return;

      activeGroupMove.snapshots.forEach(snapshot => {
        if (!snapshot || snapshot.graphic === graphic || !snapshot.geometry) return;
        const nextGeometry = transformGeometry(snapshot.geometry, startCenter, radians, dx, dy);
        moveGraphicToGeometry(snapshot.graphic, nextGeometry);
      });
    }

    function endGroupMove(graphic) {
      updateGroupMove(graphic);
      if (activeGroupMove && activeGroupMove.snapshots) {
        activeGroupMove.snapshots.forEach(snapshot => rememberGraphicAngle(snapshot.graphic));
      }
      activeGroupMove = null;
    }

    function beginToolbarGroupRotation(graphic, deltaDegrees) {
      const groupId = snapGroupId(graphic);
      if (!graphic || !groupId) {
        toolbarRotationGroup = null;
        return;
      }
      const center = centerPointForGraphic(graphic);
      if (!center) {
        toolbarRotationGroup = null;
        return;
      }
      toolbarRotationGroup = {
        graphic,
        id: parentId(graphic),
        groupId,
        deltaRadians: Number(deltaDegrees || 0) * Math.PI / 180,
        selectedStartCenter: center,
        snapshots: groupMembers(groupId, graphic).map(member => ({
          graphic: member,
          id: parentId(member),
          geometry: cloneGeometry(member.geometry)
        }))
      };
    }

    function finishToolbarGroupRotation(graphic, deltaDegrees) {
      if (!toolbarRotationGroup || toolbarRotationGroup.graphic !== graphic) return false;
      const session = toolbarRotationGroup;
      toolbarRotationGroup = null;
      const center = centerPointForGraphic(graphic);
      const startCenter = session.selectedStartCenter;
      const radians = Number.isFinite(session.deltaRadians)
        ? session.deltaRadians
        : Number(deltaDegrees || 0) * Math.PI / 180;
      if (!center || !startCenter || !Number.isFinite(radians) || Math.abs(radians) < 1e-9) return false;
      const rotatedStartCenter = rotatePointAround([startCenter.x, startCenter.y], startCenter, radians);
      const dx = center.x - rotatedStartCenter[0];
      const dy = center.y - rotatedStartCenter[1];
      session.snapshots.forEach(snapshot => {
        if (!snapshot || !snapshot.graphic || !snapshot.geometry) return;
        const nextGeometry = transformGeometry(snapshot.geometry, startCenter, radians, dx, dy);
        moveGraphicToGeometry(snapshot.graphic, nextGeometry);
        rememberGraphicAngle(snapshot.graphic);
      });
      rememberGraphicAngle(graphic);
      suppressNextToolbarRotationForId = parentId(graphic);
      return true;
    }

    function syncToolbarRotation(graphic, event) {
      if (!graphic || activeGroupMove) return;
      const info = event && event.toolEventInfo ? event.toolEventInfo : {};
      if (info.type !== 'rotate') return;
      const id = parentId(graphic);
      if (suppressNextToolbarRotationForId && id === suppressNextToolbarRotationForId) {
        suppressNextToolbarRotationForId = null;
        rememberGraphicAngle(graphic);
        return;
      }
      const groupId = snapGroupId(graphic);
      if (!groupId) {
        rememberGraphicAngle(graphic);
        return;
      }
      const currentAngle = angleForGraphic(graphic);
      let radians = Number.isFinite(info.deltaDegrees) ? Number(info.deltaDegrees) * Math.PI / 180 : null;
      if (!Number.isFinite(radians)) {
        let previousAngle = Number.isFinite(graphic.__parkingLastAngle) ? graphic.__parkingLastAngle : null;
        if (!Number.isFinite(previousAngle)) {
          const siblings = groupMembers(groupId, graphic);
          const siblingAngle = siblings.map(member => member.__parkingLastAngle).find(angle => Number.isFinite(angle));
          previousAngle = Number.isFinite(siblingAngle) ? siblingAngle : currentAngle;
        }
        radians = angleDelta(previousAngle, currentAngle);
      }
      const center = centerPointForGraphic(graphic);
      if (!center || !Number.isFinite(radians) || Math.abs(radians) < 1e-9) {
        rememberGraphicAngle(graphic);
        return;
      }
      groupMembers(groupId, graphic).forEach(member => {
        const nextGeometry = transformGeometry(member.geometry, center, radians, 0, 0);
        moveGraphicToGeometry(member, nextGeometry);
        rememberGraphicAngle(member);
      });
      rememberGraphicAngle(graphic);
    }

    function mountRegisteredTools() {
      if (!section) {
        console.warn('[tools-parking] Sidebar section #tools-parking not found.');
        return;
      }

      PS.getTools().forEach(tool => {
        const elements = typeof PS.getToolElements === 'function'
          ? PS.getToolElements(tool)
          : (typeof tool.buildButton === 'function' ? [tool.buildButton()].filter(Boolean) : []);

        elements.forEach(el => {
          if (el && el.parentNode !== section) section.appendChild(el);
          else if (el) section.appendChild(el);
        });

        if (tool && typeof tool.wireControls === 'function') tool.wireControls();
      });
    }

    mountRegisteredTools();

    window.addEventListener('siteplan:before-toolbar-rotate', event => {
      const detail = event && event.detail ? event.detail : {};
      if (!toolForGraphic(detail.graphic)) return;
      beginToolbarGroupRotation(detail.graphic, detail.deltaDegrees);
    });

    window.addEventListener('siteplan:after-toolbar-rotate', event => {
      const detail = event && event.detail ? event.detail : {};
      if (!toolForGraphic(detail.graphic)) return;
      finishToolbarGroupRotation(detail.graphic, detail.deltaDegrees);
    });

    window.addEventListener('siteplan:rotation-guides-changed', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.enabled === false) clearRotationSnapGuide();
    });

    function resetParkingRotationAfterRelease() {
      if (!rotationSnapSession || !rotationSnapSession.isRotating) return;
      const graphic = rotationSnapSession.graphic;
      const session = rotationSnapSession;
      const reset = () => {
        if (!session || !graphic || !toolForGraphic(graphic)) return;
        snapParkingRotation(graphic, session);
        resetRotationSnapSession(graphic);
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.setTimeout(reset, 0));
      else window.setTimeout(reset, 0);
    }

    window.addEventListener('pointerup', resetParkingRotationAfterRelease, true);
    window.addEventListener('mouseup', resetParkingRotationAfterRelease, true);
    window.addEventListener('touchend', resetParkingRotationAfterRelease, true);

    sideSnapTools().forEach(tool => {
      if (typeof tool.setCoordinator === 'function') {
        tool.setCoordinator({
          applySideSnap,
          updateSideSnapPreview,
          clearSideSnapPreview,
          clearSnapGroup
        });
      }
    });

    RT.onGraphicCreated(graphic => {
      if (!toolForGraphic(graphic)) return;
      rememberGraphicAngle(graphic);
    });

    RT.onGraphicUpdated((graphic, event) => {
      if (!toolForGraphic(graphic)) return;
      syncToolbarRotation(graphic, event);
      rememberGraphicAngle(graphic);
    });

    RT.onGraphicDeleted(graphic => {
      const wasParkingGraphic = !!toolForGraphic(graphic);
      if (!wasParkingGraphic) return;
      const rebuild = () => rebuildSnapGroupsFromContacts();
      if (window.requestAnimationFrame) window.requestAnimationFrame(rebuild);
      else window.setTimeout(rebuild, 0);
    });

    RT.sketch.on('update', event => {
      const graphic = event && event.graphics && event.graphics[0];
      if (!toolForGraphic(graphic)) return;

      if (event.state === 'active' || event.state === 'start') {
        if (event.state === 'start') {
          beginGroupMove(graphic);
          beginRotationSnapSession(graphic);
        } else {
          updateGroupMove(graphic);
          updateRotationSnapSession(graphic, event);
        }
        updateSideSnapPreview(graphic);
        return;
      }

      if (event.state === 'complete') {
        const session = rotationSnapSession;
        rotationSnapSession = null;
        const commit = () => {
          clearRotationSnapGuide();
          endGroupMove(graphic);
          snapParkingRotation(graphic, session);
          resetRotationSnapSession(graphic);
          applySideSnap(graphic);
          const tool = toolForGraphic(graphic);
          if (tool) callTool(tool, 'rebuildSupport', [graphic]);
          if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(commit);
        else window.setTimeout(commit, 0);
        return;
      }

      if (event.state === 'cancel') {
        activeGroupMove = null;
        rotationSnapSession = null;
        clearSideSnapPreview();
        clearRotationSnapGuide();
      }
    });

    window.SitePlanParking = Object.assign({}, window.SitePlanParking || {}, {
      shared: PS,
      getTool: typeof PS.getTool === 'function' ? PS.getTool.bind(PS) : function () { return null; },
      getTools: typeof PS.getTools === 'function' ? PS.getTools.bind(PS) : function () { return []; },
      cancelAllExcept: typeof PS.cancelAllExcept === 'function' ? PS.cancelAllExcept.bind(PS) : function () {},
      clearActiveAllExcept: typeof PS.clearActiveAllExcept === 'function' ? PS.clearActiveAllExcept.bind(PS) : function () {},
      applySideSnap,
      updateSideSnapPreview,
      clearSideSnapPreview,
      clearRotationSnapGuide,
      clearSnapGroup,
      mergeSnapGroups,
      moveSnapGroup,
      rebuildSnapGroupsFromContacts,
      mountRegisteredTools
    });
  }).catch(err => {
    console.error('[tools-parking] Failed to initialize Parking coordinator:', err);
  });
})();
