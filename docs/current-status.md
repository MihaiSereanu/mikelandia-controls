# Current status

Updated 2026-10-27. WFRP single-line Encumbrance and direct Momentum checkbox are installed; await phone review.

## Installed and verified

WFRP Combat and Trappings begin with read-only Encumbrance current/max, using prepared system values and accepting native decimal strings. Its label and value stay on one line; adjacent Combat cards stack on phones. Momentum uses an immediate-save checkbox with pending, error, and cancellation handling. Four changed runtime files were copied to D:/FoundryVTT/Data/modules/ve-mobile and SHA256-compared. Installed version remains 1.1.0. All current checkout changes are authorized for commit and publication; the main release workflow assigns its own version and verifies both public installation channels.

Validation: all 292 Node tests and 1,485 browser fixture checks passed across 26 scenarios, including 335 WFRP checks across 4e/5e phone/tablet scenarios. Both standard and experimental packages build with archive integrity and import checks. This is source/fixture proof; the new display and checkbox have not been confirmed on the user's phone.

The Blunderbuss concat error is native to WFRP 10.1.2 / Warhammer Library 3.5.1. Missing-ammo setup returns undefined, but the library still constructs a dialog and calls concat on its absent script list. An isolated harness extracted the installed native methods and reproduced both No Ammo and the exact concat error with no VE code. Consumes Ammo disabled passes native setup. Per-weapon Details -> Consumes Ammo is the native switch; no global equivalent was found. Loading remains separate. No native code, ammo setting, actor, or item was changed.

Diagnostic harness and JSON results: dist/diagnosis/20261027-wfrp-ammo/.

Latest backup: D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip; archive contents hash-verified. Previous full module backup: 20261026-233033-module-before-inventory-ui.zip in the same directory.

Shadowdark Basic-only creation, slot weight fields, unrestricted safe-integer quantities, Gear/coin controls, and deletion at zero remain installed. Its latest validation was 290 Node tests, 1,444 browser fixture checks across 26 scenarios, and six isolated native slot-getter examples. Latest Shadowdark runtime backup: 20261027-000015-runtime-before-custom-item-weight.zip.

Earlier real-campaign touch proof remains specific to Gods of the Forbidden North, Foundry 14.369, Shadowdark 4.0.6, GamingTable/Argos with Common Display. Selection, targeting, and a native joystick step were verified; Argos position and pause state restored. Evidence: dist/diagnosis/20261026-203347-token-control/. World/module backups: 20261026-203347-{gotfn-before-token-control,module-before-token-control}.zip.

## Remaining review

- Phone confirmation of WFRP Encumbrance in both tabs, direct Momentum checkbox, and native weapon Consumes Ammo behavior.
- Shadowdark phone confirmation of custom slot weights, quantity increases and totals; earlier Gear, coin, and zero-quantity controls.
- Physical-mobile audio listening and broader light timer/reconnect and multi-client inventory/resource checks remain separate from fixtures.
- Simplification review: experimental overlay discovery, scaling/ordering, third-party adapters, debug bookkeeping and excess performance settings. Retain overlays pending review; preserve recovery, permissions, native workflows and desktop restoration.

Support/report exporting and device/FPS/latency readouts are removed. Keep controls help and online-player status. Documentation and test-runner changes do not need installation copies.
