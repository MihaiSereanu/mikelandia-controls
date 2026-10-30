# Current status

Updated 2026-10-30. Source contracts: [architecture](architecture.md). Operations: [mobile login](mobile-login.md) and [migration](migration.md).

## Deployment

Recorded deployment facts; installed files and the remote host were not rechecked for this documentation pass.

- Static PWA: six `/mobile/` files deployed on 2026-10-29; public HTTPS hashes verified and native routes returned HTTP 200. Receipt: `dist/pwa-gold-live-deployment.json`. Rollback: [mobile login](mobile-login.md#rollback). Installed-app review remains pending.
- Local module: package 1.1.0 installed on 2026-10-29 at `D:/FoundryVTT/Data/modules/mikelandia-controls`; 186 packaged file hashes matched. Receipt: `dist/local-install-evidence.json`. Backup: `D:/FoundryVTT/module-backups/mikelandia-controls-20261029-120408.zip`. Foundry was not restarted; world activation was not checked.
- Hosted investigation on 2026-10-30: `mikelandia-controls` 1.1.31 on Foundry 14.367, active Warhammer world. All 133 entry-graph JavaScript files matched the pre-correction checkout; assets returned HTTP 200. Active modules include Common Display 14.01 and Carolingian UI 4.6.2. Receipt: `dist/deployed-asset-audit.json`. The libWrapper startup correction below is not deployed.

## Runtime status and checkout-only correction

The hosted source matches the implementation before the startup correction below. That correction remains uninstalled and unpublished; the other behavior notes retain their verification gaps.

- Exact hosted-world-copy testing reproduced the remaining 1.1.31 startup failure: libWrapper's managed initialize accessor re-entered our wrapper, creating 213 loaders and 457 init hooks while game.ready stayed false. The correction uses Game.create plus an own instance initializer, preserving the managed prototype and delegating once. Loader remounts preserve Continue/recovery phases, and all ready-stage failures enter recovery. Only the isolated copy is patched so far. Evidence: `dist/investigate-native-libwrapper-before-summary.json`, `dist/investigate-native-libwrapper-probe.json`, `dist/investigate-native-matrix-*.json`.

- Mobile startup now reads the registered Foundry client mode inside Game initialization instead of allowing a stale bootstrap cache to skip the companion. Common Display's actual 14.01 root-hide rule is covered by bootstrap/recovery-only visibility protection. Full lifecycle fixtures now begin without game, dispatch init/setup/ready, and cover mismatched caches, actual app mounting, native opt-out and Back with Hide UI. Hosted-phone verification remains pending.

- The Desktop companion client is removed. Physical desktops always use native Foundry, including with saved Phone/Tablet overrides; shared arm labels and Momentum support still install. Active mobile clients alone load the companion runtime/styles. Phones/tablets retain Use native Foundry. Historical graphics/theme/Carolingian overrides have upgrade-only cleanup with native error notifications. Future general theme/Carolingian changes are runtime-only; permanent WFRP theme-off remains. Native-world upgrade and phone verification remain pending.

- Phone/Tablet audio now blocks loading and playback rather than muting. Existing local sounds/media stop; native audio contexts suspend; the optional mute control is removed. No playback state is preserved or resumed. Hidden-board main-stage screen draws are skipped while native token updates and the ticker remain active. Node and browser fixture verification is recorded below; native-world and physical-device verification remain pending.

- WFRP 4e/5e arm translations automatically use Right Arm / Left Arm on native, Phone and Tablet clients. Native handedness calculations remain unchanged. Startup-hook fixture verification passed; native-world verification remains pending.

- WFRP 5e opposed Momentum compatibility routes unowned participant gain/clearing through a validated active-GM query on mobile and desktop. Node permission/transport fixtures cover linked/unlinked NPCs, ownership, result validation, missing GM and cleanup. Native-world verification remains pending.

- Selected-PC damage feedback across Phone/Tablet routes for D&D 5e, Shadowdark and WFRP 4e/5e: ordinary hits clear within two seconds. Crossing zero adds “You’re down!”; only the mist remains after the notification expires, until remaining HP/Wounds changes. Close/Escape does not dismiss zero-health mist. Node and browser fixture evidence; native-world and physical-device verification remain pending.

- Phone/Tablet mode saves all WFRP Theme sections off in the browser and enforces that preference while mobile mode runs. Choosing native Foundry does not restore the old WFRP theme. Native-world verification remains pending.

- WFRP signed SL controls, a separate Effects tab with native condition actions and 5e references, and revised effect/item rows. Engaged is excluded from mobile condition tracking; Injuries moved from Combat to Effects. Native encumbrance penalties remain in WFRP Combat.
- The main Combat route is labelled Initiative. Targets also appears in WFRP Character > Combat and Magic, Shadowdark Abilities and Spells, and D&D Overview and Spells.
- WFRP conditions use an app-themed picker capped at half the viewport, with scrollable choices, Close, outside-tap and Escape dismissal.
- Collapsible WFRP/Shadowdark descriptions and expanded Effects Notes preserve source formatting; D&D effect disclosures retain complete descriptions. Secret content and executable markup remain excluded.
- Condition references and Notes tooltips now associate their triggers with native popovers, preventing a second touch from closing and immediately reopening them. Outside taps dismiss and preserve the tapped control's action.

- Controls & Gestures now explains the main tabs and system-specific Character tabs, with tab headings, bold controls and a short controls list. Mobile help follows the selected character and Warhammer edition.

Behavioral contracts are in [architecture](architecture.md). Publication requires separate authorization: pushing main publishes the rolling `latest` release.

## Remaining verification and known issues

- Native worlds: Effects/condition actions, signed SL controls, character-tab Targets and health, Notes/ambition saves, WFRP resources/recovery/movement/XP/Social Status, character selection, roll dialogs, Shadowdark counters, Logout/loading, and renamed-module activation. Current coverage is primarily source and browser fixtures.
- Targeting: native v13 runtime, actual system roll/chat, and persisted two-player deletion checks.
- Physical devices: character/Initiative UI, roll dialogs, isolation/Settings with Hide UI, installed PWA/login-to-game display, keyboard behavior, and audio blocking/battery impact. Native-world verification of token selection and animated distances with hidden-board drawing skipped remains pending.
- WFRP cancellation: native 4e-world review remains pending; the reported 5e lock was not reproduced in a fresh session. WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a [native bug](architecture.md#warhammer-resources) controlled by **Details > Consumes Ammo**.

## Latest recorded evidence

These records cover specific revisions and scopes, not all current changes. They do not establish physical-device behavior.

| Scope | Result | Evidence |
|---|---|---|
| libWrapper startup and loader phases | Full Node suite; 105 browser scenarios / 6,472 checks; archive validation. Isolated hosted-world copy uses Foundry 14.367 and all 30 active modules. Native phone/tablet/player/GM/wake startup and Settings/Back pass; desktop GM stays native with shared arm/Momentum fixes. A simulated gesture-only wake policy preserves Continue through a late theme save, then completes after a trusted tap. Player file-browser permission warnings remain; physical-device confirmation is separate. | `tests/shared-entry.test.mjs`, `tests/browser/shared-entry.mjs`, `tests/browser/bootstrap.mjs`, `dist/investigate-native-matrix-summary.json`, `dist/investigate-native-matrix-wake-gesture-phone.json` |
| Stale-mode startup and Common Display recovery | Full Node suite; 104 browser scenarios / 6,411 checks; local archive/import validation (198 files). Startup fixtures now execute init/setup/ready with no game at import, cover both cache mismatch directions and mounted API, and exercise Settings/Back with the actual Common Display 14.01 hide selector. Bootstrap/recovery visibility and controls pass in regular/simulated standalone. Hosted-phone confirmation remains pending; correction is checkout-only. | `tests/shared-entry.test.mjs`, `tests/browser/shared-entry.mjs`, `tests/browser/bootstrap.mjs`, `tests/browser/fixtures/monks-common-display-14.01-root-hide.css` |
| Native desktop boundary and mobile-only runtime | Full Node suite; 99 browser scenarios / 6,312 checks; local archive/import validation (198 files). Shared-entry fixtures cover desktop saved overrides, shared arm/Momentum fixes, mobile native opt-out, absence of desktop UI/API/styles, and mobile import completion before native init. Upgrade/theme/Carolingian fixtures cover local cleanup and runtime-only overrides. Live-world/physical-device verification remains pending. | `tests/shared-entry.test.mjs`, `tests/browser/shared-entry.mjs`, `tests/activation-policy.test.mjs`, `tests/client-upgrade-cleanup.test.mjs`, `tests/theme-gateway.test.mjs`, `tests/mobile-module-compatibility.test.mjs` |
| Audio blocking and hidden-board rendering | Full Node suite; 96 browser scenarios / 6,286 checks. Four targeting fixtures / 216 checks exercise selection and moving-token distances with board screen draws skipped. Audio fixtures cover native loads/playback, first-gesture contexts, queued sounds, HTML media and YouTube. Native-world/audio listening and battery measurements remain pending. | `tests/mobile-audio.test.mjs`, `tests/hidden-canvas-rendering.test.mjs`, `tests/presentation-isolation.test.mjs`, `tests/browser/targeting.mjs` |
| Damage feedback | Full Node suite; eight phone/tablet damage fixtures / 512 checks cover all supported integrations, two-second notice expiry, zero-health wording and mist persistence through Close/Escape and max-only updates, health-change clearing, repeated hits and route persistence | `tests/damage-feedback.test.mjs`, `tests/browser/damage-feedback.mjs`, `dist/damage-*-{phone,tablet}.png` |
| Combat and spell targeting | Node suite; six phone/tablet browser fixtures exercise all three systems, shared selection/collapse, spell-tab placement, live distance/focus and combat-end removal; four native-style targeting fixtures / 216 checks cover summary bottom spacing | `tests/browser/in-person.mjs`, `tests/browser/targeting.mjs` |
| Magic Targets and condition picker | Node suite passed; browser fixtures cover shared Magic targeting, live distance/focus, light/dark picker sizing, native button defaults, Close, outside touch and Escape; remaining browser cases passed in a separate run | `tests/browser/in-person.mjs`, `tests/browser/warhammer.mjs`, `scripts/browser/tooltip-touches.mjs` |
| WFRP Theme policy | Full Node suite; 88 browser scenarios / 5,645 checks, including 18 phone/tablet policy checks for persistence, native surfaces, enforcement, Desktop behavior and cleanup | `tests/wfrp-theme-policy.test.mjs`, `tests/browser/wfrp-theme-policy.mjs` |
| Controls guide | Full Node suite; 86 browser scenarios / 5,627 checks, including phone/tablet help content and formatting | `dist/controls-guide-evidence.json` |
| Tooltip dismissal | Full Node suite; 87 browser scenarios / 6,529 checks, including trusted touch input at phone, tablet and narrow widths | `dist/tooltip-dismissal-evidence.json` |
| Description formatting | Full Node suite plus new D&D regression; 83 browser scenarios / 4,971 checks, followed by 5 final effect-layout scenarios / 94 checks | `dist/description-formatting-evidence.json` |
| Conditions layout and current checkout | 383 Node tests; 84 browser scenarios / 5,860 checks, including native button defaults and mixed condition rows | `dist/conditions-layout-evidence.json` |
| Loading | Light/dark fixtures / 38 checks | `dist/bootstrap-{light,dark}-phone.png` |
| Native targeting animation | 12 v14 checks in an isolated copied Shadowdark world; no world document writes | `dist/targeting-animation-native-check.json` |
