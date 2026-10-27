# Current status

Updated 2026-10-27. The checkout contains a fix for Shadowdark roll latency caused by mobile mute handling interacting with YouTube Player Widget. GitHub publication is authorized; installation in the live Foundry instance remains pending. Mikelandia Controls remains an in-person companion with strict Phone/Tablet UI isolation.

Phone/Tablet UI isolation now hides unrelated module and world-macro widgets, including late V1/V2 applications and descendants that force visibility. Native windows require explicit workflow ownership, recognized roll UI, approved parents, or a deliberate mobile control. Preserve module-launched editors/settings/confirmations, temporary notifications/tooltips, native menus and Dice So Nice. The rule works with Common Display Hide UI on or off and restores external presentation on exit.

## Checkout behavior

Five screens remain: Character, Chat, Journals, Combat, and Settings. Scene browsing, map gestures, token control/targeting/movement, token and template placement, Scene overlays and action bars, map asset optimization, and map-memory profiles are removed. Character selection no longer selects or releases tokens. Shadowdark light buttons and acquisition/deletion light toggles are removed; ordinary gear, quantities, coins, and native character actions remain.

Combat keeps initiative rolls, End Turn, and GM start/end/previous/next progression with native authority checks and encounter-end confirmation. Synthetic Actor resolution remains for character data and chat provenance.

Visible names and startup artwork use Mikelandia Controls. Technical ID ve-mobile, saved settings/flags, folder and release URLs remain compatible. README credits the original VE Mobile. A small upgrade routine restores client settings saved by the removed graphics profiles.

## Deployment and remaining review

The local full-stack reproduction uses an isolated copy of Gods of the Forbidden North with the same 35 active module IDs as the deployment. Repeated YouTube mute commands triggered 620 mute calls, 618 attempted playlist-volume writes, and 927 playlist renders in one bounded probe. Issuing at most one mute command per player stops the feedback loop, including when the iframe initially reports stale mute state. Preserve mute and teardown behavior; physical-phone listening remains unverified.

With the fix, Argos STR and Stromdinn rolls opened dialogs in 9–15 ms and displayed chat cards 25–31 ms after submission, without a reload. Common Display Hide UI was tested both ways. This is a native local-world test with Android identification and trusted touch, not a physical S24+ test. Local Foundry is 14.369; deployment is 14.367. Local Carolingian UI is 4.6.1 versus 4.6.2 in the supplied screenshot. The remote STR test intercepted ChatMessage.create, so it does not measure server-side chat creation. Evidence: dist/diagnosis/roll-latency-evidence.json and dist/diagnosis/roll-cpu-profile.json.

Approved subtree animations now skip unrelated desktop isolation scans. Native mobile Chat also handles Dice So Nice hiding entire messages. The deployment already enables immediate dice chat, so that compatibility fix was not the cause of the reproduced loop. Optional local timing is exposed through module API setRollTimingEnabled(true), rollTimingSnapshot(), and resetRollTiming(); it retains at most 20 observations for 30 seconds each.

Distribution uses the public rolling latest release at https://github.com/MihaiSereanu/ve-mobile/releases/tag/latest. Pushing main runs Node and browser checks, builds standard/experimental packages, assigns the patch version from the workflow run number, and verifies anonymous manifests and matching ZIP downloads. Keep the technical module ID and existing manifest URLs unchanged.

The user reported the in-person interface works and installed the local changes themselves. Physical-phone verification of the latest isolation behavior remains pending. Latest prior agent-created runtime backup: D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip.

The native WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo concat error remains external to this module. Extracted-native-method reproduction: dist/diagnosis/20261027-wfrp-ammo/. Per-weapon Details -> Consumes Ammo is the native switch; the module does not patch ammo behavior.

Validation: all 297 Node tests and 34 browser scenarios (1,665 checks) pass. The event-driven audio regression fails with the old repeated-mute implementation and reaches idle with the fix. The isolated native-world checks above add full-stack evidence. Release packages have not been rebuilt for these local changes; the existing dist ZIPs predate this fix. Physical-phone interaction, audible mute confirmation, and deployment of this revision remain pending.
