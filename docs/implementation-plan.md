# Multi-system implementation plan

Status: integration boundary, native-sheet fallback, shared panels, Warhammer 4e/5e character profiles, native Characteristic/Skill tests, equipped-weapon attacks, casting/channelling, and explicit resource editing implemented locally, 26 October 2026. Shadowdark PC panels, native stat/attack/spell workflows, HP/Luck edits, and scoped native light controls are also implemented. New NPC/creature profiles are deferred at the user's request; PC support is the priority. Live D&D regression, native game-sheet behavior, and device validation remain pending.

## Outcome and constraints

Extend VE Mobile to Warhammer 4e/5e and Shadowdark while keeping navigation, scene interaction, chat, journals, permissions, and lifecycle handling shared. Preserve existing D&D5e behavior throughout the migration.

The interface must use each game's actual terminology, grouping, and applicable controls. Shared components are an internal implementation detail. Warhammer displays Wounds and Characteristics; Shadowdark displays its own ability names and Luck. Prefer system localization keys, with verified game-specific fallback text. Never show D&D controls merely because another system has a similarly shaped field.

Use declarative mappings for presentation and explicitly supported field edits. Delegate rules actions to the installed system. Unknown systems receive a conservative fallback with native-sheet access; automatic schema inspection must not invent rules or writable resources.

## Verified starting point

- This checkout is the 1.0.7 baseline with repository and packaging documentation. The installed module is a separate copy.
- `module.json` declares D&D5e support. Expanding that declaration alone cannot provide compatibility.
- Actor eligibility is restricted by D&D actor type names in `src/foundry/session-gateway.mjs`.
- Data extraction, capability detection, commands, character tabs, and editors assume D&D structures in `actor-view.mjs`, `command-gateway.mjs`, and `features/characters/presenter.mjs`.
- Item macro creation, quickbar skill labels, action summaries, and combat tie-breaking also contain D&D assumptions.
- `mobile-presentation.mjs` suppresses ordinary native actor sheets. The fallback needs an explicit, scoped admission route.
- Installed sources identify Warhammer as `wfrp4e` 10.1.2 and Shadowdark as `shadowdark` 4.0.6. Warhammer's edition manager selects dialogs and test classes; Shadowdark exposes actions through `actor.system`.
- There is no existing test directory or JavaScript test runner configuration. CI currently validates packaging.

These are local source findings. Native workflows and phone behavior still require live-world validation.

## Architecture boundary

Add a small integration registry under `src/systems/`, selected once at application composition and supplied to the existing gateways. Start with `dnd5e` and a conservative fallback; add `wfrp4e` and `shadowdark` later. Keep the existing module format and DOM renderer.

The boundary owns:

| Responsibility | Contract |
| --- | --- |
| Actor presentation | Produce permission-filtered identity, game-labeled sections, resources, item groups, and action descriptors. Keep list summaries cheaper than full selected-actor records. |
| Capabilities | Identify supported actions and explicit edits for the current actor type, edition, and user. Missing capabilities produce no actionable control. |
| Action dispatch | Resolve an allowlisted action ID to native system behavior. The UI supplies actor source UUID, item reference, and validated inputs. |
| Presentation mappings | Supply localization keys, fallback labels, field paths, grouping, and ordering in code-owned profiles. |
| Optional system features | Supply quickbar entries, item-macro creation, action summaries, and combat settings when supported. |

Shared gateways retain session checks, fresh actor/token resolution, permission enforcement, duplicate-action protection, cancellation, and connection-generation checks. They re-evaluate capability and validate item ownership immediately before dispatch. Client payloads cannot select arbitrary document paths or methods.

Retain the legacy D&D view and renderer behind the selected integration initially. Extract common components incrementally when another system actually needs them. Native chat remains the default results surface for integrations without a verified action-summary implementation.

## Phase 1: Establish the boundary and preserve D&D behavior

