/* Add Image: visually place an image onto PDF pages. */
'use strict';

(() => {
  const HANDLE = 8;
  const HANDLE_NAMES = ['tl', 'tm', 'tr', 'mr', 'br', 'bm', 'bl', 'ml'];
  const CURSOR_MAP = {
    tl: 'nwse-resize', tm: 'ns-resize',  tr: 'nesw-resize',
    mr: 'ew-resize',   br: 'nwse-resize', bm: 'ns-resize',
    bl: 'nesw-resize', ml: 'ew-resize',
  };

  const state = {
    name: null,
    bytes: null,
    pdfJs: null,
    pageCount: 0,
    current: 0,
    scale: 1,
    imgEl: null,
    imgBytes: null,
    imgMime: null,
    ratioRect: null,  // {x,y,w,h} as fractions of canvas dimensions; null = not placed
    drag: null,
    pageCanvas: null, // cached page render (offscreen canvas)
  };

  const canvas = $('addimage-canvas');
  const ctx = canvas.getContext('2d');
  const status = $('addimage-status');

  /* ---- Coordinate helpers ---- */

  function toPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }

  function toRatio(r) {
    return { x: r.x / canvas.width, y: r.y / canvas.height, w: r.w / canvas.width, h: r.h / canvas.height };
  }

  function handlePositions() {
    if (!state.ratioRect) return [];
    const { x, y, w, h } = toPx(state.ratioRect);
    return [
      [x,       y      ],
      [x + w/2, y      ],
      [x + w,   y      ],
      [x + w,   y + h/2],
      [x + w,   y + h  ],
      [x + w/2, y + h  ],
      [x,       y + h  ],
      [x,       y + h/2],
    ];
  }

  /* ---- Rendering ---- */

  function redraw() {
    if (!state.pageCanvas) return;
    ctx.drawImage(state.pageCanvas, 0, 0);
    if (!state.ratioRect || !state.imgEl) return;

    const { x, y, w, h } = toPx(state.ratioRect);
    ctx.drawImage(state.imgEl, x, y, w, h);

    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 1.5;
    for (const [hx, hy] of handlePositions()) {
      ctx.beginPath();
      ctx.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
      ctx.fill();
      ctx.stroke();
    }
  }

  async function renderPage() {
    if (!state.pdfJs) return;
    const page = await state.pdfJs.getPage(state.current + 1);
    const base = page.getViewport({ scale: 1 });
    state.scale = Math.min(1.5, 700 / base.width);
    const vp = page.getViewport({ scale: state.scale });

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.ceil(vp.width);
    offscreen.height = Math.ceil(vp.height);
    const offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#fff';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    await page.render({ canvasContext: offCtx, viewport: vp }).promise;
    state.pageCanvas = offscreen;

    canvas.width = offscreen.width;
    canvas.height = offscreen.height;

    // Auto-place image at center on first load
    if (state.imgEl && !state.ratioRect) {
      const aspect = state.imgEl.naturalHeight / state.imgEl.naturalWidth;
      const rw = 0.4;
      const rh = (rw * canvas.width * aspect) / canvas.height;
      state.ratioRect = { x: (1 - rw) / 2, y: (1 - rh) / 2, w: rw, h: rh };
    }

    redraw();
    $('addimage-page-label').textContent = `Page ${state.current + 1} / ${state.pageCount}`;
  }

  /* ---- Pointer interaction ---- */

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return [
      (e.clientX - r.left) * (canvas.width / r.width),
      (e.clientY - r.top) * (canvas.height / r.height),
    ];
  }

  function hitHandle(cx, cy) {
    const positions = handlePositions();
    for (let i = 0; i < positions.length; i++) {
      const [hx, hy] = positions[i];
      if (Math.abs(cx - hx) <= HANDLE + 2 && Math.abs(cy - hy) <= HANDLE + 2) return HANDLE_NAMES[i];
    }
    return null;
  }

  function hitRect(cx, cy) {
    if (!state.ratioRect) return false;
    const { x, y, w, h } = toPx(state.ratioRect);
    return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
  }

  function applyResize(handle, o, dx, dy) {
    let { x, y, w, h } = o;
    const MIN = 20;
    if      (handle === 'tl') { x += dx; y += dy; w -= dx; h -= dy; }
    else if (handle === 'tm') { y += dy; h -= dy; }
    else if (handle === 'tr') { w += dx; y += dy; h -= dy; }
    else if (handle === 'mr') { w += dx; }
    else if (handle === 'br') { w += dx; h += dy; }
    else if (handle === 'bm') { h += dy; }
    else if (handle === 'bl') { x += dx; w -= dx; h += dy; }
    else if (handle === 'ml') { x += dx; w -= dx; }
    if (w < MIN) { if (handle === 'tl' || handle === 'bl' || handle === 'ml') x = o.x + o.w - MIN; w = MIN; }
    if (h < MIN) { if (handle === 'tl' || handle === 'tm' || handle === 'tr') y = o.y + o.h - MIN; h = MIN; }
    return { x, y, w, h };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.ratioRect || !state.imgEl) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const [cx, cy] = canvasPos(e);
    const handle = hitHandle(cx, cy);
    const origPx = toPx(state.ratioRect);
    if (handle) {
      state.drag = { mode: 'resize', handle, startX: cx, startY: cy, origPx };
    } else if (hitRect(cx, cy)) {
      state.drag = { mode: 'move', startX: cx, startY: cy, origPx };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.ratioRect) return;
    const [cx, cy] = canvasPos(e);
    if (state.drag) {
      e.preventDefault();
      const dx = cx - state.drag.startX;
      const dy = cy - state.drag.startY;
      const r = state.drag.mode === 'move'
        ? { ...state.drag.origPx, x: state.drag.origPx.x + dx, y: state.drag.origPx.y + dy }
        : applyResize(state.drag.handle, state.drag.origPx, dx, dy);
      state.ratioRect = toRatio(r);
      redraw();
    } else {
      const handle = hitHandle(cx, cy);
      canvas.style.cursor = handle ? CURSOR_MAP[handle] : hitRect(cx, cy) ? 'move' : 'default';
    }
  });

  canvas.addEventListener('pointerup', () => { state.drag = null; });

  /* ---- Page navigation ---- */

  $('addimage-prev').addEventListener('click', () => {
    if (state.current > 0) { state.current--; renderPage(); }
  });
  $('addimage-next').addEventListener('click', () => {
    if (state.current < state.pageCount - 1) { state.current++; renderPage(); }
  });

  /* ---- PDF upload ---- */

  setupDropzone('addimage-dropzone', 'addimage-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (state.pdfJs) await state.pdfJs.destroy();
      state.name = file.name;
      state.bytes = bytes;
      state.pdfJs = await openWithPdfJs(bytes);
      state.pageCount = state.pdfJs.numPages;
      state.current = 0;
      state.ratioRect = null;
      $('addimage-workspace').classList.remove('hidden');
      $('addimage-dropzone').classList.add('hidden');
      setStatus(status, '');
      await renderPage();
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  /* ---- Image upload ---- */

  function loadImage(file) {
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setStatus(status, 'Only PNG, JPEG, or WebP supported.', 'error');
      return;
    }
    file.arrayBuffer().then((buf) => {
      const mime = file.type || (/\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg');
      const url = URL.createObjectURL(new Blob([buf], { type: mime }));
      const img = new Image();
      img.onload = () => {
        state.imgEl = img;
        state.imgBytes = new Uint8Array(buf);
        state.imgMime = mime;
        state.ratioRect = null;
        URL.revokeObjectURL(url);
        renderPage();
        $('addimage-img-zone').classList.add('hidden');
        $('addimage-img-info').classList.remove('hidden');
        $('addimage-img-name').textContent = file.name;
        setStatus(status, 'Image loaded. Drag to position, drag handles to resize.');
      };
      img.src = url;
    });
  }

  setupDropzone('addimage-img-zone', 'addimage-img-input',
    (files) => loadImage(files[0]),
    (f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));

  $('addimage-change-img').addEventListener('click', () => {
    state.imgEl = null;
    state.imgBytes = null;
    state.ratioRect = null;
    $('addimage-img-zone').classList.remove('hidden');
    $('addimage-img-info').classList.add('hidden');
    redraw();
  });

  /* ---- Save ---- */

  $('addimage-save').addEventListener('click', async () => {
    if (!state.bytes)    { setStatus(status, 'Load a PDF first.', 'error'); return; }
    if (!state.imgEl)    { setStatus(status, 'Add an image first.', 'error'); return; }
    if (!state.ratioRect){ setStatus(status, 'Position the image on the canvas first.', 'error'); return; }

    const btn = $('addimage-save');
    btn.disabled = true;
    try {
      setStatus(status, 'Saving…');
      const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const pages = doc.getPages();

      const applyTo = document.querySelector('input[name="addimage-pages"]:checked').value;
      let targetIndices;
      if (applyTo === 'all') {
        targetIndices = pages.map((_, i) => i);
      } else if (applyTo === 'current') {
        targetIndices = [state.current];
      } else {
        targetIndices = parsePageRange($('addimage-range').value, state.pageCount);
      }

      // pdf-lib supports JPEG and PNG only; convert WebP/other via canvas
      let embedBytes = state.imgBytes;
      let embedMime = state.imgMime;
      if (!embedMime.includes('jpeg') && !embedMime.includes('png')) {
        const c = document.createElement('canvas');
        c.width = state.imgEl.naturalWidth;
        c.height = state.imgEl.naturalHeight;
        c.getContext('2d').drawImage(state.imgEl, 0, 0);
        embedBytes = await new Promise((res) =>
          c.toBlob((b) => b.arrayBuffer().then((buf) => res(new Uint8Array(buf))), 'image/png'));
        embedMime = 'image/png';
      }

      const embedded = embedMime.includes('png')
        ? await doc.embedPng(embedBytes)
        : await doc.embedJpg(embedBytes);

      const { x: rx, y: ry, w: rw, h: rh } = state.ratioRect;
      for (const idx of targetIndices) {
        const page = pages[idx];
        const { width: pw, height: ph } = page.getSize();
        // PDF origin is bottom-left; canvas origin is top-left — flip Y
        page.drawImage(embedded, {
          x: rx * pw,
          y: (1 - ry - rh) * ph,
          width: rw * pw,
          height: rh * ph,
        });
      }

      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-edited.pdf');
      setStatus(status, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('addimage-clear').addEventListener('click', async () => {
    if (state.pdfJs) await state.pdfJs.destroy();
    Object.assign(state, {
      name: null, bytes: null, pdfJs: null, pageCanvas: null,
      ratioRect: null, imgEl: null, imgBytes: null, imgMime: null,
    });
    $('addimage-workspace').classList.add('hidden');
    $('addimage-dropzone').classList.remove('hidden');
    $('addimage-img-zone').classList.remove('hidden');
    $('addimage-img-info').classList.add('hidden');
    setStatus(status, '');
  });
})();
