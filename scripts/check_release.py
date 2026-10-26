"""Verify that Foundry can download both public installation channels."""
import argparse
from io import BytesIO
import json
from time import sleep
from urllib.request import urlopen
from zipfile import ZipFile


def check(base, version, build):
    for suffix in ("", "-experimental"):
        manifest_url = f"{base}/module{suffix}.json"
        with urlopen(f"{manifest_url}?build={build}", timeout=45) as response:
            manifest = json.load(response)
        if manifest["version"] != version or manifest["manifest"] != manifest_url:
            raise ValueError(f"Unexpected public manifest: {manifest_url}")
        with urlopen(f"{manifest['download']}?build={build}", timeout=45) as response:
            data = response.read()
        with ZipFile(BytesIO(data)) as archive:
            if archive.testzip() or json.loads(archive.read("module.json")) != manifest:
                raise ValueError(f"Public archive does not match {manifest_url}")
            if any(name.startswith(("tests/", "dist/", ".git/")) for name in archive.namelist()):
                raise ValueError("Unexpected development files in public archive")
        systems = manifest.get("relationships", {}).get("systems", [])
        if (suffix and systems) or (not suffix and [s["id"] for s in systems] != ["dnd5e"]):
            raise ValueError("Unexpected installation channel restriction")
        print(f"Verified anonymous manifest and matching ZIP: module{suffix}.json {version}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--build", required=True)
    args = parser.parse_args()
    for attempt in range(4):
        try:
            check(args.base_url.rstrip("/"), args.version, args.build)
            break
        except Exception:
            if attempt == 3:
                raise
            sleep(5)