1. Add the registry and integrate selection in `src/entry.mjs` where gateways are composed.
2. Route actor eligibility, actor records, and capability lookup through it. Preserve D&D's current visibility policy and record shape.
3. Put the existing D&D command handler selection behind the boundary while keeping shared command guards in place. Migrate D&D-specific helpers in small follow-up changes rather than moving every file at once.
4. Audit remaining system assumptions in character collections, headers/themes, quickbars, combat, biography/editing gateways, action sessions, hooks, settings, and localized help text. Assign each to shared code or an integration.
5. Introduce focused `node:test` checks and run them in CI before packaging. Use small synthetic actors and injected Foundry services.

Acceptance: D&D still uses its existing mobile sheet; another system selects the fallback and cannot invoke D&D actions or receive D&D resource editors. Automated checks cover integration selection, unsupported actions, and preservation of D&D actor eligibility.

## Phase 2: Make the fallback useful

1. Discover actors through Foundry permissions without requiring particular type names. Default fallback discovery to GM/owner access; expose observer browsing only through an explicit supported policy. Keep D&D's existing policy intact.
2. Show a minimal actor identity and permission-safe item list. Do not serialize all of `actor.system` or expose unidentified/secret item details through a generic browser. Use native sheets where safe presentation cannot be established.
3. Add an explicit Open Character Sheet action using the current actor source, including synthetic actors on unlinked tokens.
4. Admit only the deliberately opened sheet through mobile presentation. Support the installed Application V1/V2 paths, nested native dialogs, scrolling, keyboard input, close/back, and restoration on exit. Reuse existing native application hosting where possible.
5. Exercise native chat, journals, existing hotbar macros, scene controls, and the combat tracker without invoking D&D enhancements. Keep unsupported item-macro creation and quickbar actions unavailable.
6. Change manifest restrictions only when needed to run this fallback in development worlds. Reserve public compatibility claims for validated systems and versions.

Acceptance: a Shadowdark player can select an owned `Player`, open its native sheet, run an existing macro, use chat/journals, and return to the scene. An unauthorized actor remains inaccessible. A fallback actor never shows death saves, spell slots, attunement, or other inferred D&D controls.

## Phase 3: Add shared rendering with game-specific presentation

1. Define section descriptors for labeled values, counters, item lists, rich text, and action buttons, with stable IDs separate from visible labels.
2. Let profiles specify tabs, section order, item grouping, formatting, and relevant controls. Do not impose the existing D&D tab set on other games.
3. Add explicitly allowlisted resource editing with validation, limits, and a native-operation option. Derived fields remain read-only; use native workflows when edits have rules side effects.
4. Handle missing fields, unsupported actor types, and failed profile validation by omitting the affected feature or offering the native sheet.
5. Keep D&D on its existing renderer until individual shared components demonstrate equivalent behavior.

Acceptance: fixture-driven rendering uses the correct game labels and controls, missing data never becomes a misleading zero or editable resource, and neither Warhammer nor Shadowdark needs a separate copy of the mobile application.

## Phase 4: Deliver Warhammer first

Use one `wfrp4e` integration for both editions. Support owned characters. NPC/creature mappings are deferred by the user's PC-only priority update. Leave vehicles and other unmapped types on native-sheet access.

1. Read the installed schemas, localization keys, and native sheet listeners for Characteristics, Skills, Wounds, resources, inventory, and magic before mapping them.
2. Deliver read-only game-labeled panels, then native Characteristic/Skill tests and weapon actions.
3. Add casting and channelling after checking their edition-specific entry points and cancellation behavior. Follow native setup/test workflows, including rolling the returned test where required.
4. Preserve native chat-card handling for opposed tests and follow-up actions. Add mobile summaries only after native cards work reliably.
5. Refresh views when the edition setting changes; cancel stale action descriptors and use the active edition's native workflow.

Acceptance: independently validate 4e and 5e for checks, attacks, resource changes, casting/channelling, opposed-test interactions, and cancellation. Confirm correct labels and absence of irrelevant edition controls in each mode.

## Phase 5: Add Shadowdark through the same boundary

1. Support the case-sensitive `Player` type. Keep `NPC` and `Light` actors on native sheets under the user's PC-only priority update.
2. Map ability scores, HP, Luck, inventory, and spells using native labels and visibility rules.
3. Dispatch checks, attacks, and spellcasting through verified native methods. Respect the differing Player/NPC action arguments and references.
4. Add light controls only through the system's native workflow; verify timer ownership, synchronization, and reconnect behavior.
5. Use any pressure to duplicate the presenter as a reason to improve the shared descriptor boundary.

