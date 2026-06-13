/* PDF → Images: render each page to PNG/JPEG, ZIP when multiple. */
'use strict';

(() => {
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('pdf2img-status');

  setupDropzone('pdf2img-dropzone', 'pdf2img-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      state.name = file.name;
      state.bytes = bytes;
      state.pageCount = doc.getPageCount();
      $('pdf2img-meta').classList.remove('hidden');
      $('pdf2img-meta').innerHTML =
        `<strong>${file.name}</strong> — ${state.pageCount} pages, ${formatBytes(file.size)}`;
      $('pdf2img-options').classList.remove('hidden');
      $('pdf2img-actions').classList.remove('hidden');
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('pdf2img-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['pdf2img-meta', 'pdf2img-options', 'pdf2img-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

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
        blobs.push(await canvasToBlob(canvas, mime, 0.9));
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
