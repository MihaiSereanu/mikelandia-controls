# Current status

Updated 2026-10-29. Source contracts: [architecture](architecture.md). Operations: [mobile login](mobile-login.md) and [migration](migration.md).

## Deployment

Recorded deployment facts; installed files and the remote host were not rechecked for this documentation pass.

- Static PWA: six `/mobile/` files deployed on 2026-10-29; public HTTPS hashes verified and native routes returned HTTP 200. Receipt: `dist/pwa-gold-live-deployment.json`. Rollback: [mobile login](mobile-login.md#rollback). Installed-app review remains pending.
- Local module: package 1.1.0 installed on 2026-10-29 at `D:/FoundryVTT/Data/modules/mikelandia-controls`; 186 packaged file hashes matched. Receipt: `dist/local-install-evidence.json`. Backup: `D:/FoundryVTT/module-backups/mikelandia-controls-20261029-120408.zip`. Foundry was not restarted; world activation was not checked.
- Last recorded remote module: `ve-mobile` 1.1.15. Renamed-module publication and per-world migration remain pending. Last recorded local/remote Foundry versions: 14.369 / 14.367.

## Checkout-only work

Changes since the local installation remain unpackaged and uninstalled:

- WFRP signed SL controls, a separate Effects tab with native condition actions and 5e references, and revised effect/item rows. Engaged is excluded from mobile condition tracking; Injuries moved from Combat to Effects. Native encumbrance penalties remain in WFRP Combat.
- The main Combat route is labelled Initiative. Targets also appears in WFRP Character > Combat, Shadowdark Abilities, and D&D Overview.
- Collapsible WFRP/Shadowdark descriptions and expanded Effects Notes preserve source formatting; D&D effect disclosures retain complete descriptions. Secret content and executable markup remain excluded.
- Condition references and Notes tooltips now associate their triggers with native popovers, preventing a second touch from closing and immediately reopening them. Outside taps dismiss and preserve the tapped control's action.

- Controls & Gestures now explains the main tabs and system-specific Character tabs, with tab headings, bold controls and a short controls list. Mobile help follows the selected character and Warhammer edition.

Behavioral contracts are in [architecture](architecture.md). Publication requires separate authorization: pushing main publishes the rolling `latest` release.

## Remaining verification and known issues

- Native worlds: Effects/condition actions, signed SL controls, character-tab Targets and health, Notes/ambition saves, WFRP resources/recovery/movement/XP/Social Status, character selection, roll dialogs, Shadowdark counters, Logout/loading, and renamed-module activation. Current coverage is primarily source and browser fixtures.
- Targeting: native v13 runtime, actual system roll/chat, and persisted two-player deletion checks.
- Physical devices: character/Initiative UI, roll dialogs, isolation/Settings with Hide UI, installed PWA/login-to-game display, keyboard behavior, and audible mute.
- WFRP cancellation: native 4e-world review remains pending; the reported 5e lock was not reproduced in a fresh session. WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a [native bug](architecture.md#warhammer-resources) controlled by **Details > Consumes Ammo**.

## Latest recorded evidence

These records cover specific revisions and scopes, not all current changes. They do not establish physical-device behavior.

| Scope | Result | Evidence |
|---|---|---|
| Controls guide | Full Node suite; 86 browser scenarios / 5,627 checks, including phone/tablet help content and formatting | `dist/controls-guide-evidence.json` |
| Tooltip dismissal | Full Node suite; 87 browser scenarios / 6,529 checks, including trusted touch input at phone, tablet and narrow widths | `dist/tooltip-dismissal-evidence.json` |
| Description formatting | Full Node suite plus new D&D regression; 83 browser scenarios / 4,971 checks, followed by 5 final effect-layout scenarios / 94 checks | `dist/description-formatting-evidence.json` |
| Conditions layout and current checkout | 383 Node tests; 84 browser scenarios / 5,860 checks, including native button defaults and mixed condition rows | `dist/conditions-layout-evidence.json` |
| Loading | Light/dark fixtures / 38 checks | `dist/bootstrap-{light,dark}-phone.png` |
| Native targeting animation | 12 v14 checks in an isolated copied Shadowdark world; no world document writes | `dist/targeting-animation-native-check.json` |
