// Per-group "Proposed vs. Existing" drawing mode.
// This module has NO runtime/map dependencies, so it self-initializes like the
// other global toggles (toggleSnapping / toggleRotationGuides). It loads with
// the rest of js/core/ ahead of the factories and tools.
(function () {
  'use strict';

  const MODES = { EXISTING: 'existing', PROPOSED: 'proposed' };
  const DEFAULT_MODE = MODES.EXISTING;
  const EVENT_NAME = 'siteplan:drawing-mode-changed';
  const DEFAULT_DASH = '5,3';

  function normalizeMode(mode) {
    return mode === MODES.PROPOSED ? MODES.PROPOSED : MODES.EXISTING;
  }

  function normalizeCategory(category) {
    return category == null ? '' : String(category);
  }

  // Per-category state: { [category]: 'existing' | 'proposed' }.
  const state = (window.__sitePlanDrawingModes && typeof window.__sitePlanDrawingModes === 'object')
    ? window.__sitePlanDrawingModes
    : {};
  window.__sitePlanDrawingModes = state;

  // Registry of icons to refresh when a category's mode changes.
  // Each entry: { svg, category, apply } — see registerIcon().
  const iconRegistry = [];

  function getDrawingMode(category) {
    return normalizeMode(state[normalizeCategory(category)]);
  }

  function isProposed(category) {
    return getDrawingMode(category) === MODES.PROPOSED;
  }

  function setDrawingMode(category, mode) {
    const cat = normalizeCategory(category);
    const next = normalizeMode(mode);
    const prev = getDrawingMode(cat);
    state[cat] = next;
    if (next !== prev) {
      refreshIcons(cat);
      try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {
          detail: { category: cat, mode: next, previous: prev }
        }));
      } catch (err) {}
    }
    return next;
  }

  // --- Icon handling ---------------------------------------------------------
  // Generic transform: dash stroked shapes for proposed, restore for existing.
  // Captures each element's original stroke-dasharray once so existing mode can
  // restore tools that legitimately ship a dashed icon.
  function defaultApplyIcon(svg, mode, options) {
    if (!svg || typeof svg.querySelectorAll !== 'function') return;
    const dash = (options && options.dash) || DEFAULT_DASH;
    const nodes = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
    nodes.forEach(node => {
      if (node.getAttribute('data-dm-skip') != null) return;
      if (node.getAttribute('data-dm-orig-dash') == null) {
        node.setAttribute('data-dm-orig-dash', node.getAttribute('stroke-dasharray') || '');
      }
      if (mode === MODES.PROPOSED) {
        const hasStroke = node.getAttribute('stroke') &&
          node.getAttribute('stroke') !== 'none';
        if (hasStroke) node.setAttribute('stroke-dasharray', dash);
      } else {
        const orig = node.getAttribute('data-dm-orig-dash');
        if (orig) node.setAttribute('stroke-dasharray', orig);
        else node.removeAttribute('stroke-dasharray');
      }
    });
  }

  // Register a tool button SVG so it re-renders when its group's mode changes.
  function registerIcon(svg, options) {
    if (!svg) return function () {};
    const opts = options || {};
    const category = normalizeCategory(opts.category);
    const apply = typeof opts.apply === 'function'
      ? opts.apply
      : function (el, mode) { defaultApplyIcon(el, mode, opts); };
    const entry = { svg, category, apply };
    iconRegistry.push(entry);
    // Apply current mode immediately so late-registered icons are correct.
    try { apply(svg, getDrawingMode(category)); } catch (err) {}
    return function unregister() {
      const i = iconRegistry.indexOf(entry);
      if (i >= 0) iconRegistry.splice(i, 1);
    };
  }

  // Refresh icons for one category, or all icons when category is omitted.
  function iconSwapApply(svg, mode) {
    if (!svg || typeof svg.querySelectorAll !== 'function') return;
    const proposed = mode === MODES.PROPOSED;
    svg.querySelectorAll('.dm-existing').forEach(el => { el.style.display = proposed ? 'none' : ''; });
    svg.querySelectorAll('.dm-proposed').forEach(el => { el.style.display = proposed ? '' : 'none'; });
  }

  function refreshIcons(category) {
    const cat = category == null ? null : normalizeCategory(category);
    // Iterate over a copy in case an apply callback unregisters.
    iconRegistry.slice().forEach(entry => {
      if (cat != null && entry.category !== cat) return;
      try { entry.apply(entry.svg, getDrawingMode(entry.category)); } catch (err) {}
    });
  }

  window.SitePlanDrawingMode = {
    MODES,
    EVENT_NAME,
    getDrawingMode,
    setDrawingMode,
    isProposed,
    registerIcon,
    refreshIcons,
    applyDrawingModeToIcon: defaultApplyIcon,
    iconSwapApply
  };
})();
