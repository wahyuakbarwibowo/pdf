/* Metadata: view and edit document properties. */
'use strict';

(() => {
  const state = { name: null, bytes: null };
  const status = $('metadata-status');

  setupDropzone('metadata-dropzone', 'metadata-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      state.name = file.name;
      state.bytes = bytes;

      $('meta-title').value = doc.getTitle() || '';
      $('meta-author').value = doc.getAuthor() || '';
      $('meta-subject').value = doc.getSubject() || '';
      $('meta-keywords').value = doc.getKeywords() || '';
      $('meta-creator').value = doc.getCreator() || '';

      $('metadata-meta').classList.remove('hidden');
      $('metadata-meta').innerHTML =
        `<strong>${file.name}</strong> — ${doc.getPageCount()} pages, ${formatBytes(file.size)}`;
      $('metadata-options').classList.remove('hidden');
      $('metadata-actions').classList.remove('hidden');
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('metadata-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['metadata-meta', 'metadata-options', 'metadata-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('metadata-save').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('metadata-save');
    btn.disabled = true;
    try {
      setStatus(status, 'Saving…');
      const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
      doc.setTitle($('meta-title').value);
      doc.setAuthor($('meta-author').value);
      doc.setSubject($('meta-subject').value);
      doc.setKeywords($('meta-keywords').value.split(',').map((k) => k.trim()).filter(Boolean));
      doc.setCreator($('meta-creator').value);
      const saved = await doc.save();
      downloadBlob(saved, baseName(state.name) + '-metadata.pdf');
      setStatus(status, `Done — ${formatBytes(saved.length)} downloaded.`, 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
