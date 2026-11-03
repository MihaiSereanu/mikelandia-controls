# Architecture and native boundaries

## Source map

The shared entry point installs system fixes and upgrade cleanup. Only active phone/tablet clients import the mobile runtime and its styles. Keep orchestration in `kernel`, Foundry APIs in `foundry`, route behavior in `features`, shared controls in `ui`, and game rules in `systems`.

| Area | Folders and entry points |
|---|---|
| Shared startup / mobile runtime | `src/entry.mjs`, `src/mobile-entry.mjs`, `src/kernel/app-kernel.mjs` |
| Kernel responsibilities | `src/kernel/state/`, `lifecycle/`, `connection/`, `presentation/` |
| Character UI | `src/features/characters/presenter.mjs`; `profile/`, `sheets/`, `appearance/` |
| Other routes and help | `src/features/{chat,combat,journals,settings,help}/` |
| Foundry data and actions | `src/foundry/{actors,chat,combat,commands,journals,session}/` |
| Foundry client behavior | `src/foundry/{presentation,settings,compatibility,media,diagnostics}/` |
| Shared UI | `src/ui/{bootstrap,frame,help,media,navigation,primitives,timing}/` |
| System profiles | `src/systems/registry.mjs`, `{dnd5e,wfrp4e,shadowdark,fallback}/`, `profile-view.mjs` |

Character themes, header artwork, and header scrolling live in `features/characters/appearance/`. The banner catalogue resolves artwork relative to its own module; the elapsed clock loads its worker from `ui/timing/`. Preserve these URLs when moving their modules.

### Task map

Paths below are relative to `src/`; Node names are relative to `tests/` and end in `.test.mjs`. Browser expressions match case names in `scripts/check_browser.mjs`: list with `--list --filter "<expression>"`, then run the selected cases without `--list`. These are starting points; inspect imports and assertions for the specific change.

