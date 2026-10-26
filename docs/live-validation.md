# Live PC validation

Initial live subsets passed on 26 October 2026 in three disposable worlds. The full matrix below remains a release gate: each row contains cases beyond the initial run. Source inspection, synthetic documents, and browser fixtures do not establish a live pass. New NPC/creature profiles are outside the user's current scope; existing D&D behavior still needs regression checks.

## Environment and evidence

Local source inventory checked on 26 October 2026: the installed Foundry package identifies generation 14, build 369; Warhammer source is 10.1.2 and Shadowdark source is 4.0.6. The isolated run subsequently confirmed Foundry 14.369, Warhammer 10.1.2, Shadowdark 4.0.6, and experimental VE Mobile 1.0.8 in running worlds. No D&D5e installation was found at `D:\FoundryVTT\Data\systems\dnd5e` during this audit; record the actual test system version rather than assuming the legacy source's version.

Use the experimental 1.0.8 package for controlled Warhammer/Shadowdark test worlds. Normal packaging retains its D&D-only system declaration. Before any installation or world modification, obtain authorization for that concrete target and preserve the existing installation/test-world data as required by the implementation plan. This checklist does not authorize deployment.

For each run, record the world, actual Foundry/system/module versions, edition/Pulp settings, browser/device, actor and token source UUIDs, user role, observed result, and screenshot/chat evidence. Distinguish desktop browser, emulated viewport, and real phone/tablet results. Record cancellations and stale requests as well as successful actions.

## Isolated live run, 26 October 2026

The user explicitly authorized an isolated Foundry setup, experimental ZIP installation, and disposable PC/world changes. Data lives under `dist/live-test/data`; existing campaigns and `D:\FoundryVTT\Data\modules\ve-mobile` were untouched. The separate server used loopback port 30137, Node 24.13.1, and Foundry 14.369. Copies of installed systems and required `warhammer-lib` supplied native rules. Both GM and owner-player clients connected through headless Chromium; the player viewport was 390x844. Software rendering produced Foundry's hardware-acceleration warning. This is real Foundry/system evidence with an emulated viewport, not real-phone or hardware-GPU proof.

Evidence is retained locally in `dist/live-test/evidence/` (ignored generated artifacts):

| World | Evidence | Observed subset |
| --- | --- | --- |
| `ve-test-wfrp4` | `wfrp4-live.json` (13 checks), three phone screenshots | Owner PC; native Characteristic/Skill/melee Chat; cancellation; unequipping during setup blocks stale roll; Wounds zero; native array-lore spells; Petty cast; 4e Cast/Channel choice and Channelling Chat. |
| `ve-test-wfrp5` | `wfrp5-live.json` (10 checks), native Wind screenshot | Edition labels; Resolve absent; Momentum checkbox save; Aqshy Wind dialog and Chat; direct spell casting, Characteristic, and melee Chat. |
| `ve-test-shadowdark` | `shadowdark-live.json` (18 checks), Pulp phone screenshot | Native Wizard pregen; Stat and melee/thrown Chat; cancellation; HP zero; normal/Pulp Luck saves and mode refresh; failed spell loss and disabled casting; Torch activation received by GM and native tracker; no horizontal overflow. |

Live findings corrected two fixture assumptions: native Warhammer spell lore is an array in both editions; native Shadowdark `isClaimedByUser()` is asynchronous. Light eligibility now uses exact current-user/world-actor assignment without calling that async method during synchronous projection. Fixtures model these native shapes. The corrected experimental package was loaded into the isolated setup; the light workflow was retested after its fix. Earlier checks were not all repeated on the final archive.

The Shadowdark spell-failure check used the native dialog's editable formula `1d20 - 100`; real dice, native Chat, and native spell-loss handling remained active. No channel-resource progression, ammo consumption, Group Advantage, timer expiry, reconnect synchronization, linked/unlinked-token behavior, D&D regression, or real device pass is claimed by this run. The light check ran while paused. Follow the matrix for those remaining cases. Preserve the isolated data/evidence for continuation; stop its own server/browser after testing.

## Test matrix

