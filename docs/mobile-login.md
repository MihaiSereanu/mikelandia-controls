# Mobile login and PWA runbook

The login page is hosted at `https://mikelandia.duckdns.org/mobile/` from `/srv/mikelandia-mobile`. Foundry owns users, passwords, and sessions; the page remembers only a per-world player ID, clears submitted passwords, and disables connected users. Visiting establishes a native `/join` session, logging out an existing world login in that browser. Module activation and mode selection remain independent.

## Build and check

- Build: `py -3 scripts/build_mobile_login.py` writes `dist/mobile-login.zip`, separate from module packages.
- Protocol: `node --test --test-reporter=dot tests/mobile-login.test.mjs`.
- Fixtures: `node scripts/check_browser.mjs --filter "mobile-login" --screenshots`. Screenshots: `dist/mobile-login-*.png`; short viewports simulate keyboard space only.

Latest deployed evidence and pending phone checks: [current status](current-status.md).

## App installation

The collapsed **Install Mikelandia Controls** section detects Android, iPhone/iPad (including desktop-identified iPads), or other browsers. Android Chrome: **Install and create shortcut > Install**, **Add to home screen > Install**, or **Install app**, depending on version. iOS Safari: **Share > Add to Home Screen**, keeping **Open as Web App** on if shown. Open Mikelandia from the home screen. Regular tabs retain browser controls.

Manifest: standalone display, start `./`, scope `../` relative to `/mobile/manifest.webmanifest`, covering login and `/game`; route prefixes work. OS bars remain device-controlled. Installation controls hide when installed/standalone and work independently of Foundry availability. No service worker or offline game cache.

The in-game companion frame follows the [standalone spacing contract](architecture.md#mobile-frame-and-upgrades). Browser fixtures explicitly activate that CSS branch because CDP display-mode emulation does not establish standalone context. Physical installed-app review remains required.

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

Replace static files without a service restart. For Caddy changes, run `sudo caddy validate --config /etc/caddy/Caddyfile`, then reload Caddy. Verify public hashes, `/mobile` redirect, and native `/`, `/join`, `/game`, and Socket.IO routes. Foundry need not restart.

Caddy can serve the page while Foundry is stopped; connection failures offer retry. No active world triggers a 20-second retry. Stopping the AWS instance stops both.

## Rollback

Verify backup availability before restoring. The latest recorded static update uses `/var/backups/mikelandia-mobile/20261029-121703-gold-icon`; its affected files and hashes are in `dist/pwa-gold-live-deployment.json`. Restore only those files to `/srv/mikelandia-mobile/`, verify public hashes, and reload clients. No service restart is needed.

The earlier standalone-spacing backup at `/var/backups/mikelandia-mobile/20261028-095230-pwa-fixes/` contains `static/` originals and `module/assets/` originals for `/home/ubuntu/foundrydata/Data/modules/ve-mobile/`. Restore those groups only when rolling back that spacing change.

To remove the hosted login route, restore `/var/backups/mikelandia-mobile/20261027-210837/Caddyfile` to `/etc/caddy/Caddyfile`, validate, and reload Caddy.

## Native compatibility

Verified against Foundry 14.369 source: GET `/join` establishes a cookie; its served Socket.IO library emits `session`, then `getJoinData` returns `world`, `users`, `activeUsers`. POST `/join` accepts JSON `{action: "join", userId, password}`; follow a successful same-origin `/game` redirect. Mount prefixes at `<prefix>/mobile/`.

These internal interfaces require checks after major Foundry upgrades. Core is unpatched; module-enabled detection is unavailable. Foundry login appears as a fallback on errors and for browsers without JavaScript.
