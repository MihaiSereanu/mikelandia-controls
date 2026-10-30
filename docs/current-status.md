# Current status

Updated 2026-10-30. [Task map and contracts](architecture.md#task-map); [PWA operations](mobile-login.md); [migration](migration.md).

## Deployment

Recorded facts from earlier checks; this maintenance pass did not recheck installed files or the host. Receipts describe their recorded revisions, not all current changes.

- Static PWA: six `/mobile/` files deployed 2026-10-29; public HTTPS hashes matched and native routes returned HTTP 200. Receipt: `dist/pwa-gold-live-deployment.json`. [Rollback](mobile-login.md#rollback). Installed-app review pending.
- Local module: 1.1.0 installed 2026-10-29 at `D:/FoundryVTT/Data/modules/mikelandia-controls`; 186 packaged hashes matched. Receipt: `dist/local-install-evidence.json`. Backup: `D:/FoundryVTT/module-backups/mikelandia-controls-20261029-120408.zip`. No restart or world-activation check.
- Hosted baseline on 2026-10-30: 1.1.31, Foundry 14.367, Warhammer world; all 133 entry-graph JavaScript files matched the then-current checkout. Active modules included Common Display 14.01 and Carolingian UI 4.6.2. Receipt: `dist/deployed-asset-audit.json`.
- Latest hosted check that day: manifest 1.1.32; `src/entry.mjs` matched the libWrapper correction. Both runtime files for the Carolingian repair differed from the host. Receipt: `dist/carolingian-startup-live-audit.json`. This entry check does not establish full checkout deployment.

## Open corrections and verification

- **Checkout-only YouTube loading prevention:** Phone/Tablet now blocks the widget's API script and bootstrap before iframe construction, with safe incoming setting callbacks. Actual YouTube Player Widget 4.0.0 in an isolated local Foundry world: before-fix Phone and current Desktop loaded API/embed; corrected GM Phone/Tablet and player Phone made zero YouTube or media requests. Not deployed; physical listening and battery impact remain unverified. Evidence: `dist/youtube-native-network.json`, reproduction: `dist/check-youtube-native.mjs`.
- **Checkout-only Carolingian repair:** asynchronous `disable-ui` registration could race historical preference cleanup, warn and abort mobile startup. The repair waits up to five seconds, releases canvas after graphics/theme restoration, and continues startup after cleanup warnings while retaining failed receipts. Fixtures pass; hosted-world and physical-phone checks pending. [Startup contract](architecture.md#startup-contract).
- **Checkout-only Effects alignment:** consistent item/Notes/duration metrics and row heights; damage wording uses singular/plural wounds. Fixture evidence below; live-world and phone checks pending.
- Native worlds: desktop/mobile upgrade cleanup, permanent WFRP theme-off, arm labels, opposed Momentum permissions, Effects/conditions, signed SL, character-tab Targets and health, Notes/ambition saves, WFRP resources/recovery/movement/XP/Social Status, character selection, roll dialogs, Shadowdark counters, Logout/loading and renamed-module activation. Existing source/browser fixtures do not close these gaps.
- Targeting: native v13, actual system roll/chat and persisted two-player deletion checks remain pending. With hidden-board drawing skipped, native token selection and animated distances still need verification.
- Physical devices: character/Initiative UI, damage feedback, roll dialogs, isolation/Settings with Hide UI, startup with stale mode caches, installed PWA/login-to-game display, keyboard behavior, audio listening and battery impact. Hosted-world-copy and simulated standalone/gesture checks below are separate evidence.
- WFRP cancellation: native 4e review pending; reported 5e lock not reproduced in a fresh session. WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a [native issue](architecture.md#native-ammunition-issue), controlled by **Details > Consumes Ammo**.

## Latest recorded evidence

Historical results below apply to their tested revisions. Test owners and rerun commands are in the [task map](architecture.md#task-map). Durable behavior belongs in the linked contracts.

| Scope | Recorded result and limits | Essential evidence |
|---|---|---|
| Carolingian cleanup | Full Node suite; 109 browser scenarios / 6,544 checks, then 76 focused upgrade checks including overlay dismissal. Delayed/missing registration and damaged receipts covered. Fixture only; unpublished repair. | `tests/client-upgrade-cleanup.test.mjs`, `tests/browser/shared-entry.mjs`, `dist/shared-entry-upgrade-late-phone.png` |
| Effects alignment / damage wording | Full Node suite; 109 browser scenarios / 6,622 checks. Fixture only. | `tests/browser/warhammer.mjs`, `tests/browser/damage-feedback.mjs`, `dist/warhammer-effects-phone.png` |
| libWrapper startup / loader | Isolated hosted-world copy: Foundry 14.367, all 30 active modules; phone/tablet/player/GM/wake and Settings/Back passed; desktop stayed native. Simulated gesture-only wake completed after trusted tap. Player file-browser permission warnings remain. Full Node suite, 105 browser scenarios / 6,472 checks and archive validation also passed. Physical-device confirmation pending. | `dist/investigate-native-matrix-summary.json`, `dist/investigate-native-matrix-wake-gesture-phone.json`; failure diagnosis: `dist/investigate-native-libwrapper-before-summary.json`, `dist/investigate-native-libwrapper-probe.json` |
| Mode authority / Common Display / desktop boundary | Lifecycle fixtures start without game, cover cache mismatches, mounted API, native opt-out, desktop shared fixes and no companion UI/styles. Actual Common Display 14.01 hide selector covered for Settings/Back and bootstrap/recovery, including simulated standalone. Archive/import validation: 198 files. | `tests/shared-entry.test.mjs`, `tests/browser/shared-entry.mjs`, `tests/browser/bootstrap.mjs`, `tests/browser/fixtures/monks-common-display-14.01-root-hide.css` |
| Audio / hidden-board rendering | YouTube loading prevention: full Node suite passed; 19 startup/in-person browser scenarios / 542 checks passed. Five actual-widget local-world controls passed on Foundry 14.369 / Shadowdark 4.0.6, with only Mikelandia Controls, YouTube Player Widget and libWrapper enabled; native incoming setting callbacks exercised without errors. Earlier hidden-board evidence: four targeting fixtures / 216 checks. No listening or battery proof. | `dist/youtube-native-network.json`, `tests/mobile-audio.test.mjs`, `tests/hidden-canvas-rendering.test.mjs`, `tests/presentation-isolation.test.mjs`, `tests/browser/targeting.mjs` |
| Damage feedback | Eight phone/tablet fixtures / 512 checks: all supported integrations, expiry, zero-health mist, Close/Escape, max-only updates, repeated hits and route persistence. | `tests/damage-feedback.test.mjs`, `tests/browser/damage-feedback.mjs` |
| Native targeting animation | 12 v14 checks in an isolated copied Shadowdark world; no world document writes. | `dist/targeting-animation-native-check.json` |
| UI contracts | Recorded fixture passes for targeting placement, condition picker, theme policy, controls guide, tooltip dismissal and description formatting. See task map for current test owners; these results do not establish live/device behavior. | `dist/controls-guide-evidence.json`, `dist/tooltip-dismissal-evidence.json`, `dist/description-formatting-evidence.json`, `dist/conditions-layout-evidence.json` |

No publication in this pass. Pushing main publishes the rolling `latest` release and requires separate authorization.
