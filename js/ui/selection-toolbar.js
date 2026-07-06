// Floating selected-object toolbar presentation and positioning.
(function () {
  'use strict';

  window.SitePlanSelectionToolbar = {
    create
  };

  function create(options) {
    const view = options.view;
    const getGraphicAnchorPoint = options.getGraphicAnchorPoint;
    const getGraphicCapabilities = options.getGraphicCapabilities;
    const defaultGraphicCapabilities = options.defaultGraphicCapabilities || {};
    const updateEditModeButtons = typeof options.updateEditModeButtons === 'function'
      ? options.updateEditModeButtons
      : function () {};

    function toolbarElement() {
      return document.getElementById('selection-toolbar');
    }

    function pointFromXY(x, y, spatialReference) {
      return {
        type: 'point',
        x,
        y,
        spatialReference: spatialReference && spatialReference.toJSON
          ? spatialReference.toJSON()
          : spatialReference
      };
    }

    function setButtonVisibility(id, visible) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.style.display = visible ? '' : 'none';
      btn.disabled = !visible;
      btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function applyCapabilities(graphic) {
      const caps = graphic ? getGraphicCapabilities(graphic) : defaultGraphicCapabilities;
      setButtonVisibility('btn-duplicate-tool', caps.duplicate !== false);
      setButtonVisibility('rotate-ccw-tool', caps.rotate !== false);
      setButtonVisibility('rotate-cw-tool', caps.rotate !== false);
      setButtonVisibility('btn-label-tool', caps.label !== false);
      setButtonVisibility('btn-delete-tool', caps.delete !== false);

      const toolbar = toolbarElement();
      if (toolbar && caps.label === false) toolbar.classList.remove('editing-label');
      updateEditModeButtons();
    }

    function getGraphicTopScreenY(graphic) {
      if (!graphic || !graphic.geometry) return null;
      const geom = graphic.geometry;
      const candidates = [];
      if (geom.type === 'point') {
        candidates.push(geom);
      } else if (geom.type === 'polygon' && geom.rings && geom.rings.length) {
        const ring = geom.rings[0];
        const sr = geom.spatialReference;
        const step = Math.max(1, Math.floor(ring.length / 16));
        for (let i = 0; i < ring.length; i += step) {
          candidates.push(pointFromXY(ring[i][0], ring[i][1], sr));
        }
      } else if (geom.type === 'polyline' && geom.paths && geom.paths.length) {
        geom.paths.forEach(path => {
          path.forEach(pt => candidates.push(pointFromXY(pt[0], pt[1], geom.spatialReference)));
        });
      } else if (geom.extent) {
        const e = geom.extent;
        candidates.push(pointFromXY(e.xmin, e.ymax, e.spatialReference));
        candidates.push(pointFromXY(e.xmax, e.ymax, e.spatialReference));
        candidates.push(pointFromXY(e.xmin, e.ymin, e.spatialReference));
        candidates.push(pointFromXY(e.xmax, e.ymin, e.spatialReference));
      }
      let minY = Infinity;
      let anchorX = 0;
      candidates.forEach(pt => {
        const s = view.toScreen(pt);
        if (s && Number.isFinite(s.y) && s.y < minY) {
          minY = s.y;
          anchorX = s.x;
        }
      });
      if (!Number.isFinite(minY)) return null;
      return { x: anchorX, y: minY };
    }

    function getGraphicCenterScreen(graphic) {
      const anchor = getGraphicAnchorPoint(graphic);
      if (!anchor) return null;
      const s = view.toScreen(anchor);
      return (s && Number.isFinite(s.x)) ? s : null;
    }

    function position(graphic) {
      const toolbar = toolbarElement();
      if (!toolbar || !graphic) return;
      const top = getGraphicTopScreenY(graphic);
      const center = getGraphicCenterScreen(graphic);
      if (!top || !center) return;
      const ROTATE_HANDLE_CLEARANCE = 56;
      const viewport = view.container ? view.container.getBoundingClientRect() : { width: 0, height: 0 };
      let targetX = center.x;
      let targetY = top.y - ROTATE_HANDLE_CLEARANCE;
      const toolbarRect = toolbar.getBoundingClientRect();
      const halfW = (toolbarRect.width || 160) / 2;
      const fullH = toolbarRect.height || 36;
      const PAD = 6;
      if (targetX - halfW < PAD) targetX = halfW + PAD;
      if (targetX + halfW > viewport.width - PAD) targetX = viewport.width - halfW - PAD;
      if (targetY < PAD) targetY = PAD + fullH;
      if (targetY > viewport.height - PAD) targetY = viewport.height - PAD;
      toolbar.style.left = Math.round(targetX) + 'px';
      toolbar.style.top = Math.round(targetY) + 'px';
      toolbar.style.transform = 'translate(-50%, -100%)';
    }

    function show(graphic) {
      const toolbar = toolbarElement();
      if (!toolbar || !graphic) return false;
      toolbar.classList.remove('editing-label');
      applyCapabilities(graphic);
      if (getGraphicCapabilities(graphic).toolbar === false) {
        toolbar.classList.remove('visible');
        return false;
      }
      toolbar.classList.add('visible');
      requestAnimationFrame(() => position(graphic));
      return true;
    }

    function hide() {
      const toolbar = toolbarElement();
      if (toolbar) {
        toolbar.classList.remove('visible');
        toolbar.classList.remove('editing-label');
      }
      applyCapabilities(null);
    }

    function setLabelEditing(enabled) {
      const toolbar = toolbarElement();
      if (!toolbar) return null;
      toolbar.classList.toggle('editing-label', !!enabled);
      return toolbar;
    }

    return {
      position,
      show,
      hide,
      setLabelEditing
    };
  }
})();