| Area | Exercise | Required observation |
| --- | --- | --- |
| D&D baseline | PC sheets, existing NPC/group/vehicle paths, inventory/spells, resources/rests, quickbars/macros, summaries | Existing native behavior and labels remain intact; extraction did not change outcomes. |
| Warhammer 4e | Characteristic/Skill tests, equipped melee/ranged attacks, native Cast/Channel choice and Petty casting | One native workflow per action; native ammo/reload, channelled SL, ingredients, effects, miscasts, opposed/chat follow-ups remain functional. |
| Warhammer 5e | Characteristics/Skills, melee/ranged attacks, spell casting, Wind channelling | Native edition dialogs/tests, Wind arguments, power consumption, spell effects, and native chat/follow-ups work. Reload after edition changes as required by the system. |
| Warhammer resources | Zero/max Wounds, Fortune/Fate, Corruption above threshold, 4e Resolve/Resilience and Advantage, 5e Momentum | Allowlisted updates retain native hooks, visual effects, Corruption checks, and caps. Derived fields stay read-only. |
| Group Advantage | Two players plus GM, current combatants, pool edits, group changes, combat exit | Native GM/socket routing updates the correct pool and all actor views; stale or unsynchronized editors cannot overwrite it. VE does not broadcast its own pool update. |
| Shadowdark checks/attacks | Stat checks, equipped melee/ranged/thrown attacks, ammo shortage, cancelled dialogs | Native PC model workflows, bonuses/targets/ammo and chat run once; native vetoes/cancellation cause no extra roll. |
| Shadowdark casting | Successful/failed known spells, lost spells, native rest/restoration, class availability | Failure retains native spell loss; restoration refreshes the view. Class mismatch is refused natively; no D&D spell slots/rest rules appear. |
| Shadowdark resources | HP zero/current maximum, normal Luck, Pulp Luck; change mode with an editor open | Correct native field and typed input; stale mode/value/max saves are refused. HP edits retain native actor-update behavior. |
| Shadowdark lights | Assigned world PC, two light sources, player/GM clients, native timer expiry, pause, world-time and realtime modes, disconnect/reconnect | Native one-active-light selection, lighting, chat, GM tracker ownership, sockets, remaining time, and resumed state stay synchronized. VE creates no timer. |
| Scoped light support | Unassigned PC and unlinked-token PC | Native-sheet access remains; unsupported mobile light toggles are absent and never alter another actor's prototype. |
| Authority and lifecycle | Ownership removal, actor/item deletion or replacement, equipment/lore/lost-state changes, actor/tab navigation, mobile exit, reconnect while a dialog is open | Stale requests stop before the native execution checkpoint; dialogs and locks clean up. Native operations already started remain native. |
| Exact sources | Linked and unlinked tokens sharing an actor ID, scene changes and token selection | Each action/edit uses the displayed source UUID and its own embedded Items, never a world-actor substitute. |
| Chat/journals/canvas | Native result cards and follow-ups, nested native dialogs, journals, targeting, token movement/placement, combat turns | Shared Foundry controls and system listeners still function; unsupported D&D summaries never capture native cards. |
| Help/Settings | Each supported game plus fallback, native Settings, mobile Settings, Restore Defaults | Controls/instructions match the actual character shell. Shared colors work; hidden legacy preferences remain stored. |
| Real devices | Phone/tablet portrait and landscape, keyboard input, scrolling, nested dialogs, Back/close, desktop restoration | Readable labels, usable controls/focus, no horizontal overflow, no lost native windows, and clean restoration. |

Keep normal compatibility restrictions until the relevant live rows pass. Validate Foundry 13 separately before extending new integration compatibility claims to it. A built archive or simulated browser pass does not satisfy an installation or device row.

## PC follow-up run

After the initial run, a disposable `ve-test-gotfn` world used a read-only copy of Gods of the Forbidden North actor/item/settings databases with Argos and an owner-player stand-in for GamingTable. Native STR and Stromdinn melee prompts were visible and each produced one Chat; the legacy native sheet opened and closed; Gear displayed native Slots 11 / 16 and Coins displayed native denominations and Slots 0. Other original modules were disabled in the copied world, so the actual GamingTable client remains user validation. Evidence: `dist/live-test/evidence/argos-regression.json`, `argos-stat-dialog-phone.png`, `argos-native-sheet-fixed-phone.png`, and `argos-inventory-phone.png`.

Disposable WFRP native testing confirmed nonempty Trappings/Talents tabs and the explicit editor. Its tab navigation wraps; header/table content retains readable width and can be panned horizontally within the viewport. The desktop native layout remains a native layout. Existing campaigns were not edited during this run.

## Android composition and device/audio follow-up

The user reported that 1.1.7 still hid native windows in physical Android Chrome. That report supersedes any earlier implication of full Android validation. The revised regression suite uses Android UA/touch emulation and hit testing with a clipped/transformed/transparent host and a high-layer mobile root. Native sheets and prompts now enter the browser top layer; external native context menus remain reachable too.

In the isolated Argos owner-player world, actual CDP touch events opened STR and Stromdinn attack prompts and submitted one native Chat each. The native editor entered the top layer with reachable inputs. All three native audio channels were observed at gain zero after context startup. Desktop-mode exit restored the unmuted native interface; Auto on a Windows identity stayed in desktop mode even at 393px with five touch points. Evidence is under `dist/live-test/evidence/android-composition-regression.json` and `argos-android-*.png`. These are desktop Chromium tests with Android emulation, not a physical Android pass.

The screenshot of failed GitHub run #3 was historical. Published 1.1.7 came from successful run #7. The follow-up workflow additionally verifies both public manifests and ZIPs anonymously after publication and validates relative imports inside packaged runtime files.
