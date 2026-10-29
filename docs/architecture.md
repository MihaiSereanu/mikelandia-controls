# Architecture and native boundaries

## Source map

The entry point wires the runtime together. Keep orchestration in `kernel`, Foundry APIs in `foundry`, route behavior in `features`, shared controls in `ui`, and game rules in `systems`.

| Area | Folders and entry points |
|---|---|
| Runtime coordination | `src/entry.mjs`, `src/kernel/app-kernel.mjs` |
| Kernel responsibilities | `src/kernel/state/`, `lifecycle/`, `connection/`, `presentation/` |
| Character UI | `src/features/characters/presenter.mjs`; `profile/`, `sheets/`, `appearance/` |
| Other routes and help | `src/features/{chat,combat,journals,settings,help}/` |
| Foundry data and actions | `src/foundry/{actors,chat,combat,commands,journals,session}/` |
| Foundry client behavior | `src/foundry/{presentation,settings,compatibility,media,diagnostics}/` |
| Shared UI | `src/ui/{bootstrap,frame,help,media,navigation,primitives,timing}/` |
| System profiles | `src/systems/registry.mjs`, `{dnd5e,wfrp4e,shadowdark,fallback}/`, `profile-view.mjs` |

Character themes, header artwork, and header scrolling live in `features/characters/appearance/`. The banner catalogue resolves artwork relative to its own module; the elapsed clock loads its worker from `ui/timing/`. Preserve these URLs when moving their modules.

## Scope and action validation

Five routes: Character, Chat, Journals, Initiative, Settings (internal route key: `combat`). Character selection never controls tokens. Synthetic Actor UUIDs support character data and chat provenance. Initiative retains End Turn and GM encounter progression with native permissions, stale-state checks, and end confirmation. Map/token/light controls, placement, scene overlays, and graphics profiles are removed.

Resolve fresh Actor/Item state by UUID. Validate ownership, session/config revisions, and duplicate submissions; clean up pending actions on cancellation. Never accept arbitrary client paths or native method names. Refresh after native updates; system models own derived values. Share implementation while retaining each game's terminology/grouping. Unsupported systems get identity and native sheets; isolate D&D handlers.

Notes adapters use native fields: WFRP player biography `system.details.biography.value`, Shadowdark `system.notes`. The shared editor provides enrichment and Save/Cancel; writes require ownership and compare the original source to reject stale edits. GM notes are excluded.

Collapsible profile descriptions and expanded Effects Notes use `ui/primitives/description.mjs` to copy source paragraphs, emphasis, headings, lists, tables, line breaks and images into read-only content. It excludes secret sections, executable markup, native controls, source classes/styles and unsafe URLs. Plain-text sources retain line breaks; wide content scrolls within its container. D&D effect disclosures retain the complete source rather than the truncated text preview. D&D item descriptions keep their existing renderer.

Native Notes content participates in selected-Actor snapshot change detection, so Notes-only updates refresh the enriched display. The editor host remains attached during same-Actor Notes refreshes, preserving drafts, focus and selection. Actor/tab changes and scope disposal remove the editor. Pending native writes retain the duplicate-save guard until settlement; failures preserve the draft and permit retry.

## Controls guide

Controls & Gestures shows main navigation, system-specific Character tabs, and useful controls. Both Desktop and mobile pass the integration ID; mobile also passes the selected character type, available profile tabs, Notes availability, and Warhammer edition. D&D groups and vehicles receive their own tab descriptions; unknown systems use full-sheet guidance.

Tab names render as subheadings, and controls as a list. Localized copy supports only paired `**bold**` markers, rendered as text and `strong` elements without interpreting HTML. Hold instructions are limited to D&D lists.

## Combat targeting

The main navigation tab and tracker heading are named Initiative. Targets remains there and also appears above WFRP Character > Combat, Shadowdark Abilities, and D&D Overview. All locations share the native target state, disclosure and token-source choice; initiative scores and turn markers stay in Initiative. Native movement refreshes run while any of these target surfaces is visible, and entering one refreshes its snapshot. Character distance-only updates retain rows and focus.

