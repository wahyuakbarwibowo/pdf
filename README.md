# PDF Toolbox

Client-side PDF tools — merge, reorder pages, and compress. Everything runs in the browser (pdf-lib + PDF.js via CDN); files are never uploaded anywhere.

## Features

- **Merge** — combine multiple PDFs, drag to set file order
- **Reorder** — drag page thumbnails to rearrange or delete pages
- **Compress** — re-render pages as JPEG at a chosen quality (best for scanned/image-heavy PDFs; text becomes non-selectable)

## Run locally

No build step. Open `index.html` directly, or:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source**: select `main` branch, `/ (root)` folder.
3. Site goes live at `https://<username>.github.io/<repo>/`.
