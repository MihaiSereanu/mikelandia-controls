# Fresh-session handoff

Continue the implementation plan in this checkout. The current PC integration milestones and PC presentation/source audit are complete locally. Warhammer and Shadowdark PC panels/actions/resources are implemented; new NPC/creature profiles remain deferred by the user's explicit request. Initial live checks passed in authorized isolated Warhammer 4e/5e and Shadowdark worlds; the remaining matrix is the release gate. Do not repeat the completed audit or rerun passing suites without a change or a concrete unresolved concern. The user authorized experimental installation and disposable world edits only under `dist/live-test`; existing campaign data remains outside that scope. The user subsequently requested correcting the copied local module so it can be enabled in WFRP. The user subsequently authorized GitHub push/publication and making the repository public, matching Heart & Dagger.

## Read first

- `docs/implementation-plan.md`: agreed phases and implementation/validation results.
- `docs/character-profiles.md`: current projection, rendering, action contract, and native-source evidence.
- `docs/system-coupling-audit.md`: remaining D&D assumptions and migration responsibilities.
- `README.md`: current support status, test commands, and packaging.
- `docs/live-validation.md`: remaining PC test matrix, required evidence, and local version inventory.

## Workspace and constraints

- Work in `D:\Projects\ve-mobile` using PowerShell. There are many modified and untracked files from the implementation; they are intentional work to preserve. Do not reset, clean, replace the checkout, or switch to an empty worktree.
- The user authorized correcting the local module at `D:\FoundryVTT\Data\modules\ve-mobile` after copying the D&D-only checkout prevented WFRP activation. Back up overwritten runtime files outside the modules folder and install the published experimental package. A full Foundry restart is required to rescan package metadata. Do not alter campaign data or force-stop an active world. GitHub publication is authorized.
- Share the mobile application and internal components. Visible terminology, grouping, and controls must use the actual game's labels, preferably native localization strings. The user explicitly rejected generic replacement terminology.
- Keep rules calculations and gameplay side effects in native system workflows. Field shape or method existence alone cannot establish capability. Preserve source UUIDs, including unlinked-token actors, and revalidate ownership/session/lifecycle/configuration after asynchronous setup.
- Keep normal manifest support restricted to D&D5e until live validation. The experimental build intentionally removes the packaged system restriction for development-world testing.
- Source inspection, synthetic-document tests, and browser fixtures are distinct from live Foundry and real-device proof. Initial live subsets are recorded in `docs/live-validation.md`; the full matrix and real devices remain pending.

## Implemented

