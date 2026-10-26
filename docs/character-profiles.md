# Character profiles

Profiles map prepared Foundry document values and allowlisted native actions into shared components. Explicitly supported resources have capability-gated editors; derived and unmapped values remain read-only. The UI renders each profile's game labels. The renderer does not inspect system IDs, field paths, actor types, or game rules.

The current implementation adds a Warhammer character profile with Characteristic/Skill tests, equipped-weapon attacks, and native casting/channelling to the native-access shell. D&D5e keeps its existing mobile renderer and an isolated legacy action engine. Unknown systems, unmapped actor types, and unavailable edition settings retain the identity-only native-sheet view.

## Data contract

`src/systems/profile-view.mjs` projects code-owned descriptors into plain, frozen tab/section records. Each tab and section has a stable `id`, an explicit `label`, and an optional native `labelKey`. Translation lookup falls back to that game's explicit label when the key is unavailable.

Supported section types:

| Kind | Input | Output |
| --- | --- | --- |
| `values` | Explicit field paths or code-owned readers, and formats | Labeled numeric, boolean, or text values |
| `counters` | Numeric field paths and optional explicit maximum paths | Current values, optionally current/maximum |
| `items` | Explicit collection path, item types, grouping predicate, and optional displayed value path | Item names with optional prepared values |
| `text` | An explicit text field path | Plain text, without HTML enrichment |

An optional `when(context)` predicate handles profile-specific visibility such as edition settings. All predicates, readers, and paths are code-owned. Optional field readers handle prepared native presentation such as a Wind showing zero when another Wind holds the channelled power; they cannot be supplied by command payloads. Descriptors do not accept executable expressions or methods from client payloads.

Missing values, invalid numbers, unsupported formats, failing getters, unknown section kinds, and empty sections are omitted. Zero and boolean false remain valid. Numeric strings are not coerced into numbers. Maxima are shown only when explicitly mapped and available; the projector does not infer limits or recompute totals. Prototype paths are rejected.

Item rows can use `format: "display"` for a native value that may be a finite number or a nonempty formatted string. Optional `valueLabel`/`valueLabelKey` and `valuePrefix` supply game-specific presentation such as Damage +7. Native formula/dice strings stay text; VE does not evaluate them. Grouping predicates receive `(item, context, actor)` so profiles can restrict their lists to exact embedded documents.

Item projections filter by declared types and profile predicates before reading names or values. Invisible items are omitted. Warhammer maps skill names/totals, native equipped-weapon names/DamageString values, and owned spell names/CN. Item sections without a value path render name-only rows, as for Petty Spells. Unmapped inventory, descriptions, effects, and item-management controls remain in native sheets. Weapon names follow native owner-visible presentation; the integration does not infer identification semantics from unknown fields. Values and labels are inserted as text, including names that contain markup.

Optional `actionId` fields or an item section's `actionIdPrefix` can associate a row with a native action. The projector attaches action metadata only when it matches a descriptor supplied by current gateway capabilities. Descriptors contain an allowlisted ID and a configuration revision, without native method names, formulas, or writable paths. A mapping alone cannot enable an action.

An optional field `editId` attaches a resource editor only when it matches a current `profileEdits` capability and its current value. Public edit descriptors contain an ID, revision, input kind (integer/boolean), and explicit numeric limits. They contain no document paths or native method names. Unknown system paths never become writable merely because the projector can read them.

## Native action dispatch

The shared actor-command gateway owns fresh actor resolution, ownership/session checks, configuration-independent duplicate protection, and lifecycle checkpoints. Each integration supplies an execution adapter. D&D's existing orchestration, templates, chat parsing, native helpers, and response formatting now reside in `systems/dnd5e/legacy-gateway.mjs`; its original guards remain during migration.

Warhammer advertises native Characteristic/Skill tests and equipped-weapon attacks for owned player characters with mapped data, a valid edition setting, and the corresponding setup method. Skill actions require a visible, owned embedded Skill Item in the mapped native grouping. Weapon actions require a visible, owned embedded Weapon with native equipped and melee/ranged flags and an available native DamageString display.

The Warhammer adapter invokes `actor.setupCharacteristic(key)`, `actor.setupSkill(item)`, or `actor.setupWeapon(item)`, then calls the returned test's `roll()`. Native edition selection, input, effects, rules calculations, chat, and follow-up behavior stay in the system. Cancelled or aborted native setup completes without an extra roll. VE does not parse the result through D&D summaries or roll overlays.

