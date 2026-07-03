/* Edit: add images and text overlays onto PDF pages.
   Multiple items supported; each item can be independently moved/resized/deleted. */
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
    name: null, bytes: null, pdfJs: null, pageCount: 0, current: 0, scale: 1,
    items: [],      // {type:'image'|'text', rx, ry, ...}
    selected: -1,
    tool: 'select', // 'select' | 'addtext'
    drag: null,
    pageCanvas: null,
  };

  const canvas = $('edit-canvas');
  const ctx    = canvas.getContext('2d');
  const status = $('edit-status');

  /* ---- Bounding boxes ---- */

  // All items share rx,ry = top-left as fraction of canvas dimensions.
  // Images also have rw,rh. Text height is derived from fontSize*scale.
  function getBBox(item) {
    const W = canvas.width, H = canvas.height;
    if (item.type === 'image') {
      return { x: item.rx * W, y: item.ry * H, w: item.rw * W, h: item.rh * H };
    }
    // text: measure using canvas to get pixel-accurate width
    ctx.save();
    ctx.font = textFont(item);
    const m = ctx.measureText(item.text || ' ');
    ctx.restore();
    const h = item.fontSize * state.scale;
    const asc  = m.actualBoundingBoxAscent  ?? h * 0.8;
    const desc = m.actualBoundingBoxDescent ?? h * 0.2;
    return { x: item.rx * W, y: item.ry * H - asc, w: Math.max(m.width, 10), h: asc + desc };
  }

  function textFont(item) {
    return `${Math.round(item.fontSize * state.scale)}px Arial, Helvetica, sans-serif`;
  }

  /* ---- Resize handle positions (image only) ---- */

  function handlePositions(b) {
    return [
      [b.x,           b.y          ],
      [b.x + b.w / 2, b.y          ],
      [b.x + b.w,     b.y          ],
      [b.x + b.w,     b.y + b.h / 2],
      [b.x + b.w,     b.y + b.h    ],
      [b.x + b.w / 2, b.y + b.h    ],
      [b.x,           b.y + b.h    ],
      [b.x,           b.y + b.h / 2],
    ];
  }

  /* ---- Rendering ---- */

  function redraw() {
    if (!state.pageCanvas) return;
    ctx.drawImage(state.pageCanvas, 0, 0);
    const W = canvas.width, H = canvas.height;

    state.items.forEach((item, i) => {
      if (item.type === 'image') {
        ctx.drawImage(item.imgEl, item.rx * W, item.ry * H, item.rw * W, item.rh * H);
        if (i === state.selected) {
          const b = getBBox(item);
          ctx.strokeStyle = '#4f8cff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#4f8cff';
          ctx.lineWidth = 1.5;
          for (const [hx, hy] of handlePositions(b)) {
            ctx.beginPath();
            ctx.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
            ctx.fill();
            ctx.stroke();
          }
        }
      } else {
        if (!item.text) return;
        ctx.font = textFont(item);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = item.colorHex;
        ctx.fillText(item.text, item.rx * W, item.ry * H);
        if (i === state.selected) {
          const b = getBBox(item);
          ctx.strokeStyle = '#4f8cff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
        }
      }
    });
  }

  async function renderPage() {
    if (!state.pdfJs) return;
    const page = await state.pdfJs.getPage(state.current + 1);
    const base = page.getViewport({ scale: 1 });
    state.scale = Math.min(1.5, 700 / base.width);

    const off = await renderPageToCanvas(page, state.scale);
    state.pageCanvas = off;
    canvas.width  = off.width;
    canvas.height = off.height;
    redraw();
    $('edit-page-label').textContent = `Page ${state.current + 1} / ${state.pageCount}`;
  }

  /* ---- Pointer interaction ---- */

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return [
      (e.clientX - r.left) * (canvas.width  / r.width),
      (e.clientY - r.top)  * (canvas.height / r.height),
    ];
  }

  function hitHandle(cx, cy) {
    if (state.selected < 0) return null;
    const item = state.items[state.selected];
    if (item.type !== 'image') return null;
    const positions = handlePositions(getBBox(item));
    for (let i = 0; i < positions.length; i++) {
      const [hx, hy] = positions[i];
      if (Math.abs(cx - hx) <= HANDLE + 2 && Math.abs(cy - hy) <= HANDLE + 2) return HANDLE_NAMES[i];
    }
    return null;
  }

  function hitItem(cx, cy) {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const { x, y, w, h } = getBBox(state.items[i]);
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) return i;
    }
    return -1;
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
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const [cx, cy] = canvasPos(e);
    const W = canvas.width, H = canvas.height;

    if (state.tool === 'addtext') {
      const text     = $('edit-text-input').value.trim() || 'Text';
      const fontSize = Math.max(6, Number($('edit-font-size').value) || 24);
      const colorHex = $('edit-text-color').value;
      // ry = baseline y ratio (canvas textBaseline='alphabetic')
      state.items.push({ type: 'text', text, fontSize, colorHex, rx: cx / W, ry: cy / H });
      state.selected = state.items.length - 1;
      setTool('select');
      updateUI();
      setTimeout(() => { $('edit-text-input').focus(); $('edit-text-input').select(); }, 0);
      redraw();
      return;
    }

    const handle = hitHandle(cx, cy);
    if (handle) {
      const b = getBBox(state.items[state.selected]);
      state.drag = { mode: 'resize', handle, startX: cx, startY: cy, orig: { ...b } };
      return;
    }

    const hit = hitItem(cx, cy);
    if (hit >= 0) {
      state.selected = hit;
      const item = state.items[hit];
      state.drag = item.type === 'image'
        ? { mode: 'move',     startX: cx, startY: cy, orig: { ...getBBox(item) } }
        : { mode: 'movetext', startX: cx, startY: cy, origRx: item.rx, origRy: item.ry };
      updateUI();
      redraw();
    } else {
      state.selected = -1;
      updateUI();
      redraw();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [cx, cy] = canvasPos(e);
    const W = canvas.width, H = canvas.height;

    if (state.drag) {
      e.preventDefault();
      const dx = cx - state.drag.startX;
      const dy = cy - state.drag.startY;
      const item = state.items[state.selected];
      if (state.drag.mode === 'move') {
        const o = state.drag.orig;
        item.rx = (o.x + dx) / W;
        item.ry = (o.y + dy) / H;
      } else if (state.drag.mode === 'movetext') {
        item.rx = state.drag.origRx + dx / W;
        item.ry = state.drag.origRy + dy / H;
      } else if (state.drag.mode === 'resize') {
        const r = applyResize(state.drag.handle, state.drag.orig, dx, dy);
        item.rx = r.x / W; item.ry = r.y / H;
        item.rw = r.w / W; item.rh = r.h / H;
      }
      redraw();
      return;
    }

    if (state.tool === 'addtext') { canvas.style.cursor = 'crosshair'; return; }
    const handle = hitHandle(cx, cy);
    canvas.style.cursor = handle ? CURSOR_MAP[handle] : hitItem(cx, cy) >= 0 ? 'move' : 'default';
  });

  canvas.addEventListener('pointerup', () => { state.drag = null; });

  /* ---- Tool + UI state ---- */

  function setTool(t) {
    state.tool = t;
    $('edit-tool-select').classList.toggle('active', t === 'select');
    $('edit-tool-text').classList.toggle('active',   t === 'addtext');
    canvas.style.cursor = t === 'addtext' ? 'crosshair' : 'default';
    updateTextProps();
  }

  function updateUI() {
    $('edit-delete').disabled = state.selected < 0;
    updateTextProps();
  }

  function updateTextProps() {
    const showProps = state.tool === 'addtext' ||
      (state.selected >= 0 && state.items[state.selected]?.type === 'text');
    $('edit-text-props').classList.toggle('hidden', !showProps);
    if (state.selected >= 0 && state.items[state.selected]?.type === 'text') {
      const it = state.items[state.selected];
      $('edit-text-input').value  = it.text;
      $('edit-font-size').value   = it.fontSize;
      $('edit-text-color').value  = it.colorHex;
    }
  }

  function onTextPropChange() {
    if (state.selected >= 0 && state.items[state.selected]?.type === 'text') {
      const it = state.items[state.selected];
      it.text     = $('edit-text-input').value;
      it.fontSize = Math.max(6, Number($('edit-font-size').value) || 24);
      it.colorHex = $('edit-text-color').value;
      redraw();
    }
  }
  $('edit-text-input').addEventListener('input',  onTextPropChange);
  $('edit-font-size').addEventListener('input',   onTextPropChange);
  $('edit-text-color').addEventListener('input',  onTextPropChange);

  $('edit-tool-select').addEventListener('click', () => setTool('select'));
  $('edit-tool-text').addEventListener('click',   () => setTool('addtext'));

  $('edit-delete').addEventListener('click', () => {
    if (state.selected < 0) return;
    state.items.splice(state.selected, 1);
    state.selected = -1;
    redraw(); updateUI();
  });

  /* ---- Page navigation ---- */

  $('edit-prev').addEventListener('click', () => {
    if (state.current > 0) { state.current--; renderPage(); }
  });
  $('edit-next').addEventListener('click', () => {
    if (state.current < state.pageCount - 1) { state.current++; renderPage(); }
  });

  /* ---- PDF upload ---- */

  setupDropzone('edit-dropzone', 'edit-pdf-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (state.pdfJs) await state.pdfJs.destroy();
      Object.assign(state, {
        name: file.name, bytes,
        pdfJs: await openWithPdfJs(bytes),
        pageCount: 0, current: 0, items: [], selected: -1,
      });
      state.pageCount = state.pdfJs.numPages;
      $('edit-workspace').classList.remove('hidden');
      $('edit-dropzone').classList.add('hidden');
      setTool('select');
      updateUI();
      setStatus(status, '');
      await renderPage();
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  /* ---- Image upload ---- */

  $('edit-img-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    file.arrayBuffer().then((buf) => {
      const mime = file.type || (/\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg');
      const url  = URL.createObjectURL(new Blob([buf], { type: mime }));
      const img  = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const aspect = img.naturalHeight / img.naturalWidth;
        const rw = 0.35;
        const rh = (rw * canvas.width * aspect) / canvas.height;
        state.items.push({
          type: 'image', imgEl: img,
          imgBytes: new Uint8Array(buf), imgMime: mime,
          rx: (1 - rw) / 2, ry: (1 - rh) / 2, rw, rh,
        });
        state.selected = state.items.length - 1;
        setTool('select');
        redraw(); updateUI();
        setStatus(status, `"${file.name}" added. Drag to position, handles to resize.`);
      };
      img.src = url;
    });
  });

  /* ---- Save ---- */

  $('edit-save').addEventListener('click', async () => {
    if (!state.bytes)        { setStatus(status, 'Load a PDF first.', 'error'); return; }
    if (!state.items.length) { setStatus(status, 'Add at least one image or text first.', 'error'); return; }

    const btn = $('edit-save');
    btn.disabled = true;
    try {
      setStatus(status, 'Saving…');
      const doc   = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const pages = doc.getPages();

      const applyTo = document.querySelector('input[name="edit-pages"]:checked').value;
      const targetIndices = applyTo === 'all'     ? pages.map((_, i) => i)
                          : applyTo === 'current' ? [state.current]
                          : parsePageRange($('edit-range').value, state.pageCount);

      // Pre-embed images (one embed per unique item)
      const imgMap = new Map();
      for (const item of state.items) {
        if (item.type !== 'image' || imgMap.has(item)) continue;
        let { imgBytes: bytes, imgMime: mime } = item;
        if (!mime.includes('jpeg') && !mime.includes('png')) {
          // Convert WebP/other to PNG via canvas
          const c = document.createElement('canvas');
          c.width = item.imgEl.naturalWidth; c.height = item.imgEl.naturalHeight;
          c.getContext('2d').drawImage(item.imgEl, 0, 0);
          bytes = await new Promise(res => c.toBlob(b => b.arrayBuffer().then(buf => res(new Uint8Array(buf))), 'image/png'));
          mime  = 'image/png';
        }
        imgMap.set(item, mime.includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
      }

      // Embed Helvetica once if any text items exist
      const hasText = state.items.some(i => i.type === 'text' && i.text);
      const font    = hasText ? await doc.embedFont(StandardFonts.Helvetica) : null;

      for (const idx of targetIndices) {
        const page = pages[idx];
        const { width: pw, height: ph } = page.getSize();

        for (const item of state.items) {
          if (item.type === 'image') {
            page.drawImage(imgMap.get(item), {
              x:      item.rx * pw,
              y:      (1 - item.ry - item.rh) * ph,
              width:  item.rw * pw,
              height: item.rh * ph,
            });
          } else {
            if (!item.text) continue;
            const hex = item.colorHex.replace('#', '');
            const r   = parseInt(hex.slice(0, 2), 16) / 255;
            const g   = parseInt(hex.slice(2, 4), 16) / 255;
            const b   = parseInt(hex.slice(4, 6), 16) / 255;
            // item.ry = alphabetic baseline ratio; PDF y=0 is bottom, so invert
            page.drawText(item.text, {
              x:     item.rx * pw,
              y:     (1 - item.ry) * ph,
              size:  item.fontSize,
              font,
              color: rgb(r, g, b),
            });
          }
        }
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

  /* ---- Clear ---- */

  $('edit-clear').addEventListener('click', async () => {
    if (state.pdfJs) await state.pdfJs.destroy();
    Object.assign(state, { name: null, bytes: null, pdfJs: null, pageCanvas: null, items: [], selected: -1 });
    $('edit-workspace').classList.add('hidden');
    $('edit-dropzone').classList.remove('hidden');
    setTool('select');
    updateUI();
    setStatus(status, '');
  });
})();
