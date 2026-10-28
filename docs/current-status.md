# Current status

Updated 2026-10-28. Durable behavior and source boundaries: [architecture](architecture.md). Operations: [mobile login](mobile-login.md) and [migration](migration.md).

## Deployment

These are the last recorded deployment facts; this documentation pass did not recheck the remote host.

- The live module was `ve-mobile` 1.1.15, with Momentum alignment and the native 4e chooser cancellation correction. Journal filtering was deployed earlier as a targeted three-file change. Rollback locations: [migration](migration.md#rollback).
- Login/PWA fixes were deployed at `https://mikelandia.duckdns.org/mobile/`: installation help and standalone spacing. Only the spacing delta reached the two live `ve-*` CSS files; the rebrand and local Profile wording edit remained local. Recorded validation reported 12 matching public file hashes and no Foundry/Caddy restart. That receipt is absent from this checkout. [Rollback](mobile-login.md#rollback).
- The checkout, repository/origin, module ID and package now use `mikelandia-controls`. The renamed release and world migration remain pending. Follow [migration](migration.md) after publication; enabling the new ID is a per-world operation.

## Local changes awaiting installation or publication

| Area | Pending changes |
|---|---|
| Native rolls | Shadowdark/Warhammer dialog styling, native icon fonts, 44px header controls, Damage/Charging alignment, and compact state labels. |
| Shadowdark | Immediate-save resource counters, numeric entry, and individual session padlocks; AC stays read-only. |
| Combat targets | Collapsed selector, source label, scene-safe filtering, and distance updates during native token animation that preserve rows and focus. |
| Login and loading | Prefix-aware mobile Logout. |
| Rebrand | Browser preferences/restoration receipts and Actor/raw-token flags migrate without overwriting destination values. No coexistence guard. |
| Isolation and audio | Native Settings visibility with Common Display Hide UI, and the Shadowdark/YouTube mute-loop latency fix. |
| Source organization | 89 modules grouped by responsibility across kernel, Foundry adapters, character UI, and shared UI; imports, fixtures, worker/artwork URLs, and architecture map updated. |
| Cleanup and packaging | Dead-code/graphics-policy cleanup and a single release channel. Publication retires obsolete release assets. |

Latest recorded package: `dist/mikelandia-controls.zip`, version 1.1.0. The latest roll-dialog corrections have not been installed. This package version does not describe the recorded remote `ve-mobile` version.

Earlier notes conflict on publication scope: one authorizes commit/push of all current changes, including Profile wording; another limits publication to journal, roll-latency and Momentum/cancellation fixes. Confirm scope before publication. Changes remain local. Pushing main triggers the rolling `latest` release; see [packaging](architecture.md#packaging).

## Remaining verification and known issues

- Live-world and physical-device checks remain pending for the latest roll dialogs, Shadowdark counters, Logout/loading, and renamed module. Phone review also covers isolation, Settings with Hide UI, PWA installation, login-to-game display, and keyboard behavior.
- Combat targeting still needs native v13 runtime, actual system roll/chat, persisted two-player deletion, and physical-device checks.
- Audio fixtures and Android emulation do not establish audible phone silence; an actual mobile listening check remains required.
- Native 4e-world cancellation review remains pending. The reported 5e lock was not reproduced in a fresh session.
- WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a native bug controlled by **Details > Consumes Ammo**. See [native boundary](architecture.md#warhammer-resources).
- Last recorded local/remote Foundry versions differ: 14.369 / 14.367.

## Latest recorded evidence

Fixture, copied-world and physical-device evidence remain distinct.

- **Source organization:** 356 Node tests and 71 browser fixture scenarios / 3,252 checks passed. All 119 source modules remain reachable from the entry point; relative imports and 54 artwork/worker URLs resolve. Package 1.1.0 rebuilt with 183 files. No live-world or physical-device check was performed for this reorganization.
- **Roll-dialog fixture milestone:** full Node suite and 71 browser scenarios / 3,276 checks passed, including 24 dialog scenarios / 920 checks using the installed Foundry icon font. The receipt records that corrected checkout CSS differs from the unmodified installed CSS. Evidence: `dist/roll-dialog-corrections-evidence.json`. Previews: `dist/roll-dialogs-{shadowdark,4e,5e}-{dark,light}-{phone,tablet,narrow,large-text}.png`.
- **Native targeting:** 12 v14 animation checks passed in an isolated copied Shadowdark world without world document writes, covering intermediate/final/cancel distances, source movement, row/focus preservation and disposal. Evidence: `dist/targeting-animation-native-check.json`.
- **Earlier recorded checks:** copied-world rebrand, Settings/Hide UI and dice-policy checks passed; local Android emulation restored fast rolls, and deployed Android emulation confirmed Momentum geometry and weapon open/close/reopen. PWA emulation covered installation help, manifest and standalone geometry; live login loaded without submitting credentials. Their older `dist/diagnosis/` and PWA receipts are absent from this checkout, so these summaries are historical evidence only.