Combat targeting uses native user targets through `targeting-gateway.mjs`; it never controls or moves tokens. The selector appears for started combat linked to the loaded scene, or a global (unlinked) encounter containing combatants in that scene. Each combatant is filtered by its own scene before resolving its token, so cross-scene token IDs cannot admit foreign combatants. Eligible tokens must belong to that combat and have neither token nor combatant hidden, regardless of ownership or line of sight. Friendly disposition forms Friendly; other dispositions form Enemies. The selected character must have a matching scene token; synthetic sources require their exact token, and ambiguous world Actors require a source choice. Automatic cleanup affects only targets acquired through this feature; individual toggles handle manual deselection. Native external target changes relinquish feature ownership on release. Selection persists across turns, rolls, and routes, with reconciliation active throughout the mobile runtime. Post-roll targeting remains system-native; there is no bulk-clear action.

System integrations declare `readCombatHealth(actor)` for native remaining/max health. Read each token's Actor, including synthetic Actors. Every listed Friendly token shows exact current/max health regardless of sheet permissions; Enemies receive only Healthy (>50%), Bloodied (<=50%), or Critical (<=10%, including zero). Defeated remains independent. Missing or invalid health is omitted. Health and distance changes patch existing rows to preserve focus.

Targets and the module's Initiative Tracker share health projection and formatting beside Actor names, wrapping on narrow screens. Each list retains its own visibility rules; tokenless Initiative entries omit health when disposition is unavailable. Integrations declare `combatHealthPaths` for precise Actor-update invalidation, including native parent-object replacements. Health-only updates patch both lists without replacing focused rows.

While Targets is expanded and a target surface is visible, relevant native refreshToken position/size events refresh distances once per animation frame. Equal snapshots are suppressed; distance-only changes patch existing text nodes without replacing rows or focus. Structural updates still rerender normally, and disposal cancels queued frames. Distance uses minimum native occupied-space measurement on square/hex grids, stripping elevation. Foundry v14 requires `{level:null,elevation:0,depth:1}` to bypass level-based wall/surface filtering; v13 uses its unconstrained occupied-space API. Gridless measurement uses nearest rectangular footprint edges. Scene grid rules, distance scale and units remain authoritative. Failed measurement is unavailable; no range enforcement or roll metadata is added. Warhammer consumes native targets; Shadowdark retains its targeting setting and first-target semantics.

## Mobile frame and upgrades

The in-game companion frame reserves the top safe-area inset plus 8px in standalone mode. Both base and protected-style CSS use border-box sizing to keep navigation within the viewport and preserve the phone character header's additional 4px inset. Login/PWA behavior and operations are in the [runbook](mobile-login.md).

Mobile Logout navigates to Foundry's prefix-aware `mobile` route with a trailing slash. The mobile login establishes the native `/join` session to end the world login.

Branding and technical ID are Mikelandia Controls / `mikelandia-controls`; CSS/data prefixes are `mc-`, and localization uses `MIKELANDIA_CONTROLS`. `branding-migration.mjs` copies browser state before first reads and missing Actor/raw-token flag leaves under one GM, preserving destination values and originals. See [migration](migration.md) for world activation and rollback. Upgrade restoration restores only owned client settings and preserves failed restoration data.

## Native applications and rolls

Admitted Shadowdark `#sd-roll-dialog` and Warhammer `.warhammer.roll-dialog-v2` forms use Mikelandia colors, typography and touch controls while the mobile shell runs. Their palette follows the shell even when Foundry's application theme differs. Native controls, handlers and hidden effects remain intact. Header controls stay transparent and borderless with 44px touch targets; `.icon` buttons retain their native icon font.

`native-roll-presentation.mjs` restores decorated native labels on release. Warhammer 5e per-test ADV/DISADV states remain distinct from 4e combat Advantage. Desktop and D&D 5E retain their styling. `node scripts/check_browser.mjs --filter "^roll-dialogs-" --native-assets --screenshots` reads the installed Foundry icon font without copying or shipping it (`FOUNDRY_APP_PATH` overrides the application path). This establishes fixture/font evidence, not live-system behavior.

