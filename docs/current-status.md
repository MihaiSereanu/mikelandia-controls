# Current status

Updated 2026-10-29. Source contracts: [architecture](architecture.md). Operations: [mobile login](mobile-login.md) and [migration](migration.md).

## Deployment

These are recorded deployment facts; the remote host was not rechecked during this cleanup.

- Static PWA update on 2026-10-29: six targeted `/mobile/` files were deployed and their public HTTPS hashes verified. Foundry process remained unchanged; native routes returned HTTP 200. Receipt: `dist/pwa-gold-live-deployment.json`. Backup: `/var/backups/mikelandia-mobile/20261029-121703-gold-icon`. Physical installed-app review remains pending.
- Local installation on 2026-10-29: package 1.1.0 was copied into `D:/FoundryVTT/Data/modules/mikelandia-controls`; all 186 packaged file hashes matched. Receipt: `dist/local-install-evidence.json`. Backup: `D:/FoundryVTT/module-backups/mikelandia-controls-20261029-120408.zip`. Foundry was not restarted and world activation was not checked.
- Last recorded remote module: `ve-mobile` 1.1.15. Renamed-module publication and per-world migration remain pending. Use the [migration runbook](migration.md); local and remote package versions are separate.

## Checkout-only work

The latest WFRP additions and layout/contrast corrections have not been packaged or copied into the installed module. Combat now includes native encumbrance penalties in a conditional disclosure and a conditional read-only Injuries card. Each injury uses one horizontal row with its name, truncated player notes (press for the full-text tooltip), and duration. The recorded local package therefore does not contain every checkout change.

Publication requires separate authorization. Pushing main publishes the rolling `latest` release; see [packaging](architecture.md#packaging).

## Remaining verification and known issues

- Native-world review: Combat health, Notes/ambition saves, Warhammer counters/recovery/movement/XP and Social Status, character selection, roll dialogs, Shadowdark counters, Logout/loading, and renamed-module activation. Current coverage is primarily source and browser fixtures.
- Combat targeting: native v13 runtime, actual system roll/chat, and persisted two-player deletion checks remain pending.
- Physical-device review: character and Combat UI, roll dialogs, isolation/Settings with Hide UI, PWA installation and login-to-game display, keyboard behavior, and audible mute. Browser fixtures and Android emulation do not establish phone behavior or audible silence.
- Native 4e-world cancellation review remains pending. The reported 5e lock was not reproduced in a fresh session.
- WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a [native bug](architecture.md#warhammer-resources) controlled by **Details > Consumes Ammo**.
- Last recorded local/remote Foundry versions: 14.369 / 14.367.

## Latest recorded evidence

- WFRP Combat additions: 380 Node tests and 79 browser scenarios / 5,022 checks passed with `--native-assets`. This includes native penalty thresholds, single-row injuries, truncated notes with press-to-open full-text tooltips, GM-note exclusion, disclosure refresh/character-switch behavior, and viewport bounds. Receipt: `dist/wfrp-combat-evidence.json`; logs: `dist/wfrp-combat-{node,browser}-checks.txt`.
- Loading: light/dark fixtures passed 38 checks; previews: `dist/bootstrap-{light,dark}-phone.png`.
- Native targeting: 12 v14 animation checks passed in an isolated copied Shadowdark world without world document writes. Receipt: `dist/targeting-animation-native-check.json`.

The WFRP Combat checks were run for the checkout additions; other entries retain their earlier evidence. Native-world and physical-device gaps above remain open.
