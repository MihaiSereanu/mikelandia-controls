# Mikelandia Controls

A phone and tablet companion for in-person Foundry VTT: Character, Chat, Journals, Initiative, and Settings. Initiative supports initiative, End Turn, and GM encounter progression. Map, token, placement, and light controls are excluded.

Supports D&D5e, experimental Warhammer 4e/5e and Shadowdark PC panels, and native-sheet fallback. Based on [Silvestrae](https://github.com/Silvestrae); original license and author credits are preserved.

## Install

In Foundry Setup, choose **Add-on Modules > Install Module** and paste:

`https://github.com/MihaiSereanu/mikelandia-controls/releases/download/latest/module.json`

Enable **Mikelandia Controls** in **Manage Modules**. The technical ID, settings namespace, and install folder are `mikelandia-controls`. Existing worlds use the [migration steps](docs/migration.md). Checkout changes reach the installer after publication.

Phone/Tablet mode hides unrelated widgets while preserving admitted native workflows, notifications, tooltips, and Dice So Nice, including with Common Display Hide UI. It suppresses Carolingian UI and Narrator Tools locally without changing their saved settings. Phones/tablets can choose **Use native Foundry** to turn off the companion. Desktop browsers always use native Foundry; shared system fixes still apply.

For the installable login app, see [mobile login](docs/mobile-login.md). For development, read [AGENTS.md](AGENTS.md), then [current status](docs/current-status.md); open [architecture](docs/architecture.md) only for the relevant subsystem.