Requests carry only the source, action ID, and action revision. Extra fields such as native method names, bypass flags, or arbitrary options are rejected. Before rolling after a dialog, the adapter rechecks current session/lifecycle, actor identity and ownership, edition, capability, and exact Skill identity/visibility/ownership. Changing the selected actor or leaving the active mobile character view invalidates a pending profile action through the kernel checkpoint. An already-running native roll remains owned by the system.

Weapon actions additionally recheck exact embedded identity, owner visibility, equipment state, and native attack mode. Native tests may expose cloned Item views; those are accepted only for the matching weapon ID/type/actor, while the original embedded document remains the authority. VE does not consume ammunition, edit loaded state, calculate damage, select attack targets, or implement reload/dual-wield/opposed rules. `setupWeapon()` and the native test own those workflows, including unloaded-weapon behavior. Unarmed, improvised, trait, and vehicle attacks remain native-sheet workflows.

## Rendering and state

`features/characters/profile-panels.mjs` renders the supplied tabs and sections inside the existing native-access shell. `state.characterTab` selects a stable tab ID; an absent or unavailable tab selects the first populated tab. Actor updates rebuild the selected profile from current documents. The native-sheet button stays above the panels.

The embedded actor chooser does not scroll the enclosing view when it mounts or refreshes. Popup choosers keep their existing selected-entry scrolling behavior.

## Warhammer source mapping

Verified against the local installed `wfrp4e` 10.1.2 source, not a live world:

| Mapping | Native source evidence |
| --- | --- |
| Characteristics | `CharacteristicsModel` and `CharacteristicModel` in `wfrp4e.js`; prepared `system.characteristics.<key>.value`; characteristic label keys in `WFRP4E.characteristics` and `lang/en.json` |
| Main tab resources | `templates/sheets/actor/character/character-main.hbs`; Wounds, Fortune, Fate, Corruption; Resolve and Resilience hidden when `editionSettings.use5e` is true |
| Combat resources | `templates/sheets/actor/tabs/actor-combat.hbs`; Momentum in 5e, Advantage or Group Advantage in 4e; value read from the actor as in the native sheet |
| Skill lists | `_prepareSkillsContext` in `wfrp4e.js` and `templates/sheets/actor/tabs/actor-skills.hbs`; basic non-specializations versus advanced/specialized skills; prepared `system.total.value` |
| Edition selection | `EditionManager` and the `wfrp4e.editionSettings` setting, including `use5e`; unavailable or malformed settings retain native access |
| Native tests | `setupCharacteristic`/`setupSkill` and `_onRollTest` in `wfrp4e.js`; `_setupTest` in `warhammer-lib.js` returns a test or no value on cancelled setup; native test `roll()` handles messages and effects |
| Weapon lists | `templates/sheets/partials/melee-weapons.hbs` and `ranged-weapons.hbs`; `system.isEquipped`, `isMelee`/`isRanged`, and `DamageString` from `WeaponModel`/`EquippableItemModel` |
| Native attacks | `setupWeapon`, `WeaponDialog`/`WeaponDialog5e`, and `WeaponTest`/`WeaponTest5e` in `wfrp4e.js`; native setup owns ammunition/reload checks and native tests own consumption, effects, and opposed follow-ups |
| Refreshes | Integration contributions for edition, group-advantage mode, and group-advantage value settings; ordinary actor/item hooks reuse shared session invalidation |

Only owned/GM player characters receive these panels. NPCs, creatures, and vehicles keep the safe native-sheet view until explicitly mapped. Edition switching refreshes the profile in fixtures; the installed system marks edition changes as requiring reload, which should still be followed in live testing.

## Validation boundary

Node checks cover projection, localization fallback, visibility, missing data, permissions, skill grouping, prepared values, and setting invalidation. Chromium fixtures exercise the actual renderer and watcher for both editions at phone/tablet sizes, including tab changes, native access, text injection resistance, and profile/native transitions.

Live native-system behavior, Foundry sheet/dialog integration, and real-device interaction remain unverified. These profiles do not establish complete Warhammer support. Magic now uses the native entry points described below; live casting/channelling and chat follow-ups remain unverified.

## Native magic

The Magic tab follows `actor-magic.hbs`, `actor-magic5e.hbs`, and `_prepareMagicContext` in installed wfrp4e 10.1.2. Petty Spells have name-only rows; Lore Spells display prepared CN. Only visible, owned, exact embedded Spell Items with mapped edition-specific lore and numeric CN are projected. Live Foundry testing confirmed that native 10.1.2 lore is a list in both editions. Native templates/prompt code coerce a single-entry list when comparing it to a string.

