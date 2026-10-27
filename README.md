# Mikelandia Controls

A phone and tablet companion for in-person Foundry VTT sessions. Use character sheets, chat, journals, and the Combat initiative tracker. Combat retains initiative rolling, End Turn, and GM encounter progression. Scene browsing, map gestures, token controls, placement, and token-light actions are removed.

Supports D&D5e sheets, experimental Warhammer 4e/5e and Shadowdark PC panels, and native-sheet fallback for other actors. Based on [VE Mobile by Silvestrae](https://github.com/Silvestrae/ve-mobile). Original license and author credits are preserved.

## Install

In Foundry Setup, open **Add-on Modules**, choose **Install Module**, and paste this manifest URL:

- `https://github.com/MihaiSereanu/ve-mobile/releases/download/latest/module.json`

Enable **Mikelandia Controls** in your world's **Manage Modules** after installing a build with the new name. The technical module ID, settings namespace, installation folder, and update URLs remain ve-mobile for compatibility. Local checkout changes appear in the installer only after publication.

Phone and Tablet modes use Carolingian UI's client setting to disable its interface, restoring the prior value in Desktop mode. Narrator Tools' interface hooks and styles are suppressed in that browser. Applying or restoring Carolingian UI's setting triggers its native reload. Other clients and world module settings are unaffected.

Phone and Tablet modes hide unrelated Foundry and module widgets, including ones opened after startup. The tabs, native workflows opened through them, roll dialogs, notifications/tooltips and Dice So Nice remain available. This isolation applies with or without Common Display Hide UI; switching out of mobile presentation restores the other interfaces.

## Development

Start with [current status](docs/current-status.md); see [architecture](docs/architecture.md) for source boundaries and native workflows. Keep review changes in this checkout until installation or publication is authorized. A push to main publishes a release.

Run Node tests with `node --test --test-reporter=dot tests/*.test.mjs`. List browser scenarios with `node scripts/check_browser.mjs --list`; run a focused group with `--filter "in-person|shadowdark"`. Add --screenshots to save passing layouts. Build packages with `py scripts/build_release.py --version 1.1.0`.
