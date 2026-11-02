# Current status

Updated 2026-11-02. [Task map and contracts](architecture.md#task-map); [PWA operations](mobile-login.md); [migration](migration.md).

## Deployment

Recorded deployments apply to their tested revisions, not the entire current checkout. Neither installation nor fixture checks establish live-world or physical-device behavior.

- Local module: installed 2026-11-02 at `D:/FoundryVTT/Data/modules/mikelandia-controls`; 202 files matched SHA-256 hashes, manifest 1.1.0. Includes Notes/journal editing, description enrichment, Shadowdark panels, WFRP equipment/mounts, YouTube loading prevention, Carolingian cleanup and Effects alignment. Receipt: `dist/notes-journal-local-deployment.json`. No restart or live-world test accompanied that installation.
- Checkout corrections: Shadowdark spell ordering and Group Item Tracking are not installed. Inventory safety has fixture/package evidence; installed-world verification is pending. See the evidence table and [contract](architecture.md#shadowdark-resources-and-gear).
- Hosted module: last checked 2026-10-30. Full entry-graph audit covered 1.1.31 on Foundry 14.367 with Common Display 14.01 and Carolingian UI 4.6.2 (`dist/deployed-asset-audit.json`). Later, manifest 1.1.32 and the libWrapper entry correction matched, but both Carolingian repair files differed (`dist/carolingian-startup-live-audit.json`). Current host state is unverified.
- Static PWA: six `/mobile/` files deployed 2026-10-29; public HTTPS hashes matched and native routes returned HTTP 200. Receipt: `dist/pwa-gold-live-deployment.json`. [Rollback](mobile-login.md#rollback); installed-app review pending.

## Open issues and verification

- Browser baseline failures: presentation phone/tablet checks reject Shadowdark guide wording; profile-layout narrow/phone/small-tablet/large-text checks reject the compact coin row. Both reproduced on unchanged HEAD; tablet profile layout passed. Evidence: `dist/description-baseline-comparison.json`.
- Installed-world checks remain pending for Notes/journal saves, description links/rolls, Shadowdark panels/counters/inventory, WFRP equipment/mounts, Effects/conditions, signed SL, ambitions, resources/recovery/movement/XP/Social Status, character selection and roll dialogs. Assigned-mount permissions need a live retest (`dist/mount-permission-audit.json`).
- Native startup checks remain pending for desktop/mobile upgrade cleanup, permanent WFRP theme-off, arm labels, opposed Momentum permissions, Logout/loading and renamed-module activation. Carolingian repair needs hosted-world verification.
- Targeting still needs native v13, actual system roll/chat, persisted two-player deletion, and native token-selection/distance checks with hidden-board drawing skipped.
- Physical-device checks remain pending for character/Initiative UI, damage feedback, roll dialogs, isolation/Settings with Hide UI, stale mode caches, installed PWA/login-to-game display, keyboard behavior, audio listening and battery impact.
- WFRP cancellation: native 4e review pending; reported 5e lock was not reproduced in a fresh session. WFRP 10.1.2 / Library 3.5.1 missing-ammo cancellation remains a [native issue](architecture.md#native-ammunition-issue), controlled by **Details > Consumes Ammo**.

## Latest recorded evidence

Results below apply to their recorded revisions. Source/test owners and browser filters are in the [task map](architecture.md#task-map). Common fixture passes are summarized; unique native checks retain their environment and limits.

| Scope | Evidence and limits | Essential artifacts |
|---|---|---|
| Shadowdark spell ordering | Node suite and four native-font responsive browser scenarios passed; phone/tablet screenshots reviewed. | `dist/shadowdark-spells-{phone,tablet}.png` |
| Shadowdark Group Item Tracking | Node suite, four Group and six neighboring Shadowdark/Notes scenarios passed; phone/tablet screenshots reviewed. | `dist/shadowdark-group-{phone,tablet}.png` |
| Shadowdark inventory/panels | Node/package checks and 15 native-font Shadowdark scenarios passed across split runs; one fixture timeout passed on focused rerun. Equipment, abilities and responsive layouts covered. | `dist/shadowdark-inventory-{phone,tablet}.png`, `dist/shadowdark-{main,spells,abilities}-{phone,tablet}.png` |
| Notes/journal editing | 507 Node tests and 12 browser scenarios passed; phone/tablet editor screenshots reviewed. | `dist/journal-editor-{phone,tablet}.png` |
| Description enrichment / UUID previews | Permission, source-change, privacy, nested navigation, secret stripping and trusted-touch fixtures passed. Baseline failures listed above remain separate. | `dist/descriptions-{phone,tablet,narrow}.png` |
| WFRP equipment / mounts | Both editions passed native-font fixtures, including an invisible/unowned mount, mount/dismount, read-only Wounds and loss of rider ownership. Local saved records established the permission mismatch without world writes. | `dist/mount-permission-audit.json`, `dist/warhammer-{trappings,equipment,mounts}-{phone,tablet}.png` |
| Carolingian / mode / isolation | Delayed/missing settings registration, damaged receipts, cached modes, native opt-out and actual Common Display 14.01 hide-selector fixtures passed. | `dist/shared-entry-upgrade-late-phone.png`, `tests/browser/fixtures/monks-common-display-14.01-root-hide.css` |
| libWrapper startup / loader | Isolated hosted-world copy: Foundry 14.367, all 30 active modules; phone/tablet/player/GM/wake and Settings/Back passed; desktop stayed native. Simulated gesture-only wake passed after trusted tap. Player file-browser permission warnings remain. | `dist/investigate-native-matrix-summary.json`, `dist/investigate-native-matrix-wake-gesture-phone.json` |
| Audio / hidden-board rendering | Five actual-widget controls passed on isolated Foundry 14.369 / Shadowdark 4.0.6 with YouTube Player Widget 4.0.0 and libWrapper. Corrected GM Phone/Tablet and player Phone made zero YouTube/media requests; Desktop and before-fix Phone loaded API/embed. Incoming setting callbacks passed. Hidden-board targeting fixtures passed. No listening/battery proof. | `dist/youtube-native-network.json`, reproduction: `dist/check-youtube-native.mjs` |
| Damage feedback / Effects alignment | Responsive fixtures passed for resource loss, expiry, persistent zero-health mist, dismissal, max-only changes and route persistence. | `dist/warhammer-effects-phone.png`, `tests/browser/damage-feedback.mjs` |
| Native targeting animation | 12 v14 checks passed in an isolated copied Shadowdark world; no world document writes. | `dist/targeting-animation-native-check.json` |
| UI contracts | Fixture checks passed for targeting placement, conditions, theme, controls guide, tooltip dismissal and descriptions. | `dist/controls-guide-evidence.json`, `dist/tooltip-dismissal-evidence.json`, `dist/description-formatting-evidence.json`, `dist/conditions-layout-evidence.json` |

Pushing main publishes the rolling `latest` release and requires separate authorization.
