/* Reorder, rotate and delete pages. */
'use strict';

(() => {
  const state = {
    name: null,
    bytes: null,
    pages: [], // [{ origIndex, rotation (0/90/180/270 extra), thumbDataUrl, baseThumbDataUrl }]
  };
  const grid = $('reorder-grid');
  const status = $('reorder-status');

  function render() {
    grid.innerHTML = '';
    state.pages.forEach((page, i) => {
      const card = document.createElement('div');
      card.className = 'page-card';
      card.draggable = true;
      card.dataset.index = i;
      const rot = page.rotation ? ` · ↻${page.rotation}°` : '';
      card.innerHTML = `
        <img src="${page.thumbDataUrl}" alt="Page ${page.origIndex + 1}" draggable="false" />
        <span class="page-num">#${i + 1} <small>(was ${page.origIndex + 1}${rot})</small></span>
        <button class="rotate-page" title="Rotate 90°">↻</button>
        <button class="remove-page" title="Remove page">✕</button>
      `;
      grid.appendChild(card);
    });
    $('reorder-actions').classList.toggle('hidden', !state.bytes);
    $('reorder-save').disabled = state.pages.length === 0;
  }

  /* Redraw a thumbnail rotated by `deg` clockwise. */
  function rotateThumb(dataUrl, deg) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const swap = deg === 90 || deg === 270;
        const canvas = document.createElement('canvas');
        canvas.width = swap ? img.height : img.width;
        canvas.height = swap ? img.width : img.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = dataUrl;
    });
  }

  grid.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.remove-page');
    const rotateBtn = e.target.closest('.rotate-page');
    if (!removeBtn && !rotateBtn) return;
    const i = Number(e.target.closest('.page-card').dataset.index);
    if (removeBtn) {
      state.pages.splice(i, 1);
    } else {
      const page = state.pages[i];
      page.rotation = (page.rotation + 90) % 360;
      page.thumbDataUrl = page.rotation === 0
        ? page.baseThumbDataUrl
        : await rotateThumb(page.baseThumbDataUrl, page.rotation);
    }
    render();
  });

  makeSortable(grid, state.pages, render);

  async function renderThumbnails(bytes) {
    const pdf = await openWithPdfJs(bytes);
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      setStatus(status, `Rendering page ${n} / ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      const scale = 220 / page.getViewport({ scale: 1 }).width;
      const canvas = await renderPageToCanvas(page, scale);
      const thumb = canvas.toDataURL('image/jpeg', 0.7);
      pages.push({ origIndex: n - 1, rotation: 0, thumbDataUrl: thumb, baseThumbDataUrl: thumb });
    }
    await pdf.destroy();
    return pages;
  }

  setupDropzone('reorder-dropzone', 'reorder-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await PDFDocument.load(bytes, { ignoreEncryption: true }); // validate early
      state.name = file.name;
      state.bytes = bytes;
      state.pages = await renderThumbnails(bytes);
      $('reorder-meta').classList.remove('hidden');
      $('reorder-meta').innerHTML =
        `<strong>${file.name}</strong> — ${state.pages.length} pages, ${formatBytes(file.size)}`;
      setStatus(status, '');
      render();
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('reorder-save').addEventListener('click', async () => {
    const btn = $('reorder-save');
    btn.disabled = true;
    try {
      setStatus(status, 'Building PDF…');
      const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const indices = state.pages.map((p) => p.origIndex);
      const copied = await out.copyPages(src, indices);
      copied.forEach((page, i) => {
        const extra = state.pages[i].rotation;
        if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
        out.addPage(page);
      });
      const saved = await out.save();
      downloadBlob(saved, baseName(state.name) + '-reordered.pdf');
      setStatus(status, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Save failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('reorder-reset').addEventListener('click', () => {
    state.pages.sort((a, b) => a.origIndex - b.origIndex);
    state.pages.forEach((p) => {
      p.rotation = 0;
      p.thumbDataUrl = p.baseThumbDataUrl;
    });
    render();
  });

  $('reorder-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    state.pages = [];
    $('reorder-meta').classList.add('hidden');
    setStatus(status, '');
    render();
  });
})();
