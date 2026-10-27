# Current status

Updated 2026-10-27. Mikelandia Controls is an in-person companion with strict Phone/Tablet UI isolation. The user has authorized GitHub publication and reports having installed the local changes already. This deployment targets GitHub; it does not modify the local Foundry installation.

Phone/Tablet UI isolation now hides unrelated module and world-macro widgets, including late V1/V2 applications and descendants that force visibility. Native windows require explicit workflow ownership, recognized roll UI, approved parents, or a deliberate mobile control. Preserve module-launched editors/settings/confirmations, temporary notifications/tooltips, native menus and Dice So Nice. The rule works with Common Display Hide UI on or off and restores external presentation on exit.

## Checkout behavior

Five screens remain: Character, Chat, Journals, Combat, and Settings. Scene browsing, map gestures, token control/targeting/movement, token and template placement, Scene overlays and action bars, map asset optimization, and map-memory profiles are removed. Character selection no longer selects or releases tokens. Shadowdark light buttons and acquisition/deletion light toggles are removed; ordinary gear, quantities, coins, and native character actions remain.

Combat keeps initiative rolls, End Turn, and GM start/end/previous/next progression with native authority checks and encounter-end confirmation. Synthetic Actor resolution remains for character data and chat provenance.

Visible names and startup artwork use Mikelandia Controls. Technical ID ve-mobile, saved settings/flags, folder and release URLs remain compatible. README credits the original VE Mobile. A small upgrade routine restores client settings saved by the removed graphics profiles.

## Deployment and remaining review

Distribution uses the public rolling latest release at https://github.com/MihaiSereanu/ve-mobile/releases/tag/latest. Pushing main runs Node and browser checks, builds standard/experimental packages, assigns the patch version from the workflow run number, and verifies anonymous manifests and matching ZIP downloads. Keep the technical module ID and existing manifest URLs unchanged.

The user reported the in-person interface works and installed the local changes themselves. Physical-phone verification of the latest isolation behavior remains pending. Latest prior agent-created runtime backup: D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip.

The native WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo concat error remains external to this module. Extracted-native-method reproduction: dist/diagnosis/20261027-wfrp-ammo/. Per-weapon Details -> Consumes Ammo is the native switch; the module does not patch ammo behavior.

Validation: all 289 Node tests and 34 browser scenarios pass, including 128 dedicated isolation checks across Phone/Tablet with and without Common Display Hide UI. The final native-header check also passed both existing Common Display V1/V2 scenarios. Runtime undefined-reference checks and package/archive/import validation pass. Standard dist/ve-mobile.zip and experimental dist/experimental/ve-mobile.zip contain 175 files at version 1.1.0. These results are source and browser fixture proof. Live-world installation, physical-phone interaction, audible mute confirmation, and multi-client checks remain unverified for this revision.
