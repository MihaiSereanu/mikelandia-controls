# Mikelandia Controls

A phone/tablet companion for in-person Foundry VTT: Character, Chat, Journals, Initiative and Settings. Initiative includes End Turn and GM encounter progression. No map, token, placement or light controls.

Supports D&D5e, experimental Warhammer 4e/5e panels, PC panels for Shadowdark, SWADE and Honor + Intrigue, and native-sheet fallback. SWADE 6.0.4 and Honor + Intrigue 0.2.0 target Foundry 14. Based on [Silvestrae](https://github.com/Silvestrae); original license and author credits are preserved.

## Install

In Foundry Setup, choose **Add-on Modules > Install Module** and paste:

`https://github.com/MihaiSereanu/mikelandia-controls/releases/download/latest/module.json`

Enable **Mikelandia Controls** in **Manage Modules**. Module ID, settings namespace and install folder: `mikelandia-controls`. Existing worlds use the [migration steps](docs/migration.md). Checkout changes reach the installer after publication.

Phone/Tablet mode hides unrelated widgets, preserving admitted native workflows, notifications, tooltips and Dice So Nice under Common Display Hide UI. Carolingian UI/Narrator Tools are suppressed locally without saved-setting changes. **Use native Foundry** disables the companion. Desktops always use native Foundry with shared system fixes.

For the installable login app, see [mobile login](docs/mobile-login.md). For development, read [AGENTS.md](AGENTS.md), then [current status](docs/current-status.md); open [architecture](docs/architecture.md) only for the relevant subsystem.
