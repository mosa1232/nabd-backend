"""Proves the configured storage actually works, before a deploy depends on it.

Reads the same settings the app does (.env or the environment), writes a small
test object, reads it back through a signed URL, deletes it, and reports what
it found. Run it after filling in the S3_* variables:

    python scripts/check_storage.py

Nothing here is destructive: it only ever touches the one key it creates.
"""
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

MARKER = b"kiur-storage-check"
TEST_NAME = "_kiur_storage_check.txt"


def main() -> int:
    try:
        from app.config import get_settings
        from app.storage import storage
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    settings = get_settings()
    print(f"backend  : {storage.kind}")
    if storage.kind == "local":
        print("\nSTORAGE_BACKEND is 'local' — files go to ./uploads and are wiped on")
        print("every deploy. Set STORAGE_BACKEND=s3 and the S3_* variables to test")
        print("real object storage.")
        return 0

    print(f"bucket   : {settings.s3_bucket}")
    print(f"endpoint : {settings.s3_endpoint_url or '(AWS default)'}")
    print(f"prefix   : {settings.s3_prefix or '(none)'}")
    print()

    try:
        storage.save(TEST_NAME, MARKER, "text/plain")
        print("[ok]   wrote a test object")
    except Exception as exc:
        print(f"[FAIL] could not write: {type(exc).__name__}: {exc}")
        print("\nUsually means: wrong keys, wrong endpoint, the bucket doesn't exist,")
        print("or the token lacks Object Read & Write on this bucket.")
        return 1

    try:
        if not storage.exists(TEST_NAME):
            print("[FAIL] wrote the object but cannot see it — check the token's read permission")
            return 1
        print("[ok]   read it back")

        url = storage.signed_url(TEST_NAME)
        if not url:
            print("[FAIL] no URL generated")
            return 1
        kind = "public" if settings.s3_public_base_url else "signed"
        print(f"[ok]   generated a {kind} URL")

        try:
            with urllib.request.urlopen(url, timeout=30) as res:
                body = res.read()
        except urllib.error.HTTPError as exc:
            print(f"[FAIL] the URL returned HTTP {exc.code} — the app could not serve this file")
            return 1

        if body != MARKER:
            print(f"[FAIL] fetched the wrong bytes: {body[:40]!r}")
            return 1
        print("[ok]   fetched the exact bytes over HTTP")

        # Range support is what makes lecture video seekable.
        req = urllib.request.Request(url)
        req.add_header("Range", "bytes=0-3")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                partial, status = res.read(), res.status
            if status == 206 and partial == MARKER[:4]:
                print("[ok]   range requests work — video seeking will work")
            else:
                print(f"[warn] range request returned {status}; video seeking may not work")
        except Exception as exc:
            print(f"[warn] range request failed ({exc}); video seeking may not work")
    finally:
        storage.delete(TEST_NAME)
        print("[ok]   cleaned up the test object")

    print("\nStorage is working. Set the same variables on your host.")
    if not settings.s3_public_base_url:
        print(f"Signed URLs expire after {settings.s3_url_expiry_seconds}s — keep the bucket private.")
    else:
        print("S3_PUBLIC_BASE_URL is set, so files are served publicly with no expiry.")
        print("Paid booklets and videos should normally use signed URLs instead.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
