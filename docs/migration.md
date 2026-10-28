# Mikelandia Controls migration

Use this runbook to move a world from `ve-mobile` to `mikelandia-controls`. See [current status](current-status.md#deployment) for the last recorded deployment state and [architecture](architecture.md#mobile-frame-and-upgrades) for internal namespaces.

## Installation

After the renamed package is published:

1. Back up each world before changing its enabled modules.
2. Disable the old `ve-mobile` module in that world.
3. Install `https://github.com/MihaiSereanu/mikelandia-controls/releases/download/latest/module.json` and enable **Mikelandia Controls**.
4. Join as a GM first so shared Actor and unlinked-token flags can migrate, then reconnect players.

Foundry treats the new ID as a separate module. Enabling it in one world does not enable it in other worlds. There is no runtime coexistence guard.

## Preserved data

Each browser copies its old preferences, bootstrap cache, controls-guide receipt, chat dock state, and Carolingian restoration receipt before the new interface reads them. Existing destination values win. A completion marker prevents consumed receipts from being copied again. Original entries remain available for rollback. A failed transfer is retryable and leaves the normal Foundry interface available without starting the new mobile interface.

One active GM copies missing flags from world Actors and raw unlinked-token deltas. Existing new values win, including zero, false, null, and arrays. The complete old flag namespace is retained, including historical Renown. Imported or compendium Actors can still read their legacy resource values before those values are written under the new namespace. Packs are not bulk rewritten.

Legacy identifiers remain where migration, release-asset retirement, and deployment/rollback records require them. Original MIT notices remain in `LICENSE`.

## Rollback

Disable the new module and re-enable the original installation. Its retained browser preferences and document flags represent the pre-migration state; later changes made under the new namespace are separate.

The earlier source snapshot was recorded as `dist/diagnosis/rebrand-before.zip`; it is absent from this checkout. Deployment backups were recorded at the following paths; verify availability before rollback:

- `/home/ubuntu/backups/ve-mobile/20261028-momentum-cancellation/`
- `/home/ubuntu/backups/ve-mobile-journals/20261027-212646/`
- `D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip`
