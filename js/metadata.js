/* Metadata: view and edit document properties. */
'use strict';

(() => {
  const state = { name: null, bytes: null };
  const status = $('metadata-status');

  setupPdfPanel('metadata', state, status, (doc) => {
    $('meta-title').value = doc.getTitle() || '';
    $('meta-author').value = doc.getAuthor() || '';
    $('meta-subject').value = doc.getSubject() || '';
    $('meta-keywords').value = doc.getKeywords() || '';
    $('meta-creator').value = doc.getCreator() || '';
  }, { ignoreEncryption: true, updateMetadata: false });

  $('metadata-clear').addEventListener('click', () => resetPdfPanel('metadata', state, status));

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
