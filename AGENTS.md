# Working in Mikelandia Controls

Read [current status](docs/current-status.md) first. Use the [task map](docs/architecture.md#task-map) to find source owners, tests and the relevant contract; code/tests establish behavior. Open [mobile login](docs/mobile-login.md) for login/PWA deployment work.

## Workflow

- Follow the standing grill-me interview; reuse settled answers. Preserve existing edits.
- Use targeted `rg` searches and bounded reads. State the hypothesis and required evidence; stop after it passes. After two unproductive attempts, change approach and explain the blocker.
- Trace actual native classes and active modules before patching Foundry symptoms: Shadowdark sheets use V1, its roll dialogs can use V2, and Warhammer sheets use V2.
- Keep this checkout separate from `D:/FoundryVTT/Data/modules/mikelandia-controls`. Verify installed files for live reports; copy only within authorized scope.

## Validation

- Run relevant Node files: `node --test --test-reporter=dot tests/<name>.test.mjs`.
- Discover browser cases with `node scripts/check_browser.mjs --list --filter "<regex>"`, then remove `--list` to run them. Filters match case names, not filenames. `--screenshots` saves passing captures; failures always retain them. Native-font checks require `--native-assets` (see architecture).
- Run broader checks once at the final milestone for shared changes. Repeat passing checks only after relevant changes or new failures; stop at completion criteria.
- Reuse the harness. Launch live worlds/browsers only to answer unresolved questions; close only task-created helpers.
- Separate fixture, live-world, and physical-device evidence. Audible mute requires an actual mobile listening check.

Keep status to open issues, deployment, latest evidence, and essential artifact pointers. Replace superseded evidence per subsystem; retain unique live checks and verification gaps. Put durable contracts in architecture; update the task map when moving source/tests. Delete obsolete prose instead of adding diaries or archives.

No commit, push, release, or broader world changes without authorization. Pushing main publishes a release.
