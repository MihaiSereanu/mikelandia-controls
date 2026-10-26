# Implementation direction

See [the phased implementation plan](implementation-plan.md) for the proposed change sequence, acceptance checks, and first implementation batch.

## Goal

Extend the mobile interface to additional systems, initially Warhammer 4e/5e and Shadowdark. Share most implementation code while preserving each game's terminology and native rules workflows.

## Shared application

Reuse navigation, phone/tablet layouts, scene controls, chat, journals, connection recovery, permissions, and existing macro execution. Check each reused feature in live worlds; source similarity does not establish compatibility.

Build shared internal components for displayed statistics, resources, item groups, text sections, and actions. Profiles supply the actual game's labels, ordering, values, and relevant controls. Generic internal components must not introduce generic replacement terminology in the interface.

## Data and action boundary

Use declarative profiles for field paths, item grouping, and displayed resources. System metadata and token bars may supply defaults, but data structure alone cannot determine rules semantics. Expose edits only through explicitly configured writable fields or native system operations.

Use small integrations for native attacks, characteristic or ability checks, skills, casting, channelling, conditions, and special resources. Keep rules calculations in the owning system. Resolve the current actor or token actor and recheck permissions before actions.

The installed Warhammer 10.1.2 system handles both editions under `wfrp4e`; its edition manager chooses native dialogs and tests. Delegate to those entry points rather than reproducing edition rules. The installed Shadowdark 4.0.6 system uses `Player` and `NPC` actor types and exposes many actions through `actor.system`.

## Initial work

1. Isolate the existing D&D5e data and action handling behind the shared boundary.
2. Support actor discovery without assuming D&D actor type names.
3. Establish generic chat, journals, scene controls, existing macros, and deliberate native-sheet access.
4. Add game-labeled character panels and small Warhammer and Shadowdark action integrations.
5. Test with player ownership, unlinked token actors, native dialogs, chat interactions, reconnects, and phone/tablet viewports. Exercise both Warhammer editions.

## Known coupling in the baseline

- `session-gateway.mjs`: actor eligibility excludes Shadowdark's actor types and Warhammer creatures.
- `actor-view.mjs`: D&D-specific field paths, item categories, conditions, and spell data.
- `command-gateway.mjs`: D&D APIs and field writes; method existence alone is insufficient capability detection.
- `features/characters/presenter.mjs`: D&D-specific display assumptions.
- `hotbar-gateway.mjs`: existing macro execution is generic; item macro creation generates D&D code.
- `action-session-gateway.mjs`: action summaries interpret D&D messages and markup.
- `mobile-presentation.mjs`: native actor sheets are normally suppressed and need an explicit fallback path.

This document records the agreed direction. It does not claim that system support has been implemented.