For 4e, the adapter calls the exact actor sheet's `castOrChannelPrompt(spell)`. The native sheet sends Petty Spells directly to `setupCast(spell)` and offers Cast/Channel for Lore Spells, invoking `setupCast(spell)` or `setupChannell(spell)`. VE rolls the returned native test once. The prompt and required setup entry points must be available before the action is advertised.

For 5e, spells call `setupCast(spell)` directly. Wind labels invoke `setupChannelling(windKey)`, whose argument is a Wind key rather than a Spell Item. The native `ChannellingModel.getWinds()` receives only visible, owned, mapped spells; results must also exist in the prepared `status.channelling.winds`. Hidden spells cannot leak additional Winds. Displayed power follows the native template: `status.channelling.value` for the active Wind, zero for others. Missing model support omits Wind controls.

After setup, VE rechecks source, session, lifecycle, ownership, edition, native capability, exact spell identity, and lore. Pending Wind actions also retain spell identities/lore and require the Wind to remain available. Native cloned spell views must match the original embedded Item's ID/type/actor; a returned Wind context must match the requested Wind. Native setup errors release command locks, and empty setup returns cancel without rolling.

Source evidence: `_onRollTest`, `castOrChannelPrompt`, `setupCast`, `setupChannell`, `setupChannelling`, `EditionManager`, `ChannellingModel`, and the edition-specific Cast/Channelling dialogs/tests in `wfrp4e.js`; `_setupTest` in installed `warhammer-lib.js`. Native tests own ingredients, channelled SL/power, miscasts, overcasting, effects, chat cards, and opposed follow-ups. VE supplies no bypass options, rules calculations, or resource writes. Prayer/aspect actions and magic management remain in native sheets.

## Explicit resource edits

`profile-resource-editor.mjs` renders an Edit button and a labeled numeric input or checkbox with Save/Cancel. `EDIT_PROFILE_RESOURCE` passes the exact actor source, resource ID, resource revision, displayed value (`expectedValue`), and requested value. The shared gateway enforces fresh authority, session/lifecycle checks, and a per-source/resource lock independent of editor revision. The Warhammer adapter owns the fixed resource paths and operations in `resources.mjs`. The renderer cannot select document paths, methods, or update options.

Supported current values: Wounds, Fortune, Fate, Corruption, 4e Resolve/Resilience/Advantage, and 5e Momentum. Numeric inputs require nonnegative safe integers; Momentum requires a boolean. Wounds uses the prepared native maximum; personal Advantage uses the native prepared cap. Fortune is not artificially limited to Fate, Resolve is not limited to Resilience, and Corruption can exceed its mutation threshold. Missing or malformed values/caps and unsupported native entry points omit editors. Derived maxima, Characteristics, channelled power, item values, prayers, and rest/spend workflows remain outside this edit contract.

Wounds calls `setWounds(value)`; Advantage calls `setAdvantage(value)`. Other resources call native `actor.update()` with one allowlisted field and no bypass options, matching the native sheet's update path. Native model hooks own Corruption checks, Momentum/token effects, Advantage caps, and Group Advantage routing. A resource save does not create a test or parse chat in VE. Native hook cancellation is reported as cancelled, and unchanged saves skip writes to avoid repeated side effects.

Group Advantage additionally requires a current combatant whose actor is the exact source, a native players/enemies group, and matching prepared/shared pool values. Its revision includes combat/combatant identity, group, and shared value. VE uses the native actor setter rather than writing world settings or broadcasting sockets; completion reports a requested update while native GM/socket synchronization proceeds. Combat membership and native cap settings invalidate the selected profile through integration contributions.

Saves reject changed values, edition/group mode, caps/settings, shared pools, permissions, actor source, lifecycle, or session. The expected-value check detects changes already visible to this client; it is not a server transaction or a guarantee against simultaneous writes on different clients. Once a native update starts, its side effects remain native and cannot be rolled back by navigating away. Tab changes, actor selection, and profile refreshes dispose unsaved editor drafts.

Native source evidence: `character-main.hbs`, `actor-combat.hbs`, `StandardStatusModel`/`CharacterStatusModel`, `computeAdvantage`, `_handleWoundsUpdate`, `_handleAdvantageUpdate`, `_handleGroupAdvantage`, `_handleMomentumUpdate`, character `_onUpdate`/`checkCorruption`, `setWounds`/`setAdvantage`, and `advantageGroup` in installed wfrp4e 10.1.2; `_onStepProperty` in `warhammer-lib.js`. These findings and synthetic/browser fixtures do not establish live-world correctness.

## Shadowdark PCs