WFRP 4e `slBonus` and 5e `SL` inputs gain one-point minus/plus buttons that cross zero. They retain native input elements and dispatch native `change` events; WFRP owns recalculation and rerendering. Decoration is idempotent across partial renders and restores unwrapped inputs on release.

Inspect ancestry: Shadowdark 4.0.6 `PlayerSheetSD` is V1; `RollDialogSD` is V2; Warhammer sheets use V2. CSS suppresses maximum-height transitions, so admitted V2 windows close with `{animate: false}`; keep V1 lifecycle native.

Warhammer uses the edition manager and native setup, then returned test `.roll()`. Pass `{resolveClose: true}` as setup's third argument to release locks on cancellation. The 4e Cast/Channel chooser omits options: temporarily observe renders, attach one-time close listeners to that Actor's `WarhammerRollDialogV2` instances, resolve unsubmitted closes, and remove listeners in `finally`. Never mutate frozen application options.

Shadowdark `rollStatCheck`, `rollAttack`, and `castSpell` roll internally: do not roll twice. Preserve native chat and scoped hooks distinguishing cancellation from failure.

## Journal access

List/read policy requires effective native OBSERVER permission and sheet page visibility. Exclude active Sequencer `sequencerDatabase` and Calendaria `isCalendarNote`/`isCalendarJournal` entries or descendants of `isCalendarNotesFolder`/`isCalendarFolder`, honoring native GM `devMode`. Recheck after async enrichment; refresh on document/folder/user/developer-setting changes. Never alter storage or ownership; ordinary names/default access remain valid.

## Warhammer resources

### Encumbrance

Combat/Trappings share read-only native `system.status.encumbrance.{current,max}`; accept finite numeric strings, omit malformed values, and never recompute weight.

Combat alone adds a collapsed Penalties disclosure when native prepared `system.status.encumbrance.state` exceeds 1. The native thresholds (>1, >2, >3) select localized Encumbered/VeryEnc/MaxEnc labels and penalty text. Its open state survives refreshes and tab changes in the retained character shell and resets on character changes.

### Effects and conditions

The separate Effects tab contains a condition picker above independent condition rows. Choosing an entry adds a session row at zero/off without changing the Actor; active conditions appear automatically. Rows persist across refreshes and tab navigation for the exact Actor source, and inactive rows can be dismissed without a document write. Native edition configuration owns available conditions and `system.condition.numbered`. Names align left; shared stepper/action columns keep rows aligned when native actions are absent. Numbered rows use minus/count/plus; other rows toggle. Commands revalidate ownership, edition and condition revision, then call native `addCondition`/`removeCondition`. Active conditions expose available native `manualScripts` on the same row, executed with `{actor}` so native rolls, damage and chat remain authoritative.

Populated secondary sections are read-only: combat Aspects, Injuries, Criticals, Psychology, Corruption & Mutation, Disease and disabled effects. Omit Temporary and Passive lists. Native `allApplicableEffects(true)`, `show` and name consolidation govern disabled effects; native rules govern concealed disease sources/timing.

Item rows show native values and player Notes (`system.description.value`). Keep names/values single-line at full width; only Notes ellipsizes, with a 44px minimum tap width. Oversized rows scroll within their card. Notes opens a viewport-bounded native popover with full formatted content, light dismissal and Escape support; the compact trigger remains plain text. Shared description rendering excludes GM Notes, secrets, native controls and executable markup. No effect creation or editing controls.

In 5e, tapping a condition name toggles a formatted, scrollable native popover without a visible heading. Engaged is excluded from the picker, rows and mobile actions. References live in `src/systems/wfrp4e/condition-descriptions.mjs` and render code-owned text and bold spans without HTML injection or system rule changes. The 5e references are gated by native edition settings so they do not replace 4e rules.

