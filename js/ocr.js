/* OCR: extract text from scanned PDFs with Tesseract.js (lazy-loaded). */
'use strict';

(() => {
  const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('ocr-status');

  setupPdfPanel('ocr', state, status, () => $('ocr-result-wrap').classList.add('hidden'));

  $('ocr-clear').addEventListener('click', () =>
    resetPdfPanel('ocr', state, status, ['ocr-result-wrap']));

  $('ocr-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('ocr-btn');
    btn.disabled = true;
    const lang = document.querySelector('input[name="ocr-lang"]:checked').value;

    let worker = null;
    let progressPrefix = '';
    try {
      setStatus(status, 'Loading OCR engine (first use only)…');
      await loadScript(TESSERACT_SRC);
      worker = await Tesseract.createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setStatus(status, `${progressPrefix} ${(m.progress * 100).toFixed(0)}%`);
          }
        },
      });

      const pdf = await openWithPdfJs(state.bytes);
      const parts = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        progressPrefix = `OCR page ${n} / ${pdf.numPages} —`;
        setStatus(status, `Rendering page ${n} / ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        // ~200 DPI: good accuracy without huge canvases.
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.8, 3000 / Math.max(base.width, base.height));
        const canvas = await renderPageToCanvas(page, scale);
        setStatus(status, `${progressPrefix} starting…`);
        const { data } = await worker.recognize(canvas);
        parts.push(`--- Page ${n} ---\n${data.text.trim()}`);
        canvas.width = canvas.height = 0;
      }
      await pdf.destroy();

      $('ocr-result').value = parts.join('\n\n');
      $('ocr-result-wrap').classList.remove('hidden');
      setStatus(status, `Done — text extracted from ${state.pageCount} pages.`, 'success');
    } catch (err) {
      setStatus(status, 'OCR failed: ' + err.message, 'error');
    } finally {
      if (worker) await worker.terminate();
      btn.disabled = false;
    }
  });

  $('ocr-download').addEventListener('click', () => {
    const text = $('ocr-result').value;
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }),
      baseName(state.name || 'ocr') + '.txt', 'text/plain');
  });

  $('ocr-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('ocr-result').value);
    setStatus(status, 'Copied to clipboard.', 'success');
  });
})();