Acceptance: player actions reach native dialogs/cards, spell failures retain system behavior, resource changes refresh, and light state stays synchronized across clients.

## Phase 6: Validate and package

| Validation | Required evidence |
| --- | --- |
| Automated behavior | Registry/fallback selection; permission boundaries; unsupported commands rejected even when called directly; no cross-system field writes; synthetic actor resolution; stale sessions; cancelled native workflows. |
| Presentation | Game labels, correct grouping, unavailable controls absent, supported locale plus localization fallback, narrow phone and tablet layouts. |
| D&D regression | Character and NPC sheets, group/vehicle behavior, inventory, spells, rests, quickbar, macros, and action summaries. |
| Live system workflows | D&D, Warhammer 4e, Warhammer 5e, and Shadowdark in separate test worlds or controlled edition runs; record exact Foundry/system versions. |
| Shared mobile behavior | Owner/observer/GM access, linked/unlinked tokens, native sheet/dialog nesting, chat cards, journals, targeting/movement, combat, reconnects, rotation, and desktop restoration. |
| Release artifact | Existing Python packaging validation, runtime import paths, required assets/locales, and installation of the built ZIP in a test environment. |

Start with the currently installed Foundry version. Validate Foundry 13 separately if retaining a minimum-version compatibility claim for the new functionality. Report automated, desktop-browser, and real phone/tablet results separately.

Before any installed-copy update, preserve that installation and use a backed-up test world. Build a version above 1.0.7 when ready; publish support status by feature and tested version. The private repository's download-access requirement in the README remains a release dependency.

## First implementation batch

Implemented locally:

- A delayed, application-lifetime integration resolver shared by session and actor-command gateways.
- D&D actor discovery, record projection, references, command dispatch, actor-type restrictions, and capability policy routed through its integration.
- Conservative fallback with no character discovery or gameplay capabilities; direct actor commands and item-menu requests are rejected.
- Node integration checks and a CI test step before packaging.
- A [source coupling audit](system-coupling-audit.md) assigning the remaining D&D assumptions and Phase 2 prerequisites.

The D&D renderer and native operation helpers remain in place. Fallback discovery stays disabled until its renderer/native-sheet path exists. The manifest and installed module are unchanged. Automated checks use synthetic documents and do not establish live-world or device behavior.

Local validation:

- `node --test tests/*.test.mjs`: 23 checks passed, covering discovery, integration selection, native dispatch, cross-system isolation, ownership, exact token sources, stale sessions, and duplicate/cancelled requests.
- Changed runtime modules passed `node --check`.
- Legacy native operation helpers matched the baseline source after the gateway extraction.
- `py -3 scripts/build_release.py --version 1.0.8`: development package built and validated. All 283 packaged relative module imports resolved; tests and documentation were excluded from the ZIP.
- `git diff --check`: passed. No release was published or installed.

Scope of this first batch:

- Add `src/systems/registry.mjs`, `src/systems/dnd5e/`, and `src/systems/fallback/`.
- Inject the selected integration into session actor discovery/view creation and command capability/dispatch handling.
- Keep legacy D&D rendering and commands operational through the integration.
- Make fallback capabilities empty for gameplay actions until explicitly implemented; block direct command calls as well as hiding buttons.
- Add focused Node tests for selection, eligibility, cross-system isolation, and permission/dispatch guards; wire the checks into CI.
- Update this plan with actual results and any contract changes discovered during implementation.

Live D&D regression remains a deployment gate. Phase 2 source development proceeded with synthetic-document and browser-fixture checks; the installed module has not been changed.

## Phase 2 implementation results

- Fallback discovery accepts any actor type when the user owns it or is GM. Observer-only actors remain excluded. Identity records use native actor-type localization and never read system fields, items, effects, or assigned sheets.
- The fallback renderer reuses the character chooser, displays identity, and provides Open Character Sheet. Inventory browsing and rules actions use the native sheet because unprofiled item visibility cannot be inferred safely.
- Native access reuses the instance-owned actor editor gateway, with integration-specific eligibility, separate sheet instances, Application V1/V2 rendering paths, unique application IDs, permission revalidation, close hooks, and disposal on teardown/reconnect.
- Auxiliary biography, Armor Class, and quickbar paths reject unsupported integrations even when called directly. Fallback action bars use existing Foundry macros without changing the stored client preference. D&D summaries and initiative tie-break settings stay disabled outside D&D.
- `--experimental-fallback` builds a separate development package under `dist/experimental/` with no system restriction. Normal packaging and the working manifest retain the D&D-only declaration.

