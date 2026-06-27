#!/usr/bin/env python3
"""Generate local thumbnails and enrich WAR.gov UAP records for GitHub Pages.

Inputs:
  - /Volumes/LaCie/war-gov-uap/pdf_video_inventory.cleaned.json
  - docs/data/records.json
Outputs:
  - docs/thumbs/*.webp
  - docs/data/records.json with thumbnail_url/local_file_path/local_file_bytes
  - data/records.json mirror
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import unquote, urlparse

import cv2
import fitz  # PyMuPDF
from PIL import Image, ImageOps, ImageDraw

REPO = Path(__file__).resolve().parents[1]
ARCHIVE = Path('/Volumes/LaCie/war-gov-uap')
INVENTORY = ARCHIVE / 'pdf_video_inventory.cleaned.json'
DOCS_RECORDS = REPO / 'docs/data/records.json'
ROOT_RECORDS = REPO / 'data/records.json'
THUMBS = REPO / 'docs/thumbs'

RELEASE_TO_DIR = {
    '5/8/26': 'release_01',
    '5/22/26': 'release_02',
    '6/12/26': 'release_03',
}

RELEASE_SHORT = {
    '5/8/26': 'r01',
    '5/22/26': 'r02',
    '6/12/26': 'r03',
}


def slugify(text: str, limit: int = 70) -> str:
    text = (text or '').lower().replace('\u00a0', ' ')
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text[:limit].strip('-') or 'record'


def url_basename(url: str) -> str:
    if not url:
        return ''
    return unquote(Path(urlparse(url).path).name).lower()


def norm_name(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', unquote(name).lower())


def thumb_name(record: dict, index: int) -> str:
    rel = RELEASE_SHORT.get(record.get('release_date'), 'rx')
    typ = str(record.get('type', 'item')).lower()
    return f"{rel}-{typ}-{index + 1:03d}-{slugify(record.get('title', 'record'), 54)}.webp"


def cover_canvas(img: Image.Image, size=(640, 420)) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert('RGB')
    img.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', size, (8, 8, 10))
    x = (size[0] - img.width) // 2
    y = (size[1] - img.height) // 2
    canvas.paste(img, (x, y))
    return canvas


def add_letterbox_texture(img: Image.Image, label: str) -> Image.Image:
    # Tiny, quiet metadata line embedded into generated previews. This also makes
    # pure-black video frames read as intentional artifacts rather than broken images.
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, img.height - 28, img.width, img.height), fill=(6, 6, 8))
    draw.text((16, img.height - 20), label[:82], fill=(154, 151, 145))
    return img


def save_webp(img: Image.Image, out: Path, quality=74) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, 'WEBP', quality=quality, method=6)


def fallback_thumb(record: dict, out: Path) -> bool:
    img = Image.new('RGB', (640, 420), (8, 8, 10))
    draw = ImageDraw.Draw(img)
    typ = str(record.get('type') or 'ITEM').upper()
    agency = str(record.get('agency') or 'WAR.gov')[:36]
    title = str(record.get('title') or 'Record preview unavailable')[:64]
    # Quiet instrument-style placeholder for records with no local derivative.
    for x in range(0, 640, 32):
        draw.line((x, 0, x, 420), fill=(13, 13, 15))
    for y in range(0, 420, 32):
        draw.line((0, y, 640, y), fill=(13, 13, 15))
    draw.ellipse((238, 128, 402, 292), outline=(64, 54, 40), width=1)
    draw.ellipse((286, 176, 354, 244), outline=(116, 94, 65), width=1)
    draw.text((28, 26), typ, fill=(201, 168, 124))
    draw.text((28, 326), agency, fill=(154, 151, 145))
    draw.text((28, 350), title, fill=(220, 219, 216))
    draw.text((28, 382), 'no local media derivative mapped', fill=(94, 92, 88))
    save_webp(img, out, quality=76)
    return True


def pdf_thumb(pdf_path: Path, out: Path, label: str) -> bool:
    try:
        doc = fitz.open(pdf_path)
        if doc.page_count < 1:
            return False
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(1.15, 1.15), alpha=False)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        img = cover_canvas(img)
        img = add_letterbox_texture(img, label)
        save_webp(img, out, quality=72)
        return True
    except Exception as exc:
        print(f"PDF thumb failed: {pdf_path}: {exc}", file=sys.stderr)
        return False


def video_thumb(video_path: Path, out: Path, label: str) -> bool:
    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return False
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        duration = frame_count / fps if frame_count and fps else 0

        # Many official clips open on pure black/redacted slates. Sample across
        # the timeline and choose the frame with the most visible signal rather
        # than blindly taking the first/third second.
        candidates = []
        if frame_count:
            fractions = [0.08, 0.14, 0.22, 0.32, 0.45, 0.58, 0.72, 0.86]
            candidates = [min(frame_count - 1, max(0, int(frame_count * f))) for f in fractions]
            # Include a few absolute early points for short sensor clips.
            candidates += [min(frame_count - 1, int(fps * s)) for s in (1, 3, 6, 10) if int(fps * s) < frame_count]
        else:
            candidates = [int(fps * s) for s in (1, 3, 6, 10, 18, 30)]

        best = None
        best_score = -1.0
        for target in dict.fromkeys(candidates):
            cap.set(cv2.CAP_PROP_POS_FRAMES, target)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mean = float(gray.mean())
            std = float(gray.std())
            # Reward readable image texture while penalizing nearly all-black
            # frames. Sensor footage is often low contrast, so std matters more
            # than mean after a modest darkness floor.
            score = std * 2.2 + mean * 0.35
            if mean < 4:
                score *= 0.08
            if score > best_score:
                best_score = score
                best = frame
        cap.release()
        if best is None:
            return False
        frame = cv2.cvtColor(best, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame)
        img = cover_canvas(img)
        img = add_letterbox_texture(img, label)
        save_webp(img, out, quality=76)
        return True
    except Exception as exc:
        print(f"Video thumb failed: {video_path}: {exc}", file=sys.stderr)
        return False


def main() -> int:
    if not ARCHIVE.exists():
        print(f"Missing archive: {ARCHIVE}", file=sys.stderr)
        return 2
    records = json.loads(DOCS_RECORDS.read_text())
    inventory = json.loads(INVENTORY.read_text())
    inv_by_path = {item['path']: item for item in inventory}

    pdf_by_base = {}
    pdf_by_norm = {}
    videos_by_release = defaultdict(deque)
    for item in inventory:
        rel = item['path'].split('/')[0]
        path = item['path']
        low = path.lower()
        if low.endswith('.pdf'):
            base = Path(path).name.lower()
            pdf_by_base[base] = item
            pdf_by_norm[norm_name(base)] = item
        elif low.endswith('.mp4'):
            videos_by_release[rel].append(item)

    matched = 0
    generated = 0
    failed = 0
    type_counts = defaultdict(int)

    for i, record in enumerate(records):
        typ = str(record.get('type', '')).upper()
        rel_dir = RELEASE_TO_DIR.get(record.get('release_date'), '')
        media = None

        if typ == 'PDF':
            base = url_basename(record.get('source_url', ''))
            media = pdf_by_base.get(base) or pdf_by_norm.get(norm_name(base))
        elif typ in {'VID', 'AUD'}:
            # WAR/DVIDS video IDs are not present in local filenames, but the official
            # ZIP order aligns by release. Assign sequentially inside each release.
            if videos_by_release[rel_dir]:
                media = videos_by_release[rel_dir].popleft()

        record.pop('thumbnail_missing', None)
        record.pop('local_file_path', None)
        record.pop('local_file_bytes', None)
        record.pop('thumbnail_url', None)

        if media:
            matched += 1
            local_rel = media['path']
            local_abs = ARCHIVE / local_rel
            out_name = thumb_name(record, i)
            out = THUMBS / out_name
            record['local_file_path'] = local_rel
            record['local_file_bytes'] = media.get('bytes')
            record['thumbnail_url'] = f"thumbs/{out_name}"
            label = f"{typ} · {record.get('agency') or 'WAR.gov'} · {record.get('release_date') or ''}"
            if not out.exists():
                ok = pdf_thumb(local_abs, out, label) if typ == 'PDF' else video_thumb(local_abs, out, label)
                if ok:
                    generated += 1
                else:
                    failed += 1
                    record['thumbnail_missing'] = True
                    record.pop('thumbnail_url', None)
            type_counts[typ] += 1
        else:
            out_name = thumb_name(record, i)
            out = THUMBS / out_name
            record['thumbnail_url'] = f"thumbs/{out_name}"
            record['thumbnail_missing'] = True
            if not out.exists():
                fallback_thumb(record, out)
                generated += 1

    DOCS_RECORDS.write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
    ROOT_RECORDS.write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')

    print(json.dumps({
        'records': len(records),
        'matched_media': matched,
        'generated_new': generated,
        'failed': failed,
        'type_counts': dict(type_counts),
        'thumb_files': len(list(THUMBS.glob('*.webp'))),
    }, indent=2))
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
