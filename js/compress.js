/* Compress by re-rendering pages as JPEG. */
'use strict';

(() => {
  const QUALITY_PRESETS = {
    low:    { scale: 1.2, jpeg: 0.4 },  // strong compression
    medium: { scale: 1.5, jpeg: 0.6 },  // balanced
    high:   { scale: 2.0, jpeg: 0.75 }, // light compression
  };
  const MAX_RENDER_DIM = 4000; // px cap to avoid huge canvases

  const state = { name: null, size: 0, bytes: null };
  const status = $('compress-status');

  setupDropzone('compress-dropzone', 'compress-input', async (files) => {
    const file = files[0];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      state.name = file.name;
      state.size = file.size;
      state.bytes = bytes;
      $('compress-meta').classList.remove('hidden');
      $('compress-meta').innerHTML =
        `<strong>${file.name}</strong> — ${doc.getPageCount()} pages, ${formatBytes(file.size)}`;
      $('compress-options').classList.remove('hidden');
      $('compress-actions').classList.remove('hidden');
      $('compress-result').classList.add('hidden');
      setStatus(status, '');
    } catch (err) {
      setStatus(status, `Could not read "${file.name}": ${err.message}`, 'error');
    }
  });

  $('compress-clear').addEventListener('click', () => {
    state.name = null;
    state.bytes = null;
    ['compress-meta', 'compress-options', 'compress-actions', 'compress-result']
      .forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('compress-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('compress-btn');
    btn.disabled = true;
    $('compress-result').classList.add('hidden');

    const preset = QUALITY_PRESETS[document.querySelector('input[name="quality"]:checked').value];

    try {
      const pdf = await openWithPdfJs(state.bytes);
      const out = await PDFDocument.create();

      for (let n = 1; n <= pdf.numPages; n++) {
        setStatus(status, `Compressing page ${n} / ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 }); // 1 unit = 1 PDF point

        let scale = preset.scale;
        const maxSide = Math.max(base.width, base.height) * scale;
        if (maxSide > MAX_RENDER_DIM) scale = MAX_RENDER_DIM / Math.max(base.width, base.height);

        const canvas = await renderPageToCanvas(page, scale);
        const dataUrl = canvas.toDataURL('image/jpeg', preset.jpeg);
        const img = await out.embedJpg(dataUrl);
        const outPage = out.addPage([base.width, base.height]);
        outPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });

        canvas.width = canvas.height = 0; // free canvas memory
      }
      await pdf.destroy();

      const saved = await out.save();
      const before = state.size;
      const after = saved.length;

      if (after >= before) {
        setStatus(status,
          `Result (${formatBytes(after)}) is not smaller than the original (${formatBytes(before)}). ` +
          'This PDF is likely already optimized — try the "Strong" level, or keep the original.', 'error');
      } else {
        downloadBlob(saved, baseName(state.name) + '-compressed.pdf');
        const pct = ((1 - after / before) * 100).toFixed(0);
        const result = $('compress-result');
        result.classList.remove('hidden');
        result.innerHTML =
          `${formatBytes(before)} → ${formatBytes(after)} ` +
          `<span class="savings">(−${pct}%)</span> — downloaded.`;
        setStatus(status, '');
      }
    } catch (err) {
      setStatus(status, 'Compression failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