Validation:

- 38 Node checks passed for integration boundaries, discovery, native access, ownership loss, failed/late renders, exact token sources, auxiliary guards, shared macro execution, and admission restoration.
- 60 Chromium fixture checks passed: 15 each for Application V1 and V2 at 390×844 and 1024×768. These exercise the actual fallback renderer, chooser, native admission, input focus, viewport fit, nested dialog close/back, and teardown. Screenshots were visually inspected at phone and tablet sizes.
- Normal and experimental 1.0.8 packages built successfully. Both validated all 294 relative module imports and manifest isolation; 22 changed JavaScript modules passed syntax checks. Whitespace checks passed.

These results do not establish live Shadowdark/Warhammer compatibility. Native system sheet listeners, real keyboard behavior, chat cards, journals, combat, canvas controls, and reconnects still need end-to-end checks in the target worlds. No installation, publication, or world-data edits were performed.

## Shared panels and first Warhammer profile

- Added code-owned mappings for shared read-only values, counters, item groups, and text sections. Each profile supplies its native game labels and ordering; the renderer has no game IDs or rules paths. See [the profile contract and source evidence](character-profiles.md).
- Added Warhammer player-character Main, Combat, and Skills tabs using prepared Characteristics, Wounds, Fortune/Fate, Corruption, native skill totals, and edition-specific resources. 4e displays Resolve/Resilience and Advantage or Group Advantage; 5e displays Momentum and hides the 4e-only controls.
- Kept missing fields and invalid data absent. Unmapped types and unavailable edition settings retain native-sheet access. Skill grouping mirrors the native sheet; unidentified inventory is not projected.
- Added integration-owned setting invalidation so edition/group-advantage changes refresh the selected view without sharing D&D assumptions.
- Fixed embedded chooser mounting so profile refreshes do not scroll the mobile view to the actor list. Native-sheet access remains above the game panels.

Validation: 55 Node checks and 144 Chromium fixture checks passed. Browser coverage includes both editions at 390×844 and 1024×768, tab changes, edition refreshes, native access, prepared values, text injection resistance, omitted hidden items, zero-valued updates, and profile/native transitions. Screenshots were visually inspected.

This completes the read-only foundation of Phase 3 and begins Phase 4's character presentation. Editable-resource mappings and native action dispatch remain outstanding; the native sheet provides those workflows in this batch. Stable manifest restrictions and installed files remain unchanged.

## Native Characteristic and Skill actions

- Moved D&D execution, result parsing, template hooks, and native operation helpers into its isolated legacy adapter. The shared gateway now handles authority, fresh source resolution, adapter dispatch, and duplicate-action locks without reading D&D rules data or parsing system chat.
- Added capability-gated action descriptors to shared profile rows. Warhammer's Characteristic and Skill labels open native setup dialogs, then run the returned native test. Both editions use the installed system's edition manager and test classes.
- Kept Skill identity exact by passing the current embedded Item rather than resolving a name. Hidden, unowned, removed, replaced, untrained/unmapped, or unavailable Skill actions cannot run.
- Revalidate the session, mobile lifecycle/selection, actor, ownership, edition, and native capability after dialog setup. Cancelled setup releases locks without rolling. Arbitrary native options and writable paths are not accepted.
- Native results stay in chat; Warhammer never enters D&D result-summary or dice-hook orchestration. Resource values remain read-only in these panels.

Validation: 75 Node checks and 176 Chromium fixture checks passed. New checks cover both editions' native dispatch, exact Item identity, input/cancellation, duplicate taps, stale session/lifecycle/edition, ownership loss, item changes, malformed requests, and D&D native item-use preservation. Browser fixtures use the real shared dispatcher with simulated native dialogs; these are not live-system results.

