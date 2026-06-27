const state = {
  records: [],
  release: 'all',
  type: 'all',
  query: '',
  sort: 'release',
  density: 'comfortable',
};

const els = {
  gallery: document.querySelector('#gallery'),
  count: document.querySelector('#recordCount'),
  total: document.querySelector('#totalCount'),
  thumbCount: document.querySelector('#thumbCount'),
  summary: document.querySelector('#resultSummary'),
  empty: document.querySelector('#emptyState'),
  search: document.querySelector('#searchInput'),
  sort: document.querySelector('#sortSelect'),
  dialog: document.querySelector('#recordDialog'),
  mediaPanel: document.querySelector('#mediaPanel'),
  dialogTitle: document.querySelector('#dialogTitle'),
  dialogDescription: document.querySelector('#dialogDescription'),
  dialogType: document.querySelector('#dialogType'),
  dialogMeta: document.querySelector('#dialogMeta'),
  dialogActions: document.querySelector('#dialogActions'),
  aboutBtn: document.querySelector('#aboutBtn'),
  comfortableMode: document.querySelector('#comfortableMode'),
  compactMode: document.querySelector('#compactMode'),
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

const typeLabel = { PDF: 'pdf', VID: 'video', AUD: 'audio' };
const clean = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const escapeHtml = value => clean(value).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

function slugify(text) {
  return clean(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function enrichRecord(record, index) {
  const title = clean(record.title) || `Record ${index + 1}`;
  const type = clean(record.type).toUpperCase();
  const release = clean(record.release_date);
  const dvids = clean(record.dvids_video_id);
  const id = `${releaseShort[release] || 'RX'}-${type}-${String(index + 1).padStart(3, '0')}-${slugify(title)}`;
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
    thumbnail_url: clean(record.thumbnail_url),
    local_file_path: clean(record.local_file_path),
    searchable: [title, type, record.agency, record.incident_date, record.incident_location, record.description, dvids, record.video_title]
      .map(clean).join(' ').toLowerCase(),
  };
}

async function loadRecords() {
  const res = await fetch('./data/records.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`records fetch failed: ${res.status}`);
  const raw = await res.json();
  state.records = raw.map(enrichRecord);
  els.total.textContent = state.records.length;
  els.thumbCount.textContent = state.records.filter(r => r.thumbnail_url).length;
  render();
}

function filteredRecords() {
  const q = state.query.toLowerCase();
  const list = state.records.filter(record => {
    if (state.release !== 'all' && record.release !== state.release) return false;
    if (state.type !== 'all' && record.type !== state.type) return false;
    if (q && !record.searchable.includes(q)) return false;
    return true;
  });
  return list.sort((a, b) => {
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'agency') return a.agency.localeCompare(b.agency) || a.title.localeCompare(b.title);
    if (state.sort === 'type') return a.type.localeCompare(b.type) || a.title.localeCompare(b.title);
    return (a.release_short + String(a.index).padStart(4, '0')).localeCompare(b.release_short + String(b.index).padStart(4, '0'));
  });
}

function render() {
  const records = filteredRecords();
  const fragment = document.createDocumentFragment();
  records.forEach(record => fragment.append(cardNode(record)));
  els.gallery.replaceChildren(fragment);
  els.count.textContent = records.length;
  els.empty.hidden = records.length !== 0;
  els.summary.textContent = summaryText(records);
}

function summaryText(records) {
  if (!records.length) return 'No matching records.';
  const pdf = records.filter(r => r.type === 'PDF').length;
  const vid = records.filter(r => r.type === 'VID').length;
  const aud = records.filter(r => r.type === 'AUD').length;
  return `${records.length} visible records · ${pdf} PDFs · ${vid} videos · ${aud} audio records`;
}

function cardNode(record) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  node.dataset.id = record.id;
  node.dataset.type = record.type;
  node.setAttribute('aria-label', `Open ${record.title}`);

  const img = node.querySelector('.thumb');
  const fallback = node.querySelector('.thumbFallback');
  if (record.thumbnail_url) {
    img.src = record.thumbnail_url;
    img.alt = `${record.title} thumbnail`;
    fallback.remove();
  } else {
    img.remove();
    fallback.textContent = record.type === 'PDF' ? '▧' : record.type === 'AUD' ? '≋' : '▶';
  }

  node.querySelector('.releasePill').textContent = record.release_short;
  node.querySelector('.typePill').textContent = typeLabel[record.type] || record.type;
  node.querySelector('.agencyPill').textContent = record.agency;
  node.querySelector('.cardTitle').textContent = record.title;
  node.querySelector('.cardSub').textContent = `${record.incident_date} · ${record.incident_location}`;
  node.addEventListener('click', () => openRecord(record));
  return node;
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
    metaRow('Local archive file', record.local_file_path || 'Not mapped'),
    metaRow('DVIDS ID', record.dvids_video_id || 'N/A'),
  ].join('');
  els.mediaPanel.innerHTML = mediaMarkup(record);
  els.dialogActions.innerHTML = actionMarkup(record);
  els.dialog.showModal();
}