Notes and condition tooltip triggers declare `popovertarget` so native light dismissal recognizes their invokers. Their click handlers prevent the default toggle and position the popover immediately. Outside taps dismiss without consuming the tapped control's action; inside taps and scrolling retain the tooltip. A second trigger tap closes it, another tooltip trigger switches it, and Escape dismisses it. `tooltip-touch-*` browser cases exercise trusted CDP touch input; synthetic `.click()` does not verify light dismissal.

### Resources, recovery and Notes

Trappings displays nonblank prepared `system.details.status.value` as read-only Social Status in both editions; native preparation owns rank and modifiers.

Wounds, Fortune, Fate and Corruption use separate shared counter cards with per-Actor/resource session padlocks, immediate one-point changes and numeric entry. Native validation and writes remain authoritative: Wounds uses `setWounds` and its native maximum; Corruption's displayed maximum is a threshold and does not cap increments. Resolve/Resilience retain their existing 4e editors.

The bed beside Wounds starts the native recovery test independently of the counter padlock: resolve the localized Endurance Skill from native `itemTags.skill`, fall back to Toughness, and pass native `{rest:true, tb:actor.characteristics.t.bonus, skipTargets:true}` context. Native setup/roll and Chat Apply Healing own recovery; the module does not heal on click. Cancellation must release the command without rolling.

Combat displays prepared `system.details.move.{value,walk,run}` as read-only Move/Walk/Run. Preserve manual text and mounted results; append native localized yards only to auto-calculated Walk/Run. Main displays read-only `system.details.experience.{current,spent,total}` in Current/Spent/Total order; the native system owns Current and no XP is recalculated or edited here.

WFRP Notes also exposes plain-text Personal and Party Ambitions from the selected Actor's `system.details.{personal-ambitions,party-ambitions}` fields. 5e uses `long-term` only; 4e includes `short-term` and `long-term`. Empty fields remain editable through the shared Save/Cancel modal. Saves use named, allowlisted fields with ownership, original-value and edition checks; hidden sibling fields and Party documents are not rewritten. Ambition/edition changes participate in Notes snapshot revision tracking without discarding active drafts.

Momentum uses `editControl: "checkbox"` and validated saves. Disable during saves and restore on failure/cancellation; other booleans retain their editors.

Base and protected styles preserve native checkbox glyphs and handlers, 44px touch targets, control contrast of at least 3:1, and button-text contrast of at least 4.5:1. Check installed Foundry CSS/fonts with `node scripts/check_browser.mjs --native-assets --filter '^control-contrast-native$'`; this is fixture evidence.

### Native ammunition issue

WFRP 10.1.2 / Library 3.5.1 missing-ammo cancellation can pass undefined setup data into `awaitSubmit`, causing `data.scripts.concat` failure. Native **Consumes Ammo** controls this path; loading is separate. Do not bypass ammo or patch the library.

## Shadowdark resources and gear

HP/AC/DEF and XP/Grit/Luck use native values except nonnegative integer `flags.mikelandia-controls.shadowdarkResources.{def,grit}` (default zero). XP is `system.level.xp`; old Renown flags are unused. Preserve native/Pulp Luck, 44px edit targets, and independent `system.coins.{gp,sp,cp}` controls with no negative decrement.

HP/DEF/XP/Grit/Luck have individual padlocks, initially locked after page reload; lock choices persist per Actor/resource during page-session navigation and refreshes. Unlocked minus/plus buttons save one-point changes immediately; tapping the value opens numeric entry. HP stays within 0..max, standard Luck maps 0/1 to native Boolean values, and other counters use nonnegative safe integers. AC remains calculated/read-only. Disable controls while saving and restore authoritative values on failure/cancellation.

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

Validation workflow: [AGENTS.md](../AGENTS.md). Build with `py -3 scripts/build_release.py --version <version>`; the builder validates local ZIP contents, manifest references and runtime imports. After publication, verify anonymous HTTP downloads with `py -3 scripts/check_release.py --base-url <release-url> --version <version> --build <commit-sha>`. The canonical release contains `module.json` and `mikelandia-controls.zip`; publication runs `retire_legacy_assets.py` to remove obsolete release assets. Main pushes publish releases. The standalone login has its own build/deployment [runbook](mobile-login.md).
