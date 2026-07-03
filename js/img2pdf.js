/* Images → PDF: one image per page. */
'use strict';

(() => {
  const images = []; // { name, size, dataUrl (jpeg or png), isPng, width, height }
  const list = $('img2pdf-list');
  const status = $('img2pdf-status');

  const isImage = (file) => file.type.startsWith('image/');

  function render() {
    list.innerHTML = '';
    images.forEach((img, i) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.draggable = true;
      li.dataset.index = i;
      li.innerHTML = `
        <span class="drag-handle">⠿</span>
        <img class="file-thumb" src="${img.dataUrl}" alt="" draggable="false" />
        <span class="file-name" title="${img.name}">${img.name}</span>
        <span class="file-size">${img.width}×${img.height}</span>
        <button class="icon-btn remove" data-action="remove" title="Remove">✕</button>
      `;
      list.appendChild(li);
    });
    const has = images.length > 0;
    $('img2pdf-options').classList.toggle('hidden', !has);
    $('img2pdf-actions').classList.toggle('hidden', !has);
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove"]');
    if (!btn) return;
    images.splice(Number(btn.closest('.file-item').dataset.index), 1);
    render();
  });

  makeSortable(list, images, render);

  /* Decode any browser-supported image; keep PNG as PNG (alpha), convert the rest to JPEG. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const isPng = file.type === 'image/png';
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!isPng) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          name: file.name,
          size: file.size,
          isPng,
          dataUrl: isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Cannot decode "${file.name}"`));
      };
      img.src = url;
    });
  }

  setupDropzone('img2pdf-dropzone', 'img2pdf-input', async (files) => {
    setStatus(status, 'Reading images…');
    for (const file of files) {
      try {
        images.push(await loadImage(file));
      } catch (err) {
        setStatus(status, err.message, 'error');
        render();
        return;
      }
    }
    setStatus(status, '');
    render();
  }, isImage);

  $('img2pdf-clear').addEventListener('click', () => {
    images.length = 0;
    setStatus(status, '');
    render();
  });

  $('img2pdf-btn').addEventListener('click', async () => {
    if (!images.length) return;
    const btn = $('img2pdf-btn');
    btn.disabled = true;
    const mode = document.querySelector('input[name="img2pdf-size"]:checked').value;
    const A4 = { w: 595.28, h: 841.89, margin: 40 };

    try {
      const out = await PDFDocument.create();
      for (let i = 0; i < images.length; i++) {
        setStatus(status, `Adding image ${i + 1} / ${images.length}…`);
        const item = images[i];
        const embedded = item.isPng
          ? await out.embedPng(item.dataUrl)
          : await out.embedJpg(item.dataUrl);

        if (mode === 'fit') {
          const page = out.addPage([embedded.width, embedded.height]);
          page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        } else {
          // Landscape images get a landscape A4 page.
          const landscape = embedded.width > embedded.height;
          const pw = landscape ? A4.h : A4.w;
          const ph = landscape ? A4.w : A4.h;
          const maxW = pw - A4.margin * 2;
          const maxH = ph - A4.margin * 2;
          const ratio = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
          const w = embedded.width * ratio;
          const h = embedded.height * ratio;
          const page = out.addPage([pw, ph]);
          page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        }
      }
      const saved = await out.save();
      downloadBlob(saved, 'images.pdf');
      setStatus(status, `Done — images.pdf (${images.length} pages, ${formatBytes(saved.length)}) downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
