// Object label and editable text-symbol helpers.
(function () {
  'use strict';

  window.SitePlanObjectLabels = {
    create
  };

  function create(options) {
    const Graphic = options.Graphic;
    const labelLayer = options.labelLayer;
    const assignGraphicId = options.assignGraphicId;
    const getGraphicAnchorPoint = options.getGraphicAnchorPoint;
    const fireGraphicUpdated = typeof options.fireGraphicUpdated === 'function'
      ? options.fireGraphicUpdated
      : function () {};

    function cloneSymbol(symbol) {
      if (!symbol) return symbol;
      if (symbol.clone) return symbol.clone();
      try { return JSON.parse(JSON.stringify(symbol)); }
      catch (err) { return Object.assign({}, symbol); }
    }

    function labelForGraphic(graphic) {
      if (!graphic || !graphic.__sitePlanId) return null;
      return labelLayer.graphics.find(g => g.__labelFor === graphic.__sitePlanId) || null;
    }

    function removeLabelForGraphic(graphic) {
      const label = labelForGraphic(graphic);
      if (label) labelLayer.remove(label);
    }

    function formatObjectLabelText(text) {
      const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!raw) return '';
      return raw.replace(' ', '\n');
    }

    function rawObjectLabelText(graphic) {
      if (!graphic) return '';
      return String(graphic.__labelRawText || graphic.__labelText || '').replace(/\n/g, ' ').trim().slice(0, 20);
    }

    function isSymbolTextEditable(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic && (
        graphic.__textEditMode === 'symbolText' ||
        attrs.textEditMode === 'symbolText' ||
        graphic.__textEditMode === 'metadataText' ||
        attrs.textEditMode === 'metadataText' ||
        graphic.__textEditable === true ||
        attrs.textEditable === true
      ));
    }

    function textEditorMaxLength(graphic) {
      if (!isSymbolTextEditable(graphic)) return 20;
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const raw = graphic.__textMaxLength || attrs.textMaxLength || 120;
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) ? Math.max(1, Math.min(500, value)) : 120;
    }

    function rawSymbolText(graphic) {
      if (!graphic) return '';
      const attrs = graphic.attributes || {};
      const symbol = graphic.symbol || {};
      return String(
        graphic.__textRawText ||
        attrs.textRawText ||
        symbol.text ||
        ''
      ).replace(/\n/g, ' ').trim().slice(0, textEditorMaxLength(graphic));
    }

    function formatSymbolTextForGraphic(graphic, rawText) {
      const raw = String(rawText || '');
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const firstSpaceBreak = !!(graphic && (graphic.__textLineBreakAfterFirstSpace || attrs.textLineBreakAfterFirstSpace));
      if (!firstSpaceBreak) return raw;
      return raw.replace(' ', '\n');
    }

    function editorRawText(graphic) {
      return isSymbolTextEditable(graphic) ? rawSymbolText(graphic) : rawObjectLabelText(graphic);
    }

    function updateSymbolText(graphic, text) {
      if (!graphic || !isSymbolTextEditable(graphic)) return false;
      const maxLen = textEditorMaxLength(graphic);
      const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
      if (!raw) return false;

      const attrs = graphic.attributes || {};
      const mode = graphic.__textEditMode || attrs.textEditMode || 'symbolText';
      const firstSpaceBreak = !!(graphic.__textLineBreakAfterFirstSpace || attrs.textLineBreakAfterFirstSpace);

      if (mode !== 'metadataText') {
        const symbol = cloneSymbol(graphic.symbol || {});
        symbol.type = symbol.type || 'text';
        symbol.text = formatSymbolTextForGraphic(graphic, raw);
        graphic.symbol = symbol;
      }

      graphic.__textRawText = raw;
      graphic.__textEditable = true;
      graphic.__textEditMode = mode;
      graphic.__textMaxLength = maxLen;
      graphic.__textLineBreakAfterFirstSpace = firstSpaceBreak;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        textRawText: raw,
        textEditable: true,
        textEditMode: mode,
        textMaxLength: maxLen,
        textLineBreakAfterFirstSpace: firstSpaceBreak
      });
      fireGraphicUpdated(graphic, { state: 'complete', toolEventInfo: { type: 'symbol-text-edit' } });
      return true;
    }

    function createOrUpdateObjectLabel(graphic, text) {
      const raw = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!graphic || !raw) return null;
      assignGraphicId(graphic);
      const anchor = getGraphicAnchorPoint(graphic);
      if (!anchor) return null;
      let label = labelForGraphic(graphic);
      const renderedText = formatObjectLabelText(raw);
      const symbol = {
        type: 'text', text: renderedText, color: [0, 0, 0, 1], haloColor: [255, 255, 255, 0.95], haloSize: 1.5,
        font: { family: 'Arial', size: 10 }
      };
      if (!label) {
        label = new Graphic({ geometry: anchor.clone ? anchor.clone() : anchor, symbol });
        label.__labelFor = graphic.__sitePlanId;
        label.__nonSelectable = true;
        labelLayer.add(label);
      } else {
        label.geometry = anchor.clone ? anchor.clone() : anchor;
        label.symbol = symbol;
      }
      graphic.__labelRawText = raw;
      graphic.__labelText = renderedText;
      return label;
    }

    return {
      labelForGraphic,
      removeLabelForGraphic,
      rawObjectLabelText,
      isSymbolTextEditable,
      textEditorMaxLength,
      editorRawText,
      updateSymbolText,
      createOrUpdateObjectLabel
    };
  }
})();
