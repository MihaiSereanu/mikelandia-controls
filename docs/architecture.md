# Architecture and native boundaries

## Source map

- `src/systems/registry.mjs`: profiles/adapters in `dnd5e`, `wfrp4e`, `shadowdark`, and `fallback`.
- `src/systems/profile-view.mjs`: shared presentation model. Preserve each game's labels, groups, and native rules.
- `src/features/characters/`: `profile-panels.mjs`, `profile-resource-editor.mjs`, `profile-inventory.mjs`, and `native-sheet.mjs` render controls and native actions.
- `src/foundry/actor-editor-gateway.mjs`: validated writes and native commands.
- `src/foundry/mobile-presentation.mjs`: native application admission, layout, and lifecycle. Styles live in `assets/`.
- `src/foundry/mobile-ui-isolation.mjs`: default-deny DOM isolation, exact native editor ownership, and scoped native confirmation requests.
- `src/features/combat/presenter.mjs` and `src/foundry/combat-gateway.mjs`: initiative, player End Turn, and GM encounter progression.
- `src/foundry/legacy-client-restoration.mjs`: retire saved client graphics changes from earlier releases without applying new profiles.
- `src/foundry/mobile-audio.mjs`: browser-local audio mute and restoration.

## Commands and edits

Resolve fresh actor/item state from the source UUID, including synthetic actors. Check ownership, session/config revisions, and duplicate submissions before writes. Preserve pending-action cleanup and cancellation. Never accept arbitrary client-supplied paths or native method names. Refresh after native updates; prepared system models own derived values.

Unsupported systems get identity and the native sheet. D&D-specific handlers remain isolated. Shared components must preserve native terminology and grouping.

## Native application versions

Shadowdark 4.0.6 `PlayerSheetSD` is Application V1. Warhammer sheets use V2. Shadowdark `RollDialogSD` inherits the general ApplicationV2 class: do not infer all applications' versions from their system or an optional `isV2` property. Inspect actual ancestry.

Mobile CSS suppresses the normal maximum-height transition. Admitted V2 closing uses supported `{animate: false}` to avoid waiting for a nonexistent transition. V1 closing remains native.

Warhammer uses the native edition manager and setup workflows followed by the returned test's `.roll()`. Preserve native casting/channelling.

Shadowdark `rollStatCheck`, `rollAttack`, and `castSpell` already roll internally. Do not roll again. Preserve native chat and scoped pre-roll hooks that distinguish cancellation from failure.

## WFRP encumbrance and native ammo cancellation

Combat and Trappings begin with the same read-only Encumbrance current/max card. Read native `system.status.encumbrance.current` and `.max`; current can be a numeric string from native `toFixed(2)`, so normalize finite numeric strings without recomputing weight. Missing or malformed values remain omitted.

Encumbrance reserves enough card width to keep its label and value on one line; adjacent combat resources stack below it on phones. Momentum opts into the profile's `editControl: "checkbox"` presentation, saving on change through the validated resource command. Disable it during saves; failed or cancelled writes restore its value. Other boolean resources retain their existing editors.

Installed WFRP 10.1.2 / Warhammer Library 3.5.1 has a native missing-ammo cancellation bug: 5e weapon setup reports No Ammo and returns undefined; library `_setupTest` passes that to `awaitSubmit`, whose default empty data causes `data.scripts.concat` in the constructor to throw. Isolated extracted-native-method reproduction and results: `dist/diagnosis/20261027-wfrp-ammo/`. Turning off the native weapon Details setting Consumes Ammo avoids that path; loading checks remain separate. VE does not bypass ammo or patch the native library.

## Shadowdark resources and gear

Grid: HP/AC/DEF, XP/Grit/Luck. Pencil glyphs align to the top-right corner within 44px touch targets; values have an additional inset. XP reads and edits native `system.level.xp`. DEF and Grit are nonnegative integers in Actor flags `flags.ve-mobile.shadowdarkResources.{def,grit}`, default zero, shared per PC. Old Renown flags remain unused. Native Luck retains normal/Pulp behavior. Coins stay three across, editing native `system.coins.{gp,sp,cp}` with direct entry and unit decrement/increment controls beneath each amount. Zero coins disable decrement; denominations are independent.

