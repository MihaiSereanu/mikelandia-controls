# Working in VE Mobile

Read [current status](docs/current-status.md) first. Read only the relevant [architecture](docs/architecture.md) section; code/tests establish behavior. Open [mobile login](docs/mobile-login.md) for login/PWA deployment work.

## Workflow

- Follow the standing grill-me interview; reuse settled answers. Preserve existing edits.
- Use targeted `rg` searches and bounded reads. State the hypothesis and required evidence; stop after it passes. After two unproductive attempts, change approach and explain the blocker.
- Trace actual native classes and active modules before patching Foundry symptoms: Shadowdark sheets use V1, its roll dialogs can use V2, and Warhammer sheets use V2.
- Keep this checkout separate from `D:/FoundryVTT/Data/modules/ve-mobile`. Verify installed files for live reports; copy only within authorized scope.

## Validation

- Run relevant Node files: `node --test --test-reporter=dot tests/<name>.test.mjs`.
- List browser cases: `node scripts/check_browser.mjs --list`; select with `--filter "shadowdark"`. `--screenshots` saves passing captures; failures always retain them.
- Run broader checks once at the final milestone for shared changes. Repeat passing checks only after relevant changes or new failures; stop at completion criteria.
- Reuse the harness. Launch live worlds/browsers only to answer unresolved questions; close only task-created helpers.
- Separate fixture, live-world, and physical-device evidence. Audible mute requires an actual mobile listening check.

Keep status to open issues, deployment, latest evidence, and essential artifact pointers. Put durable contracts in architecture; delete obsolete prose instead of adding diaries or archives.

No commit, push, release, or broader world changes without authorization. Pushing main publishes a release.
