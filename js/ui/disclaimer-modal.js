(function () {
  'use strict';

  function disclaimerConfig() {
    const cfg = window.SitePlanConfig || {};
    const ui = cfg.ui || {};
    return ui.disclaimerSplash || {};
  }

  function isEnabled() {
    return !!disclaimerConfig().enabled;
  }

  function getParts() {
    return {
      modal: document.getElementById('disclaimer-modal'),
      checkbox: document.getElementById('disclaimer-agree'),
      button: document.getElementById('disclaimer-continue'),
      seal: document.getElementById('disclaimer-header-seal-img')
    };
  }

  function close() {
    const parts = getParts();
    if (!parts.modal) return;
    parts.modal.classList.remove('visible');
    parts.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('disclaimer-modal-open');
  }

  function open() {
    const parts = getParts();
    if (!parts.modal || !parts.checkbox || !parts.button) return;

    const branding = (window.SitePlanConfig && window.SitePlanConfig.branding) || {};
    if (parts.seal && branding.sealUrl) parts.seal.src = branding.sealUrl;

    parts.checkbox.checked = false;
    parts.button.disabled = true;
    parts.modal.classList.add('visible');
    parts.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('disclaimer-modal-open');

    window.setTimeout(function () {
      try { parts.checkbox.focus(); } catch (err) {}
    }, 0);
  }

  function init() {
    const parts = getParts();
    if (!parts.modal || !parts.checkbox || !parts.button) return;

    parts.checkbox.addEventListener('change', function () {
      parts.button.disabled = !parts.checkbox.checked;
    });
    parts.button.addEventListener('click', function () {
      if (!parts.checkbox.checked) return;
      close();
    });

    if (isEnabled()) open();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SitePlanDisclaimerModal = {
    open,
    close,
    isEnabled
  };
})();
