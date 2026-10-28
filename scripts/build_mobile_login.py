"""Package the standalone mobile login page for Caddy; no Foundry module install."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
files = ("index.html", "login.css", "main.mjs", "login.mjs", "foundry-client.mjs",
         "pwa.mjs", "manifest.webmanifest", "icons/mc-180.png", "icons/mc-192.png", "icons/mc-512.png",
         "icons/mc-maskable-512.png")
output = root / "dist" / "mobile-login.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / "mobile-login" / name, name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
print(f"Built {output} ({len(files)} static files)")