Normal and experimental 1.0.8 packages validated all 319 relative imports and manifest isolation. All 37 changed JavaScript modules passed syntax checks. The preserved D&D native helper bodies matched the baseline source after extraction, and whitespace checks passed.

The next Warhammer action milestone is attacks, followed by casting/channelling. Stable manifest restrictions, installed files, and world data remain unchanged.

## Native equipped-weapon attacks

- Added Combat groups using the native Melee Weapon(s), Ranged Weapon(s), and Damage labels. Profiles read native equipment/mode getters and DamageString, including formatted dice text, without interpreting raw weapon groups or calculating formulas.
- Added allowlisted weapon actions that pass the exact embedded Item to `setupWeapon()` and roll the returned test once. Both editions use their native dialogs/tests; ammunition, reloads, effects, targets, damage, and opposed follow-ups remain in the system.
- Recheck weapon identity, owner visibility, equipment, and attack mode after setup. Removal, replacement, unequipping, or mode changes prevent a stale attack. Native cloned Item views are supported while retaining the original embedded document as authority.
- Extended shared item presentation to display native numeric/string values with game-provided value labels. No Warhammer-specific rendering branch was added. Unarmed, improvised, trait, vehicle, and full inventory management workflows remain in native sheets.

Validation: 98 Node checks and 220 Chromium fixture checks passed. New coverage includes both editions' melee/ranged dispatch, native Damage display, invisible/unowned/unequipped/malformed weapon omission, cancellation and duplicate taps, native-only ammunition handling, re-equipping refreshes, unloaded setup, exact synthetic-actor weapons, and changes during dialogs. Phone/tablet Combat screenshots were visually inspected.

Normal and experimental 1.0.8 packages validated all 321 relative imports and manifest isolation. All 39 changed JavaScript modules passed syntax checks; whitespace checks passed.

The next Warhammer milestone is casting/channelling. Stable manifest restrictions, installed files, and world data remain unchanged. Target-world and real-device validation is still required before compatibility claims.

## Native casting and channelling

- Added a shared Magic tab using native Petty Spell, Lore Spell, CN, Channelling, and Wind labels. Petty Spells have name-only rows; Lore Spells display prepared CN. No game-specific renderer branch was added.
- 4e spells use the actor sheet's native `castOrChannelPrompt()`, preserving its Cast/Channel choice and direct Petty casting. 5e spells use `setupCast(spell)`; Wind controls use `setupChannelling(windKey)`. Each returned native test rolls once. The native 4e choice dispatches spell channelling through `setupChannell(spell)`.
- Wind presentation uses the native model's `getWinds()` with visible, owned spells and checks the prepared Wind list. Stale spell identity/lore, hidden or unowned items, unavailable entry points, and stale Wind context prevent dispatch or a subsequent roll. The existing actor/session/lifecycle/edition checks remain shared.
- Native workflows own ingredients, channelled SL/power, miscasts, effects, overcasting, chat, and opposed follow-ups. Magic management, prayers, and aspects remain native-sheet workflows. Resources remain read-only in VE.

Validation: 140 Node checks and 274 Chromium fixture checks passed. New coverage includes both editions' dispatch, the 4e choice and cancellation, 5e Wind arguments, hidden/unowned/malformed/missing spells, stale source/item/lore/edition/session/lifecycle/permission changes, duplicate requests, native-only side effects, cloned spell views, and malformed native results. Magic screenshots were visually inspected for both editions at phone and tablet sizes.

Normal and experimental 1.0.8 packages each validated 324 relative imports, archive scope, and manifest isolation. All 41 changed JavaScript modules passed syntax checks; whitespace checks passed.

Next: explicit resource editing with native operations for resources that have rules side effects, followed by additional actor profiles and Shadowdark. Stable manifest restrictions, installed files, and world data remain unchanged. Live Foundry and real-device validation are still pending.

## Explicit resource editing