- System registry with delayed application-lifetime selection: D&D5e, Warhammer (`wfrp4e`), Shadowdark (`shadowdark`), and conservative fallback.
- Fallback owner/GM actor browsing and deliberate native-sheet access with instance-specific admission, Application V1/V2 support, close/teardown/permission checks, and exact token sources.
- Shared profile projection/rendering: game-labeled tabs, values, counters, plain text, filtered item groups, and capability-gated native action buttons. Capability-gated current-resource editors now exist; derived and unmapped values remain read-only.
- Warhammer character Main, Combat, Skills, and Magic panels. Edition-specific resources follow native visibility: 4e Advantage/Group Advantage and Resolve/Resilience; 5e Momentum. Native prepared Characteristics/skill totals are used.
- Native Characteristic and Skill tests through setup methods followed by returned test `roll()`; native chat handles results.
- Native equipped melee/ranged weapon attacks through `setupWeapon(item)` and returned test `roll()`. Combat groups use native labels and DamageString. Ammunition, reloads, effects, targets, damage, and opposed follow-ups stay native.
- Native magic: 4e `actor.sheet.castOrChannelPrompt(spell)` retains the Cast/Channel choice (`setupCast`/`setupChannell`); 5e uses `setupCast(spell)` and `setupChannelling(windKey)`. Native tests own channelled SL/power, ingredients, miscasts, effects, and chat. Hidden spells cannot expose Winds through the prepared list.
- Explicit edits for current Wounds, Fortune/Fate, Corruption, 4e Resolve/Resilience and Advantage, and 5e Momentum. Native setters/update hooks retain side effects; stale expected values/configuration, bad inputs, unknown paths/options, and duplicate saves are rejected. Group Advantage requires a matching combatant/shared pool and stays native. Unsaved drafts are disposed on profile refresh/tab or actor changes.
- Shadowdark 4.0.6 `Player` panels: Abilities, Spells, Inventory; prepared Stats/modifiers, HP/AC, normal/Pulp Luck, identified carried gear, equipped melee/ranged/thrown attacks, and known/lost spells. Native model actions use config-scoped pre-roll hooks with stale authority/identity checks. HP/Luck editors use native updates. Basic light toggles use the native sheet/tracker only for the current user's assigned world PC. NPC/Light actors and synthetic/unassigned PC light management remain native-sheet workflows.
- Exact embedded Item identity, visibility/ownership/equipment/mode revalidation; native cloned Item views supported. Unknown native options/bypass flags/field paths rejected. Cancelled or aborted setup produces no extra roll.
- D&D execution, native operations, templates, result parsing, and summaries isolated in its legacy adapter. Original native helper bodies matched the baseline after extraction; existing behavior still needs live regression checks.
- Integration-aware Settings and Help: legacy/profile/native character instructions; unsupported D&D appearance/quickbar-source/summaries/favourites controls hidden, direct preference writes rejected, and stored legacy values preserved by reads, migrations, and Restore Defaults. Shared mobile colors remain available; class colors resolve to neutral outside the legacy integration.
- Unsupported biography/Armor Class/quickbar operations gated. Existing Foundry hotbar macros remain available without rewriting stored client preferences.
- D&D action-summary mounts now reject unsupported integrations before message parsing; D&D class-item directory invalidation belongs to its integration.
- Integration setting invalidation and a fix preventing embedded chooser mounts from scrolling profiles to the bottom.

## Important files

- `src/foundry/command-gateway.mjs`: shared authority, fresh source resolution, adapter dispatch, duplicate locks, lifecycle checkpoint.
- `src/foundry/command-error.mjs`: shared error class.
- `src/systems/dnd5e/legacy-gateway.mjs`: preserved D&D engine with original internal guards.
- `src/systems/wfrp4e/{integration,context,profile,commands,items,magic,resources}.mjs`: current Warhammer mappings, eligibility, and native actions.
- `src/systems/shadowdark/{integration,context,profile,commands,resources}.mjs`: PC mappings, native hooks, resource edits, conservative light eligibility.
- `src/systems/presentation-policy.mjs`: game-specific preference availability, effective colors, and help presentation.
- `src/systems/profile-view.mjs`: code-owned mappings and supplied action descriptors; no generic writes or formula evaluation.
- `src/features/characters/{native-sheet,profile-panels,profile-resource-editor}.mjs`: shared character shell and panels.
- `src/kernel/app-kernel.mjs`: `EXECUTE_PROFILE_ACTION` selection/lifecycle checkpoint; pending actions must remain current before rolling.
- `tests/warhammer-actions.test.mjs`, `tests/warhammer-weapons.test.mjs`, `tests/warhammer-magic.test.mjs`, `tests/warhammer-resources.test.mjs`: native dispatch and stale-state examples.
- `tests/shadowdark.test.mjs`, `tests/helpers/shadowdark.mjs`, `tests/browser/shadowdark.mjs`: Shadowdark PC fixtures and native-hook examples.
- `tests/presentation-isolation.test.mjs`, `tests/browser/presentation.mjs`: real Settings/Help and stored-preference isolation coverage.
- `tests/browser/warhammer.mjs`: actual renderer/dispatcher with simulated native dialogs.

## Next: authorized live validation

