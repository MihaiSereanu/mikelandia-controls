# Mikelandia Controls migration

Migrate worlds from `ve-mobile` to `mikelandia-controls`. See [current status](current-status.md#deployment) for recorded deployments and [architecture](architecture.md#mobile-frame-and-upgrades) for internal namespaces.

## Installation

1. Back up each world before changing its enabled modules.
2. Disable the old `ve-mobile` module in that world.
3. Install `https://github.com/MihaiSereanu/mikelandia-controls/releases/download/latest/module.json` and enable **Mikelandia Controls**.
4. Join as a GM first so shared Actor and unlinked-token flags can migrate, then reconnect players.

Foundry treats the new ID as a separate module. Enabling it in one world does not enable it in other worlds. There is no runtime coexistence guard.

## Preserved data

Before first reads, each browser copies preferences, bootstrap cache, controls-guide receipt, chat dock state and Carolingian restoration receipt. Destination values win; a completion marker prevents recopying consumed receipts. Originals remain for rollback. Failed transfers are retryable and leave native Foundry available without starting the companion.

One active GM copies missing flags from world Actors and raw unlinked-token deltas. Existing new values win, including zero, false, null, and arrays. Retain all old flags, including historical Renown. Imported/compendium Actors read legacy resources until written under the new namespace; packs are not bulk rewritten.

Legacy identifiers remain where migration, release-asset retirement, and deployment/rollback records require them. Original MIT notices remain in `LICENSE`.

## Rollback

Disable the new module and re-enable the original installation. Its retained browser preferences and document flags represent the pre-migration state; later changes made under the new namespace are separate.

Recorded legacy deployment backups; verify availability before rollback:

- `/home/ubuntu/backups/ve-mobile/20261028-momentum-cancellation/`
- `/home/ubuntu/backups/ve-mobile-journals/20261027-212646/`
- `D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip`
