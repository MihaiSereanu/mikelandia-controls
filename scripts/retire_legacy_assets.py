"""Retire pre-rename release assets after the canonical package is uploaded."""
import argparse
import json
import subprocess

LEGACY_ASSETS = {"module-experimental.json", "ve-mobile-experimental.zip", "ve-mobile.zip"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    release = json.loads(subprocess.check_output(
        ["gh", "release", "view", args.tag, "--json", "assets"], text=True
    ))
    for asset in release["assets"]:
        if asset["name"] in LEGACY_ASSETS:
            subprocess.run(["gh", "release", "delete-asset", args.tag, asset["name"], "--yes"], check=True)


if __name__ == "__main__":
    main()
