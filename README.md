# VE Mobile

Private development repository for extending [VE Mobile by Silvestrae](https://github.com/Silvestrae/ve-mobile) to additional Foundry VTT systems.

The starting point is the installed 1.0.7 distribution captured on 26 October 2026. The `upstream-v1.0.7` tag preserves that exact snapshot; this repository does not contain the original project's commit history. The original MIT license and copyright remain in [LICENSE](LICENSE).

## Current status

The runtime remains the original D&D5e implementation. Warhammer 4e/5e and Shadowdark support is planned, not implemented or live-tested. See [the implementation direction](docs/implementation-direction.md).

Keep shared rendering and navigation code independent of individual systems. Visible labels, grouping, and controls must use the actual game's terminology, preferably its own localization strings.

## Working locally

The development checkout is `D:\Projects\ve-mobile`. The installed module at `D:\FoundryVTT\Data\modules\ve-mobile` is a separate copy. Changes here do not update the installed copy automatically.

The module ID remains `ve-mobile`, so this development version replaces the upstream module when installed. Foundry updates for this checkout point to this repository. Avoid installing the upstream package over a customized installation.

## Packaging and releases

Build with Python 3 using a release version greater than 1.0.7:

```powershell
py -3 scripts/build_release.py --version 1.0.8
```

This writes `dist/module.json` and `dist/ve-mobile.zip`. The archive contains only runtime files, the manifest, and the license. The packaged version comes from the command argument; the working manifest is not rewritten.

Push a version tag when ready to publish a release:

```powershell
git tag v1.0.8
git push origin v1.0.8
```

The release workflow builds the archive and creates a GitHub release with both assets. Ordinary pushes validate packaging without publishing a release. The first release should use a version above the installed baseline so Foundry can recognize an update.

The intended stable manifest address is:

```text
https://github.com/MihaiSereanu/ve-mobile/releases/latest/download/module.json
```

**While the repository is private, this is an authenticated GitHub address, not a working anonymous Foundry installer URL.** Foundry must be able to download both the manifest and its ZIP. Before enabling manifest installation, arrange hosting accessible to the Foundry server for both files, or an authenticated download service compatible with it. Keeping source private while exposing release assets on separate hosting is also possible. Signing into GitHub in a browser does not authenticate Foundry's server-side downloads. Do not put GitHub tokens in manifests, download URLs, or commits.

For separate hosting, supply `--manifest-url` and `--download-url` when building. These values are written into both manifest copies:

```powershell
py -3 scripts/build_release.py --version 1.0.8 --manifest-url https://downloads.example.com/ve-mobile/module.json --download-url https://downloads.example.com/ve-mobile/1.0.8/ve-mobile.zip
```

Upload both generated files to the selected host. The example domain above is a placeholder.
