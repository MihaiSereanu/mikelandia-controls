# Working in Mikelandia Controls

Read [current status](docs/current-status.md) first; use the [task map](docs/architecture.md#task-map) for owners, tests and contracts. Code/tests establish behavior. Login/PWA work: [runbook](docs/mobile-login.md).

## Workflow

- Follow grill-me; reuse settled answers and preserve existing edits.
- Use targeted `rg` and bounded reads. State hypothesis/evidence; stop when satisfied. After two unproductive attempts, change approach and explain the blocker.
- Trace native classes/active modules before Foundry fixes: Shadowdark sheets are V1, rolls can be V2; Warhammer sheets are V2.
- Keep checkout separate from `D:/FoundryVTT/Data/modules/mikelandia-controls`; verify installed files for live reports. Copy only within authorization.

## Validation

- Node: `node --test --test-reporter=dot tests/<name>.test.mjs`.
- Browser: `node scripts/check_browser.mjs --list --filter "<regex>"`; remove `--list` to run. Filters match case names. `--screenshots` retains passing captures; failures always retain captures. Native fonts require `--native-assets` (see architecture).
- Shared changes: broader checks once at completion. Repeat passes only after relevant changes/new failures.
- Reuse the harness; launch live worlds/browsers only for unresolved questions. Close only task-created helpers.
- Distinguish fixture/live-world/device evidence; audible mute requires mobile listening.

Status: deployment, open issues, latest evidence/artifacts. Replace superseded subsystem evidence; retain unique live checks/verification gaps. Architecture: durable contracts; update task map when moving source/tests. Delete obsolete prose; no diaries/archives.

Commit, push, release and broader world changes require authorization. Pushing main publishes a release.
