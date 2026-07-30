/* PDF → Word: extract text per page with PDF.js, write paragraphs into a .docx (docx.js, lazy-loaded).
   No layout/table/image reconstruction — this is a text dump, not a visual replica. */
'use strict';

(() => {
  const DOCX_SRC = 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.umd.cjs';
  const state = { name: null, bytes: null, pageCount: 0 };
  const status = $('pdf2word-status');

  setupPdfPanel('pdf2word', state, status);

  $('pdf2word-clear').addEventListener('click', () =>
    resetPdfPanel('pdf2word', state, status));

  // Group text items into lines by their baseline y, left-to-right within a line.
  function pageToLines(textContent) {
    const items = textContent.items.filter((it) => it.str.trim());
    const lines = [];
    for (const it of items) {
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < 3);
      if (!line) { line = { y, parts: [] }; lines.push(line); }
      line.parts.push({ x: it.transform[4], str: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' '));
  }

  $('pdf2word-btn').addEventListener('click', async () => {
    if (!state.bytes) return;
    const btn = $('pdf2word-btn');
    btn.disabled = true;
    try {
      setStatus(status, 'Loading converter…');
      await loadScript(DOCX_SRC);

      const pdf = await openWithPdfJs(state.bytes);
      const paragraphs = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        setStatus(status, `Reading page ${n} / ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const lines = pageToLines(await page.getTextContent());
        for (const line of lines) paragraphs.push(new docx.Paragraph(line));
        if (n < pdf.numPages) paragraphs.push(new docx.Paragraph({ pageBreakBefore: true }));
      }
      await pdf.destroy();

      const doc = new docx.Document({ sections: [{ children: paragraphs }] });
      const blob = await docx.Packer.toBlob(doc);
      downloadBlob(blob, baseName(state.name) + '.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      setStatus(status, `Done — text extracted from ${state.pageCount} pages. Layout, tables and images are not preserved.`, 'success');
    } catch (err) {
      setStatus(status, 'Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