- Read `docs/live-validation.md` for the remaining PC matrix. Current source work, Node checks, simulated-browser checks, package builds, and the presentation audit are complete for this scope. Existing D&D legacy paths still need live regression.
- Keep the user's PC-only priority. Do not resume new NPC/creature profiles. Native access remains available for those types.
- Identify the actual test-world/browser/device targets, running versions, users/roles, and permitted changes before live execution. The user approved installation and disposable world edits in `dist/live-test`. Existing campaigns are excluded; GitHub publication is now authorized. Reuse the isolated evidence/data before requesting further target authorization.
- Local source inventory on 26 October 2026: Foundry package 14 build 369, Warhammer 10.1.2, Shadowdark 4.0.6. The D&D5e system was absent at `D:\FoundryVTT\Data\systems\dnd5e`; do not assume a current target D&D version from the legacy source. The isolated worlds subsequently confirmed these running Foundry/Warhammer/Shadowdark versions.
- Prioritize native dialog/card integration, native ammo/spell-loss/Corruption effects, Group Advantage sockets, Shadowdark GM tracker/timers/reconnects, exact linked/unlinked sources, chat follow-ups, and phone/tablet keyboards/Back/desktop restoration.
- Shadowdark methods roll internally; use their config-scoped pre-roll hooks and never call a returned `roll()`. Native false can mean cancellation or failed rolls; post-checkpoint UI reports native workflow completion.
- Assigned-world-PC Shadowdark light toggles remain deliberately scoped. Synthetic/unassigned light management, class abilities, magic items/focus variants, inventory management, and rests/restoration use native sheets. Further custom workflows are separate scope decisions, rather than prerequisites for this implemented PC milestone.
- Expected-value resource guards are client-side, not cross-client transactions. Native operations already started cannot be rolled back on navigation. Only authorized isolated test installations/world edits were made; no broad compatibility claim is established.

Native sources: Warhammer under `D:\FoundryVTT\Data\systems\wfrp4e` and `D:\FoundryVTT\Data\modules\warhammer-lib`; Shadowdark under `D:\FoundryVTT\Data\systems\shadowdark\src` and its player templates/i18n. Preserve all intentional workspace modifications.

## Latest validation and artifacts

Last completed batch, 26 October 2026:

- 231 Node checks passed: `node --test tests/*.test.mjs`.
- 578 Chromium fixture checks passed: `node scripts/check_browser.mjs`. Native V1/V2 fallback, both Warhammer editions, and Shadowdark normal/Pulp PC profiles, and cross-system Settings/Help at 390x844 and 1024x768. Screenshots are under `dist/` and were visually inspected.
- Normal and experimental 1.0.8 packages validated 355 relative imports and manifest isolation. All 57 changed JavaScript modules passed syntax checks. `git diff --check` passed.
- Build normal: `py -3 scripts/build_release.py --version 1.0.8` -> `dist/ve-mobile.zip`.
- Build experimental: `py -3 scripts/build_release.py --version 1.0.8 --experimental-fallback` -> `dist/experimental/ve-mobile.zip`.
- No releases, commits, or existing-campaign changes were made. Authorized isolated test data lives in `dist/live-test`; see `docs/live-validation.md` for 41 live checks, evidence, and remaining cases.

Avoid broad regex output from the bundled Warhammer JS: use `rg --max-columns 200` and bounded line reads, since some bundled lines are enormous. Browser checks use isolated temporary Chromium profiles and close their own browser process.

## Latest live findings

- Native Warhammer 10.1.2 spell lore is an array in both editions; adapter and regression fixtures corrected.
- Shadowdark claimed-character lookup is async; light projection now checks exact current-user/world-actor assignment. Fixtures use the native async method shape.
- Isolated Foundry 14.369, Warhammer 10.1.2, Shadowdark 4.0.6: 13 + 10 + 18 initial live checks passed in headless Chromium, real GM/player sessions, 390x844 player viewport. This is not real-device proof or a full matrix pass. Evidence under `dist/live-test/evidence`.
- Continue pending ammo/resources/Group Advantage, timer expiry/reconnect, exact token sources, D&D regression and real devices. Keep new NPC profiles deferred.