The Gear heading groups Slots beside its title and puts the icon-only add button at the right. Keep the Gear section when empty so adding remains available. Add opens a custom/catalog choice modal, dismissed through Cancel, Escape, or VE Back. Only the chosen editor renders inline. Catalog loads automatically and filters by all search words across name/source, ignoring case and accents. All results remain reachable in a bounded scroll area. A successful acquisition or Cancel removes the editor; native cancellation retains it. Scope disposal removes the chooser and ignores late catalog responses.

Custom creation always creates a Basic Item at quantity 1. Slots used and Per quantity default to 1, mapping to native `system.slots.slots_used` and `.per_slot`, with `.free_carry` fixed at 0. Slots used is a nonnegative safe integer; Per quantity is a positive safe integer. Native weight is `ceil(quantity / per_slot) * slots_used`; zero slots is weightless. Custom fields cannot override catalog acquisition.

All physical inventory quantities accept nonnegative safe integers. Items per slot controls native weight rather than a quantity cap, so existing custom and catalog gear can increase past it. Quantity revisions include both slot-weight fields. A mobile quantity save or decrement to zero deletes the embedded Item, including stashed gear; existing zero stacks are removed only when edited to zero. Catalog acquisition excludes actor-owned sources. Await inherited native acquisition; Shadowdark 4.0.6's ordinary `_onDropItemSD` branch omits its return. Preserve native acquisition/effect prompts and chat. The companion never advertises or calls token-light toggles, including during acquisition or deletion. World-owned PCs need not be assigned to a user.

## Client compatibility

Phone and Tablet isolate external DOM branches using a reversible display boundary. An allowed descendant makes its ancestors transparent hosts without revealing sibling widgets. Late applications, widgets, rerenders, and forced inline display changes are reconciled; teardown restores the latest underlying display preferences. This rule is independent of Protect styling and Common Display's Hide UI.

Application render hooks and generic modal flags do not authorize windows. Admit exact module-owned editor instances, recognized native roll forms, children of admitted windows, or a framed/native dialog following a deliberate control in the mobile UI. Navigation taps grant no window admission. Awaited module requests admit exact core confirmation/choice dialogs, with runtime ownership revoked on teardown. Native Settings retains its explicit session owner. Keep notifications, tooltips, native context controls, and Dice So Nice's non-interactive canvas available. Preserve V1/V2 lifecycle distinctions and admitted window headers under Common Display.

The interface has five routes: Character, Chat, Journals, Combat, and Settings. Character selection is explicit or follows the user's assigned character. It never controls or releases tokens. Synthetic Actor UUID resolution remains for character data and chat provenance. Combat retains initiative rolls, End Turn, and GM start/end/previous/next actions, with native permissions, stale-state checks, and encounter-end confirmation. Map navigation, token targeting/focus/movement, placement, Scene overlays, asset optimization, and map-memory profiles are removed.

Visible branding is Mikelandia Controls, including its vector startup mark. Keep `ve-mobile` as the technical module ID, settings/flags namespace, CSS prefix, install folder, repository, and update URLs. Upgrade restoration reads existing hidden client ledgers and restores only owned settings before retiring those ledgers. It preserves pending restoration data on failure.

`muteMobileAudio` is browser-local and defaults on. Guard first-gesture audio contexts, later playback, gain writes, detached media, and known embedded-player lifecycle. Restore prior audio state on disable/exit. Fixtures cannot establish audible silence on a real phone.

## Checks and packaging

Node tests: `node --test --test-reporter=dot tests/*.test.mjs`. Browser fixtures: `node scripts/check_browser.mjs --list`, then `--filter "shadowdark|profile-layout"`. Default runs all scenarios; add `--screenshots` for passing captures. Failures save screenshots in ignored `dist/`.

Build using `scripts/build_release.py`; verify package/release requirements in `scripts/check_release.py`. Checkout and installed module are separate. A main-branch push publishes the rolling release; keep review work local until authorized.