- Added a capability-gated resource edit contract and shared Edit/Save/Cancel controls for numeric values and booleans. The UI sends resource IDs, revisions, expected values, and requested values; paths, methods, and bypass flags remain adapter-owned.
- Warhammer player characters can edit current Wounds, Fortune/Fate, Corruption, 4e Resolve/Resilience and Advantage, and 5e Momentum. Numeric inputs accept nonnegative safe integers. Wounds and personal Advantage use native prepared caps; Corruption may exceed its mutation threshold. Derived values remain read-only.
- Wounds/Advantage invoke native setters. Other resources follow the native sheet's one-field actor-update path, preserving native Corruption checks, Momentum effects, caps, and Group Advantage routing. VE does not apply damage, spend metacurrencies, perform rests, or duplicate system side effects.
- Saves reject stale values, edition/group mode, limits/settings, ownership, source/session/lifecycle, and Group Advantage pool/combat membership. A configuration-independent resource lock prevents duplicate updates. Native cancellation and errors release the lock; unchanged saves skip side effects.
- Group Advantage requires an exact combatant actor and synchronized native pool values. It uses the native actor setter and reports a requested update while native synchronization proceeds. Integration-owned combat/cap-setting invalidation keeps controls current. Unsaved drafts are discarded on profile refresh, tab change, or actor selection. Expected-value checks are client-side and do not provide server-side atomicity across clients.

Validation: 174 Node checks and 338 Chromium fixture checks passed. Browser coverage includes numeric caps and empty values, cancellation, zero Wounds, Fortune above Fate, Corruption side effects, stale values/editions, actor-selection disposal, Momentum checkboxes, native Advantage setters, Group Advantage routing and combat exit, labels/focus, and phone/tablet fit. Resource screenshots were visually inspected for both editions.

Normal and experimental 1.0.8 packages each validated 334 relative imports, archive scope, and manifest isolation. All 44 changed JavaScript modules passed syntax checks; whitespace checks passed.

Next: broader Warhammer actor profiles, then Shadowdark panels/actions/light controls. Installed files and live world data remain unchanged. Native chat follow-ups, live update hooks/sockets, and real-device behavior remain deployment-validation work.

## Shadowdark PC integration

User priority update: skip new Warhammer NPC/creature profiles and focus on PCs. No NPC implementation changes were made before this correction. Existing D&D behavior and native-sheet access for other types remain available.

- Added an exact `shadowdark` integration for installed 4.0.6 `Player` actors. Shared Abilities, Spells, and Inventory panels use native labels, prepared Stats/modifiers, HP/AC, normal/Pulp Luck, equipped attack groups, identified carried gear, and separate known/lost spell lists. No system-specific renderer was added.
- Native `actor.system.rollStatCheck`, `rollAttack`, and `castSpell` own setup, dialogs, rolls, targets, ammunition, spell loss, effects, and chat. Scoped callbacks on `SD-Stat-Check`, `SD-Player-Attack`, and `SD-Player-Spell` match only the action's exact configuration object and revalidate source/session/lifecycle, model/item identity, ownership, configuration, spellcasting status, and weapon mode before native execution continues. All callback registrations are removed on success, cancellation, or error.
- Native methods roll internally; VE never calls a returned `roll()`. A native failed spell remains a failed roll with native spell loss, rather than being mistaken for cancellation. VE reports native workflow completion without parsing native boolean results into D&D summaries.
- HP/Luck use shared resource editors with explicit native actor-update fields, strict typed values, current HP bounds, and expected-value/mode checks. AC, Stats, item values, and other derived data remain read-only.
- Basic light sources use the native player sheet's `_toggleLightSource(item)` workflow, retaining exclusive light selection, actor/token lighting, chat, and tracker/socket work in the system. Controls require the current user's assigned, claimed world PC. Synthetic/unassigned PC light management stays native because the installed tracker gathers world Player actors. Light toggles share an actor lock; stale light-state descriptors cannot retoggle a changed source. VE creates no independent timer, socket message, or light-resource update.
- PCs retain native sheets for class abilities, scrolls/wands, focus-specific casting, spell restoration, rest/spend workflows, stashed/unidentified items, and full inventory management. NPCs/Light actors remain native-only. No new NPC/creature panels were added.

Validation: 213 Node checks and 458 Chromium fixture checks passed. New coverage includes native model arguments, melee/thrown modes, normal/Pulp resources, cancellation/errors/vetoes and scoped hook cleanup, unrelated native dialogs, stale ownership/source/item/model/configuration/lifecycle, native failed-spell loss, malicious request options, conservative inventory visibility, exact synthetic-item UUIDs, resource limits, native light delegation, shared light locks, reassignment, and fixture remote light refreshes. Phone/tablet screenshots were visually inspected.

