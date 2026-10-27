# VE Mobile

A phone and tablet interface for Foundry VTT, with D&D5e sheets and experimental Warhammer 4e/5e and Shadowdark PC support. Based on [VE Mobile by Silvestrae](https://github.com/Silvestrae/ve-mobile).

## Install

In Foundry Setup, open **Add-on Modules**, choose **Install Module**, paste this Manifest URL, and click **Install**:

- `https://github.com/MihaiSereanu/ve-mobile/releases/download/latest/module.json`

Enable **VE Mobile** in your world's **Manage Modules**. The module supports D&D5e, with experimental Warhammer 4e/5e and Shadowdark PC support.

When VE Mobile is in Phone or Tablet mode, it disables Carolingian UI using that module's client-scoped setting, saving and restoring the prior value when returning to Desktop mode. It also suppresses Narrator Tools' startup, chat, and scene-control hooks and styles in that browser. Applying or restoring Carolingian UI's setting triggers an automatic reload. This does not change the world's module settings or affect desktop clients. Foundry does not support unloading an enabled module for only one client, so the modules' scripts are still loaded even though their mobile UI/features are suppressed.

For a local checkout copied directly into Foundry's `Data/modules` folder, the root manifest is also system-neutral. Restart Foundry after copying it so package metadata is rescanned.

Use Foundry's module updater for new builds. Every push to `main` publishes the latest build.

## Development

Start with [current status](docs/current-status.md); see [architecture](docs/architecture.md) for source boundaries and native workflows.

List browser scenarios with `node scripts/check_browser.mjs --list`. Run a focused group with `node scripts/check_browser.mjs --filter "shadowdark"`; add `--screenshots` when reviewing passing layouts. Without a filter, all cases run. Node checks accept individual files: `node --test --test-reporter=dot tests/shadowdark.test.mjs`.
