/* Sign: draw a signature and stamp it onto pages.
   This is a visual signature (image stamp), not a cryptographic digital signature. */
'use strict';

(() => {
  const state = {
    name: null,
    bytes: null,
    pdf: null,          // pdf.js document (kept open for previews)
    pageCount: 0,
    current: 0,         // current page index (0-based)
    placements: [],     // [{ pageIndex, xRatio, yRatio, widthRatio }] — center point ratios
    hasInk: false,
  };
  const status = $('sign-status');
  const pad = $('sign-pad');
  const padCtx = pad.getContext('2d');
  const preview = $('sign-preview');

  /* ---------- Signature pad ---------- */
  let drawing = false;
  padCtx.lineWidth = 2.5;
  padCtx.lineCap = 'round';
  padCtx.lineJoin = 'round';
  padCtx.strokeStyle = '#1a2b66';

  function padPos(e) {
    const r = pad.getBoundingClientRect();
    return [
      (e.clientX - r.left) * (pad.width / r.width),
      (e.clientY - r.top) * (pad.height / r.height),
    ];
  }
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drawing = true;
    state.hasInk = true;
    pad.setPointerCapture(e.pointerId);
    padCtx.beginPath();
    padCtx.moveTo(...padPos(e));
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    padCtx.lineTo(...padPos(e));
    padCtx.stroke();
  });
  pad.addEventListener('pointerup', () => {
    drawing = false;
    renderPreview();
  });

  $('sign-pad-clear').addEventListener('click', () => {
    padCtx.clearRect(0, 0, pad.width, pad.height);
    state.hasInk = false;
    renderPreview();
  });

  /* Crop the pad to its inked bounding box (transparent PNG). Null when empty. */
  function trimmedSignature() {
    if (!state.hasInk) return null;
    const { width, height } = pad;
    const data = padCtx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad2 = 4;
    minX = Math.max(0, minX - pad2); minY = Math.max(0, minY - pad2);
    maxX = Math.min(width - 1, maxX + pad2); maxY = Math.min(height - 1, maxY + pad2);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(pad, minX, minY, w, h, 0, 0, w, h);
    return c;
  }

  /* ---------- Page preview ---------- */
  async function renderPreview() {
    if (!state.pdf) return;
    const page = await state.pdf.getPage(state.current + 1);
    const base = page.getViewport({ scale: 1 });
    const rendered = await renderPageToCanvas(page, Math.min(1.5, 700 / base.width));
    preview.width = rendered.width;
    preview.height = rendered.height;
    const ctx = preview.getContext('2d');
    ctx.drawImage(rendered, 0, 0);

    // Composite placed signatures for this page.
    const sig = trimmedSignature();
    for (const p of state.placements) {
      if (p.pageIndex !== state.current) continue;
      const w = p.widthRatio * preview.width;
      const h = sig ? w * (sig.height / sig.width) : w * 0.3;
      const x = p.xRatio * preview.width - w / 2;
      const y = p.yRatio * preview.height - h / 2;
      if (sig) {
        ctx.drawImage(sig, x, y, w, h);
      }
      ctx.strokeStyle = 'rgba(79,140,255,0.8)';
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    $('sign-page-label').textContent = `Page ${state.current + 1} / ${state.pageCount}`;
  }

  preview.addEventListener('click', (e) => {
    if (!state.pdf) return;
    const r = preview.getBoundingClientRect();
    const xRatio = (e.clientX - r.left) / r.width;
    const yRatio = (e.clientY - r.top) / r.height;

    // Click on an existing placement removes it.
    const widthRatio = Number($('sign-width').value) / 100;
    const hit = state.placements.findIndex((p) =>
      p.pageIndex === state.current &&
      Math.abs(p.xRatio - xRatio) < p.widthRatio / 2 &&
      Math.abs(p.yRatio - yRatio) < p.widthRatio / 2);
    if (hit >= 0) {
      state.placements.splice(hit, 1);
    } else {
      if (!state.hasInk) {
        setStatus(status, 'Draw your signature first.', 'error');
        return;
      }
      state.placements.push({ pageIndex: state.current, xRatio, yRatio, widthRatio });
      setStatus(status, '');
    }
    renderPreview();
  });

  $('sign-prev').addEventListener('click', () => {
    if (state.current > 0) { state.current--; renderPreview(); }
  });
  $('sign-next').addEventListener('click', () => {
    if (state.current < state.pageCount - 1) { state.current++; renderPreview(); }
  });
  $('sign-width').addEventListener('input', () => {
    $('sign-width-val').textContent = $('sign-width').value;
  });

  /* ---------- Load / save ---------- */
  setupDropzone('sign-dropzone', 'sign-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (state.pdf) await state.pdf.destroy();
      state.name = file.name;
      state.bytes = bytes;
      state.pdf = await openWithPdfJs(bytes);
      state.pageCount = state.pdf.numPages;
      state.current = 0;
      state.placements = [];
      $('sign-workspace').classList.remove('hidden');
      setStatus(status, '');
      renderPreview();
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('sign-clear').addEventListener('click', async () => {
    if (state.pdf) await state.pdf.destroy();
    state.name = null;
    state.bytes = null;
    state.pdf = null;
    state.placements = [];
    $('sign-workspace').classList.add('hidden');
    setStatus(status, '');
  });

  $('sign-save').addEventListener('click', async () => {
    if (!state.bytes) return;
    const sig = trimmedSignature();
    if (!sig) {
      setStatus(status, 'Draw your signature first.', 'error');
      return;
    }
    if (!state.placements.length) {
      setStatus(status, 'Click on the page to place the signature first.', 'error');
      return;
    }
    const btn = $('sign-save');
    btn.disabled = true;
    try {
      setStatus(status, 'Stamping signature…');
      const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const png = await doc.embedPng(sig.toDataURL('image/png'));
      const aspect = sig.height / sig.width;
      const pages = doc.getPages();
      for (const p of state.placements) {
        const page = pages[p.pageIndex];
        const { width: pw, height: ph } = page.getSize();
        const w = p.widthRatio * pw;
        const h = w * aspect;
        page.drawImage(png, {
          x: p.xRatio * pw - w / 2,
          y: (1 - p.yRatio) * ph - h / 2,
          width: w,
          height: h,
        });
      }
      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-signed.pdf');
      setStatus(status, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
