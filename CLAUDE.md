# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

A local server is required — `file://` breaks the PDF.js worker (cross-origin restriction).

## Architecture

No build step, no bundler, no npm. Single `index.html` + `style.css` + per-tool JS modules loaded via `<script>` tags.

**Entry point:** `index.html` — all 11 tool panels live here as inline HTML. Tabs switch panels via `data-tab` attributes; tab wiring is in `common.js`.

**`js/common.js`** — loaded first (before all tool scripts). Exports globals used by every tool:
- `PDFLib`, `pdfjsLib` — CDN globals destructured at top
- `setupDropzone(zoneId, inputId, onFiles, accept?)` — wires drag-drop + file input
- `makeSortable(container, items, render)` — HTML5 drag-to-reorder
- `renderPageToCanvas(page, scale, background?)` — pdf.js page → canvas
- `openWithPdfJs(bytes, extra?)` — wraps `pdfjsLib.getDocument` (always passes `.slice()` — pdf.js takes ownership)
- `downloadBlob(data, filename, mime?)` — triggers browser download
- `parsePageRange(text, maxPage)` — parses "1-3, 5" → 0-based indices, throws on invalid
- `loadScript(src)` — lazy-loads external scripts once (used by OCR for Tesseract.js)

**`js/<tool>.js`** — one file per tool (merge, split, reorder, compress, img2pdf, pdf2img, watermark, sign, ocr, protect, metadata). Each is self-contained: queries `#panel-<tool>` elements, wires events, calls common helpers.

**`vendor/pdf.worker.min.js`** — self-hosted PDF.js worker. Must stay same-origin.

## Libraries (CDN, no install)

| Library | Purpose |
|---|---|
| `@cantoo/pdf-lib` | PDF creation/editing, encryption/decryption |
| `PDF.js` | Rendering pages to canvas |
| `JSZip` | ZIP downloads (pdf2img multi-page, split-all) |
| `Tesseract.js` | OCR (lazy-loaded on first OCR use) |

## Deploy

Push to `main` → GitHub Pages serves from repo root automatically (configured via repo Settings → Pages).
