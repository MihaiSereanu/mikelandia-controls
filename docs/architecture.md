# Architecture and native boundaries

## Source map

| Area | Entry points |
|---|---|
| System profiles | `src/systems/registry.mjs`, `{dnd5e,wfrp4e,shadowdark,fallback}/`, `profile-view.mjs` |
| Character UI | `src/features/characters/{profile-panels,profile-resource-editor,profile-inventory,native-sheet}.mjs` |
| Validated writes | `src/foundry/actor-editor-gateway.mjs` |
| Native windows / isolation | `src/foundry/{mobile-presentation,mobile-ui-isolation}.mjs`; CSS in `assets/` |
| Combat | `src/features/combat/presenter.mjs`, `src/foundry/combat-gateway.mjs` |
| Journals / audio / upgrades | `src/foundry/{journal-visibility,mobile-audio,legacy-client-restoration}.mjs` |

## Scope and commands

Five routes: Character, Chat, Journals, Combat, Settings. Character selection never controls tokens. Synthetic Actor UUIDs support character data and chat provenance. Combat retains initiative, End Turn, and GM encounter progression with native permissions, stale-state checks, and end confirmation. Map/token/light controls, placement, scene overlays, and graphics profiles are removed.

Resolve fresh Actor/Item state by UUID. Validate ownership, session/config revisions, and duplicate submissions; clean up pending actions on cancellation. Never accept arbitrary client paths or native method names. Refresh after native updates; system models own derived values. Share implementation while retaining each game's terminology/grouping. Unsupported systems get identity and native sheets; isolate D&D handlers.

Branding and technical ID are Mikelandia Controls / `mikelandia-controls`; CSS/data prefixes are `mc-`, and localization uses `MIKELANDIA_CONTROLS`. `branding-migration.mjs` copies browser state before first reads and missing Actor/raw-token flag leaves under one GM, preserving destination values and originals. See [migration](migration.md) for world activation and rollback. Upgrade restoration restores only owned client settings and preserves failed restoration data.

## Native applications and rolls

Inspect ancestry: Shadowdark 4.0.6 `PlayerSheetSD` is V1; `RollDialogSD` is V2; Warhammer sheets use V2. CSS suppresses maximum-height transitions, so admitted V2 windows close with `{animate: false}`; keep V1 lifecycle native.

Warhammer uses the edition manager and native setup, then returned test `.roll()`. Pass `{resolveClose: true}` as setup's third argument to release locks on cancellation. The 4e Cast/Channel chooser omits options: temporarily observe renders, attach one-time close listeners to that Actor's `WarhammerRollDialogV2` instances, resolve unsubmitted closes, and remove listeners in `finally`. Never mutate frozen application options.

Shadowdark `rollStatCheck`, `rollAttack`, and `castSpell` roll internally: do not roll twice. Preserve native chat and scoped hooks distinguishing cancellation from failure.

## Journal access

List/read policy requires effective native OBSERVER permission and sheet page visibility. Exclude active Sequencer `sequencerDatabase` and Calendaria `isCalendarNote`/`isCalendarJournal` entries or descendants of `isCalendarNotesFolder`/`isCalendarFolder`, honoring native GM `devMode`. Recheck after async enrichment; refresh on document/folder/user/developer-setting changes. Never alter storage or ownership; ordinary names/default access remain valid.

## Warhammer resources

Combat/Trappings share read-only native `system.status.encumbrance.{current,max}`; accept finite numeric strings, omit malformed values, and never recompute weight. Keep label/value together; adjacent phone resources stack.

Momentum uses `editControl: "checkbox"`, validated saves, a 20px input minimum inside a 44px label, and vertical Active/Inactive alignment. Input geometry alone cannot prove native glyph alignment. Disable during saves and restore on failure/cancellation; other booleans retain their editors.

WFRP 10.1.2 / Library 3.5.1 missing-ammo cancellation can pass undefined setup data into `awaitSubmit`, causing `data.scripts.concat` failure. Native **Consumes Ammo** controls this path; loading is separate. Do not bypass ammo or patch the library. Evidence lives in current status.

## Shadowdark resources and gear

HP/AC/DEF and XP/Grit/Luck use native values except nonnegative integer `flags.mikelandia-controls.shadowdarkResources.{def,grit}` (default zero). XP is `system.level.xp`; old Renown flags are unused. Preserve native/Pulp Luck, 44px edit targets, and independent `system.coins.{gp,sp,cp}` controls with no negative decrement.

Keep Gear/Slots/add visible when empty. Custom/catalog choice supports Cancel, Escape, and Back; render only the selected editor. Catalog auto-loads, searches all words across name/source ignoring case/accents, and keeps all results scrollable. Success/Cancel removes the editor; native cancellation retains it. Dispose chooser and ignore late responses.

Custom Basic Items start at quantity 1; `system.slots.{slots_used,per_slot}` default to 1, with `free_carry=0`. Validate nonnegative/positive safe integers respectively; native weight is `ceil(quantity / per_slot) * slots_used`. Custom fields cannot override catalog acquisition.

Quantities are nonnegative safe integers without per-slot caps; revisions include slot-weight fields. Saving zero deletes even stashed gear; untouched zero stacks remain. Exclude Actor-owned catalog sources. Await inherited acquisition despite 4.0.6 `_onDropItemSD` omitting its return. Preserve native prompts/effects/chat; never invoke token-light toggles. World PCs need no user assignment.

## Isolation and audio

Phone/Tablet isolation is reversible and independent of Protect/Common Display. Approved descendants expose ancestor hosts without exposing siblings; reconcile late windows, rerenders, and forced display changes. Restore latest underlying preferences on exit.

Admit exact owned editors, recognized roll forms, approved children, or native dialogs following deliberate mobile controls. Navigation/render hooks/generic modal flags grant no admission. Scoped requests own exact confirmations; Settings has explicit session ownership. While the companion is active, the native visibility layer covers both `.mc-mobile-admitted-app` and `.mc-mobile-settings-app`, including headers and Close controls, so Common Display Hide UI cannot hide owned workflows. Keep the saved Hide UI preference and desktop presentation intact. Revoke ownership on teardown; preserve headers, notifications, tooltips, menus, and Dice So Nice canvas. Skip observer mutations wholly inside approved branches while reconciling ownership changes.

Dice rendering resolves explicit static/reduced/normal choices or automatic device-hint selection without reading the canvas or a recovery journal. Keep the separate legacy client-setting restoration path for old saved graphics changes.

`muteMobileAudio` defaults on locally. Guard first-gesture contexts, playback, gain writes, detached media, and embedded players; restore prior state on exit/disable. YouTube mute is idempotent per player even with stale iframe state: repeated commands trigger Player Widget playlist-volume/render loops. Guard volume/unmute without repeating mute. Audible proof requires a phone.

Optional in-memory API: `setRollTimingEnabled`, `rollTimingSnapshot`, `resetRollTiming`. Separate native/dialog/chat stages from thinking time and time outside Chat; retain at most 20 observations, disposing listeners after 30 seconds or cancellation.

## Packaging

Validation workflow: [AGENTS.md](../AGENTS.md). Build the single module package with `py scripts/build_release.py --version <version>`; verify with `scripts/check_release.py`. The canonical release contains `module.json` and `mikelandia-controls.zip`; publication removes obsolete experimental assets. Main pushes publish releases. The standalone login has its own build/deployment [runbook](mobile-login.md).
