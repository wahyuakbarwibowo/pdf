/* Split: extract a page range, or split every page into its own PDF (ZIP). */
'use strict';

(() => {
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('split-status');

  setupPdfPanel('split', state, status, () => {
    $('split-range').value = '';
    $('split-range').placeholder = `e.g. 1-${Math.min(3, state.pageCount)}, ${state.pageCount}`;
  });

  $('split-clear').addEventListener('click', () => resetPdfPanel('split', state, status));

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