Normal and experimental 1.0.8 packages each validated 353 relative imports, archive scope, and manifest isolation. All 52 changed JavaScript modules passed syntax checks; whitespace checks passed.

Live native chat/dialog integration, actual failed-spell/ammunition side effects, tracker GM ownership/socket/reconnect/timer behavior, and real devices remain unverified. Next work is a PC-focused source/presentation audit and completion of the existing live validation matrix; broader actor profiles remain deferred. Do not install, publish, or modify world data during the source-only continuation.

## PC presentation isolation audit

- Help now follows the actual legacy/profile/native character presentation. Warhammer/Shadowdark Help describes the embedded chooser, native-sheet button, native action buttons, and resource editors. It omits unsupported portrait/item-row gestures and describes chooser-based placement in Tablet Split. D&D retains its existing guide entries.
- Integration capabilities hide unsupported native/mobile settings for class/header artwork, character Quickbar source, action summaries, and favourites. Shared mobile accent colors remain available; the class color setting resolves to neutral without changing its stored value. Existing translations and all stored preference registrations/defaults remain preserved.
- Direct preference writes reject unsupported features. Restore Defaults leaves unsupported D&D settings untouched. D&D-only collection preferences and obsolete artwork migrations stay within the legacy integration.
- D&D owns class-item directory invalidation through its integration contribution. Direct action-summary mounts check capability before parsing messages or mounting a surface. Native chat remains the results surface for Warhammer/Shadowdark.
- Reviewed theme/banner projection paths, hotbar/quickbar gates, scene/combat routing, and source identity. No additional rules changes were needed. Native-system and device behavior still require live evidence.

Validation: 230 Node checks and 578 Chromium fixture checks passed. New browser checks render the real Settings and Help for D&D, Warhammer, Shadowdark, and fallback at phone/tablet sizes; they verify available controls, preserved preferences, native/profile instructions, shared color saving, viewport fit, and guide close without remounting Settings. Guide screenshots were visually inspected. See [the live PC checklist](live-validation.md) for the remaining gate.

Normal and experimental 1.0.8 packages each validated 355 relative imports, archive scope, and manifest isolation. All 57 changed JavaScript modules passed syntax checks; whitespace checks passed. Installed files and live world data remain unchanged.

## Authorized isolated live validation

On 26 October 2026 the user authorized a separate Foundry setup under `dist/live-test`, experimental ZIP installation, and disposable Warhammer/Shadowdark PCs. Existing campaigns and installed VE Mobile were untouched. Foundry 14.369 with native Warhammer 10.1.2 and Shadowdark 4.0.6 passed initial subsets in real GM/owner-player sessions: 13 Warhammer 4e checks, 10 Warhammer 5e checks, and 18 Shadowdark checks. See `docs/live-validation.md` for exact evidence, scope, and pending cases. Headless Chromium at 390x844 is not a real-device pass.

Live testing exposed and corrected native-shape mismatches for Warhammer array-valued spell lore and Shadowdark's async claimed-character method. Regression fixtures now model both. Native spell loss, Chat, resource saves, and initial GM Torch tracking were observed; comprehensive effects/ammo, Group Advantage, timers/reconnect, exact token sources, D&D regression, and real devices remain pending. Normal packaging retains D&D-only support.

## Responsive sheet organization pass

Applied the user's request to use horizontal space throughout existing PC profiles: inline label/value rows, flexible groups of small resource sections, wider rows for long item names, and inline resource inputs/actions with safe wrapping. Larger collections keep the full sheet width so unequal-height sections do not leave large blank areas. Existing D&D layouts already use horizontal fields and controls. No native rules or command behavior changed.

Validation: 231 Node tests and 627 Chromium fixture checks passed. New geometry checks cover narrow phones, phone/tablet widths, enlarged text, long names, editor controls, and completion feedback; screenshots were inspected. Normal and experimental 1.0.8 packages rebuilt. This revision was not deployed to an installed module or rerun in a live world.
