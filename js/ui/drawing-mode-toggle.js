// Builds the per-section "Existing / Proposed" segmented toggle.
(function () {
  'use strict';

  const API = window.SitePlanDrawingMode;
  if (!API) return; // core/drawing-mode.js must load first.

  const MODES = API.MODES;
  const SEGMENTS = [
    { mode: MODES.EXISTING, label: 'Existing' },
    { mode: MODES.PROPOSED, label: 'Proposed' }
  ];

  function buildPill(category) {
    const pill = document.createElement('span');
    pill.className = 'dm-pill';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Existing or proposed drawing mode');
    // Don't let a click on the pill bubble to a collapsible header handler.
    pill.addEventListener('click', e => e.stopPropagation());

    const buttons = SEGMENTS.map(seg => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dm-seg';
      btn.textContent = seg.label;
      btn.dataset.mode = seg.mode;
      btn.addEventListener('click', () => API.setDrawingMode(category, seg.mode));
      pill.appendChild(btn);
      return btn;
    });

    function render() {
      const current = API.getDrawingMode(category);
      buttons.forEach(btn => {
        const active = btn.dataset.mode === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    render();
    // Keep this pill in sync when its category changes from anywhere.
    window.addEventListener(API.EVENT_NAME, event => {
      if (event && event.detail && event.detail.category === category) render();
    });

    return pill;
  }

  function init() {
    const heads = document.querySelectorAll('.section-head[data-drawing-mode-category]');
    heads.forEach(head => {
      if (head.querySelector('.dm-pill')) return; // already built
      const category = head.getAttribute('data-drawing-mode-category');
      head.appendChild(buildPill(category));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
