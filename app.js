/* PDF Toolbox — merge, reorder, compress. All client-side. */
'use strict';

const { PDFDocument } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ============ Shared helpers ============ */

function $(id) { return document.getElementById(id); }

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
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

/* Wire a dropzone + hidden input. onFiles receives an array of PDF File objects. */
function setupDropzone(zoneId, inputId, onFiles) {
  const zone = $(zoneId);
  const input = $(inputId);

  zone.addEventListener('click', () => input.click());
  zone.querySelector('.link-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    input.click();
  });

  input.addEventListener('change', () => {
    const files = Array.from(input.files).filter(isPdf);
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
    const files = Array.from(e.dataTransfer.files).filter(isPdf);
    if (files.length) onFiles(files);
  });
}

/* Generic HTML5 drag-to-reorder for a container's direct children.
   getOrder/setOrder operate on the backing array; render() redraws. */
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

/* ============ MERGE ============ */

const mergeFiles = []; // { name, size, bytes (Uint8Array), pageCount }

const mergeList = $('merge-list');
const mergeStatus = $('merge-status');

function renderMergeList() {
  mergeList.innerHTML = '';
  mergeFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.draggable = true;
    li.dataset.index = i;
    li.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="file-name" title="${f.name}">${f.name}</span>
      <span class="file-pages">${f.pageCount} page${f.pageCount === 1 ? '' : 's'}</span>
      <span class="file-size">${formatBytes(f.size)}</span>
      <button class="icon-btn" data-action="up" title="Move up">↑</button>
      <button class="icon-btn" data-action="down" title="Move down">↓</button>
      <button class="icon-btn remove" data-action="remove" title="Remove">✕</button>
    `;
    mergeList.appendChild(li);
  });
  $('merge-actions').classList.toggle('hidden', mergeFiles.length === 0);
  $('merge-btn').disabled = mergeFiles.length < 2;
}

mergeList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const i = Number(btn.closest('.file-item').dataset.index);
  const action = btn.dataset.action;
  if (action === 'remove') mergeFiles.splice(i, 1);
  else if (action === 'up' && i > 0) [mergeFiles[i - 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i - 1]];
  else if (action === 'down' && i < mergeFiles.length - 1) [mergeFiles[i + 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i + 1]];
  renderMergeList();
});

makeSortable(mergeList, mergeFiles, renderMergeList);

setupDropzone('merge-dropzone', 'merge-input', async (files) => {
  setStatus(mergeStatus, 'Reading files…');
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      mergeFiles.push({ name: file.name, size: file.size, bytes, pageCount: doc.getPageCount() });
    } catch (err) {
      setStatus(mergeStatus, `Could not read "${file.name}": ${err.message}`, 'error');
      renderMergeList();
      return;
    }
  }
  setStatus(mergeStatus, '');
  renderMergeList();
});

$('merge-clear').addEventListener('click', () => {
  mergeFiles.length = 0;
  setStatus(mergeStatus, '');
  renderMergeList();
});

$('merge-btn').addEventListener('click', async () => {
  if (mergeFiles.length < 2) return;
  const btn = $('merge-btn');
  btn.disabled = true;
  try {
    const merged = await PDFDocument.create();
    for (let i = 0; i < mergeFiles.length; i++) {
      setStatus(mergeStatus, `Merging ${i + 1} / ${mergeFiles.length}: ${mergeFiles[i].name}`);
      const src = await PDFDocument.load(mergeFiles[i].bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const out = await merged.save();
    downloadBlob(out, 'merged.pdf');
    setStatus(mergeStatus, `Done — merged.pdf (${formatBytes(out.length)}) downloaded.`, 'success');
  } catch (err) {
    setStatus(mergeStatus, 'Merge failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

/* ============ REORDER ============ */

const reorderState = {
  name: null,
  bytes: null,        // Uint8Array (kept for pdf-lib save)
  pages: [],          // [{ origIndex, thumbDataUrl }] in current display order
  originalCount: 0,
};

const reorderGrid = $('reorder-grid');
const reorderStatus = $('reorder-status');

function renderReorderGrid() {
  reorderGrid.innerHTML = '';
  reorderState.pages.forEach((page, i) => {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.draggable = true;
    card.dataset.index = i;
    card.innerHTML = `
      <img src="${page.thumbDataUrl}" alt="Page ${page.origIndex + 1}" draggable="false" />
      <span class="page-num">#${i + 1} <small>(was ${page.origIndex + 1})</small></span>
      <button class="remove-page" title="Remove page">✕</button>
    `;
    reorderGrid.appendChild(card);
  });
  const has = reorderState.pages.length > 0;
  $('reorder-actions').classList.toggle('hidden', !reorderState.bytes);
  $('reorder-save').disabled = !has;
}

reorderGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-page');
  if (!btn) return;
  const i = Number(btn.closest('.page-card').dataset.index);
  reorderState.pages.splice(i, 1);
  renderReorderGrid();
});

makeSortable(reorderGrid, reorderState.pages, renderReorderGrid);

async function renderThumbnails(bytes) {
  // pdf.js takes ownership of the buffer, so pass a copy.
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    setStatus(reorderStatus, `Rendering page ${n} / ${pdf.numPages}…`);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 220 / viewport.width; // thumbnail width ≈ 220px
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    pages.push({ origIndex: n - 1, thumbDataUrl: canvas.toDataURL('image/jpeg', 0.7) });
  }
  await pdf.destroy();
  return pages;
}

setupDropzone('reorder-dropzone', 'reorder-input', async (files) => {
  const file = files[0];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await PDFDocument.load(bytes, { ignoreEncryption: true }); // validate early
    reorderState.name = file.name;
    reorderState.bytes = bytes;
    reorderState.pages = await renderThumbnails(bytes);
    reorderState.originalCount = reorderState.pages.length;
    $('reorder-meta').classList.remove('hidden');
    $('reorder-meta').innerHTML =
      `<strong>${file.name}</strong> — ${reorderState.originalCount} pages, ${formatBytes(file.size)}`;
    setStatus(reorderStatus, '');
    renderReorderGrid();
  } catch (err) {
    setStatus(reorderStatus, `Could not read "${file.name}": ${err.message}`, 'error');
  }
});

$('reorder-save').addEventListener('click', async () => {
  const btn = $('reorder-save');
  btn.disabled = true;
  try {
    setStatus(reorderStatus, 'Building PDF…');
    const src = await PDFDocument.load(reorderState.bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const indices = reorderState.pages.map((p) => p.origIndex);
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    const saved = await out.save();
    downloadBlob(saved, baseName(reorderState.name) + '-reordered.pdf');
    setStatus(reorderStatus, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
  } catch (err) {
    setStatus(reorderStatus, 'Save failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('reorder-reset').addEventListener('click', () => {
  reorderState.pages.sort((a, b) => a.origIndex - b.origIndex);
  // Re-add removed pages is not possible without re-render; reset only restores order.
  renderReorderGrid();
});

$('reorder-clear').addEventListener('click', () => {
  reorderState.name = null;
  reorderState.bytes = null;
  reorderState.pages = [];
  $('reorder-meta').classList.add('hidden');
  setStatus(reorderStatus, '');
  renderReorderGrid();
});

/* ============ COMPRESS ============ */

const QUALITY_PRESETS = {
  low:    { scale: 1.2, jpeg: 0.4 },  // strong compression
  medium: { scale: 1.5, jpeg: 0.6 },  // balanced
  high:   { scale: 2.0, jpeg: 0.75 }, // light compression
};
const MAX_RENDER_DIM = 4000; // px cap to avoid huge canvases

const compressState = { name: null, size: 0, bytes: null };
const compressStatus = $('compress-status');

setupDropzone('compress-dropzone', 'compress-input', async (files) => {
  const file = files[0];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    compressState.name = file.name;
    compressState.size = file.size;
    compressState.bytes = bytes;
    $('compress-meta').classList.remove('hidden');
    $('compress-meta').innerHTML =
      `<strong>${file.name}</strong> — ${doc.getPageCount()} pages, ${formatBytes(file.size)}`;
    $('compress-options').classList.remove('hidden');
    $('compress-actions').classList.remove('hidden');
    $('compress-result').classList.add('hidden');
    setStatus(compressStatus, '');
  } catch (err) {
    setStatus(compressStatus, `Could not read "${file.name}": ${err.message}`, 'error');
  }
});

$('compress-clear').addEventListener('click', () => {
  compressState.name = null;
  compressState.bytes = null;
  ['compress-meta', 'compress-options', 'compress-actions', 'compress-result']
    .forEach((id) => $(id).classList.add('hidden'));
  setStatus(compressStatus, '');
});

$('compress-btn').addEventListener('click', async () => {
  if (!compressState.bytes) return;
  const btn = $('compress-btn');
  btn.disabled = true;
  $('compress-result').classList.add('hidden');

  const preset = QUALITY_PRESETS[document.querySelector('input[name="quality"]:checked').value];

  try {
    const pdf = await pdfjsLib.getDocument({ data: compressState.bytes.slice() }).promise;
    const out = await PDFDocument.create();

    for (let n = 1; n <= pdf.numPages; n++) {
      setStatus(compressStatus, `Compressing page ${n} / ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 }); // 1 unit = 1 PDF point

      let scale = preset.scale;
      const maxSide = Math.max(base.width, base.height) * scale;
      if (maxSide > MAX_RENDER_DIM) scale = MAX_RENDER_DIM / Math.max(base.width, base.height);

      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // JPEG has no alpha; avoid black background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', preset.jpeg);
      const img = await out.embedJpg(dataUrl);
      const outPage = out.addPage([base.width, base.height]);
      outPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });

      canvas.width = canvas.height = 0; // free canvas memory
    }
    await pdf.destroy();

    const saved = await out.save();
    const before = compressState.size;
    const after = saved.length;

    if (after >= before) {
      setStatus(compressStatus,
        `Result (${formatBytes(after)}) is not smaller than the original (${formatBytes(before)}). ` +
        'This PDF is likely already optimized — try the "Strong" level, or keep the original.', 'error');
    } else {
      downloadBlob(saved, baseName(compressState.name) + '-compressed.pdf');
      const pct = ((1 - after / before) * 100).toFixed(0);
      const result = $('compress-result');
      result.classList.remove('hidden');
      result.innerHTML =
        `${formatBytes(before)} → ${formatBytes(after)} ` +
        `<span class="savings">(−${pct}%)</span> — downloaded.`;
      setStatus(compressStatus, '');
    }
  } catch (err) {
    setStatus(compressStatus, 'Compression failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});
