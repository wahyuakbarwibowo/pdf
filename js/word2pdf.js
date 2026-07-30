/* Word → PDF: mammoth.js turns .docx into HTML, jsPDF renders that HTML to a PDF
   (via its bundled html2canvas). Basic formatting (headings, bold, lists) survives;
   complex layouts (multi-column, precise styling) may not. */
'use strict';

(() => {
  const MAMMOTH_SRC     = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
  const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const JSPDF_SRC        = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

  let file = null;
  const status = $('word2pdf-status');
  const isDocx = (f) => /\.docx$/i.test(f.name);

  setupDropzone('word2pdf-dropzone', 'word2pdf-input', (files) => {
    file = files[0];
    $('word2pdf-meta').innerHTML = `<strong>${file.name}</strong> — ${formatBytes(file.size)}`;
    ['word2pdf-meta', 'word2pdf-actions'].forEach((id) => $(id).classList.remove('hidden'));
    setStatus(status, '');
  }, isDocx);

  $('word2pdf-clear').addEventListener('click', () => {
    file = null;
    ['word2pdf-meta', 'word2pdf-actions'].forEach((id) => $(id).classList.add('hidden'));
    setStatus(status, '');
  });

  $('word2pdf-btn').addEventListener('click', async () => {
    if (!file) return;
    const btn = $('word2pdf-btn');
    btn.disabled = true;
    let container = null;
    try {
      setStatus(status, 'Loading converter…');
      await loadScript(MAMMOTH_SRC);
      await loadScript(HTML2CANVAS_SRC);
      await loadScript(JSPDF_SRC);

      setStatus(status, 'Reading document…');
      const arrayBuffer = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

      container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:700px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;';
      container.innerHTML = html;
      document.body.appendChild(container);

      setStatus(status, 'Rendering to PDF…');
      const { jsPDF } = jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      await pdf.html(container, {
        margin: 40,
        autoPaging: 'text',
        width: 515,          // a4 width (595pt) minus margins
        windowWidth: 700,
      });

      const blob = pdf.output('blob');
      downloadBlob(blob, file.name.replace(/\.docx$/i, '') + '.pdf');
      setStatus(status, 'Done — downloaded. Complex layouts may not be pixel-exact.', 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      if (container) container.remove();
      btn.disabled = false;
    }
  });
})();
