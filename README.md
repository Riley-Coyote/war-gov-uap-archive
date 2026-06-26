# WAR.gov UAP / PURSUE Archive Gallery

A dark, canvas-style GitHub Pages explorer for the public WAR.gov UAP/PURSUE disclosure releases.

- **Live site:** https://riley-coyote.github.io/war-gov-uap-archive/
- **Official source:** https://www.war.gov/UFO/

## What this repo hosts

This repository hosts the **static gallery UI** and lightweight metadata needed to explore the archive:

- `docs/index.html` — GitHub Pages entrypoint.
- `docs/styles.css` — dark canvas/museum archive visual system.
- `docs/app.js` — search, filters, canvas/list modes, modal inspector.
- `docs/data/records.json` — normalized PDF/video/audio record metadata.
- `data/uap-data.csv` — WAR.gov CSV manifest snapshot used as source data.
- `data/bundle_manifest.json` — official bundle URLs and sizes used for local download.
- `data/pdf_video_inventory.cleaned.json` — verified local extracted PDF/video inventory.

## Media hosting model

The verified local archive is ~26GB. GitHub repositories and GitHub Pages are not appropriate for hosting that much binary media directly:

- GitHub blocks normal files over 100MB.
- GitHub Pages published sites are limited to roughly 1GB.
- Large video/PDF hosting should live in object storage, an archival platform, or official source links.

So this free public version uses:

1. **GitHub Pages** for the gallery UI.
2. **Official WAR.gov / DVIDS source links** for public media access.
3. Optional future mirrors such as Internet Archive, Hugging Face Datasets, or Cloudflare R2.

WAR.gov currently blocks embedded PDF rendering in iframes from this static site, so PDF records open in a new tab via official source links. Video/audio records open their DVIDS public source page where available.

## Local archive provenance

The official bundles were downloaded and validated locally under:

```text
/Volumes/LaCie/war-gov-uap
```

Cleaned extracted inventory:

- 175 PDFs
- 94 MP4 files
- 269 real PDF/video files total

The public gallery metadata contains 270 manifest records:

- 175 PDF records
- 84 video records
- 11 audio records

## Development

Run locally from the Pages root:

```bash
cd docs
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```
