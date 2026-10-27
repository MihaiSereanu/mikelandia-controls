# Working in VE Mobile

Read [current status](docs/current-status.md) first. Consult [architecture](docs/architecture.md) only for the area being changed. Code and tests establish current behavior; docs are a compact map.

## Keep work focused

- Preserve existing edits. Use targeted `rg` searches and bounded reads; avoid dumping entire source trees, histories, logs, or test reports.
- Follow the user's standing interview workflow. Reuse settled answers; ask only about unresolved decisions that affect the result.
- State the hypothesis and the evidence needed. If a check passes, stop investigating that hypothesis unless new evidence contradicts it. After two unproductive attempts, change the approach and explain the blocker.
- Trace the actual native class and active modules before patching a Foundry symptom. Shadowdark character sheets use V1; Warhammer uses V2. Shadowdark roll dialogs can use V2.
- Keep this checkout separate from `D:/FoundryVTT/Data/modules/ve-mobile`. Verify installed files when investigating a live report; copy only within the user's authorized scope.

## Validate once at the right scope

- During implementation, run the relevant Node test files and browser scenarios. Use `node --test --test-reporter=dot tests/<name>.test.mjs` and `node scripts/check_browser.mjs --filter "shadowdark"`.
- Use `--list` to find browser cases; `--screenshots` saves passing screenshots. Failures always retain screenshots.
- Run broader checks once at the final milestone when shared behavior changed. Repeat passing checks only after relevant changes or new failures. Stop once the completion criteria are met.
- Reuse the existing harness. Launch live worlds or browsers only when they answer an unresolved question. Close only helpers created for that task.
- Report fixture, live-world, and physical-device evidence separately. A mute fix needs an actual mobile listening check before calling the reported leak resolved.

## Keep handoffs small

Replace current status instead of appending session diaries. Keep only open issues, current evidence, deployment state, and essential artifact pointers. Put durable contracts in architecture. Do not create duplicate plans, test histories, or automatic documentation archives.

No commit, push, release, or broader world changes without authorization. Pushing main publishes a release.
