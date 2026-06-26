const state = {
  records: [],
  release: 'all',
  type: 'all',
  query: '',
  zoom: 0.32,
  tx: 0,
  ty: 0,
  mode: 'canvas',
};

const els = {
  canvas: document.querySelector('#canvas'),
  viewport: document.querySelector('#viewport'),
  count: document.querySelector('#recordCount'),
  search: document.querySelector('#searchInput'),
  zoomReadout: document.querySelector('#zoomReadout'),
  zoomIn: document.querySelector('#zoomIn'),
  zoomOut: document.querySelector('#zoomOut'),
  fitAll: document.querySelector('#fitAll'),
  dialog: document.querySelector('#recordDialog'),
  mediaPanel: document.querySelector('#mediaPanel'),
  dialogTitle: document.querySelector('#dialogTitle'),
  dialogDescription: document.querySelector('#dialogDescription'),
  dialogType: document.querySelector('#dialogType'),
  dialogMeta: document.querySelector('#dialogMeta'),
  dialogActions: document.querySelector('#dialogActions'),
  inspectorKicker: document.querySelector('#inspectorKicker'),
  inspectorTitle: document.querySelector('#inspectorTitle'),
  inspectorText: document.querySelector('#inspectorText'),
  aboutBtn: document.querySelector('#aboutBtn'),
  canvasMode: document.querySelector('#canvasMode'),
  listMode: document.querySelector('#listMode'),
  template: document.querySelector('#cardTemplate'),
};

const releaseMap = {
  '5/8/26': 'Release 01',
  '5/22/26': 'Release 02',
  '6/12/26': 'Release 03',
};

const releaseShort = {
  '5/8/26': 'R01',
  '5/22/26': 'R02',
  '6/12/26': 'R03',
};

const typeLabel = {
  PDF: 'document',
  VID: 'video',
  AUD: 'audio',
};

const accents = {
  PDF: ['#d9b66c', '#f2dfaa', '#b68d4c'],
  VID: ['#a982ff', '#79d5ff', '#f4a7ff'],
  AUD: ['#9df0c8', '#79d5ff', '#d9b66c'],
};

const clean = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const escapeHtml = value => clean(value).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

