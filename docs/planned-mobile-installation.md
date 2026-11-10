# Planned mobile installation replacement

Status: Deferred - not approved for implementation.
Recorded: 2026-11-07.

This note preserves the agreed direction for future work. Approval to save this
note does not authorize implementation, deployment, publication or removal of
existing hosted files.

## Goal and agreed direction

Remove the separately hosted `/mobile/` login portal while preserving a
mobile-friendly login and installed app experience:

- Android: a signed Trusted Web Activity (TWA) APK, distributed directly to players.
- iPhone/iPad: a Home Screen PWA, without native iOS development or Apple Developer membership.
- Both: use Foundry's native authentication and the existing Mikelandia Controls interface in `/game`.
- Launch `/game` to resume valid sessions; let Foundry redirect to login when needed.
- Keep `mikelandia.duckdns.org`, existing branding/icons and online-only operation.

Use Caddy's response-replacement extension to add mobile adjustments and PWA
metadata to native Foundry pages. Caddy is the existing HTTPS reverse proxy;
this approach requires maintaining a custom Caddy build, but no additional
helper service or changes to Foundry's core files.

Tauri and native iOS apps were considered and set aside. The user has no Mac or
cloud Mac build setup. Google Play publication is outside the initial scope.

## Proposed implementation

1. Prepare a reproducible Caddy build containing the response-replacement
   extension, with pinned dependencies and upgrade/rollback instructions.
2. Augment only native `/join` and `/game` HTML responses, including configured
   route prefixes, with links to the mobile styles, prelogin script and manifest.
   Preserve native authentication requests, Socket.IO, assets and admin routes.
3. Reuse the native compact login form. Adapt its layout for phones/tablets and
   narrowly suppress the identified resolution warnings on mobile devices.
   Preserve other notifications and desktop behavior.
4. Serve the manifest, icons and small support files without a separate login
   page or custom authentication implementation. Preserve the existing PWA
   identity and old manifest address during migration.
5. Redirect the old `/mobile` and `/mobile/` entry points to `/game`; change mobile
   Logout to native `/join`. Visiting `/join` ends the current world session, so
   it must not be the app's unconditional startup URL.
6. Build the Android TWA with Bubblewrap and prepare
   `/.well-known/assetlinks.json` using the APK's signing certificate fingerprint.
   Keep signing keys/passwords outside the repository and retain the key for
   future APK updates.

## Verification before replacement

- Recheck the actual deployed Foundry version and native login behavior. During
  planning, public `/join` reported 14.370; the inspected local source was 14.369.
- Prove locally that the injected prelogin script runs early enough to handle
  resolution warnings, including warnings triggered by resizing.
- Test login, failed authentication, connected users, logout, session resumption,
  missing active world and server-unavailable behavior.
- Check narrow phones, tablets, large text, keyboard space and desktop layout.
- Verify manifest/icon responses, route prefixes, legacy redirects, and unchanged
  authentication, Socket.IO and admin routing. Account for compressed responses
  when configuring response replacement.
- On a physical iPhone, verify installation, safe-area spacing and continuity
  from login into `/game` in the installed app.
- On a physical Android device, verify the signed APK, domain verification,
  absence of browser controls, Back behavior, login and reconnection.
- Keep the current portal available until replacement validation passes. Back up
  the affected server configuration and files before an authorized deployment.

## Portability and rollout

Prepare and validate locally first. Obtain separate authorization before live
deployment, publishing the APK or removing hosted portal files.

Keep the public hostname stable when changing hosting providers. Copy the
Caddy integration and Android verification file to the destination. Another GM
would need their own compatible server setup and TWA app/domain verification;
a generic app with arbitrary server selection is outside this first version.

## References

- [Current login/PWA runbook](mobile-login.md)
- [Architecture](architecture.md)
- [Caddy response-replacement extension](https://github.com/caddyserver/replace-response)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
- [TWA setup and domain verification](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
