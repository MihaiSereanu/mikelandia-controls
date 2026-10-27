# Mobile login and PWA runbook

`https://mikelandia.duckdns.org/mobile/` serves ten static files from `/srv/mikelandia-mobile`. Foundry owns users, passwords, and sessions; the page remembers only a per-world player ID, clears submitted passwords, and disables connected users. Visiting establishes a native `/join` session, logging out an existing world login in that browser. Module activation and mode selection remain independent.

## Build and check

- Build: `py scripts/build_mobile_login.py` > `dist/mobile-login.zip`, separate from module packages.
- Protocol: `node --test --test-reporter=dot tests/mobile-login.test.mjs`.
- Fixtures: `node scripts/check_browser.mjs --filter "mobile-login" --screenshots`. Screenshots: `dist/mobile-login-*.png`; short viewports simulate keyboard space only.

Latest deployed evidence and pending phone checks: [current status](current-status.md).

## App installation

Android Chrome: use Install or **Add to home screen > Install**, then launch MC. iOS: **Share > Add to Home Screen**. Regular tabs retain browser controls.

Manifest: standalone display, start `./`, scope `../` relative to `/mobile/manifest.webmanifest`, covering login and `/game`; route prefixes work. OS bars remain device-controlled. Installation controls hide when installed/standalone and work independently of Foundry availability. Icons (180/192/512px, 512 maskable) render Foundry's Amiri Bold as gold MC/hexagon on navy; font files are not redistributed. No service worker or offline game cache.

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

- PWA update deployed 2026-10-28: restore the five prior files from `/var/backups/mikelandia-mobile/20261027-225515-pwa/static/` to the static root; remove `pwa.mjs`, `manifest.webmanifest`, and `icons/mc-*.png`. No reload; installed device icons may persist. Backup name uses server time. This update left Caddy configuration unchanged.
- Original login deployment: restore `/var/backups/mikelandia-mobile/20261027-210837/Caddyfile` to `/etc/caddy/Caddyfile`, validate, and reload. Static files may remain unserved. That backup also holds original deployment hashes.

## Native compatibility

Verified against Foundry 14.369 source: GET `/join` establishes a cookie; its served Socket.IO library emits `session`, then `getJoinData` returns `world`, `users`, `activeUsers`. POST `/join` accepts JSON `{action: "join", userId, password}`; follow a successful same-origin `/game` redirect. Mount prefixes at `<prefix>/mobile/`.

These internal interfaces require checks after major Foundry upgrades. Core is unpatched; module-enabled detection is unavailable. Standard Foundry login is the fallback.
