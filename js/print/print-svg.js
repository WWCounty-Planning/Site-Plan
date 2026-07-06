// jsPDF + svg2pdf.js print renderer for the 11x17 Site Plan Builder sheet.
// This file orchestrates captures and converts the sheet SVG to a PDF with
// jsPDF + svg2pdf.js (svg2pdf scales the viewBox into the 1224x792pt page).
(function () {
  'use strict';

  const JSPDF_URL = 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const SVG2PDF_URL = 'https://unpkg.com/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js';

  const PAGE_PT_W = 1224;  // 17in * 72pt
  const PAGE_PT_H = 792;   // 11in * 72pt

  // Drawn-symbol scaling for the MAIN capture. Symbols are authored in screen
  // px (~96 DPI) but the capture renders at ~effectiveDpi, so drawings print
  // proportionally smaller; the engine scales them by (effectiveDpi / 96) *
  // default for the main capture only (inset/locator stay unscaled).
  // Tuning dials (tweak after a real print):
  //   default - multiplier on the computed base for everything; 0 disables
  //             the whole pass.
  //   cim     - extra multiplier for the lettered utility/septic lines. Their
  //             screen weight (stroke + letters + spacing) is deliberately
  //             chunky for editing; at the full factor they dominate the sheet.
  //   roles   - extra multipliers by support-graphic role. 
  const SYMBOL_SCALE_TUNE = {
    default: 1,
    cim: 0.55,
    roles: {
      adaParkingStallMark: 0.75,
      adaParkingStallMarkIcon: 0.75,
      evParkingStallMark: 0.75,
      evParkingStallMarkIcon: 0.75
    }
  };

  function loadScriptAmdSafe(url) {
    return new Promise((resolve, reject) => {
      const savedDefine = window.define;
      const savedAmd = savedDefine && savedDefine.amd;
      try { if (savedDefine) window.define = undefined; } catch (e) {}
      const restore = () => {
        try {
          if (savedDefine) {
            window.define = savedDefine;
            if (savedAmd) savedDefine.amd = savedAmd;
          }
        } catch (e) {}
      };
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => { restore(); resolve(); };
      s.onerror = () => { restore(); reject(new Error('failed to load ' + url)); };
      document.head.appendChild(s);
    });
  }

  let libsPromise = null;
  function loadLibs() {
    const haveJs = window.jspdf && window.jspdf.jsPDF;
    const haveSvg = haveJs && (window.svg2pdf || (window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.svg));
    if (haveJs && haveSvg) return Promise.resolve();
    if (libsPromise) return libsPromise;
    libsPromise = (async () => {
      if (!haveJs) await loadScriptAmdSafe(JSPDF_URL);
      if (!(window.svg2pdf || (window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.svg))) {
        await loadScriptAmdSafe(SVG2PDF_URL);
      }
      if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF global missing after load');
      if (!(window.svg2pdf || (window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.svg))) {
        throw new Error('svg2pdf integration missing after load');
      }
    })();
    return libsPromise;
  }

  function engine() {
    const e = window.SitePlanPrint && window.SitePlanPrint._engine;
    if (!e) throw new Error('SitePlanPrint._engine missing - load js/print/print-core.js first');
    return e;
  }

  function template() {
    const t = window.SitePlanPrintTemplate;
    if (!t) throw new Error('SitePlanPrintTemplate missing - load js/print/template.js first');
    return t;
  }

  function brandingCfg() {
    return (window.SitePlanConfig && window.SitePlanConfig.branding) || {};
  }

  function toast(msg, kind) {
    let el = document.getElementById('siteplan-print-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'siteplan-print-toast';
      el.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;' +
        'background:#20383C;color:#fff;padding:10px 16px;border-radius:6px;font:600 13px Arial,sans-serif;' +
        'box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:80vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = kind === 'error' ? '#7a1f1f' : (kind === 'done' ? '#1f5a2a' : '#20383C');
    el.style.display = 'block';
  }

  function hideToast(delay) {
    const el = document.getElementById('siteplan-print-toast');
    if (el) setTimeout(() => { el.style.display = 'none'; }, delay || 0);
  }

  async function imageDataUrl(url) {
    if (!url) return null;
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  // The county seal source is a JPEG with a white square background. Crop it
  // through a circular canvas clip and export transparent PNG so only the
  // round seal prints (the paper tint shows through around it).
  async function circularCrop(dataUrl) {
    if (!dataUrl) return null;
    try {
      const imgEl = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('logo decode failed'));
        i.src = dataUrl;
      });
      const d = Math.min(imgEl.naturalWidth, imgEl.naturalHeight);
      if (!(d > 0)) return dataUrl;
      const cv = document.createElement('canvas');
      cv.width = d;
      cv.height = d;
      const ctx = cv.getContext('2d');
      ctx.beginPath();
      ctx.arc(d / 2, d / 2, (d / 2) * 0.985, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(imgEl, (d - imgEl.naturalWidth) / 2, (d - imgEl.naturalHeight) / 2);
      return cv.toDataURL('image/png');
    } catch (e) {
      console.warn('[print:svg] logo circular crop failed; using original', e);
      return dataUrl;
    }
  }

  async function renderSvgToDoc(doc, svgString, pw, ph) {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;';
    container.innerHTML = svgString;
    document.body.appendChild(container);
    const svgEl = container.querySelector('svg');
    try {
      if (typeof doc.svg === 'function') {
        await doc.svg(svgEl, { x: 0, y: 0, width: pw, height: ph });
      } else if (typeof window.svg2pdf === 'function') {
        await window.svg2pdf(svgEl, doc, { x: 0, y: 0, width: pw, height: ph });
      } else {
        throw new Error('svg2pdf integration not found on jsPDF');
      }
    } finally {
      container.remove();
    }
  }

  async function run(options) {
    options = options || {};
    const report = { ok: false, engine: 'jspdf-svg', stages: {}, warnings: [], errors: [], startedAt: new Date().toISOString() };
    console.group('[print:svg] run');
    console.log('[print:svg] options', options);

    try {
      if (!window.SitePlanRuntime) throw new Error('SitePlanRuntime not ready');
      toast('Loading PDF engine (jsPDF + svg2pdf)...');
      await loadLibs();
      report.stages.libs = { ok: true };

      const E = engine();
      const T = template();
      const esri = await E.esriReady;
      const layout = T.layout();
      const UPI = layout.unitsPerInch || 100;
      const jsPDF = window.jspdf.jsPDF;
      const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: [PAGE_PT_W, PAGE_PT_H] });

      // Map capture sizing (layout units are 100/inch).
      const dpi = Math.min(Math.max(Number(options.dpi) || 150, 96), 300);
      let pxW = Math.round(layout.map.w / UPI * dpi);
      let pxH = Math.round(layout.map.h / UPI * dpi);
      const cap = E.maxCaptureSide ? E.maxCaptureSide() : 2600;
      const longest = Math.max(pxW, pxH);
      let effectiveDpi = dpi;
      if (longest > cap) {
        const k = cap / longest;
        pxW = Math.round(pxW * k);
        pxH = Math.round(pxH * k);
        effectiveDpi = Math.round(dpi * k);
      }
      const aspect = pxW / pxH;
      report.stages.layout = { dpi, effectiveDpi, capPx: cap, pxW, pxH, aspect: Number(aspect.toFixed(3)) };
      if (effectiveDpi < dpi) {
        report.warnings.push('Requested ' + dpi + ' DPI exceeds this device GPU limit; captured at about ' + effectiveDpi + ' DPI.');
      }

      toast('Computing print extent...');
      const parcelExt = await E.getParcelExtentInView(esri);
      let mainExt = null;
      if (options.extentMode === 'currentView') {
        mainExt = window.SitePlanRuntime.view.extent && window.SitePlanRuntime.view.extent.clone();
        report.stages.extent = { mode: 'currentView' };
      } else if (options.extentMode === 'parcel') {
        mainExt = parcelExt;
        report.stages.extent = { mode: 'parcel' };
        if (!mainExt) {
          const de = E.computeDrawnExtent({ excludeAccess: !!options.excludeAccess }, esri.Extent);
          report.stages.extent.fallback = 'drawn';
          report.stages.extent.stats = de.stats;
          mainExt = de.extent;
          report.warnings.push('No parcel loaded; used drawn extent.');
        }
        if (!mainExt) {
          mainExt = window.SitePlanRuntime.view.extent && window.SitePlanRuntime.view.extent.clone();
          report.stages.extent.fallback = 'currentView';
          report.warnings.push('No parcel or drawn objects available; used current view extent.');
        }
      } else {
        const de = E.computeDrawnExtent({ excludeAccess: !!options.excludeAccess }, esri.Extent);
        report.stages.extent = { mode: 'drawn', stats: de.stats };
        mainExt = de.extent;
        if (!mainExt) {
          mainExt = parcelExt;
          report.stages.extent.fallback = 'parcel';
          report.warnings.push('No drawn objects after filtering; used parcel extent.');
        }
        if (!mainExt) {
          mainExt = window.SitePlanRuntime.view.extent && window.SitePlanRuntime.view.extent.clone();
          report.stages.extent.fallback = 'currentView';
          report.warnings.push('No parcel loaded; used current view extent.');
        }
      }
      if (!mainExt) throw new Error('Could not determine any extent to print');
      const fittedMain = E.fitExtentToAspect(mainExt, aspect, 0.08, esri.Extent);
      report.stages.extent.fitted = {
        xmin: fittedMain.xmin,
        ymin: fittedMain.ymin,
        xmax: fittedMain.xmax,
        ymax: fittedMain.ymax
      };

      const groundFeet = E.groundFeetAcross(fittedMain);
      const feetPerInch = groundFeet / (layout.map.w / UPI);
      report.stages.scale = { groundFeet: Math.round(groundFeet), feetPerInch: Math.round(feetPerInch) };

      toast('Rendering map (loading tiles)...');
      const symbolScaleBase = SYMBOL_SCALE_TUNE.default > 0
        ? (effectiveDpi / 96) * SYMBOL_SCALE_TUNE.default
        : 1;
      const symbolScaleFor = (graphic, symbol) => {
        let k = symbolScaleBase;
        if (symbol && symbol.type === 'cim') k *= SYMBOL_SCALE_TUNE.cim;
        const attrs = (graphic && graphic.attributes) || {};
        const role = graphic.__supportRole || attrs.supportRole;
        if (role && SYMBOL_SCALE_TUNE.roles[role] != null) k *= SYMBOL_SCALE_TUNE.roles[role];
        return k;
      };
      report.stages.symbolScale = { base: Number(symbolScaleBase.toFixed(2)), tune: SYMBOL_SCALE_TUNE };
      let mainDataUrl = null;
      const restoreSymbolScale = (typeof E.beginPrintSymbolScale === 'function' && SYMBOL_SCALE_TUNE.default > 0)
        ? E.beginPrintSymbolScale(symbolScaleFor)
        : function () {};
      try {
        mainDataUrl = await E.captureExtent(esri, fittedMain, pxW, pxH, 'jpg');
        report.stages.captureMain = { ok: true };
      } catch (err) {
        report.errors.push('Main capture failed: ' + err.message);
        report.stages.captureMain = { ok: false, error: err.message };
      } finally {
        restoreSymbolScale();
      }

      const acres = E.parcelAcres();
      const wantInset = options.inset !== 'no';
      report.stages.inset = { requested: options.inset || 'yes', acres, willRender: wantInset };

      let insetDataUrl = null;
      if (wantInset) {
        try {
          toast('Rendering vicinity inset...');
          if (!parcelExt) {
            report.stages.inset.skipped = 'no-parcel';
            report.warnings.push('Inset requested but no parcel geometry was available.');
          } else {
            const ipxW = 700;
            const ipxH = Math.round(ipxW * layout.vicinity.h / layout.vicinity.w);
            insetDataUrl = await E.captureInset(esri, parcelExt, fittedMain, ipxW, ipxH, 'jpg');
            report.stages.inset.ok = true;
          }
        } catch (err) {
          report.errors.push('Inset capture failed: ' + err.message);
          report.stages.inset.ok = false;
        }
      }

      let countyDataUrl = null;
      try {
        toast('Rendering county locator...');
        const cpxW = 700;
        const cpxH = Math.round(cpxW * layout.county.h / layout.county.w);
        countyDataUrl = await E.captureCountyLocator(esri, parcelExt, cpxW, cpxH);
        report.stages.county = { ok: true };
      } catch (err) {
        report.warnings.push('County locator failed: ' + err.message);
        report.stages.county = { ok: false, error: err.message };
      }

      toast('Assembling PDF...');
      const logoDataUrl = await circularCrop(await imageDataUrl(brandingCfg().sealUrl));
      report.stages.logo = { ok: !!logoDataUrl };

      const now = new Date();
      const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const applicant = (options.applicant || '').trim();
      const meta = {
        parcelNumber: E.parcelField('parcelNumber'),
        ownerName: E.parcelField('ownerName'),
        siteAddress: E.parcelField('siteAddress'),
        acres,
        zoning: E.parcelField('zoningName'),
        setbackFront: E.parcelField('setbackFront'),
        setbackSide: E.parcelField('setbackSide'),
        setbackRear: E.parcelField('setbackRear'),
        applicant: applicant || null,
        description: options.description || '',
        dateStr: iso
      };

      const svgString = T.build(doc, {
        mainDataUrl,
        insetDataUrl,
        countyDataUrl,
        logoDataUrl,
        meta,
        scale: { feetPerInch }
      });
      report.stages.svgBytes = svgString.length;
      try { window.__lastSheetSvg = svgString; } catch (e) {}

      await renderSvgToDoc(doc, svgString, PAGE_PT_W, PAGE_PT_H);
      const bytes = doc.output('arraybuffer');
      report.stages.pdf = { ok: true, bytes: bytes.byteLength };
      report.stages.fileName = E.downloadPdf(bytes, E.pdfFileName(meta));
      report.ok = true;
      toast('PDF downloaded', 'done');
      hideToast(1800);
    } catch (err) {
      report.errors.push(err.message);
      console.error('[print:svg] fatal', err);
      toast('Print failed: ' + err.message, 'error');
      hideToast(4000);
    } finally {
      report.finishedAt = new Date().toISOString();
      console.log('[print:svg] REPORT', report);
      console.groupEnd();
      window.__lastPrintReportSVG = report;
      window.__lastPrintReport = report;
    }
    return report;
  }

  window.SitePlanPrintSVG = { run, _loadLibs: loadLibs };
})();
