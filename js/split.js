/* Split: extract a page range, or split every page into its own PDF (ZIP). */
'use strict';

(() => {
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('split-status');

  setupDropzone('split-dropzone', 'split-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      state.name = file.name;
      state.bytes = bytes;
      state.pageCount = doc.getPageCount();
      $('split-meta').classList.remove('hidden');
      $('split-meta').innerHTML =
        `<strong>${file.name}</strong> — ${state.pageCount} pages, ${formatBytes(file.size)}`;
      $('split-options').classList.remove('hidden');
      $('split-actions').classList.remove('hidden');
      $('split-range').value = '';
      $('split-range').placeholder = `e.g. 1-${Math.min(3, state.pageCount)}, ${state.pageCount}`;
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('split-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['split-meta', 'split-options', 'split-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('split-extract').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('split-extract');
    btn.disabled = true;
    try {
      const indices = parsePageRange($('split-range').value, state.pageCount);
      setStatus(status, `Extracting ${indices.length} page${indices.length === 1 ? '' : 's'}…`);
      const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, indices);
      copied.forEach((p) => out.addPage(p));
      const saved = await out.save();
      downloadBlob(saved, baseName(state.name) + '-extracted.pdf');
      setStatus(status, `Done — ${indices.length} pages, ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('split-all').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('split-all');
    btn.disabled = true;
    try {
      const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      const zip = new JSZip();
      const name = baseName(state.name);
      const pad = String(state.pageCount).length;
      for (let i = 0; i < state.pageCount; i++) {
        setStatus(status, `Splitting page ${i + 1} / ${state.pageCount}…`);
        const out = await PDFDocument.create();
        const [page] = await out.copyPages(src, [i]);
        out.addPage(page);
        zip.file(`${name}-page-${String(i + 1).padStart(pad, '0')}.pdf`, await out.save());
      }
      setStatus(status, 'Building ZIP…');
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${name}-pages.zip`, 'application/zip');
      setStatus(status, `Done — ${state.pageCount} PDFs in ZIP (${formatBytes(blob.size)}) downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Split failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
