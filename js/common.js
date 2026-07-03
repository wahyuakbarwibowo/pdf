/* PDF Toolbox — shared helpers. All processing is client-side. */
'use strict';

const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib;
// Same-origin worker: cross-origin workerSrc can hang pdf.js's fallback loader.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

function $(id) { return document.getElementById(id); }

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function downloadBlob(data, filename, mime = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function baseName(filename) {
  return filename.replace(/\.pdf$/i, '');
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (kind) el.classList.add(kind);
}

function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/* Wire a dropzone + hidden input. onFiles receives accepted File objects. */
function setupDropzone(zoneId, inputId, onFiles, accept = isPdf) {
  const zone = $(zoneId);
  const input = $(inputId);

  zone.addEventListener('click', () => input.click());
  zone.querySelector('.link-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    input.click();
  });

  input.addEventListener('change', () => {
    const files = Array.from(input.files).filter(accept);
    if (files.length) onFiles(files);
    input.value = '';
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(accept);
    if (files.length) onFiles(files);
  });
}

/* Generic HTML5 drag-to-reorder for a container's [draggable] children. */
function makeSortable(container, items, render) {
  let dragIndex = null;

  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[draggable]');
    if (!card) return;
    dragIndex = Number(card.dataset.index);
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const card = e.target.closest('[draggable]');
    container.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    if (card && Number(card.dataset.index) !== dragIndex) card.classList.add('drag-over');
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const card = e.target.closest('[draggable]');
    if (!card || dragIndex === null) return;
    const dropIndex = Number(card.dataset.index);
    if (dropIndex !== dragIndex) {
      const [moved] = items.splice(dragIndex, 1);
      items.splice(dropIndex, 0, moved);
      render();
    }
    dragIndex = null;
  });

  container.addEventListener('dragend', () => {
    dragIndex = null;
    container.querySelectorAll('.dragging, .drag-over')
      .forEach((el) => el.classList.remove('dragging', 'drag-over'));
  });
}

/* Wire a single-PDF panel: dropzone reads the file, loads it, stores state, fills
   #<prefix>-meta, and reveals #<prefix>-options / #<prefix>-actions.
   onReady(doc, file) runs after, for panel-specific setup. */
function setupPdfPanel(prefix, state, status, onReady, loadOpts = { ignoreEncryption: true }) {
  setupDropzone(`${prefix}-dropzone`, `${prefix}-input`, async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, loadOpts);
      state.name = file.name;
      state.bytes = bytes;
      state.pageCount = doc.getPageCount();
      $(`${prefix}-meta`).innerHTML =
        `<strong>${file.name}</strong> — ${state.pageCount} pages, ${formatBytes(file.size)}`;
      [`${prefix}-meta`, `${prefix}-options`, `${prefix}-actions`]
        .forEach((id) => $(id).classList.remove('hidden'));
      setStatus(status, '');
      if (onReady) onReady(doc, file);
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });
}

/* Reset a single-PDF panel: null state.name/bytes and hide its sections. */
function resetPdfPanel(prefix, state, status, extra = []) {
  state.name = null;
  state.bytes = null;
  [`${prefix}-meta`, `${prefix}-options`, `${prefix}-actions`, ...extra]
    .forEach((id) => $(id).classList.add('hidden'));
  setStatus(status, '');
}

/* Render one pdf.js page to a canvas at the given scale. Returns the canvas. */
async function renderPageToCanvas(page, scale, background = '#fff') {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

/* Open a PDF with pdf.js. Pass a copy — pdf.js takes ownership of the buffer. */
function openWithPdfJs(bytes, extra = {}) {
  return pdfjsLib.getDocument({ data: bytes.slice(), ...extra }).promise;
}

/* Lazy-load an external script once. */
const _loadedScripts = {};
function loadScript(src) {
  if (!_loadedScripts[src]) {
    _loadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  return _loadedScripts[src];
}

/* Parse a page-range string like "1-3, 5, 8-10" into 0-based indices.
   Throws on invalid input. maxPage is 1-based page count. */
function parsePageRange(text, maxPage) {
  const indices = [];
  for (const part of text.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const m = piece.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid range "${piece}"`);
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    if (start < 1 || end > maxPage || start > end) {
      throw new Error(`Range "${piece}" is out of bounds (1-${maxPage})`);
    }
    for (let p = start; p <= end; p++) indices.push(p - 1);
  }
  if (!indices.length) throw new Error('No pages selected');
  return indices;
}

/* ============ Tabs ============ */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    $('panel-' + tab.dataset.tab).classList.add('active');
  });
});
