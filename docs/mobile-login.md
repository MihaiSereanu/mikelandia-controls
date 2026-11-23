# Mobile login and PWA runbook

Login: `https://mikelandia.duckdns.org/mobile/` from `/srv/mikelandia-mobile`. Foundry owns users/passwords/sessions. The page remembers only per-world player ID, clears passwords and disables connected users. Visiting establishes `/join`, ending that browser's world login. Module activation/mode selection are independent.

## Build and check

- Build: `py -3 scripts/build_mobile_login.py` writes `dist/mobile-login.zip`, separate from module packages.
- Protocol: `node --test --test-reporter=dot tests/mobile-login.test.mjs`.
- Fixtures: `node scripts/check_browser.mjs --filter "mobile-login" --screenshots`. Screenshots: `dist/mobile-login-*.png`; short viewports simulate keyboard space only.

Latest deployed evidence and pending phone checks: [current status](current-status.md).

## App installation

The collapsed **Install Mikelandia Controls** section detects Android, iPhone/iPad (including desktop-identified iPads) and other browsers. Android Chrome: **Install and create shortcut > Install**, **Add to home screen > Install**, or **Install app**, depending on version. iOS Safari: **Share > Add to Home Screen**, keeping **Open as Web App** on if shown. Open Mikelandia from the home screen. Regular tabs retain browser controls.

Manifest: standalone display, start `./`, scope `../` relative to `/mobile/manifest.webmanifest`, covering login and `/game`; route prefixes work. OS bars remain device-controlled. Installation controls hide when installed/standalone and work independently of Foundry availability. A service worker scoped to `/mobile/` keeps the login shell and previously prepared companion assets available offline; it never controls native `/game` navigation.

[Standalone spacing](architecture.md#mobile-frame-and-upgrades) fixtures explicitly activate the CSS branch: CDP display-mode emulation cannot establish standalone context. Review installed apps physically.

## Offline player library

In companion **Settings > Session > Offline library**, enable **Remember on this device** for the current game/player. Saving remains enabled across visits until turned off. Turning it off, or forgetting that game/player from `/mobile/`, deletes its saved documents and media. GM sessions cannot populate the player library. Anyone using the same browser profile can read saved content before login; Foundry passwords and sessions are not saved.

**Saved Characters** opens a game/player catalogue on `/mobile/`, including when another world is running, Foundry is stopped, or the browser has no network. Saved games use the existing companion frame, character chooser, system sheets, tabs, descriptions, Notes, Journal reader, Party and last Initiative state. Chat is disabled. Sheet edits, rolls, target changes and other server actions are rejected; reading and navigation remain local. The saved-time banner distinguishes these copies from live play. Opening the host again does not automatically leave the reader.

The first authenticated save prepares every eligible character and readable Journal, including unopened content. Later document changes refresh automatically. Access receipts are digests of current permitted projections/page state; changed or revoked content is removed before asynchronous refresh work. Unchanged permitted copies survive a failed refresh. Access changes in a stopped world cannot be learned until the same player reconnects to that world. Browser storage can be cleared or evicted; this is a convenience copy, not a backup.

Only Character and current Party portraits are downloaded as content images; item/spell/effect icons, inline description images, Journal illustrations and linked-reference images remain online-only. Existing nonportrait blobs are removed on the next authenticated refresh. Text and directly linked permitted rules text previews remain saved. Portraits are limited to 8 MiB each and 128 MiB per game/player; missing, blocked or oversized portraits are unavailable offline. PDFs, audio, video and deeper unsaved links require an online game. Direct previews do not recursively download compendiums. SVG images are sanitized before storage. Secrets are included only when the online reader grants access; raw editor sources and document data are excluded.

Both the updated module and static login package are required. A missing `/mobile/sw.js` is reported as a static-page deployment error before downloading the app graph; relogging cannot supply missing hosted files. Portrait progress counts attempted downloads, and reader preparation has its own status. The static package contains no copied companion sources or styles. While authenticated, the module caches its existing import graph, styles, icons/fonts and applicable header artwork at their original URLs. The `/mobile/` worker serves only those static resources and its own shell, never native login/game/API responses. A complete runtime cache is published atomically; failed preparation keeps the prior runtime available. Document/media copies live in IndexedDB, separated by server path, world, system and player.

Checks: `node --test --test-reporter=dot tests/offline-library.test.mjs`; list then run `node scripts/check_browser.mjs --list --filter "^offline-library-" --native-assets`. The network-offline case reloads the actual `/mobile/` shell with Chromium networking disabled. Installed-world and physical Android/iPhone checks remain necessary before claiming live-device support.

## Hosting and updates

Caddy configuration (serve only this static directory):

```caddyfile
mikelandia.duckdns.org {
    redir /mobile /mobile/ 308
    handle_path /mobile/* {
        root * /srv/mikelandia-mobile
        header Cache-Control "no-store"
        header X-Content-Type-Options "nosniff"
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:30000
    }
}
```

Static updates need no restart. For Caddy changes, run `sudo caddy validate --config /etc/caddy/Caddyfile`, then reload Caddy. Verify public hashes, `/mobile` redirect, and native `/`, `/join`, `/game`, and Socket.IO routes. Foundry need not restart.

Caddy can serve the page while Foundry is stopped; connection failures offer retry. No active world triggers a 20-second retry. Stopping the AWS instance stops both.

## Rollback

Verify backup availability before restoring. The latest recorded static update uses `/var/backups/mikelandia-mobile/20261029-121703-gold-icon`; its affected files and hashes are in `dist/pwa-gold-live-deployment.json`. Restore only those files to `/srv/mikelandia-mobile/`, verify public hashes, and reload clients. No service restart is needed.

The earlier standalone-spacing backup at `/var/backups/mikelandia-mobile/20261028-095230-pwa-fixes/` contains `static/` originals and `module/assets/` originals for `/home/ubuntu/foundrydata/Data/modules/ve-mobile/`. Restore those groups only when rolling back that spacing change.

To remove the hosted login route, restore `/var/backups/mikelandia-mobile/20261027-210837/Caddyfile` to `/etc/caddy/Caddyfile`, validate, and reload Caddy.

## Native compatibility

Verified against Foundry 14.369 source: GET `/join` establishes a cookie; its served Socket.IO library emits `session`, then `getJoinData` returns `world`, `users`, `activeUsers`. POST `/join` accepts JSON `{action: "join", userId, password}`; follow a successful same-origin `/game` redirect. Mount prefixes at `<prefix>/mobile/`.

These internal interfaces require checks after major Foundry upgrades. Core is unpatched; module-enabled detection is unavailable. Foundry login appears as a fallback on errors and for browsers without JavaScript.
