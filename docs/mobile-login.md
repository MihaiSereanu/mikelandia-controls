# Mobile login on the existing Foundry host

The standalone page uses the same origin as Foundry at `/mobile/`. Caddy serves five static files; Foundry owns the player list, passwords, and sessions. No database, build step, third-party script host, or additional service is required. This page is independent of the world's module activation and leaves the module's existing device detection and saved modes unchanged.

The page shows the running world's title and background, remembers only the selected player ID per world in browser local storage, and disables already-connected players. Passwords are cleared from the field on submission and never persisted by the page. Visiting it establishes a native `/join` session, which logs out an existing world login in that browser, as the standard login page does.

## Local checks and preview

Run `node --test --test-reporter=dot tests/mobile-login.test.mjs` and `node scripts/check_browser.mjs --filter "mobile-login" --screenshots`. The browser fixtures exercise the real page/controller and native adapter with a simulated Foundry socket and authentication responses. Screenshots are in `dist/mobile-login-*.png`; they are fixture previews, not live login evidence. The short viewport simulates reduced space for a keyboard; physical keyboard behavior still requires a phone check.

Build the independent upload archive with `py scripts/build_mobile_login.py`. It contains only the page's five static files and does not change the normal Foundry module archive.

## Deployed Caddy setup

Deployed on 2026-10-27 at `https://mikelandia.duckdns.org/mobile/`. Static files are in `/srv/mikelandia-mobile`; the original Caddyfile and deployment file hashes are backed up at `/var/backups/mikelandia-mobile/20261027-210837/`. Caddy was validated and reloaded; Foundry's process remained running without a restart. Serve only this static directory, never the whole Foundry Data directory.

The verified upstream is `127.0.0.1:30000`. The deployed configuration is:

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

For updates, validate using `sudo caddy validate --config /etc/caddy/Caddyfile`, then reload Caddy if its configuration changed. A Foundry restart is unnecessary. Public HTTP checks confirmed all five deployed files match the checkout, `/mobile` redirects to `/mobile/`, and the standard root, `/join`, `/game`, and Socket.IO library routes still reach Foundry. A browser loaded the deployed page and obtained the live world's seven players through the real socket, without errors or horizontal overflow. Evidence: `dist/mobile-login-deployment-http.json` and `dist/mobile-login-deployed-prelogin.{json,png}`. No credentials were submitted. Successful live login and physical-phone/keyboard checks remain pending; rejected credentials and no-world handling have fixture coverage.

Rollback restores `/var/backups/mikelandia-mobile/20261027-210837/Caddyfile` to `/etc/caddy/Caddyfile`, validates it, and reloads Caddy. The static directory can remain on disk because the restored configuration will not serve it.

The page remains available while Caddy runs, even if Foundry is stopped; it reports the connection failure and offers retry. With a running Foundry server and no active world, it checks again every 20 seconds. If the AWS instance is stopped, both pages are unavailable.

## Native compatibility boundary

Verified against installed Foundry 14.369 source: GET `/join` establishes the cookie; Socket.IO emits `session`, followed by a `getJoinData` request returning `world`, `users`, and `activeUsers`. The page submits JSON `{action: "join", userId, password}` to POST `/join`, then follows a successful same-origin `/game` redirect. It loads the Socket.IO library served by that Foundry installation. Route prefixes are supported when mounted at `<prefix>/mobile/`.

These are Foundry's native internal login interfaces, so major Foundry updates need a login check. No Foundry core files are patched. No module-enabled detection is claimed. The standard Foundry login remains the fallback.
