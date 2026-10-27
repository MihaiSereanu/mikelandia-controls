"""Build a Foundry module archive using only the Python standard library."""

import argparse
import json
from pathlib import Path
import re
import posixpath
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/MihaiSereanu/ve-mobile"
RUNTIME_ENTRIES = ("src", "assets", "locales", "Icon.svg", "LICENSE")

def download_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Release URLs must be HTTPS addresses without embedded credentials")
    return value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--manifest-url")
    parser.add_argument("--download-url")
    parser.add_argument("--experimental-fallback", action="store_true",
                        help="Mark this build as an experimental cross-system package")
    args = parser.parse_args()
    if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", args.version):
        parser.error("Version must be MAJOR.MINOR.PATCH with no leading zeroes")

    manifest = json.loads((ROOT / "module.json").read_text(encoding="utf-8"))
    manifest.update(
        version=args.version,
        url=REPOSITORY,
        manifest=download_url(args.manifest_url or f"{REPOSITORY}/releases/download/latest/{'module-experimental.json' if args.experimental_fallback else 'module.json'}"),
        download=download_url(args.download_url or f"{REPOSITORY}/releases/download/latest/{'ve-mobile-experimental.zip' if args.experimental_fallback else 've-mobile.zip'}"),
    )
    if manifest["id"] != "ve-mobile":
        raise ValueError("Unexpected module ID")
    if args.experimental_fallback:
        relationships = manifest.get("relationships", {})
        relationships.pop("systems", None)
        if not relationships:
            manifest.pop("relationships", None)
        manifest["description"] = (
            "Experimental Mikelandia Controls development build: D&D5e mobile sheets, Warhammer character "
            "panels/actions/resources, Shadowdark PC panels/actions/inventory, and native-sheet fallback. Cross-system compatibility is unverified."
        )
    files = []
    for entry in RUNTIME_ENTRIES:
        path = ROOT / entry
        if not path.exists():
            raise FileNotFoundError(path)
        files.extend(sorted(p for p in path.rglob("*") if p.is_file()) if path.is_dir() else [path])
    included = {path.relative_to(ROOT).as_posix() for path in files}
    references = [*manifest.get("esmodules", []), *manifest.get("scripts", []),
                  *manifest.get("styles", []), *[lang["path"] for lang in manifest.get("languages", [])]]
    for reference in references:
        if reference.removeprefix("./") not in included:
            raise ValueError(f"Manifest references a missing runtime file: {reference}")
    for path in files:
        if path.suffix == ".json":
            json.loads(path.read_text(encoding="utf-8"))

    output = ROOT / "dist"
    if args.experimental_fallback:
        output = output / "experimental"
    output.mkdir(exist_ok=True)
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    (output / "module.json").write_text(manifest_text, encoding="utf-8")
    archive_path = output / "ve-mobile.zip"
    with ZipFile(archive_path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("module.json", manifest_text)
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())
    with ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        if set(archive.namelist()) != included | {"module.json"}:
            raise ValueError("Archive has unexpected contents")
        if json.loads(archive.read("module.json")) != manifest:
            raise ValueError("Archive manifest differs from release manifest")
        for name in archive.namelist():
            if not name.endswith((".mjs", ".js")):
                continue
            source = archive.read(name).decode("utf-8")
            for reference in re.findall(r'''(?:from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}/[^"']+)''', source):
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), reference))
                if target not in included:
                    raise ValueError(f"Missing packaged import: {name} -> {reference}")
    print(f"Built {archive_path} ({len(files) + 1} files), version {args.version}")

if __name__ == "__main__":
    main()