Installed source: Shadowdark 4.0.6 `src/models/PlayerSD.mjs`, `_ActorBaseSD.mjs`, actor/item field models, `WeaponSD.mjs`, `SpellSD.mjs`, `src/sheets/PlayerSheetSD.mjs`, `src/documents/{ActorSD,ItemSD}.mjs`, `src/apps/LightSourceTrackerSD.mjs`, native player templates, and `i18n/en.json`.

`systems/shadowdark/` explicitly maps the case-sensitive `Player` type. Unknown Pulp Mode settings retain native access. Abilities uses native HP/AC/Stats/Luck labels and prepared `system.abilities.<key>.value/mod`. Luck reads `system.luck.available` normally and `system.luck.remaining` in Pulp Mode. Equipped native Weapons use Melee/Ranged Attacks groups; native `isThrown` enables the additional ranged option. Weapon subtext stays plain text. Inventory projects explicit carried physical Item types only when visible, owned, identified, and not stashed; names are filtered before access. Spells Known and Lost Spells use exact embedded native Spell Items and prepared Tier. Only unlost spells on a native spellcaster advertise casting.

The native methods `actor.system.rollStatCheck(key, config)`, `rollAttack(weaponUuid, config)`, and `castSpell(spellUuid, config)` perform their own dialogs, rolling, post-roll effects, and chat. The native player attack entry point takes a UUID; the NPC method's different arguments are not used. VE supplies only code-owned attack-mode configuration and never exposes native options or bypass flags in requests. Native class/spell capability checks remain native; unavailable class combinations can still be refused by the system.

Source-verified pre-roll hooks (`SD-Stat-Check`, `SD-Player-Attack`, `SD-Player-Spell`) receive the same mutable native config object passed by VE. The scoped callback ignores all other configs, rechecks fresh authority and exact source/model/item identity, native capabilities, settings, class binding, weapon equipment/mode/handedness, spell loss/tier/class/duration, and config actor/item targets, and returns false on stale state. It catches guard errors so Foundry's Hook error handler cannot accidentally permit the action. Hooks are removed in `finally`. Once the native checkpoint accepts, subsequent async ammunition/roll/effect work remains native; VE cannot roll it back on navigation.

Native methods return false for both cancelled workflows and some failed rolls. A workflow that never reaches VE's native checkpoint is reported cancelled/refused. After the checkpoint, the shared UI reports native workflow completion, allowing the native chat/warnings to explain failed rolls or another module's later veto. VE never rolls twice or infers spell loss from a boolean result.

HP/Luck use the shared edit contract. Only `system.attributes.hp.value`, `system.luck.available`, and `system.luck.remaining` may be updated; the Pulp setting selects the appropriate Luck field. HP edits require nonnegative safe integers within the prepared maximum; Luck is boolean normally or a nonnegative safe integer in Pulp Mode. Native actor update hooks remain active. These are direct current-value edits, rather than damage application, Luck spending, or rest operations. Derived AC, ability scores, and maxima are not editable through this contract.

Basic light sources delegate to the exact native Player sheet's `_toggleLightSource(item)`. The adapter requires a claimed world Player assigned to the current user, an exact owned/visible/identified carried source, and the native tracker entry point. Exact current-user assignment establishes the claim synchronously; native `isClaimedByUser()` returns a Promise in 4.0.6 and is not called during projection. It does not mirror light timers, write item light fields, alter token/prototype lighting, emit sockets, or implement one-active-light rules. A per-actor light lock prevents overlapping mobile toggles of different sources; revision checks include native active state. Item/user/settings hooks refresh the profile. Unlinked-token and unassigned actors keep native-sheet light management because the installed tracker gathers world actors. Spell/Effect lights remain native. Reconnect checkpoints and simulated remote updates are tested; initial player-to-GM Torch activation and native tracker admission passed live; timer expiry and reconnect synchronization still require live validation.

New NPC and creature profiles are deferred at the user's request. Existing native access remains. Full inventory, class abilities, magic items, focus-specific casting, rest/spend actions, and spell restoration also remain native-sheet workflows.

## Responsive profile organization

The shared Warhammer/Shadowdark renderer places labels and values on the same line, with values aligned to the trailing edge. Rows wrap when their content needs more space. Consecutive single-field resource sections share a flexible row; an unmatched last card fills the available width. Larger sections retain the full sheet width, with responsive grids for their fields and longer minimum widths for item names. Numeric inputs and Save/Cancel controls share a line when they fit. Status messages and editors use the full row width; touch targets retain their 44px minimum height.

Layout fixtures cover 320, 390, 768, and 1024px viewports, 24px text, long translated/unbroken names, large values, open editors, and native completion feedback. These are browser layout checks, separate from the earlier isolated live workflows and real-device validation. Existing D&D label/value, resource, skill, and item rows already use horizontal layouts and were retained.
