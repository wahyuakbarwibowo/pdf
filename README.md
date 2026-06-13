# PDF Toolbox

Client-side PDF tools — everything runs in the browser; files are never uploaded anywhere.

**Live:** https://wahyuakbarwibowo.github.io/pdf/

## Features

- **Merge** — combine multiple PDFs, drag to set file order
- **Split** — extract a page range, or split every page into its own PDF (ZIP)
- **Reorder** — drag page thumbnails to rearrange, rotate or delete pages
- **Compress** — re-render pages as JPEG at a chosen quality (best for scanned/image-heavy PDFs; text becomes non-selectable)
- **Images → PDF** — JPG/PNG/WebP to PDF, fit-image or A4 pages
- **PDF → Images** — export pages as PNG/JPEG (ZIP for multi-page)
- **Watermark** — text watermark and/or page numbers on every page
- **Sign** — draw a signature and stamp it onto pages (visual signature, not a cryptographic digital signature)
- **OCR** — extract text from scanned PDFs with Tesseract.js (English/Indonesian; engine downloads on first use, then runs locally)
- **Protect** — add a password (encrypt), or remove one if you know it
- **Metadata** — view/edit title, author, subject, keywords, creator

## Stack

No build step, no server. Plain HTML/CSS/JS with CDN libraries:

- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) — PDF create/edit + encryption
- [PDF.js](https://mozilla.github.io/pdf.js/) — rendering (worker self-hosted in `vendor/`)
- [JSZip](https://stuk.github.io/jszip/) — ZIP downloads
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR (lazy-loaded)

## Run locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

(A local server is needed — the PDF.js worker won't load from `file://`.)

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source**: select `main` branch, `/ (root)` folder.
3. Site goes live at `https://<username>.github.io/<repo>/`.
