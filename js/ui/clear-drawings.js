(function () {
  'use strict';

  function noop() {}

  function create(options) {
    const modalId = options.modalId || 'clear-modal';
    const onConfirm = options.onConfirm || noop;

    function getModal() {
      return document.getElementById(modalId);
    }

    function open() {
      const modal = getModal();
      if (!modal) return;
      modal.classList.add('visible');
      modal.setAttribute('aria-hidden', 'false');
    }

    function close() {
      const modal = getModal();
      if (!modal) return;
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
    }

    function confirm() {
      close();
      onConfirm();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('keydown', handleKeydown);

    return {
      open,
      close,
      confirm,
      destroy() {
        document.removeEventListener('keydown', handleKeydown);
      }
    };
  }

  window.SitePlanClearDrawings = { create };
})();