function slugify(text) {
  return clean(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function enrichRecord(record, index) {
  const title = clean(record.title) || `Record ${index + 1}`;
  const type = clean(record.type).toUpperCase();
  const release = clean(record.release_date);
  const id = `${releaseShort[release] || 'RX'}-${type}-${String(index + 1).padStart(3, '0')}-${slugify(title)}`;
  const h = hashString(`${title}${record.description}${index}`);
  const cluster = release === '5/8/26' ? 0 : release === '5/22/26' ? 1 : 2;
  const cols = 12;
  const row = Math.floor(index / cols);
  const col = index % cols;
  const baseX = 420 + col * 410 + cluster * 250;
  const baseY = 340 + row * 292 + Math.sin((col + cluster) * 1.7) * 62;
  const jitterX = ((h & 255) - 128) * 0.75;
  const jitterY = (((h >> 8) & 255) - 128) * 0.55;
  const accent = accents[type]?.[h % (accents[type]?.length || 1)] || '#a982ff';
  const dvids = clean(record.dvids_video_id);
  return {
    ...record,
    id,
    index,
    title,
    type,
    release,
    agency: clean(record.agency) || 'Unknown agency',
    incident_date: clean(record.incident_date) || 'N/A',
    incident_location: clean(record.incident_location) || 'N/A',
    description: clean(record.description),
    source_url: clean(record.source_url),
    dvids_video_id: dvids,
    dvids_url: dvids ? `https://www.dvidshub.net/video/${dvids}` : '',
    release_label: releaseMap[release] || release || 'Unreleased',
    release_short: releaseShort[release] || 'RX',
    x: baseX + jitterX,
    y: baseY + jitterY,
    accent,
    gx: 18 + (h % 70),
    gy: 18 + ((h >> 12) % 64),
    searchable: [title, type, record.agency, record.incident_date, record.incident_location, record.description, dvids].map(clean).join(' ').toLowerCase(),
  };
}

async function loadRecords() {
  const res = await fetch('./data/records.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`records fetch failed: ${res.status}`);
  const raw = await res.json();
  state.records = raw.map(enrichRecord);
  els.count.textContent = state.records.length;
  renderCards();
  applyFilters();
  fitAll();
}

function renderCards() {
  const fragment = document.createDocumentFragment();
  state.records.forEach(record => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = record.id;
    node.dataset.type = record.type;
    node.style.left = `${record.x}px`;
    node.style.top = `${record.y}px`;
    node.style.setProperty('--accent', record.accent);
    node.style.setProperty('--gx', `${record.gx}%`);
    node.style.setProperty('--gy', `${record.gy}%`);
    node.querySelector('.typePill').textContent = typeLabel[record.type] || record.type;
    node.querySelector('.releasePill').textContent = record.release_short;
    node.querySelector('.cardTitle').textContent = record.title;
    node.querySelector('.cardMeta').textContent = `${record.agency} • ${record.incident_date} • ${record.incident_location}`;
    node.addEventListener('mouseenter', () => inspect(record));
    node.addEventListener('focus', () => inspect(record));
    node.addEventListener('click', () => openRecord(record));
    fragment.append(node);
  });
  els.canvas.replaceChildren(fragment);
}

function filteredRecords() {
  const q = state.query.toLowerCase();
  return state.records.filter(record => {
    if (state.release !== 'all' && record.release !== state.release) return false;
    if (state.type !== 'all' && record.type !== state.type) return false;
    if (q && !record.searchable.includes(q)) return false;
    return true;
  });
}

function applyFilters() {
  const visible = new Set(filteredRecords().map(r => r.id));
  document.querySelectorAll('.recordCard').forEach(card => {
    card.classList.toggle('hidden', !visible.has(card.dataset.id));
  });
  els.count.textContent = visible.size;
  const first = state.records.find(r => visible.has(r.id));
  if (first) inspect(first, { quiet: true });
}

function inspect(record, opts = {}) {
  els.inspectorKicker.textContent = `${record.release_label} • ${typeLabel[record.type] || record.type} • ${record.agency}`;
  els.inspectorTitle.textContent = record.title;
  els.inspectorText.textContent = record.description || `${record.incident_date} · ${record.incident_location}`;
}

function metaRow(term, value) {
  return `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value || 'N/A')}</dd>`;
}

function openRecord(record) {
  els.dialogTitle.textContent = record.title;
  els.dialogType.textContent = `${record.release_label} / ${typeLabel[record.type] || record.type}`;
  els.dialogDescription.textContent = record.description || 'No description was included in the WAR.gov manifest for this record.';
  els.dialogMeta.innerHTML = [
    metaRow('Agency', record.agency),
    metaRow('Incident date', record.incident_date),
    metaRow('Location', record.incident_location),
    metaRow('Release', `${record.release_label} (${record.release})`),
    metaRow('DVIDS ID', record.dvids_video_id || 'N/A'),
  ].join('');
  els.mediaPanel.innerHTML = mediaMarkup(record);
  els.dialogActions.innerHTML = actionMarkup(record);
  els.dialog.showModal();
}

function mediaMarkup(record) {
  if (record.type === 'PDF' && record.source_url) {
    return `<div class="mediaFallback pdfFallback">
      <div class="fallbackIcon">▧</div>
      <h2>Official PDF document</h2>
      <p>WAR.gov blocks embedded PDF rendering from this static page, so the gallery preserves the record metadata here and opens the official document in a new tab.</p>
    </div>`;
  }
  if ((record.type === 'VID' || record.type === 'AUD') && record.dvids_url) {
    const label = record.type === 'AUD' ? 'audio excerpt' : 'video record';
    return `<div class="mediaFallback">
      <div class="fallbackIcon">${record.type === 'AUD' ? '≋' : '▶'}</div>
      <h2>${escapeHtml(label)} hosted by DVIDS</h2>
      <p>This free gallery uses official public source pages for large media instead of rehosting the 26GB archive. Open the source to stream or download the original file.</p>
    </div>`;
  }
  return `<div class="mediaFallback"><div class="fallbackIcon">◌</div><h2>Source preview unavailable</h2><p>This record has metadata in the manifest, but no direct embeddable media URL.</p></div>`;
}

function actionMarkup(record) {
  const actions = [];
  if (record.type === 'PDF' && record.source_url) {
    actions.push(`<a class="primary" href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">open pdf</a>`);
    actions.push(`<a href="${escapeHtml(record.source_url)}" download>download</a>`);
  }
  if ((record.type === 'VID' || record.type === 'AUD') && record.dvids_url) {
    actions.push(`<a class="primary" href="${escapeHtml(record.dvids_url)}" target="_blank" rel="noreferrer">open dvids</a>`);
  }
  if (record.source_url && record.type !== 'PDF') actions.push(`<a href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">source</a>`);
  actions.push(`<a href="https://www.war.gov/UFO/" target="_blank" rel="noreferrer">war.gov portal</a>`);
  return actions.join('');
}

function setZoom(next) {
  state.zoom = Math.max(0.16, Math.min(0.95, next));
  els.canvas.style.setProperty('--scale', state.zoom.toFixed(3));
  els.zoomReadout.value = `${Math.round(state.zoom * 100)}%`;
  els.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitAll() {
  if (document.body.classList.contains('list')) return;
  state.tx = 0;
  state.ty = -45;
  setZoom(window.innerWidth < 1200 ? 0.21 : 0.32);
  els.canvas.style.setProperty('--tx', `${state.tx}px`);
  els.canvas.style.setProperty('--ty', `${state.ty}px`);
}

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('list', mode === 'list');
  els.canvasMode.classList.toggle('active', mode === 'canvas');
  els.listMode.classList.toggle('active', mode === 'list');
  if (mode === 'canvas') fitAll();
}

function wireControls() {
  els.search.addEventListener('input', event => {
    state.query = event.target.value;
    applyFilters();
  });
  document.querySelectorAll('.filterGroup').forEach(group => {
    group.addEventListener('click', event => {
      const btn = event.target.closest('button[data-value]');
      if (!btn) return;
      group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state[group.dataset.filter] = btn.dataset.value;
      applyFilters();
    });
  });
  els.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.06));
  els.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.06));
  els.fitAll.addEventListener('click', fitAll);
  els.canvasMode.addEventListener('click', () => setMode('canvas'));
  els.listMode.addEventListener('click', () => setMode('list'));
  els.aboutBtn.addEventListener('click', () => openRecord({
    title: 'PURSUE Archive / design note',
    type: 'PDF',
    release_label: 'About',
    release: '—',
    agency: 'WAR.gov public records + independent gallery',
    incident_date: '2026',
    incident_location: 'Public domain source archive',
    description: 'A static GitHub Pages gallery for exploring public WAR.gov UAP/PURSUE records. The interface is free-hosted; large media is opened from official public source URLs rather than rehosted inside GitHub.',
    source_url: 'https://www.war.gov/UFO/',
    dvids_video_id: '',
  }));

  let dragging = false;
  let last = null;
  els.viewport.addEventListener('pointerdown', event => {
    if (document.body.classList.contains('list') || event.target.closest('.recordCard')) return;
    dragging = true;
    last = { x: event.clientX, y: event.clientY };
    els.viewport.setPointerCapture(event.pointerId);
  });
  els.viewport.addEventListener('pointermove', event => {
    if (!dragging || !last) return;
    state.tx += event.clientX - last.x;
    state.ty += event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };
    els.canvas.style.setProperty('--tx', `${state.tx}px`);
    els.canvas.style.setProperty('--ty', `${state.ty}px`);
  });
  els.viewport.addEventListener('pointerup', () => { dragging = false; last = null; });
  els.viewport.addEventListener('wheel', event => {
    if (document.body.classList.contains('list')) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) setZoom(state.zoom + (event.deltaY > 0 ? -0.035 : 0.035));
    else {
      state.tx -= event.deltaX * 0.9;
      state.ty -= event.deltaY * 0.9;
      els.canvas.style.setProperty('--tx', `${state.tx}px`);
      els.canvas.style.setProperty('--ty', `${state.ty}px`);
    }
  }, { passive: false });
  window.addEventListener('resize', () => { if (state.mode === 'canvas') fitAll(); });
}

wireControls();
loadRecords().catch(error => {
  console.error(error);
  els.canvas.innerHTML = `<p class="mediaFallback">Failed to load archive records: ${escapeHtml(error.message)}</p>`;
});
