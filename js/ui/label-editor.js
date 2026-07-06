// Inline label editor — wires the floating label/text

(function () {
  'use strict';

  window.SitePlanLabelEditor = { create };

  function create(options) {
    const getSelectedGraphic        = options.getSelectedGraphic;
    const getSelectionToolbar       = options.getSelectionToolbar;
    const getGraphicCapabilities    = options.getGraphicCapabilities;
    const positionSelectionToolbar  = options.positionSelectionToolbar;
    const isSymbolTextEditable      = options.isSymbolTextEditable;
    const textEditorMaxLength       = options.textEditorMaxLength;
    const editorRawText             = options.editorRawText;
    const updateSymbolText          = options.updateSymbolText;
    const removeLabelForGraphic     = options.removeLabelForGraphic;
    const createOrUpdateObjectLabel = options.createOrUpdateObjectLabel;

    function enterLabelEditMode() {
      const toolbar         = getSelectionToolbar();
      const selectedGraphic = getSelectedGraphic();
      if (!toolbar || !selectedGraphic) return;
      toolbar.setLabelEditing(true);
      const input = document.getElementById('label-edit-input');
      if (input) {
        input.maxLength   = textEditorMaxLength(selectedGraphic);
        input.placeholder = isSymbolTextEditable(selectedGraphic) ? 'Text...' : 'Label...';
        input.value       = editorRawText(selectedGraphic);
        // Reposition because the form may have a different width than the buttons.
        requestAnimationFrame(() => { positionSelectionToolbar(); input.focus(); input.select(); });
      }
    }

    function exitLabelEditMode() {
      const toolbar = getSelectionToolbar();
      if (toolbar) toolbar.setLabelEditing(false);
      requestAnimationFrame(positionSelectionToolbar);
    }

    function applyLabelFromInput() {
      const selectedGraphic = getSelectedGraphic();
      if (!selectedGraphic) { exitLabelEditMode(); return; }
      const input = document.getElementById('label-edit-input');
      const value = input ? String(input.value || '').trim() : '';

      if (isSymbolTextEditable(selectedGraphic)) {
        if (value) updateSymbolText(selectedGraphic, value);
        exitLabelEditMode();
        return;
      }

      if (!value) {
        removeLabelForGraphic(selectedGraphic);
        delete selectedGraphic.__labelText;
        delete selectedGraphic.__labelRawText;
      } else {
        createOrUpdateObjectLabel(selectedGraphic, value);
      }
      exitLabelEditMode();
    }

    (function wireLabelEditFormControls() {
      const clearBtn   = document.getElementById('label-edit-clear');
      const confirmBtn = document.getElementById('label-edit-confirm');
      const input      = document.getElementById('label-edit-input');
      if (clearBtn) {
        clearBtn.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (input) { input.value = ''; input.focus(); }
        });
      }
      if (confirmBtn) confirmBtn.addEventListener('click', applyLabelFromInput);
      if (input) {
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter')        { ev.preventDefault(); applyLabelFromInput(); }
          else if (ev.key === 'Escape')  { ev.preventDefault(); exitLabelEditMode(); }
          // Block keystrokes from reaching map/sketch keyboard handlers.
          ev.stopPropagation();
        });
      }
    }());

    function openLabelEditor() {
      const selectedGraphic = getSelectedGraphic();
      if (!selectedGraphic || getGraphicCapabilities(selectedGraphic).label === false) return;
      enterLabelEditMode();
    }

    return { openLabelEditor };
  }
}());
