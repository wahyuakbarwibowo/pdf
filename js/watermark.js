/* Watermark text and/or page numbers on every page. */
'use strict';

(() => {
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('watermark-status');

  setupDropzone('watermark-dropzone', 'watermark-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      state.name = file.name;
      state.bytes = bytes;
      state.pageCount = doc.getPageCount();
      $('watermark-meta').classList.remove('hidden');
      $('watermark-meta').innerHTML =
        `<strong>${file.name}</strong> — ${state.pageCount} pages, ${formatBytes(file.size)}`;
      $('watermark-options').classList.remove('hidden');
      $('watermark-actions').classList.remove('hidden');
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('watermark-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['watermark-meta', 'watermark-options', 'watermark-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('watermark-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const text = $('watermark-text').value.trim();
    const addNumbers = $('watermark-pagenum').checked;
    if (!text && !addNumbers) {
      setStatus(status, 'Enter watermark text or enable page numbers.', 'error');
      return;
    }

    const btn = $('watermark-btn');
    btn.disabled = true;
    try {
      setStatus(status, 'Applying…');
      const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const numFont = await doc.embedFont(StandardFonts.Helvetica);

      const size = Number($('watermark-size').value);
      const opacity = Number($('watermark-opacity').value);
      const diagonal = $('watermark-diagonal').checked;
      const numPos = $('watermark-pagenum-pos').value;
      const pages = doc.getPages();

      pages.forEach((page, i) => {
        const { width, height } = page.getSize();

        if (text) {
          const textWidth = font.widthOfTextAtSize(text, size);
          const angle = diagonal ? Math.atan2(height, width) * (180 / Math.PI) : 0;
          const rad = (angle * Math.PI) / 180;
          // Offset so the rotated text is centered on the page.
          const x = width / 2 - (textWidth / 2) * Math.cos(rad) + (size / 2) * Math.sin(rad) * 0.5;
          const y = height / 2 - (textWidth / 2) * Math.sin(rad) - (size / 2) * Math.cos(rad) * 0.5;
          page.drawText(text, {
            x, y, size, font,
            color: rgb(0.5, 0.5, 0.5),
            opacity,
            rotate: degrees(angle),
          });
        }

        if (addNumbers) {
          const label = `${i + 1} / ${pages.length}`;
          const numSize = 10;
          const labelWidth = numFont.widthOfTextAtSize(label, numSize);
          const x = numPos === 'bottom-right' ? width - labelWidth - 36 : (width - labelWidth) / 2;
          page.drawText(label, {
            x, y: 20, size: numSize, font: numFont,
            color: rgb(0.35, 0.35, 0.35),
          });
        }
      });

      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-watermarked.pdf');
      setStatus(status, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      const hint = /WinAnsi|encode/i.test(err.message)
        ? ' (the built-in font supports Latin characters only)' : '';
      setStatus(status, 'Failed: ' + err.message + hint, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
