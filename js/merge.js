/* Merge multiple PDFs into one. */
'use strict';

(() => {
  const mergeFiles = []; // { name, size, bytes (Uint8Array), pageCount }
  const mergeList = $('merge-list');
  const mergeStatus = $('merge-status');

  function renderMergeList() {
    mergeList.innerHTML = '';
    mergeFiles.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.draggable = true;
      li.dataset.index = i;
      li.innerHTML = `
        <span class="drag-handle">⠿</span>
        <span class="file-name" title="${f.name}">${f.name}</span>
        <span class="file-pages">${f.pageCount} page${f.pageCount === 1 ? '' : 's'}</span>
        <span class="file-size">${formatBytes(f.size)}</span>
        <button class="icon-btn remove" data-action="remove" title="Remove">✕</button>
      `;
      mergeList.appendChild(li);
    });
    $('merge-actions').classList.toggle('hidden', mergeFiles.length === 0);
    $('merge-btn').disabled = mergeFiles.length < 2;
  }

  mergeList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="remove"]');
    if (!btn) return;
    mergeFiles.splice(Number(btn.closest('.file-item').dataset.index), 1);
    renderMergeList();
  });

  makeSortable(mergeList, mergeFiles, renderMergeList);

  setupDropzone('merge-dropzone', 'merge-input', async (files) => {
    setStatus(mergeStatus, 'Reading files…');
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        mergeFiles.push({ name: file.name, size: file.size, bytes, pageCount: doc.getPageCount() });
      } catch (err) {
        setStatus(mergeStatus, `Could not read "${file.name}": ${err.message}`, 'error');
        renderMergeList();
        return;
      }
    }
    setStatus(mergeStatus, '');
    renderMergeList();
  });

  $('merge-clear').addEventListener('click', () => {
    mergeFiles.length = 0;
    setStatus(mergeStatus, '');
    renderMergeList();
  });

  $('merge-btn').addEventListener('click', async () => {
    if (mergeFiles.length < 2) return;
    const btn = $('merge-btn');
    btn.disabled = true;
    try {
      const merged = await PDFDocument.create();
      for (let i = 0; i < mergeFiles.length; i++) {
        setStatus(mergeStatus, `Merging ${i + 1} / ${mergeFiles.length}: ${mergeFiles[i].name}`);
        const src = await PDFDocument.load(mergeFiles[i].bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const out = await merged.save();
      downloadBlob(out, 'merged.pdf');
      setStatus(mergeStatus, `Done — merged.pdf (${formatBytes(out.length)}) downloaded.`, 'success');
    } catch (err) {
      setStatus(mergeStatus, 'Merge failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
