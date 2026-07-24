// js/ui/help-guide.js
// Right Sidebar "Help Guide" panel
(function () {
  'use strict';

  let built = false;

  function branding() {
    return (window.SitePlanConfig && window.SitePlanConfig.branding) || {};
  }

  function stepsSection() {
    const wrap = document.createElement('div');
    wrap.className = 'help-block';
    wrap.innerHTML =
      '<div class="help-subhead">Getting Started</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">1. Select a Property</div>' +
        '<p>Enter a parcel number or address in the search bar. Once located, the parcel boundary will be outlined in red.</p>' +
        '<p class="help-tip"><em>Note: Parcels must be searched and cannot be selected by clicking directly on the map.</em></p>' +
      '</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">2. Choose Existing or Proposed</div>' +
        '<p>Before adding an item, toggle between <strong>Existing</strong> and <strong>Proposed</strong>. This determines how the item will appear on the map and in the printed legend.</p>' +
      '</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">3. Add Items to the Site Plan</div>' +
        '<p>Select a tool from the left sidebar. If needed, select a fixed size and enter your dimensions. Click or drag on the map to place the item.</p>' +
        '<p>For lines and polygons (e.g. utility lines, grading, easements), click to add each point and double-click to finish.</p>' +
        '<p class="help-tip"><em>Note: Press the Esc key to cancel an item before it is completed.</em></p>' +
      '</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">4. Edit or Remove Items</div>' +
        '<p>Click on any placed object to select it. A toolbar will appear, allowing you to duplicate, rotate, delete, or add text.</p>' +
        '<p>To scale an object, use the <strong>Resize / Rotate</strong> button at the top of the left sidebar. To edit the vertices or reshape an object, select the <strong>Reshape (Edit points)</strong> button.</p>' +
      '</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">5. Add Reference Layers</div>' +
        '<p>Use the layers button on the map to toggle additional information on or off, such as wetlands, flood zones, and contours.</p>' +
        '<p class="help-tip"><em>Note: Layers are provided for informational purposes only and may not reflect actual on-site conditions.</em></p>' +
      '</div>' +

      '<div class="help-step">' +
        '<div class="help-step-title">6. Print / Save PDF</div>' +
        '<p>Confirm that the following information is clearly shown and illustrated when applicable: existing and proposed improvements, setbacks, access, utilities, wells and septic, and easements.</p>' +
        '<p>When the site plan is complete, click <strong>Print / Save PDF</strong> at the top of the page.</p>' +
        '<p>Add a description of the proposed project (e.g., Proposed 1,080 sq ft accessory dwelling unit) and include the applicant’s name if relevant.</p>' +
        '<p>Choose a Print Extent:</p>' +
        '<ul class="help-bullets">' +
          '<li><strong>Default (Recommended):</strong> Print to draw extent (excludes setbacks) with the inset/overview map selected.</li>' +
          '<li><strong>Larger Parcels:</strong> You may need to deselect “Draw to driveway / culvert extent” depending on the proposed layout.</li>' +
          '<li><strong>Smaller Parcels (Under 5 acres):</strong> You may wish to select “Print to parcel extent,” as the entire property will generally remain legible at that scale. This will remove the option to draw to driveway / culvert extent.</li>' +
        '</ul>' +
        '<p>Click <strong>Generate PDF</strong> and wait for the site plan to be created. This may take a minute or so depending on the number of details added. Once complete, it will download automatically as a PDF.</p>' +
      '</div>';
    return wrap;
  }

  function disclaimerSection() {
    const b = branding();
    const wrap = document.createElement('div');
    wrap.className = 'help-block';
    wrap.innerHTML =
      '<div class="help-subhead">Disclaimer</div>' +
      '<p>The site plan generated from this application is not a survey or engineered site plan and should not be accepted or approved as a substitute for a surveying or engineering document. Applicants are responsible for determining whether a professionally prepared survey, engineered plan, or other application specific document is required. This does not guarantee that a proposed development, site plan, permit application, or land use application will be accepted, approved, or deemed complete by Walla Walla County.</p>' +
      '<p>Parcels as shown may not reflect legal property boundaries. For information regarding public surveys or plat maps please contact the ' +
        '<a href="' + (b.assessorUrl || '#') + '" target="_blank" rel="noopener noreferrer">Walla Walla County Assessor’s Office</a>.</p>';
    return wrap;
  }

  function linksSection() {
    const b = branding();
    const links = [
      { label: 'Building Applications & Forms', url: b.formsUrl },
      { label: 'Parcel Information Report', url: b.parcelInfoUrl },
      { label: 'Complete Application Guide', url: b.applicationGuideUrl }
    ].filter(l => l.url);
    if (!links.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'help-block';
    const head = document.createElement('div');
    head.className = 'help-subhead';
    head.textContent = 'Other Useful Links';
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'help-link-list';
    links.forEach(l => {
      const a = document.createElement('a');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = l.label;
      list.appendChild(a);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function contactSection() {
    const b = branding();
    const wrap = document.createElement('div');
    wrap.className = 'help-block';
    const head = document.createElement('div');
    head.className = 'help-subhead';
    head.textContent = 'Contact Us';
    wrap.appendChild(head);

    const body = document.createElement('div');
    body.className = 'help-contact';
    const addLine = text => {
      const p = document.createElement('div');
      p.textContent = text;
      body.appendChild(p);
      return p;
    };

    if (b.countyName) addLine(b.countyName);
    const deptLine = (b.departmentFullName && b.countyName &&
        b.departmentFullName.indexOf(b.countyName) === 0)
      ? b.departmentFullName.slice(b.countyName.length).trim()
      : (b.departmentFullName || b.agencyName);
    if (deptLine) addLine(deptLine);
    if (b.directorName) addLine('Director: ' + b.directorName);
    // Canonical address stores a middle-dot separator; split it into lines.
    if (b.address) b.address.split('·').forEach(part => addLine(part.trim()));

    if (b.email) {
      const p = document.createElement('div');
      p.appendChild(document.createTextNode('Main: '));
      const a = document.createElement('a');
      a.href = 'mailto:' + b.email;
      a.textContent = b.email;
      p.appendChild(a);
      body.appendChild(p);
    }
    if (b.phone) addLine(b.phone);
    wrap.appendChild(body);
    return wrap;
  }

  function buildContent() {
    const host = document.getElementById('info-panel-help');
    if (!host || built) return;
    host.innerHTML = '';
    host.appendChild(stepsSection());
    host.appendChild(disclaimerSection());
    const links = linksSection();
    if (links) host.appendChild(links);
    host.appendChild(contactSection());
    built = true;
  }

  function showSidebarPanel(which) {
    const parcelPanel = document.getElementById('info-panel-parcel');
    const helpPanel = document.getElementById('info-panel-help');
    const parcelTab = document.getElementById('tab-parcel-info');
    const helpTab = document.getElementById('tab-help-guide');
    if (!parcelPanel || !helpPanel || !parcelTab || !helpTab) return;

    const showHelp = which === 'help';
    if (showHelp) buildContent();

    parcelPanel.hidden = showHelp;
    helpPanel.hidden = !showHelp;
    parcelTab.classList.toggle('active', !showHelp);
    helpTab.classList.toggle('active', showHelp);
    parcelTab.setAttribute('aria-selected', showHelp ? 'false' : 'true');
    helpTab.setAttribute('aria-selected', showHelp ? 'true' : 'false');
  }

  window.showSidebarPanel = showSidebarPanel;
  window.SitePlanHelpGuide = { show: showSidebarPanel };

  // Help Guide is the default sidebar panel on load.
  function initDefaultPanel() { showSidebarPanel('help'); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDefaultPanel);
  } else {
    initDefaultPanel();
  }
})();