| Task / contract | Source owners | Node tests | Browser expression |
|---|---|---|---|
| [Startup / mode / upgrades](#source-map) | `entry.mjs`, `mobile-entry.mjs`, `foundry/session/activation-policy.mjs`, `foundry/compatibility/client-upgrade-cleanup.mjs` | `shared-entry`, `activation-policy`, `client-upgrade-cleanup` | `^shared-entry-` |
| [Loading / isolation](#isolation-and-audio) | `ui/bootstrap/bootstrap-loader.mjs`, `foundry/presentation/mobile-ui-isolation.mjs`, `mobile-presentation.mjs` in the same folder | `mobile-ui-isolation`, `presentation-isolation` | `^(bootstrap|ui-isolation)-` |
| [Reconnect recovery](#mobile-reconnect-recovery) | `foundry/session/{connection-grace,authoritative-session-gateway}.mjs`, `kernel/{app-kernel,connection/authoritative-resync}.mjs`, `ui/frame/{app-frame,reconnect-interactions}.mjs` | `reconnect`, `session-integration`, `command-integration` | `^reconnect-` |
| [Audio / board drawing](#isolation-and-audio) | `foundry/media/mobile-audio.mjs`, `foundry/presentation/hidden-canvas-rendering.mjs` | `mobile-audio`, `hidden-canvas-rendering` | `^(in-person|targeting)-` |
| [Targeting / health / distance](#combat-targeting) | `features/combat/`, `foundry/combat/`, `systems/combat-health.mjs` | `targeting`, `target-distance`, `combat-health` | `^(targeting|in-person)-` |
| [Damage feedback](#mobile-frame-and-upgrades) | `foundry/actors/damage-gateway.mjs`, `systems/damage-health.mjs`, `ui/media/damage-feedback.mjs` | `damage-feedback` | `^damage-` |
| [Native sheets / roll dialogs](#native-applications-and-rolls) | `features/characters/sheets/`, `foundry/presentation/native-roll-presentation.mjs`, `systems/{shadowdark,wfrp4e}/commands.mjs` | `native-sheet-gateway`, `native-close-animation`, `warhammer-actions`, `shadowdark` | `^(fallback|roll-dialogs)-` |
| [Warhammer panels / actions](#warhammer-resources) | `systems/wfrp4e/`, `features/characters/profile/` | `warhammer-{profile,resources,equipment,effects,magic,weapons,rest,ambitions,actions}` | `^warhammer-` |
| [Theme / Momentum](#warhammer-resources) | `foundry/compatibility/wfrp-theme-policy.mjs`, `wfrp-opposed-momentum.mjs` in the same folder | `wfrp-theme-policy`, `wfrp-opposed-momentum` | `^(wfrp-theme-policy|shared-entry)-` |
| [Shadowdark gear / counters / spells / Bio](#shadowdark-resources-and-gear) | `systems/shadowdark/` (Bio: `bio.mjs`) | `shadowdark`, `shadowdark-inventory`, `shadowdark-equipment` | `^(shadowdark|actor-notes)-` |
| [Notes](#scope-and-action-validation) / [journals](#journal-access) | `systems/actor-notes.mjs`, `foundry/actors/biography-gateway.mjs`, `foundry/session/session-gateway.mjs`, `foundry/journals/`, `features/journals/presenter.mjs`, `ui/primitives/{text-editor,text-line-breaks,notes-markdown}.mjs` | `actor-notes`, `notes-markdown`, `warhammer-ambitions`, `journal-visibility`, `journal-editing` | `^(actor-notes|in-person|journal-editor)-` |
| [Controls guide](#controls-guide) / descriptions | `features/help/`, `ui/help/`, `ui/primitives/{description,enriched-description,localized-text}.mjs`, `foundry/actors/description-gateway.mjs` | `in-person`, `profile-view`, `description-gateway` | `^(descriptions|in-person|tooltip-touch|warhammer)-` |
| [Login / PWA](mobile-login.md) | `../mobile-login/`, `foundry/presentation/mobile-back-gateway.mjs` | `mobile-login`, `mobile-logout` | `^mobile-login-` |

Bio/Notes browser fixtures: `tests/browser/actor-notes.mjs`. Brace groups abbreviate paths/test names; expand them before using a literal filename. Browser coverage is fixture evidence. Roll-dialog icon checks and `^control-contrast-native$` additionally use `--native-assets`; see [native applications](#native-applications-and-rolls) and [resources](#resources-recovery-and-notes).

### Startup contract

Physical desktops always use native Foundry, ignoring saved Phone/Tablet overrides; no companion UI, help, settings rewriting, module API or mobile styles load. Shared WFRP arm translations and opposed Momentum remain active. Mobile modes are Auto/Phone/Tablet/Use native Foundry; legacy `desktop`/`off` normalize to `native`. Opted-out clients expose only the native mode setting. Desktop-identified iPads remain tablets.

Foundry does not await package top-level async work before init. Mobile clients temporarily wrap `Game.create`, await its instance and install a one-use own `initialize` boundary. Never replace `Game.prototype.initialize`: calling a captured libWrapper proxy after replacing its target recurses. The instance boundary reads registered authoritative mode, conditionally imports runtime/styles and hooks, removes itself, then delegates once. Restore static creation after its first call; leave desktops untouched. Cached preferences cannot decide activation.

Upgrade cleanup follows settings registration. Clients with historical receipts get a temporary pre-Canvas boundary restoring owned graphics/noCanvas and native theme. Carolingian's async registration gets a five-second wait without blocking canvas. Verify restoration before retiring receipts; failures retain recovery data and warn without blocking mobile startup. Successful restoration requiring reload waits for that reload.

## Scope and action validation

Five routes: Character, Chat, Journals, Initiative, Settings (internal route key: `combat`). Character selection never controls tokens. Synthetic Actor UUIDs support character data and chat provenance. Initiative retains End Turn and GM encounter progression with native permissions, stale-state checks, and end confirmation. Map/token/light controls, placement, scene overlays and graphics profiles are outside scope.

Resolve fresh Actor/Item state by UUID. Validate ownership, session/config revisions, and duplicate submissions; clean up pending actions on cancellation. Never accept arbitrary client paths or native method names. Refresh after native updates; system models own derived values. Share implementation while retaining each game's terminology/grouping. Unsupported systems get identity and native sheets; isolate D&D handlers.

Notes fields are WFRP `system.details.biography.value` and Shadowdark `system.notes`. Notes and D&D Biography/About/Details convert existing HTML in an inert template to readable basic Markdown (bold, italic, headings, lists). Preserve line breaks and blank lines. Only Save converts to escaped simple HTML, simplifying unsupported formatting/embeds; opening and Cancel never write. Exclude GM notes; compare exact original source before saving. Notes and journals share `ui/primitives/text-editor.mjs` controls, with separate format handling; ambitions stay plain text.

Item descriptions, profile properties and Effects Notes share `ui/primitives/enriched-description.mjs`. Exact Item/Effect UUIDs supply native `TextEditor.enrichHTML` context and roll data, including unidentified D&D descriptions and source-Item property fragments. Strip secrets before enrichment; recheck identity, access and source afterward. Preserve safe formatting, images, plain-text breaks and internally scrolling wide content; exclude executable markup, native controls, source classes/styles and unsafe URLs. Retain only native enriched roll/link metadata and icons; D&D effects keep full descriptions.

Inline rolls use native Roll/chat, source Item data, Actor speaker and privacy modes; Actor rolls require OWNER. UUID references use viewport-bounded native popovers. Nested references replace content; Back resolves previous references afresh. Recheck compendium/journal/page access and exclude GM/secrets on every lookup. Show unavailable targets; dismiss on outside tap, retap or Escape, discarding pending loads on dismissal/disposal.

Notes-only changes invalidate selected-Actor snapshots. Same-Actor refreshes retain the editor, draft, focus and selection; Actor/tab changes or disposal remove it. Keep duplicate-save guards until native writes settle; failures retain drafts for retry.

## Controls guide

Mobile-only Controls & Gestures describes navigation and controls for the integration, character type, available tabs, Notes and WFRP edition. D&D groups/vehicles have distinct guidance; unsupported systems use full-sheet guidance.

Tab names render as subheadings, and controls as a list. Localized copy supports only paired `**bold**` markers, rendered as text and `strong` elements without interpreting HTML. Hold instructions are limited to D&D lists.

## Combat targeting

Initiative contains the tracker and Targets. Targets also appears above WFRP Combat/Magic, Shadowdark Main/Spells and D&D Overview/Spells, sharing target state, disclosure and token-source choice. Scores/turn markers remain in Initiative. Refresh on entering a target surface and native movement while visible; distance-only updates preserve rows/focus.

`targeting-gateway.mjs` uses native user targets without controlling/moving tokens. Show the selector for started combat linked to the loaded scene, or global combat with participants there. Filter each combatant by scene before resolving tokens. Eligible combatants/tokens must be in that combat and nonhidden, regardless of ownership or line of sight. Friendly disposition forms Friendly; others form Enemies. Require the character's scene token: exact token for synthetic Actors, explicit choice for ambiguous world Actors.

Reconcile throughout the mobile runtime; retain selection across turns, rolls and routes. Cleanup removes only feature-acquired targets; external changes relinquish feature ownership on release. Individual toggles allow deselection; post-roll behavior stays system-native, with no bulk clear.

`readCombatHealth(actor)` reads native remaining/max health from each token's Actor, including synthetic Actors. Friendlies show exact health regardless of sheet permissions; Enemies show Healthy (>50%), Bloodied (<=50%) or Critical (<=10%, including zero). Defeated is independent; omit invalid health.

Targets and Initiative share health formatting beside names, wrapping on narrow screens while retaining separate visibility rules. Tokenless Initiative entries omit health without disposition. `combatHealthPaths` invalidate on precise Actor updates and parent-object replacements; health-only changes patch both lists without replacing focused rows.

Expanded, visible Targets refreshes distances at most once per animation frame on relevant native `refreshToken` position/size events. Suppress equal snapshots, patch distance text, rerender structural changes and cancel queued frames on disposal. Square/hex grids use minimum native occupied-space distance without elevation: v14 needs `{level:null,elevation:0,depth:1}` to bypass wall/surface filtering; v13 uses its unconstrained API. Gridless uses nearest footprint edges. Preserve scene scale/units/rules; failed measurement is unavailable. Add no range enforcement or roll metadata. WFRP consumes native targets; Shadowdark retains its targeting setting and first-target semantics.

## Mobile frame and upgrades

Damage feedback follows the exact selected owned PC across routes: D&D 5e characters (including temporary HP), Shadowdark Players and WFRP characters. Read raw native HP/Wounds updates to preserve consecutive hits before snapshots coalesce. Report resource loss, including manual reductions, but no overkill beyond zero. Ignore healing, initial load, maximum-only changes, NPCs, unsupported systems and observer Actors.

Each hit replaces feedback with a 0.4-second shake, soft red edge mist and damage/wounds amount. Ordinary feedback clears within two seconds or on Close/Escape. Crossing positive HP/Wounds to zero or below adds “You're down!”; notification/shake expire, leaving same-strength mist. Close/Escape preserves this mist until remaining HP/Wounds changes; maximum-only, temporary-HP-only and unrelated updates cannot clear it. Further damage starts new feedback. Selection, reconnect and disposal clear/rebaseline silently. Preserve focus, route persistence and pointer passthrough outside the notification; reduced motion disables shake.

Mobile WFRP permanently disables all five browser `wfrp4e.theme` sections, preserving fonts, removing open-app themes and correcting previews/re-enabling. Native mode stops enforcement without restoration. Only the WFRP 10.1.2 client schema is supported; report others without writes. General light/dark uses runtime `configureUI()` without saving `core.uiConfig` or restoration snapshots. Carolingian suppression overrides its local `disable-ui` read before init without saving or reloading.

The in-game companion frame reserves the top safe-area inset plus 8px in standalone mode. Both base and protected-style CSS use border-box sizing to keep navigation within the viewport and preserve the phone character header's additional 4px inset. Login/PWA behavior and operations are in the [runbook](mobile-login.md).

Mobile Logout navigates to Foundry's prefix-aware `mobile` route with a trailing slash. The mobile login establishes the native `/join` session to end the world login.

ID: `mikelandia-controls`; branding: Mikelandia Controls; CSS/data: `mc-`; localization: `MIKELANDIA_CONTROLS`. `branding-migration.mjs` transfers browser state before first reads and missing Actor/raw-token flag leaves under one GM, preserving destinations/originals. [Migration](migration.md) covers activation/rollback. Upgrade restoration touches only owned client settings and retains failed recovery data.

## Mobile reconnect recovery

An intact foreground connection leaves the screen ready. Disconnect keeps reading visible/scrollable, replacing disabled navigation with compact Reconnecting/Syncing status: a polite live region outside the busy pane, without covering content or taking focus. Mode changes retain their full-screen blocker.

Recovery capture-phase input guards block activation, editing, submission and navigation, allowing touch/wheel scrolling, reading and copy; restore control accessibility attributes afterward. Kernel guards independently reject navigation/writes; Back consumes without navigating. Preserve connection generations and native editor cleanup.

Concurrently fetch permission-filtered User, Folder, Actor, Combat, JournalEntry and ChatMessage collections. Retain unchanged document identities; reconcile changes/additions/deletions before unlocking. Rerender native chat only for changed authoritative collections. Preserve accessible character/tab/disclosures and latest reading position. Await journal refresh, preserving page/heading and post-heading scroll; remove revoked/deleted content.

Render store subscribers synchronously, independent of hidden-tab animation frames. Fetch/reconciliation timers and `reconnect.presentation` separate data work from UI restoration. Retain five-minute connection grace and reload on recovery failure. No service worker/persistent world cache; OS-discarded pages reload.

The task map locates reconnect coverage. `node scripts/measure_reconnect.mjs` compares HEAD/checkout with identical synthetic inputs, writing `dist/reconnect-timing-comparison.json`. Hosted latency and installed Android/iPhone behavior require separate checks.

## Native applications and rolls

Admitted Shadowdark `#sd-roll-dialog` and WFRP `.warhammer.roll-dialog-v2` forms follow the mobile palette, typography and touch styling, preserving native controls/handlers/hidden effects. Headers stay transparent/borderless with 44px targets; `.icon` buttons keep native fonts.

`native-roll-presentation.mjs` restores labels on release. Keep 5e test ADV/DISADV distinct from 4e combat Advantage; desktop/D&D styling remains native. Run `node scripts/check_browser.mjs --filter "^roll-dialogs-" --native-assets --screenshots` for installed icon-font fixtures (`FOUNDRY_APP_PATH` overrides location); never copy/ship the font.

WFRP 4e `slBonus` / 5e `SL` gain one-point buttons crossing zero. Retain native inputs and `change` events for recalculation; decorate idempotently across partial renders and unwrap on release.

Inspect ancestry: Shadowdark 4.0.6 `PlayerSheetSD` is V1; `RollDialogSD` is V2; Warhammer sheets use V2. CSS suppresses maximum-height transitions, so admitted V2 windows close with `{animate: false}`; keep V1 lifecycle native.

Warhammer uses the edition manager and native setup, then returned test `.roll()`. Pass `{resolveClose: true}` as setup's third argument to release locks on cancellation. The 4e Cast/Channel chooser omits options: temporarily observe renders, attach one-time close listeners to that Actor's `WarhammerRollDialogV2` instances, resolve unsubmitted closes, and remove listeners in `finally`. Never mutate frozen application options.

Shadowdark `rollStatCheck`, `rollAttack`, and `castSpell` roll internally: do not roll twice. Preserve native chat and scoped hooks distinguishing cancellation from failure.

## Journal access

List/read policy requires effective native OBSERVER permission and sheet page visibility. Exclude active Sequencer `sequencerDatabase` and Calendaria `isCalendarNote`/`isCalendarJournal` entries or descendants of `isCalendarNotesFolder`/`isCalendarFolder`, honoring native GM `devMode`. Recheck after async enrichment; refresh on document/folder/user/developer-setting changes. Never alter storage or ownership; ordinary names/default access remain valid.

Edit existing text pages only with effective OWNER on entry and visible page, including inherited permissions. Read fresh source; save only HTML `text.content` or Markdown `text.markdown`, preserving `text.format` and siblings. Use Foundry's configured converter for Markdown reading. Validate session, exact documents, ownership, source/format and duplicate saves. Same-page refreshes/errors retain draft/focus/selection; Save/Cancel refresh the reader and preserve line breaks. Nontext pages use native editors; no page creation or permission changes.

## Warhammer resources

WFRP 4e/5e share `wfrp4e`. At `i18nInit`, every client overrides Primary/Secondary Arm with fixed English Right/Left Arm labels. Localization changes only; native handedness/hit-location calculations remain.

### Opposed Momentum compatibility

Native 5e opposed evaluation may write an unowned melee participant's Momentum from the responding client. `wfrp-opposed-momentum.mjs` runs in every mode so desktop GMs can service writes. During serialized evaluation, intercept only single-field boolean `system.status.momentum` writes to unowned participants; flush after result persistence. The authenticated Foundry user query verifies requester ownership, handler/result identity, roll authors/participant links, native winner, melee item and combat requirement before the GM writes that field. Cover winner gain and loser clearing. Missing GM/rejection reports Momentum failure without losing the native roll; disposal restores wrappers/query.

### Equipment and mounts

Both editions equip Weapons, Armour, clothing/accessories (`trappingType.value === "clothingAccessories"`) and wearable Containers (`wearable.value === true`). Full-width phone/tablet rows align checkboxes beneath one muted, regular-size Equipped heading per eligible section. Mixed ineligible rows reserve the column; Money/Ammunition omit it. Keep item-specific accessible labels.

Money, Weapons, Armour, Ammunition, Trappings and Containers use initially closed native disclosures. The whole heading toggles once; retain each list through same-character refresh/tab changes and reset on character change. Encumbrance/Social Status remain outside; equipment headings stay visible when closed.

Write owned embedded Item `system.equipped.value` through native `Item.update`, preserving effects, offhand rules and weapon limits. Check eligibility, expected state and edition; rejection restores the checkbox. Combat reads prepared native equipment.

Combat shows Mounted beside Movement when native `actor.mount` resolves. Match rider-sheet permissions: mount ownership/visibility is unnecessary for display or toggling the owned rider's `system.status.mount.mounted`. Native preparation owns movement. In 5e, Mounted text opens a scrollable rules popover without toggling: Automated/Not Automated h3 headings and system 10.1.2 mounted-Dodge discrepancy are owned by `mount-rules.mjs`.

Below Armour, Mounts shows assigned Name and read-only current/max Wounds in either mounted state. Name takes remaining width on one line with horizontal overflow; Wounds uses content width and wraps below as needed. Resolve native actor/token assignment via `mount.mjs`, never creature names. Hide unavailable/off-scene token mounts without calling the native off-scene getter. Include mount identity in revisions; `profileDependencySources` refreshes riders on mount changes without granting mount navigation/editing.

### Encumbrance

Combat/Trappings share read-only native `system.status.encumbrance.{current,max}`; accept finite numeric strings, omit malformed values, and never recompute weight.

Combat alone adds a collapsed Penalties disclosure when native prepared `system.status.encumbrance.state` exceeds 1. The native thresholds (>1, >2, >3) select localized Encumbered/VeryEnc/MaxEnc labels and penalty text. Its open state survives refreshes and tab changes in the retained character shell and resets on character changes.

### Effects and conditions

Effects has a condition picker above session rows. Its native auto popover scrolls within half the viewport and closes on selection, Close, outside tap or Escape. Choosing adds a zero/off row without Actor writes; active conditions appear automatically. Retain rows for the exact Actor across refresh/tab changes; dismiss inactive rows locally. Native edition configuration owns conditions/`system.condition.numbered`. Align left names and shared action columns; numbered rows use minus/count/plus, others toggle. Revalidate edition/revision before native `addCondition`/`removeCondition`. Active `manualScripts` run with `{actor}`, preserving native rolls/damage/chat.

Populated secondary sections are read-only: combat Aspects, Injuries, Criticals, Psychology, Corruption & Mutation, Disease and disabled effects. Omit Temporary and Passive lists. Native `allApplicableEffects(true)`, `show` and name consolidation govern disabled effects; native rules govern concealed disease sources/timing.

Rows show native values/player Notes (`system.description.value`) with equal typography and consistent minimum height. Names/values stay single-line; only Notes ellipsizes, with 44px tap width. Scroll oversized rows within cards. Plain-text Notes opens a viewport-bounded formatted popover through the shared safe renderer. No effect creation/editing controls.

5e condition names toggle heading-free, scrollable popovers. Exclude Engaged from picker/rows/actions. Edition-gated `systems/wfrp4e/condition-descriptions.mjs` supplies code-owned text/bold spans without HTML injection or replacing 4e/native rules.

Notes/condition triggers declare `popovertarget`, prevent default toggle and position immediately. Outside taps dismiss while activating the tapped control; inside taps/scroll retain content. Retap closes, another trigger switches, Escape dismisses. Use trusted CDP `tooltip-touch-*` cases; synthetic clicks cannot verify light dismissal.

### Resources, recovery and Notes

Trappings displays nonblank prepared `system.details.status.value` as read-only Social Status in both editions; native preparation owns rank and modifiers.

Wounds, Fortune, Fate and Corruption use separate shared counter cards with per-Actor/resource session padlocks, immediate one-point changes and numeric entry. Native validation and writes remain authoritative: Wounds uses `setWounds` and its native maximum; Corruption's displayed maximum is a threshold and does not cap increments. Resolve/Resilience retain their existing 4e editors.

The Wounds bed starts native recovery regardless of padlock: find localized Endurance via `itemTags.skill`, fall back to Toughness, pass `{rest:true, tb:actor.characteristics.t.bonus, skipTargets:true}`. Native setup/roll and Chat Apply Healing own healing; cancellation releases without rolling.

Combat displays prepared `system.details.move.{value,walk,run}` as read-only Move/Walk/Run. Preserve manual text and mounted results; append native localized yards only to auto-calculated Walk/Run. Main displays read-only `system.details.experience.{current,spent,total}` in Current/Spent/Total order; the native system owns Current and no XP is recalculated or edited here.

Notes edits the selected Actor's plain-text Personal/Party Ambitions, `system.details.{personal-ambitions,party-ambitions}`: 5e `long-term`; 4e `short-term`/`long-term`. Empty fields stay editable. Allowlist named fields, checking original value/edition; preserve siblings and Party documents. Ambition/edition changes invalidate Notes snapshots without losing drafts.

Momentum uses `editControl: "checkbox"` and validated saves. Disable during saves and restore on failure/cancellation; other booleans retain their editors.

Base and protected styles preserve native checkbox glyphs and handlers, 44px touch targets, control contrast of at least 3:1, and button-text contrast of at least 4.5:1. Check installed Foundry CSS/fonts with `node scripts/check_browser.mjs --native-assets --filter '^control-contrast-native$'`; this is fixture evidence.

### Native ammunition issue

WFRP 10.1.2 / Library 3.5.1 missing-ammo cancellation can pass undefined setup data into `awaitSubmit`, causing `data.scripts.concat` failure. Native **Consumes Ammo** controls this path; loading is separate. Do not bypass ammo or patch the library.

## Shadowdark resources and gear

PC Bio retains internal `notes` and editable Notes, followed by read-only, nonblank, visible linked Languages (alphabetical), Deity and Background. `systems/shadowdark/bio.mjs` resolves `system.languages`, `system.deity` and `system.background` UUIDs, including uncached compendiums; lifecycle notifications refresh profiles after loading. Include Bio in snapshot revisions. Group keeps Notes without PC sections.

Inventory names/arrows toggle initially closed player descriptions in Equipped/Carried/Stashed Gear, including Group. Empty or sanitized-away descriptions have no toggle; safe image-only content does. Quantity/equipment controls remain independent.

Spells Known sorts all spells, including lost ones, by ascending Tier then name. Tier headings match resource-value typography; rows omit Tier labels and reserve only cast-button space. Tiers start expanded, retaining choices across same-character refresh/tab changes until character change/reload. Lost names strike through with visible disabled casting. Names/arrows disclose descriptions; dice alone casts. Expanded descriptions expose Lost, writing owned Spell `system.lost` without rolling and preserving disclosure state.

Spells from Items lists identified carried Scrolls/unbroken Wands with resolvable native Spell links; omit empty subsections. Wands/Scrolls start expanded and retain state like Tiers; alphabetical rows show source and separate description/cast controls. Wand Lost uses native `toggleSpellLost` on the source reference after ownership/link/revision/unbroken checks, never the compendium Spell. Scrolls omit Lost.

Item casting requires `canUseMagicItems` and native `actor.system.castSpell(spell.uuid, {itemUuid: sourceItem.uuid})`; preserve dialogs/consumption/loss/breakage. Scoped `SD-Player-Spell` rejects changed source/link/spell identities/state before rolling. `item-spells.mjs` deduplicates async compendium loads; lifecycle watchers reproject the selected Actor and ignore disposed completions. Unsupported Actors/Group never load item spells.

Main retains internal `abilities` for tab state/Targets. Special Abilities shows owned native Class Ability Items with descriptions and native group/uses summaries. Call `actor.system.useAbility(item.uuid, config)` once; scoped `SD-Player-classAbility` checks identity, uses, loss and roll fields before native consumption/chat. Lost/exhausted abilities remain readable without actions.

Inventory separates Equipped/Carried/Stashed Gear, keeping Slots/Add Gear when empty. Equipped quantities are read-only in UI/capabilities until unequipped. Owned, identified, carried Items with native `canBeEquipped` delegate to sheet `_onToggleEquipped`, retaining shield/two-handed handling. Validate expected equipment/handedness dependencies; invent no flags. HP/read-only AC cards share height. Keep each coin label/value/controls together, wrapping between denominations. Tablet resources use HP/AC/DEF then XP/Grit/Luck; Stats/Coins also use three columns.

Phone/Tablet `Player` Actors named `Group` (trimmed, case-insensitive) open Item Tracking: Inventory by default plus native Notes. Gear combines identified carried physical Items, including equipped ones; omit Equipped Gear/equip controls. Quantities remain editable without changing equipment flags. Retain Coins, Slots, Stashed Gear, descriptions and custom/catalog Add Gear. Renaming across Group invalidates quantity requests and refreshes profiles; desktop stays native.

HP/AC/DEF and XP/Grit/Luck use native values except nonnegative integer `flags.mikelandia-controls.shadowdarkResources.{def,grit}` (default zero). XP is `system.level.xp`. Preserve native/Pulp Luck, 44px edit targets, and independent `system.coins.{gp,sp,cp}` controls with no negative decrement.

HP/DEF/XP/Grit/Luck padlocks start locked after reload and persist per Actor/resource in-session. Unlocked buttons save one-point changes; values open numeric entry. HP is 0..max, standard Luck maps Boolean 0/1, others use nonnegative safe integers. AC stays calculated. Disable while saving; restore authoritative values on failure/cancel.

Shadowdark/Group numeric resource, coin and quantity editors use `numericEditorLayout: "stacked"`: centered label/input (at most 9rem/card width), equal Save/Cancel buttons and cards tall enough for the form. Hide duplicate coin/resource labels; keep gear name plus Quantity. Preserve focus/selection, numeric keyboard and validation; other profiles keep their layouts.

Keep Gear/Slots/add visible when empty. Custom/catalog choice supports Cancel, Escape, and Back; render only the selected editor. Catalog auto-loads, searches all words across name/source ignoring case/accents, and keeps all results scrollable. Success/Cancel removes the editor; native cancellation retains it. Dispose chooser and ignore late responses.

Custom Basic Items start at quantity 1; `system.slots.{slots_used,per_slot}` default to 1, with `free_carry=0`. Validate nonnegative/positive safe integers respectively; native weight is `ceil(quantity / per_slot) * slots_used`. Custom fields cannot override catalog acquisition.

Quantities are nonnegative safe integers without per-slot caps; revisions include weight/equipment. Saving zero in Carried/Stashed Gear opens native Remove/Cancel, default Cancel. Dismissal preserves quantity; Remove rechecks session, ownership, identity, quantity and revision. Leave untouched zero stacks. Exclude Actor-owned catalog sources. Await inherited acquisition despite 4.0.6 `_onDropItemSD` omitting its return. Preserve native prompts/effects/chat; never toggle token lights. World PCs need no user assignment.

## Isolation and audio

Phone/Tablet isolation is reversible and independent of Protect/Common Display. Approved descendants expose ancestor hosts without exposing siblings; reconcile late windows, rerenders, and forced display changes. Restore latest underlying preferences on exit.

During `mc-mobile-booting`, an important visibility layer admits only direct `.mc-mobile-bootstrap` and recovery controls, before `mc-mobile-running`, preserving Hide UI. Keep opacity completion; remounts update policy without resetting Continue/recovery/completion. Guard the entire ready callback, including shared/upgrade waits and theme setup, to show recovery on failure.

Admit exact owned editors, recognized rolls, approved children and native dialogs opened deliberately from mobile controls. Render/navigation hooks and generic modal flags grant nothing. Scoped requests own confirmations; Settings owns its session. Cover `.mc-mobile-admitted-app` and `.mc-mobile-settings-app` headers/Close despite Common Display Hide UI; preserve its saved preference and desktop. Revoke ownership on teardown; retain notifications/tooltips/menus and Dice So Nice. Ignore mutations wholly inside approved branches while reconciling ownership changes.

Dice rendering resolves explicit static/reduced/normal choices or automatic device-hint selection without reading the canvas or a recovery journal. Historical graphics changes are handled only by upgrade cleanup.

Disable mobile audio from init, before ready/gesture unlock. Block native Sound loading/playback, pending/delayed entry points and AudioContext resume; stop local Sounds, suspend existing/new contexts and pause/block attached or detached HTML media. Block YouTube Player Widget API insertion/bootstrap before iframe/music loading. Keep incoming currentVideo/playlists/currentTime callbacks safe via a dormant interface; block existing widget load/playback/volume without shared writes.

Verify actual widget/saved-track use: zero mobile YouTube API/embed/media requests, Desktop positive control. Never alter Playlists, save playback state or replay/resume on disposal. Remove guards at teardown; mode changes reload. Audible proof requires a phone.

`hidden-canvas-rendering.mjs` skips only native board main-stage screen draws when isolated/hidden. Preserve texture/other-stage rendering and other renderers, including Dice So Nice. Never stop the ticker: token animation, render flags, primary updates and perception depend on it. Keep canvas objects, targeting and moving-token distances active. Reattach on canvasReady; remove guard at teardown. Other scene processing continues.

Optional in-memory API: `setRollTimingEnabled`, `rollTimingSnapshot`, `resetRollTiming`. Separate native/dialog/chat stages from thinking time and time outside Chat; retain at most 20 observations, disposing listeners after 30 seconds or cancellation.

## Packaging

Validation workflow: [AGENTS.md](../AGENTS.md). Build with `py -3 scripts/build_release.py --version <version>`; the builder validates local ZIP contents, manifest references and runtime imports. After publication, verify anonymous HTTP downloads with `py -3 scripts/check_release.py --base-url <release-url> --version <version> --build <commit-sha>`. The canonical release contains `module.json` and `mikelandia-controls.zip`; publication runs `retire_legacy_assets.py` to remove obsolete release assets. Main pushes publish releases. The standalone login has its own build/deployment [runbook](mobile-login.md).
