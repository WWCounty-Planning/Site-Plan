// Callout annotation tool.
// Part of the annotation pair — see text.js for the text tool and shared annotation UI.

(function () {
  if (!window.SitePlanRuntimeReady) return;

  window.SitePlanRuntimeReady.then(RT => {
    if (!RT) return;
    const DS = window.SitePlanDrawShared;

    const TEXT_TOOL_TYPE = 'text';
    const CALLOUT_TOOL_TYPE = 'callout';
    const CALLOUT_BUTTON_ID = 'btn-callout';
    const TEXT_INPUT_ID = 'text-input';
    const TEXT_MAX_LENGTH = 35;

    const CALLOUT_LEADER_CAPABILITIES = {
      reshape: true,
      resize: false,
      rotate: false,
      label: true,
      duplicate: false,
      delete: true,
      toolbar: true
    };

    const CALLOUT_SUPPORT_CAPABILITIES = {
      reshape: false,
      resize: false,
      rotate: false,
      label: false,
      duplicate: false,
      delete: false,
      toolbar: false
    };

    let calloutPlacementClickHandle = null;
    let calloutPlacementMoveHandle = null;
    let calloutPlacementEscHandler = null;
    let activeCalloutTool = false;
    let calloutTargetPoint = null;
    let calloutPreviewGraphics = [];
    let calloutCounter = 1;

    function textInputEl() {
      return document.getElementById(TEXT_INPUT_ID);
    }

    function currentTextValue() {
      const input = textInputEl();
      return input ? String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH) : '';
    }

    function calloutTextSymbol(text) {
      return {
        type: 'text',
        text: String(text || '').replace(' ', '\n'),
        color: [0, 0, 0, 1],
        haloColor: [255, 255, 255, 0.95],
        haloSize: 1.25,
        horizontalAlignment: 'center',
        verticalAlignment: 'middle',
        yoffset: 14,
        font: {
          family: 'Arial',
          size: 10
        }
      };
    }

    function calloutLeaderSymbol() {
      return {
        type: 'simple-line',
        color: [0, 0, 0, 1],
        width: 1.5,
        cap: 'round',
        join: 'round',
        marker: {
          style: 'arrow',
          placement: 'begin',
          color: [0, 0, 0, 1]
        }
      };
    }

    function previewTargetSymbol() {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [255, 153, 0, 0.95],
        size: 8,
        outline: {
          type: 'simple-line',
          color: [255, 255, 255, 0.95],
          width: 1.2
        }
      };
    }

    function previewLineSymbol() {
      return {
        type: 'simple-line',
        color: [255, 153, 0, 0.95],
        width: 1.5,
        cap: 'round',
        join: 'round'
      };
    }

    function spatialReferenceForPoint(point) {
      return point && point.spatialReference ? point.spatialReference : (RT.view && RT.view.spatialReference);
    }

    function lineGeometry(a, b) {
      if (!a || !b) return null;
      return {
        type: 'polyline',
        paths: [[[a.x, a.y], [b.x, b.y]]],
        spatialReference: spatialReferenceForPoint(a)
      };
    }

    function calloutIdForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__calloutId || attrs.calloutId || null);
    }

    function calloutRoleForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__calloutRole || attrs.calloutRole || null);
    }

    function isCalloutLeader(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === CALLOUT_TOOL_TYPE || attrs.toolType === CALLOUT_TOOL_TYPE || attrs.sitePlanTool === CALLOUT_TOOL_TYPE) &&
        calloutRoleForGraphic(graphic) === 'leader' &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    }

    function calloutSupports(calloutId) {
      const inDraw = DS.graphicsInLayer(RT.drawLayer).filter(g => calloutIdForGraphic(g) === calloutId && calloutRoleForGraphic(g) !== 'leader');
      const inLabels = DS.graphicsInLayer(RT.labelLayer).filter(g => calloutIdForGraphic(g) === calloutId && calloutRoleForGraphic(g) !== 'leader');
      return inDraw.concat(inLabels);
    }

    function removeCalloutSupports(calloutId) {
      if (!calloutId) return;
      calloutSupports(calloutId).forEach(g => {
        try {
          if (g.layer) g.layer.remove(g);
          else {
            RT.drawLayer.remove(g);
            RT.labelLayer.remove(g);
          }
        } catch (err) {}
      });
    }

    function leaderEndpoints(leaderGraphic) {
      const geom = leaderGraphic && leaderGraphic.geometry;
      if (!geom || !geom.paths || !geom.paths[0] || geom.paths[0].length < 2) return null;
      const path = geom.paths[0];
      const first = path[0];
      const last = path[path.length - 1];
      return {
        target: DS.pointFromXY(first[0], first[1], geom.spatialReference),
        label: DS.pointFromXY(last[0], last[1], geom.spatialReference)
      };
    }

    function tagCalloutSupport(graphic, leaderGraphic, role) {
      const calloutId = calloutIdForGraphic(leaderGraphic);
      graphic.__toolType = CALLOUT_TOOL_TYPE;
      graphic.__calloutId = calloutId;
      graphic.__calloutRole = role;
      graphic.__nonSelectable = true;
      graphic.__skipMeasure = true;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType: CALLOUT_TOOL_TYPE,
        sitePlanTool: CALLOUT_TOOL_TYPE,
        sitePlanCategory: 'annotation',
        calloutId,
        calloutRole: role,
        toolCapabilities: Object.assign({}, CALLOUT_SUPPORT_CAPABILITIES)
      });
      DS.applyToolCapabilities(RT, graphic, CALLOUT_SUPPORT_CAPABILITIES);
      return graphic;
    }

    function applyCalloutLeaderMetadata(graphic, rawText) {
      if (!graphic) return graphic;
      const existingAttrs = graphic.attributes || {};
      const calloutId = calloutIdForGraphic(graphic) || ('callout-' + (calloutCounter++));
      const text = String(
        rawText ||
        graphic.__textRawText ||
        existingAttrs.textRawText ||
        ''
      ).replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH);

      graphic.__toolType = CALLOUT_TOOL_TYPE;
      graphic.__calloutId = calloutId;
      graphic.__calloutRole = 'leader';
      graphic.__preferredEditMode = 'reshape';
      graphic.__textEditable = true;
      graphic.__textEditMode = 'metadataText';
      graphic.__textMaxLength = TEXT_MAX_LENGTH;
      graphic.__textLineBreakAfterFirstSpace = true;
      if (text) graphic.__textRawText = text;
      graphic.attributes = Object.assign({}, existingAttrs, {
        toolType: CALLOUT_TOOL_TYPE,
        sitePlanTool: CALLOUT_TOOL_TYPE,
        sitePlanCategory: 'annotation',
        calloutId,
        calloutRole: 'leader',
        preferredEditMode: 'reshape',
        textEditable: true,
        textEditMode: 'metadataText',
        textMaxLength: TEXT_MAX_LENGTH,
        textLineBreakAfterFirstSpace: true,
        textRawText: text || existingAttrs.textRawText || '',
        toolCapabilities: Object.assign({}, CALLOUT_LEADER_CAPABILITIES)
      });
      DS.applyToolCapabilities(RT, graphic, CALLOUT_LEADER_CAPABILITIES);
      return graphic;
    }

    function rebuildCalloutSupports(leaderGraphic) {
      if (!isCalloutLeader(leaderGraphic)) return;
      applyCalloutLeaderMetadata(leaderGraphic);
      const calloutId = calloutIdForGraphic(leaderGraphic);
      removeCalloutSupports(calloutId);

      const endpoints = leaderEndpoints(leaderGraphic);
      if (!endpoints) return;

      const rawText = String(leaderGraphic.__textRawText || (leaderGraphic.attributes && leaderGraphic.attributes.textRawText) || '').trim();

      const textGraphic = tagCalloutSupport(new RT.Graphic({
        geometry: DS.clonePoint(endpoints.label),
        symbol: calloutTextSymbol(rawText)
      }), leaderGraphic, 'text');

      // The arrow is now part of the leader-line symbol, matching the Setback
      // approach. Text remains the only separate visual support graphic.
      RT.labelLayer.add(textGraphic);
    }

    function setCalloutButtonActive(active) {
      activeCalloutTool = active;
      if (active) {
        document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(btn => btn.classList.remove('active'));
      }
      const btn = document.getElementById(CALLOUT_BUTTON_ID);
      if (btn) btn.classList.toggle('active', active);
    }

    function clearCalloutPreview() {
      if (RT.previewLayer) {
        calloutPreviewGraphics.forEach(g => {
          try { RT.previewLayer.remove(g); } catch (err) {}
        });
      }
      calloutPreviewGraphics = [];
    }

    function clearCalloutPlacement() {
      if (calloutPlacementClickHandle) {
        try { calloutPlacementClickHandle.remove(); } catch (err) {}
        calloutPlacementClickHandle = null;
      }
      if (calloutPlacementMoveHandle) {
        try { calloutPlacementMoveHandle.remove(); } catch (err) {}
        calloutPlacementMoveHandle = null;
      }
      if (calloutPlacementEscHandler) {
        document.removeEventListener('keydown', calloutPlacementEscHandler, true);
        calloutPlacementEscHandler = null;
      }
      calloutTargetPoint = null;
      clearCalloutPreview();
      if (window.__sitePlanPendingToolType === CALLOUT_TOOL_TYPE) window.__sitePlanPendingToolType = null;
      if (activeCalloutTool) setCalloutButtonActive(false);
    }

    function updateCalloutPreview(anchorPoint) {
      clearCalloutPreview();
      if (!calloutTargetPoint || !anchorPoint || !RT.previewLayer) return;

      const targetGraphic = new RT.Graphic({
        geometry: DS.clonePoint(calloutTargetPoint),
        symbol: previewTargetSymbol()
      });
      targetGraphic.__nonSelectable = true;

      const lineGraphic = new RT.Graphic({
        geometry: lineGeometry(calloutTargetPoint, anchorPoint),
        symbol: previewLineSymbol()
      });
      lineGraphic.__nonSelectable = true;

      calloutPreviewGraphics = [lineGraphic, targetGraphic];
      RT.previewLayer.addMany(calloutPreviewGraphics);
    }

    function createCallout(targetPoint, anchorPoint, rawText) {
      const text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH);
      if (!targetPoint || !anchorPoint || !text) return null;

      const calloutId = 'callout-' + (calloutCounter++);
      const leaderGraphic = new RT.Graphic({
        geometry: lineGeometry(targetPoint, anchorPoint),
        symbol: calloutLeaderSymbol(),
        attributes: {
          toolType: CALLOUT_TOOL_TYPE,
          sitePlanTool: CALLOUT_TOOL_TYPE,
          sitePlanCategory: 'annotation',
          calloutId,
          calloutRole: 'leader',
          preferredEditMode: 'reshape',
          textEditable: true,
          textEditMode: 'metadataText',
          textMaxLength: TEXT_MAX_LENGTH,
          textLineBreakAfterFirstSpace: true,
          textRawText: text,
          toolCapabilities: Object.assign({}, CALLOUT_LEADER_CAPABILITIES)
        }
      });
      applyCalloutLeaderMetadata(leaderGraphic, text);

      clearCalloutPlacement();
      RT.registerDrawableGraphic(leaderGraphic);
      rebuildCalloutSupports(leaderGraphic);
      if (typeof RT.refreshSnapSources === 'function') RT.refreshSnapSources();
      return leaderGraphic;
    }

    window.startCalloutTool = function () {
      const input = textInputEl();
      const text = currentTextValue();
      if (!text) {
        if (input) input.focus();
        return;
      }

      DS.announceToolActivated(CALLOUT_TOOL_TYPE, { source: 'tools-annotations' });
      clearCalloutPlacement();
      RT.clearSelection();
      window.__sitePlanPendingToolType = CALLOUT_TOOL_TYPE;
      setCalloutButtonActive(true);

      calloutPlacementClickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (!event.mapPoint) return;

        if (!calloutTargetPoint) {
          calloutTargetPoint = DS.clonePoint(event.mapPoint);
          updateCalloutPreview(event.mapPoint);
          return;
        }

        const placedLeader = createCallout(calloutTargetPoint, event.mapPoint, currentTextValue());
        const inputEl = textInputEl();
        if (inputEl) inputEl.value = '';

        if (placedLeader) {
          const select = () => {
            try { RT.selectGraphic(placedLeader); }
            catch (err) { console.warn('[tools-annotations] Unable to select placed callout.', err); }
          };
          if (window.requestAnimationFrame) window.requestAnimationFrame(select);
          else setTimeout(select, 0);
        }
      });

      calloutPlacementMoveHandle = RT.view.on('pointer-move', event => {
        if (!calloutTargetPoint) return;
        const mapPoint = RT.view.toMap({ x: event.x, y: event.y });
        if (mapPoint) updateCalloutPreview(mapPoint);
      });

      calloutPlacementEscHandler = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          clearCalloutPlacement();
        }
      };
      document.addEventListener('keydown', calloutPlacementEscHandler, true);
    };

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === 'tools-annotations' && detail.tool === CALLOUT_TOOL_TYPE) return;
      clearCalloutPlacement();
    });

    RT.onGraphicCreated(graphic => {
      if (!isCalloutLeader(graphic)) return;
      applyCalloutLeaderMetadata(graphic);
      rebuildCalloutSupports(graphic);
    });

    RT.onGraphicUpdated(graphic => {
      if (!isCalloutLeader(graphic)) return;
      applyCalloutLeaderMetadata(graphic);
      rebuildCalloutSupports(graphic);
    });

    RT.onGraphicDeleted(graphic => {
      if (!isCalloutLeader(graphic)) return;
      removeCalloutSupports(calloutIdForGraphic(graphic));
    });

    window.SitePlanAnnotations = Object.assign({}, window.SitePlanAnnotations || {}, {
      isCalloutLeader,
      applyCalloutLeaderMetadata,
      rebuildCalloutSupports,
      clearCalloutPlacement,
      startCalloutTool: window.startCalloutTool
    });
  });
})();
