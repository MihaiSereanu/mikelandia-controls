# Current status

Updated 2026-10-28. For source boundaries see [architecture](architecture.md); login/PWA operations are in [mobile login](mobile-login.md).

## Deployment and open work

- Live VE Mobile 1.1.13 has Momentum alignment and the native 4e chooser cancellation correction; only `assets/ve-mobile.css` and `src/systems/wfrp4e/magic.mjs` were deployed. Backup: `/home/ubuntu/backups/ve-mobile/20261028-momentum-cancellation/`. Native 4e-world and phone checks remain pending. The reported 5e lock was not reproduced in a fresh session.
- Journal filtering was deployed as a targeted three-file change on 1.1.11: non-GM results matched the native directory (7 journals); module storage remained intact and inaccessible. Backup: `/home/ubuntu/backups/ve-mobile-journals/20261027-212646/`.
- Login/PWA is deployed at `https://mikelandia.duckdns.org/mobile/`. Ten public files match; live Chromium accepts the manifest and prelogin. No live credentials were submitted. PWA changes remain uncommitted; publication of the earlier login addition is authorized.
- Checkout contains the Shadowdark/YouTube mute-loop latency fix; live installation remains pending. Local native-world Android emulation restored fast rolls without reload. Physical-phone listening is unverified. Local/deployed Foundry versions differ (14.369/14.367).
- Phone/Tablet isolation supports Common Display Hide UI on/off. Latest isolation, interaction, PWA installation, login-to-game display, and keyboard behavior still need physical-phone review.
- WFRP 10.1.2 / Warhammer Library 3.5.1 missing-ammo cancellation remains a native bug. Per-weapon **Details > Consumes Ammo** controls that path; VE does not patch it.

Publication is authorized for the journal, roll-latency, and Momentum/cancellation fixes. Pushing main publishes the public rolling `latest` release, runs checks, builds both packages, assigns the patch version from the workflow run, and verifies anonymous downloads. This documentation cleanup stays local.

## Latest recorded evidence

- 320 Node tests; four WFRP browser scenarios / 355 checks. Prior full browser milestone: 39 scenarios / 1,829 checks. PWA: four protocol tests and five browser scenarios / 130 checks.
- Live Android emulation confirmed deployed Momentum geometry and three weapon open/close/reopen cycles. Local native-world audio regression reached idle with the fix; fixtures do not prove phone silence.
- Artifacts: `dist/diagnosis/wfrp-live-*`, `dist/diagnosis/journal-live-*`, `dist/diagnosis/roll-{latency-evidence,cpu-profile}.json`, `dist/diagnosis/20261027-wfrp-ammo/`, and `dist/mobile-pwa-{deployment-http,deployed-prelogin}.*`.
- Prior local runtime backup: `D:/FoundryVTT/Backups/ve-mobile/20261027-044946-runtime-before-momentum-checkbox.zip`. PWA/Caddy backups and rollback: [runbook](mobile-login.md).