function mediaMarkup(record) {
  const thumb = record.thumbnail_url ? `<img class="dialogThumb" src="${escapeHtml(record.thumbnail_url)}" alt="${escapeHtml(record.title)} preview" />` : '';
  if (record.type === 'PDF') {
    return `<div class="previewPlate pdfPlate">${thumb}<div class="previewCaption"><span>PDF first page preview</span><p>Open the official source to view or download the complete document.</p></div></div>`;
  }
  if (record.type === 'VID' || record.type === 'AUD') {
    const label = record.type === 'AUD' ? 'Audio/video poster generated from local archive' : 'Video poster generated from local archive';
    return `<div class="previewPlate videoPlate">${thumb}<div class="previewCaption"><span>${escapeHtml(label)}</span><p>The full media file is too large for GitHub Pages; use official DVIDS/WAR.gov links for playback/download.</p></div></div>`;
  }
  return `<div class="previewPlate"><div class="thumbFallback">◌</div><div class="previewCaption"><span>Preview unavailable</span><p>No local preview derivative is mapped for this record.</p></div></div>`;
}

function actionMarkup(record) {
  const actions = [];
  if (record.type === 'PDF' && record.source_url) {
    actions.push(`<a class="primary" href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">open official pdf</a>`);
    actions.push(`<a href="${escapeHtml(record.source_url)}" download>download source</a>`);
  }
  if ((record.type === 'VID' || record.type === 'AUD') && record.dvids_url) {
    actions.push(`<a class="primary" href="${escapeHtml(record.dvids_url)}" target="_blank" rel="noreferrer">open dvids</a>`);
  }
  if (record.source_url && record.type !== 'PDF') actions.push(`<a href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">source document</a>`);
  actions.push(`<a href="https://www.war.gov/UFO/" target="_blank" rel="noreferrer">war.gov portal</a>`);
  return actions.join('');
}

function wireControls() {
  els.search.addEventListener('input', event => {
    state.query = event.target.value;
    render();
  });
  els.sort.addEventListener('change', event => {
    state.sort = event.target.value;
    render();
  });
  document.querySelectorAll('.filterGroup').forEach(group => {
    group.addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      group.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      state[group.dataset.filter] = button.dataset.value;
      render();
    });
  });
  els.comfortableMode.addEventListener('click', () => setDensity('comfortable'));
  els.compactMode.addEventListener('click', () => setDensity('compact'));
  els.aboutBtn.addEventListener('click', () => openRecord({
    title: 'About the PURSUE Archive gallery',
    type: 'PDF',
    release_label: 'Project note',
    release: 'N/A',
    agency: 'WAR.gov / GitHub Pages',
    incident_date: '2026',
    incident_location: 'Public release archive',
    description: 'A static formal gallery for WAR.gov UAP/PURSUE disclosure records. This revision uses generated local thumbnails while preserving official source links for originals.',
    source_url: 'https://www.war.gov/UFO/',
  }));
}

function setDensity(mode) {
  state.density = mode;
  document.body.classList.toggle('compact', mode === 'compact');
  els.comfortableMode.classList.toggle('active', mode === 'comfortable');
  els.compactMode.classList.toggle('active', mode === 'compact');
}

wireControls();
loadRecords().catch(err => {
  console.error(err);
  els.summary.textContent = 'Could not load records.json. See console for details.';
});
