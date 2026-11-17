# Phase 4 design: SagaLib 1.1 format batch

Short design for [WORK-ORDER.md](WORK-ORDER.md) Phase 4 (2026-11-15). Requests: R16, R25, R26,
RC-F1, RC-F5, RC-F6 in [INGAME-CHECKS.md](INGAME-CHECKS.md). **RC-F2** (planet scenes without
taking over the arrival) followed as Phase 4b, on the user's decision (2026-11-15): §6.

All new fields are optional, so `format` stays 1. They need **SagaLib 1.1**; SagaLib 1.0 would
ignore them, so Export adds `"version": "1.1.0"` to the SagaLib dependency in `mod_info.json`
when the mod uses one.

## 1. Systems without a star (R16)

`"star": null` and `"light": [r, g, b]` on a new system. SagaLib calls `initNonStarCenter()` and
`setLightColor`, as vanilla's Tri-Tachyon black site does; `orbit.focus: "star"` means the empty
centre. Editor: the Star field gets **No star (empty centre)** with a light colour.

## 2. Objects that appear and disappear during a quest (R25, R26)

| JSON | Meaning |
|---|---|
| entity `"appears": {"quest": q, "stage": s}` | Not built with the system. Built when quest `q` reaches stage `s` (or by `SF_PlaceEntity <id>`), once; it stays after. |
| entity `"replaces": "<id>"` (with `appears`) | When it is placed, it takes that entity's place (focus, current angle, radius, days) and that entity is removed. |
| system `"removals": [{"target": id, "quest": q, "stage": s, "market": "keep\|decivilize"}]` | When `q` reaches `s` (or by `SF_RemoveEntity <id>`), the entity is removed (fades out). Any entity: the mod's own, vanilla's or another mod's. |

**SagaLib** (memory keys only, as encounters):
- `$global.sagaforge_placed_<id>` and `$global.sagaforge_removed_<id>` record what happened.
- The checks run when a step changes (`SF_Step`), on load, and in the manager tick.
- A placed entity is never placed twice. A removed one never comes back, and an addition to an
  existing system isn't rebuilt (that rule already exists).

**Guardrails:**
- SagaLib checks that the target exists, and logs and skips otherwise.
- An entity with a **market** is only removed with `"market": "decivilize"`
  (`DecivTracker.decivilize`); with `keep` (the default) SagaLib logs an error and leaves it.
- The editor warns when a removal targets a vanilla or another mod's object, naming what depends
  on it in the mod (stage markers, Arrive nodes, encounter spawns, people's markets).
- The editor also warns when content still points at an object after the stage that removes it.
- A removal with `decivilize` needs a confirmation in the editor.

**New rule commands:** `SF_PlaceEntity <id>` and `SF_RemoveEntity <id> [decivilize]` (Action node
steps "Place an object", "Remove an object").

**Editor:**
- The entity inspector gets **Appears**: from the start, or when a quest reaches a stage. With a
  stage, it also offers **Replaces**.
- A system gets **Removed during quests**: a list of target, quest, stage and market handling.
- Play mode doesn't simulate the map, so it only notes these steps.

## 3. Planet conditions on uncolonised planets (RC-F1)

A planet or moon without a market may list `"conditions": [...]` and
`"surveyed": "none|preliminary|full"`. SagaLib calls `Misc.initConditionMarket(planet)`, adds the
conditions, and sets the survey level. Ruins are conditions (`ruins_scattered`, …). Editor: the
inspector's **Conditions** (the market condition picker) and **Surveyed**, for planets without a
market.

## 4. Spawn when the player is near (RC-F5)

Encounter `spawn.when: "player-near"` with `spawn.range`, in map units (0 = anywhere in the same
system). It spawns once, when the player's fleet comes that close to `spawn.at`. With
`spawn.quest` / `spawn.stage`, only while the quest is at that stage, and again on a later visit to
the stage (as quest-stage encounters).

## 5. Loot reserved, salvage CSV checks (RC-F6)

- `"loot": []` on entities and rewards is reserved (written only as `[]`; SagaLib ignores it), for
  the drop groups that come with random content.
- Check mod verifies the headers of the mod's own `drop_groups.csv` and
  `salvage_entity_gen_data.csv` against vanilla's.
- How `drop_groups.csv` merges goes on the in-game list.

## 6. Planet scenes without taking over the arrival (RC-F2, Phase 4b)

From RANDOM-CONTENT-ASSESSMENT.md, "F2 in detail".

**Arrive as an option (default).**
- A `PopulateOptions` rule at the place, while the quest is at that step, adds the node's
  **Option** (`5:<quest>_<node>_go:<text>`). Picking it shows the node's text and goes on.
- Vanilla's menu stays: trade, salvage, planet info.

**Take over the arrival (opt-in).**
- The node's **Shows as › takes over the arrival** keeps the old `OpenInteractionDialog` rule,
  for a scene that must interrupt (a hail as the player docks).
- An Arrive at a place guarded by a **Protect this wreck** lock is always a takeover. The lock owns
  that arrival (only Leave), so an option would never show; and if the lock stepped aside, vanilla's
  salvage would be open during the step. The editor's previews and Play mode compile the same way
  as Export.

**Entity flags (SagaLib 1.1).**
- Each Arrive node's place gets `entityFlags` for the stage the node waits at.
- SagaLib marks the place important on the map while the quest is there.

**Interjection start.**
- The quest start "an interjection before an existing option": option id (e.g. `salExplore`),
  extra conditions, a chance (`RollProbability`, vanilla's seeded roll) and a once-limit (per
  object `$entity.<quest>_seen`, or per playthrough `$global.<quest>_seen`).
- Its start rule answers `$option == <option>` with more conditions than the option's own rule,
  and sets a local `$<quest>_interjected` flag. The hand-back (a Link "Hand back to <option>",
  which makes the option the same id) then reaches vanilla's rule in the same dialog.

**Takeover check, third result.**
- An interjection rule is reported as an interjection: info when it has a chance or a once-limit,
  a warning when it runs every time.
- The quest check makes any path that doesn't hand back (an option without a target, a node that
  ends without a Link) an **error**.

**Not done:** interjection limits through the shared pool model (§6 of the assessment); they move
there when random content comes.
