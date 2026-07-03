/* PDF → Images: render each page to PNG/JPEG, ZIP when multiple. */
'use strict';

(() => {
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('pdf2img-status');

  setupPdfPanel('pdf2img', state, status);

  $('pdf2img-clear').addEventListener('click', () => resetPdfPanel('pdf2img', state, status));

  $('pdf2img-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('pdf2img-btn');
    btn.disabled = true;
    const format = $('pdf2img-format').value; // 'png' | 'jpeg'
    const scale = Number($('pdf2img-scale').value);
    const ext = format === 'png' ? 'png' : 'jpg';
    const mime = 'image/' + format;
    const name = baseName(state.name);

    try {
      const pdf = await openWithPdfJs(state.bytes);
      const blobs = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        setStatus(status, `Rendering page ${n} / ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const canvas = await renderPageToCanvas(page, scale);
        blobs.push(await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9)));
        canvas.width = canvas.height = 0;
      }
      await pdf.destroy();

      if (blobs.length === 1) {
        downloadBlob(blobs[0], `${name}.${ext}`, mime);
        setStatus(status, 'Done — image downloaded.', 'success');
      } else {
        setStatus(status, 'Building ZIP…');
        const zip = new JSZip();
        const pad = String(blobs.length).length;
        blobs.forEach((blob, i) => {
          zip.file(`${name}-page-${String(i + 1).padStart(pad, '0')}.${ext}`, blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `${name}-images.zip`, 'application/zip');
        setStatus(status, `Done — ${blobs.length} images in ZIP (${formatBytes(zipBlob.size)}) downloaded.`, 'success');
      }
    } catch (err) {
      setStatus(status, 'Conversion failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
