// Part of the annotation pair — see callout.js for the callout tool.

(function () {
  if (!window.SitePlanRuntimeReady) return;

  window.SitePlanRuntimeReady.then(RT => {
    if (!RT) return;
    const DS = window.SitePlanDrawShared;

    const TEXT_TOOL_TYPE = 'text';
    const TEXT_BUTTON_ID = 'btn-text';
    const CALLOUT_BUTTON_ID = 'btn-callout';
    const TEXT_INPUT_ID = 'text-input';
    const TEXT_MAX_LENGTH = 35;

    const TEXT_TOOL_CAPABILITIES = {
      reshape: false,
      resize: false,
      rotate: false,
      label: true,
      duplicate: true,
      delete: true,
      toolbar: true
    };

    let textPlacementClickHandle = null;
    let textPlacementEscHandler = null;
    let activeTextTool = false;
    let annotationRowEl = null;
    let annotationInputEl = null;
    let annotationInputWired = false;

    function textInputEl() {
      return document.getElementById(TEXT_INPUT_ID);
    }

    function currentTextValue() {
      const input = textInputEl();
      return input ? String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH) : '';
    }

    function formatTextForDisplay(text) {
      return String(text || '').replace(' ', '\n');
    }

    function textSymbol(text) {
      return {
        type: 'text',
        text: formatTextForDisplay(text),
        color: [0, 0, 0, 1],
        haloColor: [255, 255, 255, 0.95],
        haloSize: 1.25,
        horizontalAlignment: 'center',
        verticalAlignment: 'middle',
        font: {
          family: 'Arial',
          size: 10
        }
      };
    }

    function isTextGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === TEXT_TOOL_TYPE || attrs.toolType === TEXT_TOOL_TYPE || attrs.sitePlanTool === TEXT_TOOL_TYPE) &&
        graphic.geometry && graphic.geometry.type === 'point');
    }

    function applyTextMetadata(graphic, rawText) {
      if (!graphic) return graphic;
      const text = String(rawText || (graphic.__textRawText || (graphic.attributes && graphic.attributes.textRawText) || (graphic.symbol && graphic.symbol.text) || '')).replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH);
      graphic.__toolType = TEXT_TOOL_TYPE;
      graphic.__preferredEditMode = 'move';
      graphic.__textEditable = true;
      graphic.__textEditMode = 'symbolText';
      graphic.__textMaxLength = TEXT_MAX_LENGTH;
      graphic.__textLineBreakAfterFirstSpace = true;
      if (text) {
        graphic.__textRawText = text;
        if (graphic.symbol) {
          const symbol = graphic.symbol.clone ? graphic.symbol.clone() : Object.assign({}, graphic.symbol || {});
          symbol.text = formatTextForDisplay(text);
          graphic.symbol = symbol;
        }
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType: TEXT_TOOL_TYPE,
        sitePlanTool: TEXT_TOOL_TYPE,
        sitePlanCategory: 'annotation',
        preferredEditMode: 'move',
        textEditable: true,
        textEditMode: 'symbolText',
        textMaxLength: TEXT_MAX_LENGTH,
        textLineBreakAfterFirstSpace: true,
        textRawText: text || (graphic.attributes && graphic.attributes.textRawText) || '',
        toolCapabilities: Object.assign({}, TEXT_TOOL_CAPABILITIES)
      });
      DS.applyToolCapabilities(RT, graphic, TEXT_TOOL_CAPABILITIES);
      return graphic;
    }

    function setTextButtonActive(active) {
      activeTextTool = active;
      if (active) {
        document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(btn => btn.classList.remove('active'));
      }
      const btn = document.getElementById(TEXT_BUTTON_ID);
      if (btn) btn.classList.toggle('active', active);
    }

    function clearTextPlacement() {
      if (textPlacementClickHandle) {
        try { textPlacementClickHandle.remove(); } catch (err) {}
        textPlacementClickHandle = null;
      }
      if (textPlacementEscHandler) {
        document.removeEventListener('keydown', textPlacementEscHandler, true);
        textPlacementEscHandler = null;
      }
      if (window.__sitePlanPendingToolType === TEXT_TOOL_TYPE) window.__sitePlanPendingToolType = null;
      if (activeTextTool) setTextButtonActive(false);
    }

    function placeTextAt(mapPoint) {
      const text = currentTextValue();
      const input = textInputEl();
      if (!text) {
        if (input) input.focus();
        return;
      }
      if (!mapPoint) return;

      const graphic = new RT.Graphic({
        geometry: DS.clonePoint(mapPoint),
        symbol: textSymbol(text),
        attributes: {
          toolType: TEXT_TOOL_TYPE,
          sitePlanTool: TEXT_TOOL_TYPE,
          sitePlanCategory: 'annotation',
          preferredEditMode: 'move',
          textEditable: true,
          textEditMode: 'symbolText',
          textMaxLength: TEXT_MAX_LENGTH,
          textLineBreakAfterFirstSpace: true,
          textRawText: text,
          toolCapabilities: Object.assign({}, TEXT_TOOL_CAPABILITIES)
        }
      });
      applyTextMetadata(graphic, text);
      clearTextPlacement();
      RT.registerDrawableGraphic(graphic);
      if (input) input.value = '';

      const select = () => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn('[tools-annotations] Unable to select placed text.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(select);
      else setTimeout(select, 0);
    }

    window.startTextTool = function () {
      const input = textInputEl();
      const text = currentTextValue();
      if (!text) {
        if (input) input.focus();
        return;
      }

      DS.announceToolActivated(TEXT_TOOL_TYPE, { source: 'tools-annotations' });
      clearTextPlacement();
      RT.clearSelection();
      window.__sitePlanPendingToolType = TEXT_TOOL_TYPE;
      setTextButtonActive(true);

      textPlacementClickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        placeTextAt(event.mapPoint);
      });
      textPlacementEscHandler = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          clearTextPlacement();
        }
      };
      document.addEventListener('keydown', textPlacementEscHandler, true);
    };

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === 'tools-annotations' && detail.tool === TEXT_TOOL_TYPE) return;
      clearTextPlacement();
    });

    RT.onGraphicCreated(graphic => {
      if (!isTextGraphic(graphic)) return;
      applyTextMetadata(graphic);
    });

    RT.onGraphicUpdated(graphic => {
      if (!isTextGraphic(graphic)) return;
      applyTextMetadata(graphic);
    });

    function buildToolButton(options) {
      const existing = document.getElementById(options.id);
      if (existing) return existing;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = options.id;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title = options.title || options.label;
      btn.innerHTML = '<span class="tool-icon ' + (options.iconClass || '') + '">' +
        options.icon +
        '</span><span class="tool-label">' + options.label + '</span>';
      btn.addEventListener('click', options.onClick);
      return btn;
    }

    function buildAnnotationRow() {
      if (annotationRowEl) return annotationRowEl;
      annotationRowEl = document.createElement('div');
      annotationRowEl.className = 'annotation-button-row';
      annotationRowEl.appendChild(buildToolButton({
        id: CALLOUT_BUTTON_ID,
        label: 'Callout',
        title: 'Place a callout annotation',
        iconClass: 'icon-callout',
        icon:
          '<svg viewBox="0 0 28 18" aria-hidden="true">' +
            '<line x1="6" y1="13" x2="17" y2="6" stroke="#000" stroke-width="1.5"></line>' +
            '<path d="M6 13 L10.5 12.5 L8.3 9.2 Z" fill="#000"></path>' +
            '<rect x="16" y="3" width="8" height="6" rx="1" fill="#fff" stroke="#000" stroke-width="1"></rect>' +
          '</svg>',
        onClick: function () { if (window.startCalloutTool) window.startCalloutTool(); }
      }));
      annotationRowEl.appendChild(buildToolButton({
        id: TEXT_BUTTON_ID,
        label: 'Text',
        title: 'Place text annotation',
        iconClass: 'icon-text',
        icon:
          '<svg viewBox="0 0 16 16" aria-hidden="true">' +
            '<path fill="currentColor" fill-rule="evenodd" d="M3.279 2.544A.75.75 0 0 1 4 2h8a.75.75 0 0 1 .721.544l.5 1.75a.75.75 0 1 1-1.442.412L11.434 3.5H8.75l-.004 9H9.5a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5h.746l.004-9H4.566L4.22 4.706a.75.75 0 1 1-1.442-.412z" clip-rule="evenodd"></path>' +
          '</svg>',
        onClick: window.startTextTool
      }));
      return annotationRowEl;
    }

    function buildAnnotationInput() {
      if (annotationInputEl) return annotationInputEl;
      const existing = document.getElementById(TEXT_INPUT_ID);
      if (existing) {
        annotationInputEl = existing;
        return annotationInputEl;
      }
      annotationInputEl = document.createElement('input');
      annotationInputEl.id = TEXT_INPUT_ID;
      annotationInputEl.type = 'text';
      annotationInputEl.maxLength = TEXT_MAX_LENGTH;
      annotationInputEl.placeholder = 'Text / callout label';
      annotationInputEl.autocomplete = 'off';
      annotationInputEl.spellcheck = false;
      annotationInputEl.className = 'annotation-text-input';
      annotationInputEl.setAttribute('aria-label', 'Text or callout label');
      return annotationInputEl;
    }

    function wireAnnotationControls() {
      if (annotationInputWired) return;
      const input = buildAnnotationInput();
      if (!input) return;
      input.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          window.startTextTool();
        }
      });
      annotationInputWired = true;
    }

    function getAnnotationElements() {
      return [buildAnnotationRow(), buildAnnotationInput()].filter(Boolean);
    }

    if (DS && typeof DS.registerTool === 'function') {
      DS.registerTool({
        id: 'annotations',
        order: 900,
        label: 'Annotations',
        start: window.startTextTool,
        cancel: function cancelAnnotations() {
          clearTextPlacement();
          if (window.SitePlanAnnotations && typeof window.SitePlanAnnotations.clearCalloutPlacement === 'function') {
            window.SitePlanAnnotations.clearCalloutPlacement();
          }
        },
        clearActive: function clearActiveAnnotations() {
          activeTextTool = false;
          const textBtn = document.getElementById(TEXT_BUTTON_ID);
          if (textBtn) textBtn.classList.remove('active');
          const calloutBtn = document.getElementById(CALLOUT_BUTTON_ID);
          if (calloutBtn) calloutBtn.classList.remove('active');
        },
        buildButton: buildAnnotationRow,
        buildControls: buildAnnotationInput,
        getElements: getAnnotationElements,
        wireControls: wireAnnotationControls
      });
    } else {
      const section = document.getElementById('tools-draw');
      if (section) getAnnotationElements().forEach(el => section.appendChild(el));
      wireAnnotationControls();
    }

    window.SitePlanAnnotations = Object.assign({}, window.SitePlanAnnotations || {}, {
      isTextGraphic,
      applyTextMetadata,
      clearTextPlacement,
      startTextTool: window.startTextTool
    });
  });
})();
