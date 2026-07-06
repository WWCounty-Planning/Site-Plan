// -----------------------------------------------------------------------------
// Builds its own DOM + styles (so index.html stays untouched apart from the
// three <script> tags), then overrides window.printPlan once the runtime is
// ready so the existing header "Print / Save PDF" button opens this dialog.
// -----------------------------------------------------------------------------
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('siteplan-print-dialog-styles')) return;
    const s = document.createElement('style');
    s.id = 'siteplan-print-dialog-styles';
    s.textContent = `
      #print-modal { position:fixed; inset:0; z-index:9000; display:none;
        align-items:center; justify-content:center; background:rgba(20,28,30,.45); }
      #print-modal.visible { display:flex; }
      .print-modal-panel { width:440px; max-width:92vw; max-height:90vh; overflow:auto;
        background:#FEFDF9; border:1px solid #D8CFB6; border-radius:8px;
        box-shadow:0 18px 50px rgba(0,0,0,.35); font:14px Arial,sans-serif; color:#2E2A22; }
      .print-modal-head { background:#20383C; color:#fff; padding:12px 16px; font-weight:700; font-size:15px;
        border-radius:8px 8px 0 0; }
      .print-modal-body { padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
      .print-row { display:flex; flex-direction:column; gap:4px; }
      .print-row > label.print-label { font-weight:700; font-size:12px; color:#20383C; }
      .print-row textarea, .print-row input[type=text], .print-row select {
        font:13px Arial,sans-serif; padding:6px 8px; border:1px solid #C9C2B0;
        border-radius:5px; background:#fff; width:100%; }
      .print-row textarea { min-height:64px; resize:vertical; }
      .print-check { display:flex; align-items:center; gap:8px; font-size:13px; }
      .print-check.is-disabled { opacity:.55; }
      .print-check.is-disabled input { display:none; }
      .print-hint { font-size:11px; color:#7a7464; }
      .print-modal-actions { padding:12px 16px; display:flex; justify-content:flex-end; gap:10px;
        border-top:1px solid #E8E2D2; }
      .print-btn { font:600 13px Arial,sans-serif; padding:8px 16px; border-radius:5px;
        border:1px solid transparent; cursor:pointer; }
      .print-btn.cancel { background:#fff; border-color:#C9C2B0; color:#2E2A22; }
      .print-btn.go { background:#F0660D; color:#fff; }
      .print-btn.go:disabled { opacity:.5; cursor:default; }
    `;
    document.head.appendChild(s);
  }

  function buildModal() {
    if (document.getElementById('print-modal')) return document.getElementById('print-modal');
    const wrap = document.createElement('div');
    wrap.id = 'print-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `
      <div class="print-modal-panel">
        <div class="print-modal-head">Print / Save PDF - 11x17</div>
        <div class="print-modal-body">
          <div class="print-row">
            <label class="print-label" for="print-desc">Project description</label>
            <textarea id="print-desc" maxlength="600" placeholder="Describe the proposed project..."></textarea>
          </div>
          <div class="print-row">
            <label class="print-label" for="print-applicant">Applicant name</label>
            <input type="text" id="print-applicant" maxlength="80" placeholder="Optional" />
          </div>
          <div class="print-row">
            <label class="print-label" for="print-extent">Print extent</label>
            <select id="print-extent">
              <option value="drawn" selected>Print to draw extent (excludes setbacks)</option>
              <option value="parcel">Print to parcel extent</option>
            </select>
          </div>
          <label class="print-check" id="print-include-access-row"><input type="checkbox" id="print-include-access" checked /> Draw to driveway / culvert extent</label>
          <div class="print-row">
            <label class="print-label" for="print-inset">Inset / Overview map</label>
            <select id="print-inset">
              <option value="yes" selected>Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div class="print-modal-actions">
          <button type="button" class="print-btn cancel" id="print-cancel">Cancel</button>
          <button type="button" class="print-btn go" id="print-go">Generate PDF</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelector('#print-cancel').addEventListener('click', close);
    wrap.querySelector('#print-go').addEventListener('click', onGenerate);
    wrap.querySelector('#print-extent').addEventListener('change', syncAccessOption);
    return wrap;
  }

  function syncAccessOption() {
    const modal = document.getElementById('print-modal');
    if (!modal) return;
    const isDrawExtent = modal.querySelector('#print-extent').value === 'drawn';
    const row = modal.querySelector('#print-include-access-row');
    const input = modal.querySelector('#print-include-access');
    if (row) row.classList.toggle('is-disabled', !isDrawExtent);
    if (input) input.disabled = !isDrawExtent;
  }

  function open() {
    injectStyles();
    const modal = buildModal();
    syncAccessOption();
    modal.classList.add('visible');
  }

  function close() {
    const modal = document.getElementById('print-modal');
    if (modal) modal.classList.remove('visible');
  }

  function onGenerate() {
    const modal = document.getElementById('print-modal');
    const go = modal.querySelector('#print-go');
    const extentMode = modal.querySelector('#print-extent').value;
    const options = {
      description: modal.querySelector('#print-desc').value,
      applicant: modal.querySelector('#print-applicant').value,
      orientation: 'landscape',
      extentMode,
      excludeAccess: extentMode === 'drawn' && !modal.querySelector('#print-include-access').checked,
      inset: modal.querySelector('#print-inset').value,
      dpi: 300
    };
    const runner = window.SitePlanPrintSVG || window.SitePlanPrint;
    go.disabled = true;
    go.textContent = 'Generating...';
    Promise.resolve(runner.run(options)).finally(() => {
      go.disabled = false;
      go.textContent = 'Generate PDF';
      close();
    });
  }

  // Override the runtime's placeholder printPlan once the runtime is ready.
  if (window.SitePlanRuntimeReady && typeof window.SitePlanRuntimeReady.then === 'function') {
    window.SitePlanRuntimeReady.then(() => { window.printPlan = open; })
      .catch(() => { window.printPlan = open; });
  } else {
    window.printPlan = open;
  }
  // Also expose directly in case something calls it before the override lands.
  window.SitePlanPrintDialog = { open, close };
})();

