# WAR.gov UAP / PURSUE Archive Gallery

A provenance-first explorer for the public WAR.gov UAP/PURSUE disclosure releases.

This repository is being prepared as a GitHub Pages gallery for browsing the released PDFs and videos.

## Current status

- Local official bundles downloaded and validated on Riley's machine under `/Volumes/LaCie/war-gov-uap`.
- This repo currently commits lightweight metadata and a placeholder Pages entrypoint only.
- Large media files are intentionally not committed directly: the local archive is ~26 GB, while normal GitHub repositories reject files over 100 MB and are not suitable for multi-GB video bundles.

## Data included

- `data/uap-data.csv` — current WAR.gov CSV manifest snapshot.
- `data/bundle_manifest.json` — official bundle URLs and sizes used for download.
- `data/pdf_video_inventory.cleaned.json` — local extracted PDF/video inventory.
- `data/records.json` — normalized records for the future gallery.

## Future Pages gallery

The next step is to design and build a refined dark-mode gallery in `docs/` using the normalized records.
