// js/print/template.js
// -----------------------------------------------------------------------------
// Sheet builder for the redesigned 11x17 print template.
//
// Mirrors js/print/template-11x17.svg (the design source of truth) and emits
// the sheet as an SVG string.
//   - map / vicinity / county capture images
//   - parcel metadata, setbacks, project description (wrapped to 7 lines)
//   - dynamic Existing/Proposed legend (3x3 default, scales to 4x4 = 16 max,
//     full-band takeover when the other segment is empty, "+ N more" overflow)
//   - scale ratio + scale bar with clean increments
//
// Canvas: viewBox 0 0 1700 1100 (100 px = 1 inch). The caller renders this
// into a 1224x792pt jsPDF page (same 17:11 aspect, svg2pdf scales by viewBox).
//
// build(doc, parts) needs a jsPDF instance for text measurement only.
// parts: { mainDataUrl, insetDataUrl, countyDataUrl, logoDataUrl,
//          meta, scale: { feetPerInch } }
// meta:  { parcelNumber, ownerName, siteAddress, zoning, acres,
//          setbackFront, setbackSide, setbackRear, applicant, dateStr,
//          description }
//
// Exposes: window.SitePlanPrintTemplate = { build, layout }
// -----------------------------------------------------------------------------
(function () {
  'use strict';

  var PAGE = { w: 1700, h: 1100 };
  var MAP = { x: 26, y: 26, w: 1306, h: 880 };
  var SB = { div: 1332, cx: 1358, cr: 1648, w: 290 };
  var VIC = { x: 1358, y: 658, w: 290, h: 173 };
  var CTY = { x: 1168, y: 920, w: 140, h: 112 };

  var INK = '#1B1A17', GREY = '#6F6A60', HAIR = '#C9C4B8', PAPER = '#FCFBF7',
      PANEL = '#F2F0E9', ACCENT = '#F0660D';

  function xml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function attr(name, value) {
    if (value == null || value === false || value === '') return '';
    return ' ' + name + '="' + xml(value) + '"';
  }

  // NOTE: svg2pdf does not honor text-anchor (or tspan flow), so alignment is
  // never expressed via SVG attributes here. txtR/txtC compute the start x
  // from measured text width instead - keep it that way.
  function txt(x, y, content, o) {
    o = o || {};
    return '<text' + attr('x', x) + attr('y', y) +
      attr('font-size', o.size || 9) +
      attr('font-weight', o.weight) +
      attr('fill', o.fill || INK) +
      attr('letter-spacing', o.ls) +
      '>' + xml(content) + '</text>';
  }

  function isBold(weight) {
    return weight != null && weight !== 'normal' && weight !== '400' ? 'bold' : null;
  }

  function txtR(doc, xRight, y, content, o) {
    o = o || {};
    var w = measure(doc, content, o.size || 9, isBold(o.weight));
    return txt(xRight - w, y, content, o);
  }

  function txtC(doc, cx, y, content, o) {
    o = o || {};
    var w = measure(doc, content, o.size || 9, isBold(o.weight));
    return txt(cx - w / 2, y, content, o);
  }

  function ln(x1, y1, x2, y2, stroke, width) {
    return '<line' + attr('x1', x1) + attr('y1', y1) + attr('x2', x2) + attr('y2', y2) +
      attr('stroke', stroke || INK) + attr('stroke-width', width || 0.75) + '/>';
  }

  function rect(x, y, w, h, o) {
    o = o || {};
    return '<rect' + attr('x', x) + attr('y', y) + attr('width', w) + attr('height', h) +
      attr('fill', o.fill || 'none') +
      attr('stroke', o.stroke) + attr('stroke-width', o.strokeWidth) +
      attr('stroke-dasharray', o.dash) + '/>';
  }

  function img(x, y, w, h, href) {
    if (!href) return '';
    return '<image' + attr('x', x) + attr('y', y) + attr('width', w) + attr('height', h) +
      attr('preserveAspectRatio', 'none') +
      attr('href', href) + attr('xlink:href', href) + '/>';
  }

  // ---------------------------------------------------------------------------
  // Text measurement helpers (jsPDF helvetica; canvas px and pt stay
  // proportional because the whole sheet is scaled uniformly into the page).
  function measure(doc, text, size, weight) {
    doc.setFont('helvetica', weight === 'bold' ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(String(text == null ? '' : text));
  }

  function fitText(doc, text, size, maxW, minSize, weight) {
    text = String(text == null ? '' : text);
    var s = size;
    while (s > minSize && measure(doc, text, s, weight) > maxW) s -= 0.5;
    if (measure(doc, text, s, weight) > maxW) {
      while (text.length > 1 && measure(doc, text + '…', s, weight) > maxW) {
        text = text.slice(0, -1);
      }
      text += '…';
    }
    return { text: text, size: s };
  }

  function wrapLines(doc, text, size, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [], line = '';
    words.forEach(function (word) {
      var trial = line ? line + ' ' + word : word;
      if (measure(doc, trial, size) > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  // ---------------------------------------------------------------------------
  function cleanScaleIncrement(maxIncrement) {
    if (!(maxIncrement > 0)) return 0;
    var candidates = [];
    for (var exp = -2; exp <= 8; exp++) {
      var pow = Math.pow(10, exp);
      [1, 1.5, 2, 2.5, 5, 10].forEach(function (mult) {
        var v = mult * pow;
        if (maxIncrement >= 1 && Math.abs(v - Math.round(v)) > 1e-6) return;
        candidates.push(v);
      });
    }
    var usable = candidates
      .filter(function (v) { return v > 0 && v <= maxIncrement + 1e-9; })
      .sort(function (a, b) { return b - a; });
    return usable[0] || maxIncrement;
  }

  function formatScaleNumber(value) {
    if (Math.abs(value - Math.round(value)) < 1e-6) {
      return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return String(Number(value.toFixed(1)));
  }

  function branding() {
    return (window.SitePlanConfig && window.SitePlanConfig.branding) || {};
  }

  function attributionText() {
    var county = branding().countyName || 'Walla Walla County';
    // Layer sources: the county placeholder plus short credits for the
    // reference layers visible at print time (js/ui/attributions.js registry).
    var layerCredits = [];
    try {
      var A = window.SitePlanAttributions;
      if (A && typeof A.printLayerCredits === 'function') {
        layerCredits = A.printLayerCredits() || [];
      }
    } catch (e) {}
    return 'Basemap Sources: Esri, Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, N Robinson, NCEAS, NLS, OS, NMA, ' +
      'Geodatastyrelsen, Rijkswaterstaat, GSA, Geoland, FEMA, Intermap, and the GIS user community. ' +
      'Sources: Esri, TomTom, Garmin, FAO, NOAA, USGS, (c) OpenStreetMap contributors, and the GIS User Community. ' +
      'Layer Sources: ' + [county].concat(layerCredits).join(', ') + '.';
  }

  // ---------------------------------------------------------------------------
  // Legend: dynamic Existing/Proposed segments inside the band (y 906-1042).
  var LEGEND_ICON_SLOT = 26;
  function segGrid(n, avail) {
    var rows = 3, cols = Math.ceil(n / rows), pitch = 175;
    if (cols * pitch <= avail) return { rows: rows, cols: cols, pitch: pitch, rowPitch: 26, max: n };
    rows = 4; cols = Math.ceil(n / rows); pitch = Math.floor(avail / cols);
    if (pitch >= 128) return { rows: rows, cols: cols, pitch: pitch, rowPitch: 24, max: n };
    cols = Math.floor(avail / 128);
    pitch = Math.floor(avail / cols);
    return { rows: 4, cols: cols, pitch: pitch, rowPitch: 24, max: 4 * cols, truncated: true };
  }

  function legendSegment(doc, out, seg) {
    var x0c = seg.x0 + 24;
    var avail = seg.x1 - 8 - x0c;
    out.push(txt(x0c, 934, seg.title, { size: 9.5, weight: '700', ls: 2, fill: seg.color }));

    var items = seg.items;
    var truncatedCount = 0;
    var grid = segGrid(items.length, avail);
    if (grid.truncated && items.length > grid.max) {
      truncatedCount = items.length - (grid.max - 1);
      items = items.slice(0, grid.max - 1);
    }

    var iconH = grid.rowPitch === 26 ? 14 : 13;
    var fontSize = grid.rowPitch === 26 ? 9 : 8.5;
    var topY = grid.rowPitch === 26 ? 949 : 948;
    var legendApi = window.SitePlanPrintLegend || {};

    items.forEach(function (item, idx) {
      var col = Math.floor(idx / grid.rows);
      var row = idx % grid.rows;
      var ix = x0c + col * grid.pitch;
      var iy = topY + row * grid.rowPitch;
      var ic = { markup: '', width: 0 };
      try {
        if (typeof legendApi.iconMarkup === 'function') {
          ic = legendApi.iconMarkup(item.tool, item.mode, ix, iy, iconH) || ic;
        }
      } catch (e) {}
      if (ic.markup) out.push(ic.markup);
      var lx = ix + LEGEND_ICON_SLOT;
      var label = fitText(doc, item.label, fontSize, grid.pitch - LEGEND_ICON_SLOT - 8, fontSize);
      out.push(txt(lx, iy + iconH - 2, label.text, { size: fontSize }));
    });

    if (truncatedCount > 0) {
      var col = Math.floor(items.length / grid.rows);
      var row = items.length % grid.rows;
      out.push(txt(x0c + col * grid.pitch + LEGEND_ICON_SLOT, topY + row * grid.rowPitch + iconH - 2,
        '+ ' + truncatedCount + ' more', { size: fontSize, fill: GREY }));
    }
  }

  function legendBand(doc, out) {
    var entries = [];
    try {
      if (window.SitePlanPrintLegend && window.SitePlanPrintLegend.drawnEntries) {
        entries = window.SitePlanPrintLegend.drawnEntries() || [];
      }
    } catch (e) {
      console.warn('[print:template] legend entries failed', e);
    }
    var existing = entries.filter(function (e) { return e.mode !== 'proposed'; });
    var proposed = entries.filter(function (e) { return e.mode === 'proposed'; });

    var segs = [];
    if (existing.length && proposed.length) {
      segs.push({ title: 'EXISTING', color: INK, items: existing, x0: 26, x1: 583 });
      segs.push({ title: 'PROPOSED', color: ACCENT, items: proposed, x0: 583, x1: 1140 });
      out.push(ln(583, 920, 583, 1028, HAIR, 0.75));
    } else if (existing.length) {
      segs.push({ title: 'EXISTING', color: INK, items: existing, x0: 26, x1: 1140 });
    } else if (proposed.length) {
      segs.push({ title: 'PROPOSED', color: ACCENT, items: proposed, x0: 26, x1: 1140 });
    }
    segs.forEach(function (seg) { legendSegment(doc, out, seg); });
  }

  // ---------------------------------------------------------------------------
  function sidebarMetaRows(doc, out, meta) {
    var areaStr = (meta.acres != null && isFinite(meta.acres))
      ? formatScaleNumber(Math.round(meta.acres * 100) / 100) + ' AC' : '';
    var rows = [
      { label: 'PARCEL NUMBER', value: meta.parcelNumber },
      { label: 'OWNER',         value: meta.ownerName },
      { label: 'SITE ADDRESS',  value: meta.siteAddress },
      { label: 'ZONING',        value: meta.zoning },
      { label: 'AREA',          value: areaStr }
    ];
    var y = 224;
    rows.forEach(function (row) {
      out.push(txt(SB.cx, y, row.label, { size: 8.5, ls: 1.5, fill: GREY }));
      // letter-spacing isn't reflected by getTextWidth - approximate it.
      var labelW = measure(doc, row.label, 8.5) + row.label.length * 1.5;
      var v = fitText(doc, row.value == null ? '' : row.value, 11, SB.w - labelW - 14, 9);
      if (v.text) out.push(txtR(doc, SB.cr, y, v.text, { size: v.size }));
      out.push(ln(SB.cx, y + 12, SB.cr, y + 12, HAIR, 0.6));
      y += 36;
    });
  }

  function sidebarSetbacks(doc, out, meta) {
    out.push(txt(SB.cx, 408, 'REQUIRED SETBACKS', { size: 9, weight: '700', ls: 2 }));
    var cols = [
      { cx: 1406, label: 'FRONT', value: meta.setbackFront },
      { cx: 1503, label: 'SIDE',  value: meta.setbackSide },
      { cx: 1600, label: 'REAR',  value: meta.setbackRear }
    ];
    cols.forEach(function (c) {
      out.push(txtC(doc, c.cx, 436, c.label, { size: 8.5, fill: GREY }));
      var v = fitText(doc, c.value == null || c.value === '' ? '—' : c.value, 11, 88, 9);
      out.push(txtC(doc, c.cx, 462, v.text, { size: v.size }));
    });
    out.push(ln(1455, 420, 1455, 470, HAIR, 0.75));
    out.push(ln(1551, 420, 1551, 470, HAIR, 0.75));
    out.push(ln(SB.cx, 488, SB.cr, 488));
  }

  function sidebarDescription(doc, out, meta) {
    out.push(txt(SB.cx, 514, 'PROJECT DESCRIPTION', { size: 9, weight: '700', ls: 2 }));
    wrapLines(doc, meta.description || '', 10, SB.w).slice(0, 7).forEach(function (line, i) {
      out.push(txt(SB.cx, 536 + i * 15, line, { size: 10, fill: GREY }));
    });
    out.push(ln(SB.cx, 640, SB.cr, 640));
  }

  function sidebarDisclaimer(out) {
    // Section heading + body (no tspans: svg2pdf stacks sibling tspans at the
    // parent x instead of flowing them).
    var lines = [
      'This site plan is not a survey or engineered site plan and',
      'should not be accepted or approved as a substitute for a',
      'surveying or engineering document. Applicants are',
      'responsible for determining whether a professionally',
      'prepared survey, engineered plan, or other application',
      'specific document is required. This does not guarantee',
      'that a proposed development, site plan, permit application,',
      'or land use application will be accepted, approved, or',
      'deemed complete by Walla Walla County.'
    ];
    out.push(txt(SB.cx, 865, 'DISCLAIMER', { size: 9, weight: '700', ls: 2 }));
    lines.forEach(function (line, i) {
      out.push(txt(SB.cx, 882 + i * 13, line, { size: 10, fill: GREY }));
    });
  }

  function spatialBlock(doc, out, scale) {
    out.push(ln(SB.cx, 1000, SB.cr, 1000));

    // North arrow
    out.push('<circle' + attr('cx', 1382) + attr('cy', 1040) + attr('r', 18) +
      attr('fill', '#FFFFFF') + attr('stroke', INK) + attr('stroke-width', 1) + '/>');
    out.push('<polygon' + attr('points', '1382,1024 1388,1045 1382,1041 1376,1045') +
      attr('fill', INK) + '/>');
    out.push(txtC(doc, 1382, 1054.5, 'N', { size: 7.5, weight: '700' }));

    if (!(scale && scale.feetPerInch > 0)) return;
    var feetPerInch = scale.feetPerInch;
    out.push(txt(1420, 1028,
      '1" = ' + formatScaleNumber(Math.round(feetPerInch)) + '\' (11" x 17")',
      { size: 11, weight: '700' }));

    // Bar: max 200px (2in); snap total feet to a clean increment.
    // App-style hollow box (mirrors js/ui/scale-bar.js): divisions at 25% and
    // 50% only, quiet grey 25-50% segment, labels at 0 / 25% / 50% / 100%.
    var maxTotalFeet = feetPerInch * 2;
    var quarterFeet = cleanScaleIncrement(maxTotalFeet / 4) || (maxTotalFeet / 4);
    var barFeet = quarterFeet * 4;
    var barPx = (barFeet / feetPerInch) * 100;
    var q = barPx / 4;
    out.push(rect(1420 + q, 1034, q, 10, { fill: '#E8E6E0' }));
    out.push(rect(1420, 1034, barPx, 10, { stroke: INK, strokeWidth: 0.75 }));
    out.push(ln(1420 + q, 1034, 1420 + q, 1044, INK, 0.6));
    out.push(ln(1420 + 2 * q, 1034, 1420 + 2 * q, 1044, INK, 0.6));
    out.push(txt(1420, 1056, '0', { size: 8.5, fill: GREY }));
    out.push(txtC(doc, 1420 + q, 1056, formatScaleNumber(quarterFeet),
      { size: 8.5, fill: GREY }));
    out.push(txtC(doc, 1420 + 2 * q, 1056, formatScaleNumber(quarterFeet * 2),
      { size: 8.5, fill: GREY }));
    out.push(txtR(doc, 1420 + barPx, 1056, formatScaleNumber(barFeet),
      { size: 8.5, fill: GREY }));
    out.push(txt(1420 + barPx + 6, 1056, 'FT', { size: 8.5, fill: GREY }));
  }

  // ---------------------------------------------------------------------------
  function build(doc, parts) {
    parts = parts || {};
    var meta = parts.meta || {};
    var out = [];

    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
      ' viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '"' +
      ' font-family="Helvetica, Arial, sans-serif">');

    // Sheet base
    out.push(rect(0, 0, PAGE.w, PAGE.h, { fill: PAPER }));
    out.push(rect(26, 26, 1648, 1048, { stroke: INK, strokeWidth: 1 }));

    // Main map
    out.push(rect(MAP.x, MAP.y, MAP.w, MAP.h, { fill: PANEL }));
    if (parts.mainDataUrl) {
      out.push(img(MAP.x, MAP.y, MAP.w, MAP.h, parts.mainDataUrl));
    } else {
      out.push(txtC(doc, MAP.x + MAP.w / 2, MAP.y + MAP.h / 2, '[ map capture failed - see console ]',
        { size: 16, fill: GREY }));
    }
    // Corner registration ticks
    out.push('<g stroke="' + INK + '" stroke-width="1" opacity="0.7">' +
      '<path d="M 38 40 h 14 M 38 40 v 14" fill="none"/>' +
      '<path d="M 1320 40 h -14 M 1320 40 v 14" fill="none"/>' +
      '<path d="M 38 892 h 14 M 38 892 v -14" fill="none"/>' +
      '<path d="M 1320 892 h -14 M 1320 892 v -14" fill="none"/></g>');

    // Legend band
    out.push(ln(26, 906, SB.div, 906));
    out.push(ln(1140, 920, 1140, 1028, HAIR, 0.75));
    legendBand(doc, out);

    // County locator: transparent PNG (bare outline + marker) floating on the
    // paper - no panel fill or frame; the band's rules give it structure.
    out.push(img(CTY.x, CTY.y, CTY.w, CTY.h, parts.countyDataUrl));

    // Footer micro-band
    out.push(ln(26, 1042, SB.div, 1042, HAIR, 0.6));
    wrapLines(doc, attributionText(), 6.5, 840).slice(0, 2).forEach(function (line, i) {
      out.push(txt(50, 1056 + i * 9, line, { size: 6.5, fill: GREY }));
    });
    // Three footer cells (no visible dividers): attribution | county + agency
    // name | address + contact. The contact block is left-justified with its
    // widest line ending at the band edge; the name cell rags toward the gap.
    var b = branding();
    var addrLine = (b.address || '310 W. Poplar Street, Suite 200 | Walla Walla, WA 99362')
      .replace(/\s*·\s*/g, ' | ');
    var mainLine = 'Main: ' + (b.email || 'commdev@wwcowa.gov') + ' | ' + (b.phone || '509-524-2610');
    var countyLine = b.countyName || 'Walla Walla County';
    var agencyLine = b.agencyName || 'Community Development';
    var ffs = 6.5;
    var contactX = 1308 - Math.max(measure(doc, addrLine, ffs), measure(doc, mainLine, ffs));
    var nameR = contactX - 18;
    out.push(txtR(doc, nameR, 1054, countyLine, { size: ffs, fill: GREY }));
    out.push(txtR(doc, nameR, 1064, agencyLine, { size: ffs, fill: GREY }));
    out.push(txt(contactX, 1054, addrLine, { size: ffs, fill: GREY }));
    out.push(txt(contactX, 1064, mainLine, { size: ffs, fill: GREY }));

    // Sidebar
    out.push(ln(SB.div, 26, SB.div, 1074));

    // Title block (+ optional county logo)
    if (parts.logoDataUrl) {
      out.push('<image' + attr('x', 1358) + attr('y', 52) + attr('width', 68) + attr('height', 68) +
        attr('preserveAspectRatio', 'xMidYMid meet') +
        attr('href', parts.logoDataUrl) + attr('xlink:href', parts.logoDataUrl) + '/>');
    }
    out.push(txt(1442, 80, (branding().countyName || 'Walla Walla County').toUpperCase(),
      { size: 17, weight: '700', ls: 0.5 }));
    out.push(txt(1442, 103, 'SITE PLAN', { size: 17, weight: '700', ls: 0.5 }));
    out.push(ln(SB.cx, 136, SB.cr, 136));

    // Authorship row
    out.push(txt(SB.cx, 158, 'PREPARED BY', { size: 8.5, ls: 1.5, fill: GREY }));
    var applicant = fitText(doc, meta.applicant || '', 11, 170, 9);
    if (applicant.text) out.push(txt(SB.cx, 176, applicant.text, { size: applicant.size }));
    out.push(txtR(doc, SB.cr, 158, 'DATE', { size: 8.5, fill: GREY }));
    out.push(txtR(doc, SB.cr, 176, meta.dateStr || '', { size: 11 }));
    out.push(ln(SB.cx, 196, SB.cr, 196));

    sidebarMetaRows(doc, out, meta);
    sidebarSetbacks(doc, out, meta);
    sidebarDescription(doc, out, meta);

    // Vicinity panel
    out.push(rect(VIC.x, VIC.y, VIC.w, VIC.h, { fill: PANEL, stroke: HAIR, strokeWidth: 0.75 }));
    out.push(img(VIC.x, VIC.y, VIC.w, VIC.h, parts.insetDataUrl));
    out.push(ln(SB.cx, 843, SB.cr, 843));

    sidebarDisclaimer(out);
    spatialBlock(doc, out, parts.scale);

    out.push('</svg>');
    return out.join('');
  }

  function layout() {
    return {
      page: { w: PAGE.w, h: PAGE.h },
      map: { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h },
      vicinity: { w: VIC.w, h: VIC.h },
      county: { w: CTY.w, h: CTY.h },
      unitsPerInch: 100
    };
  }

  window.SitePlanPrintTemplate = { build: build, layout: layout };
})();
