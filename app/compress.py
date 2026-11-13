"""Shrinks what gets stored.

Uploaded pictures are the one kind of user data a server can safely make much
smaller without anyone noticing: a 6 MB phone photo becomes a ~100 KB WebP.
PDFs and videos are left alone (already compressed formats; re-encoding them
on a small instance would be slow and risky). Text in the database is
compressed by PostgreSQL itself (TOAST) for every value over ~2 KB.
"""
from __future__ import annotations

from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps

# Refuse "decompression bombs" (a tiny file that expands to gigabytes).
Image.MAX_IMAGE_PIXELS = 40_000_000

RASTER = {".jpg", ".jpeg", ".png", ".webp"}
WEBP_QUALITY = 80


def optimize_upload(stored_name: str, data: bytes, content_type: str, max_side: int = 1600) -> tuple[str, bytes, str]:
    """Returns (name, bytes, content_type) ready to store.

    - non-images pass through untouched;
    - an image that can't be decoded is rejected (it was never a real image);
    - JPEG/PNG/WebP are downscaled to `max_side` and re-encoded as WebP, but
      only if that is actually smaller than what was uploaded;
    - GIFs are validated and kept as they are (they may be animated)."""
    dot = stored_name.rfind(".")
    ext = stored_name[dot:].lower() if dot != -1 else ""
    if ext not in RASTER and ext != ".gif":
        return stored_name, data, content_type

    try:
        with Image.open(BytesIO(data)) as probe:
            probe.verify()                       # structure check
        img = Image.open(BytesIO(data))
        img.load()                               # full decode — catches truncated files
    except (OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, "الصورة تالفة أو غير مدعومة — جرّب صورة أخرى")

    if ext == ".gif":
        return stored_name, data, content_type

    img = ImageOps.exif_transpose(img)           # honour the phone's rotation, then drop EXIF (incl. GPS)
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or img.mode == "P" and "transparency" in img.info else "RGB")

    out = BytesIO()
    img.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
    smaller = out.getvalue()
    if len(smaller) >= len(data) and max(img.size) <= max_side and ext == ".webp":
        return stored_name, data, content_type   # already as small as we'd make it
    return stored_name[:dot] + ".webp", smaller, "image/webp"
