(function () {
  'use strict';

  function create(options) {
    const view = options.view;
    const position = options.position || { position: 'bottom-left', index: 0 };
    const targetPx = options.targetPx || 170;

    const container = document.createElement('div');
    container.className = 'site-scalebar';
    container.setAttribute('aria-hidden', 'true');

    view.ui.add(container, position);

    function niceNumber(x) {
      if (!isFinite(x) || x <= 0) return 0;
      const exp = Math.floor(Math.log10(x));
      const base = Math.pow(10, exp);
      const f = x / base;
      let nice;
      if (f < 1.5) nice = 1;
      else if (f < 3) nice = 2;
      else if (f < 7) nice = 5;
      else nice = 10;
      return nice * base;
    }

    function fmt(v) {
      return v >= 1 ? Math.round(v).toLocaleString() : String(v);
    }

    function feetPerPixel() {
      const res = view.resolution; // map units (meters for Web Mercator) per px
      if (!isFinite(res) || res <= 0) return 0;
      const center = view.center;
      const lat = center && isFinite(center.latitude) ? center.latitude : 0;
      const metersPerPixel = res * Math.cos(lat * Math.PI / 180);
      return metersPerPixel * 3.280839895; // meters -> feet
    }

    function update() {
      const ftPerPx = feetPerPixel();
      if (!ftPerPx) { container.style.display = 'none'; return; }
      // Pick a nice DIVISION value so the subdivision (div/2) stays clean,
      // then total = 2 divisions. e.g. div 50 -> 0 / 25 / 50 / 100.
      const division = niceNumber(ftPerPx * targetPx / 2);
      if (!division) { container.style.display = 'none'; return; }
      container.style.display = '';

      const total = division * 2;
      const subdivision = division / 2;
      const barPx = total / ftPerPx;
      const quarterPx = barPx / 4;          // subdivision width (T/4)
      const halfPx = barPx / 2;             // division width (T/2)

      // Segments: [0..T/4 fill][T/4..T/2 empty][T/2..T fill]
      const segs =
        '<span class="ssb-seg ssb-fill" style="width:' + quarterPx + 'px"></span>' +
        '<span class="ssb-seg ssb-empty" style="width:' + quarterPx + 'px"></span>' +
        '<span class="ssb-seg ssb-fill" style="width:' + halfPx + 'px"></span>';

      // Labels at boundaries: 0, subdivision, division, total (+unit)
      const ticks =
        '<span class="ssb-tick ssb-first" style="left:0px">0</span>' +
        '<span class="ssb-tick" style="left:' + quarterPx + 'px">' + fmt(subdivision) + '</span>' +
        '<span class="ssb-tick" style="left:' + halfPx + 'px">' + fmt(division) + '</span>' +
        '<span class="ssb-tick ssb-last" style="left:' + barPx + 'px">' + fmt(total) + ' ft</span>';

      // Labels on top, bar below.
      container.innerHTML =
        '<div class="ssb-ticks" style="width:' + barPx + 'px">' + ticks + '</div>' +
        '<div class="ssb-bar" style="width:' + barPx + 'px">' + segs + '</div>';
    }

    const handles = [];
    if (typeof view.watch === 'function') {
      handles.push(view.watch('resolution', update));
      handles.push(view.watch('center', update));
    }
    if (view.when) view.when(update); else update();

    return {
      container,
      update,
      destroy() {
        handles.forEach(h => { try { h.remove(); } catch (e) {} });
        try { view.ui.remove(container); } catch (e) {}
      }
    };
  }

  window.SitePlanScaleBar = { create };
})();