The isolated server/browser were stopped after the run; the original Foundry instance on port 30000 remained running. To reuse disposable worlds, start the isolated Node 24 executable with `--import ./runtime/loopback.mjs`, the installed Foundry `main.mjs`, `--dataPath` set to the absolute `dist/live-test/data`, and port 30137 from `dist/live-test`. Keep the loopback preload and separate data path. Do not copy or expose the private Config/license files. The ignored browser helper uses remote-debugging-pipe, not a network debugging port.

## Latest sheet layout pass

User requested side-by-side presentation wherever space permits. Shared profiles now align labels/values horizontally, group consecutive small resource sections into flexible rows, give long item names wider grid cells, and keep editor inputs/buttons together when possible. Full-width collection sections avoid large gaps from pairing sections of unequal height. Existing D&D rows already use horizontal layouts.

Validation: 231 Node tests and 627 Chromium fixture checks pass, including new layout cases at 320/390/768/1024px and genuinely enlarged 24px text. Screenshots under `dist/profile-layout-*.png` and the existing game fixtures were inspected. Both 1.0.8 archives rebuilt. This layout revision has browser-fixture evidence; it has not replaced the installed module or been rerun in live Foundry. Earlier live evidence records the earlier archive hash and remains separate. Preserve the PC-only priority and remaining live matrix.

## GitHub release setup

The user authorized publishing this work and making `MihaiSereanu/ve-mobile` public to match Heart & Dagger. README should contain only a brief project description and installation instructions. Pushes to main run Node/browser checks, build version `1.1.<workflow run number>`, and update the rolling `latest` tag/release. Stable assets are `module.json`/`ve-mobile.zip` for D&D and `module-experimental.json`/`ve-mobile-experimental.zip` for cross-system testing. These share module ID `ve-mobile`; install one channel per instance. Existing campaigns remain untouched. Use GitHub Actions and anonymous manifest/ZIP downloads to verify publication.

Local installation follow-up: copying the repository folder carries the D&D-only source manifest. For Warhammer/Shadowdark use the published `module-experimental.json` manifest or its matching ZIP. The local copied folder was corrected from that published package after backing up replaced runtime files under `D:\FoundryVTT\Backups\ve-mobile`; the running campaign was not stopped or edited. Earlier source/live evidence describes its original package versions; it does not prove a fresh reload of this local installation. The user must restart Foundry to rescan the changed manifest before enabling it.

## Follow-up PC fixes

User reported missing WFRP Trappings/Talents, Shadowdark inventory details/Talents, invisible native sheets, and blocked Shadowdark rolls while testing local GamingTable/Argos. Implemented conditional tabs, descriptions, native Slots/coins/stashed gear, exact native modal roll admission and one fixed-ID roll lock. Legacy native sheet detection, distinct IDs and Foundry 14 ActorSheet lifecycle hooks corrected; native editors use viewport dimensions with two-axis scrolling. Errors now appear beside Open Character Sheet.

A read-only copy of Gods of the Forbidden North actor/item/settings databases was loaded as disposable `ve-test-gotfn` under `dist/live-test`. Owner-player stand-in with Argos (`Actor.pHdO7HEzFRFaZLHM`) passed STR and Stromdinn melee native prompts, one Chat per roll, native sheet open/close, Gear Slots 11 / 16, and Coins Slots 0. Other original modules were disabled in the copied world; the real GamingTable session remains user validation. Evidence: `dist/live-test/evidence/argos-regression.json` and screenshots. Never change the original campaign data to reproduce this.

Follow-up validation: 237 Node checks and 667 browser fixture checks passed. The legacy fallback fixture now models Foundry 14 ActorSheet base hooks, absent `isV2`, and an actual V2 form root (whose `[0]` is a control, not its root). WFRP native editor expands to the viewport, wraps tab navigation, and keeps header/table content at a readable minimum width with horizontal scrolling. Trappings and Talents were also observed in a disposable native WFRP world. Publish this batch and update the local module from the successful experimental release; leave running campaign data/processes untouched and ask the user to fully restart Foundry before retesting GamingTable/Argos.
