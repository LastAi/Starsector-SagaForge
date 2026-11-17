# Work order for the consolidated list (task #36)

Draft 1 (2026-11-15). The order in which to build the requests in
[INGAME-CHECKS.md](INGAME-CHECKS.md) › "Open questions": the user's requests **R1–R32** and the
random-content items **RC-…** (from [RANDOM-CONTENT-ASSESSMENT.md](RANDOM-CONTENT-ASSESSMENT.md)).
Each phase lists its items, why it comes there, and what it unlocks. Sizes: XS, S, M, L (RC sizes
from the assessment; ours are estimates).

## Principles

1. **Bugs and foundations first.** Fix what blocks other work (R11), then build the shared pieces
   that many requests use (images, reference pages, Set later and Inactive), so each later feature
   uses them from the start instead of being reworked.
2. **Format changes early, and batched.** There are no users to protect (decision 2026-11-15),
   so this is the cheapest time to change the plan and SagaLib formats. Changes that need SagaLib
   are grouped so SagaLib gets one new version per phase, not one per feature.
3. **The game index learns before the forms use it.** Reading stars, systems, sprites and plugin
   classes from the game comes before the filters, previews and recommendations that need them.
4. **Workflow before scope.** What makes building a mod convenient (the test mod's path) comes
   before new kinds of content. Random content and world events are large, and come after a
   checkpoint.
5. **Each phase ends green**: `npm test`, svelte-check, SagaLib's `bash build.sh`, the smoke
   screenshots, and updated docs (README, FORMATS, FORMAT.md) before the next phase starts.

## Phases

### Phase 0: fixes and quick wins (XS–S): **done 2026-11-15**

All five done; tests 144 green, svelte-check clean, screenshots checked. R22 is only its first part
(any id); naming the mod's fleet types comes in Phase 2.

| Item | What | Why now |
|---|---|---|
| R11 | Bug: Export fails after deleting exported content | Blocks R10 and anything that removes content |
| F12 | System view: a station's label overlaps its planet's | Small, visible every time |
| R13 | Items › Plugin: the 13 vanilla classes plus free text | Small, self-contained |
| R22 (first part) | Encounter fleet type accepts any id | One-line model change; names come in Phase 2 |
| RC-R5 | Offer timing fields and tag-pool contact starts (today hard-coded) | XS; the assessment suggests doing it in #36 directly |

### Phase 1: editor-wide foundations (M each): **done 2026-11-15**

All six done (design: [DESIGN-PHASE1.md](DESIGN-PHASE1.md)); tests 161 green, svelte-check clean,
screenshots checked. Left for later: R9's optional "Create…" button, R13's classes from mods' jars,
and R8's sections for the other pages' lists (added in the phases that touch them).

| Item | What | Unlocks |
|---|---|---|
| R9 | **Set later**: a "To do" mark, its own Problems level, blocks Mark as released | Every form; R10 builds on it |
| R10 | **Inactive** toggle (people; quests and dialog): not exported, warnings only, reference rules, save warning, greyed out with "[Inactive]" | Needs R11 and R9 |
| R5 + R1 + R2 | **Images page**: import a file or folder into the right folder with the mod prefix, **resize** and **crop** on import, size check | R28, R24, R19, R21 and every image field |
| R28 (+ F16) | **See images before picking them**, everywhere; portrait lists with thumbnails | Uses R5 |
| R24 | Quest icon picker with previews | Uses R5 and R28 |
| R8 | **Reference pages** for the editor's lists, with info buttons (the framework, plus the People lists first) | R7, R13, R18, R20 put their descriptions here |

### Phase 2: factions and people (S–M): **done 2026-11-15**

Both done (design: [DESIGN-PHASE2.md](DESIGN-PHASE2.md)); tests 169 green, svelte-check clean,
screenshots checked. Left for later: one-name people (in-game look first), names for every faction
(`default_fleet_type_names.json`, Phase 5).

| Item | What |
|---|---|
| R3 | **Name pools tab**: person name pools and ship name lists, written to the mod's `person_names.csv` and `ship_names.json` |
| R7 + RC-R13 | **Other keys** templates and descriptions from the vanilla survey; the most used keys get real fields (`fleetTypeNames`, R22's names; RC-R13's pirate and Pather bases, punitive expeditions, bounties) |

### Phase 3: locations (S–M each): **done 2026-11-15**

R14, R15, R17–R21 done (design: [DESIGN-PHASE3.md](DESIGN-PHASE3.md)); tests 177 green,
svelte-check clean, screenshots checked. RC-F1 moves with the SagaLib batch (Phase 4). Not done:
belt and ring texture previews; entity types that need a plugin class.

The game index first, then the forms that use it.

| Item | What |
|---|---|
| R15 | Star types read from `planets.json` (game and mods) |
| R14 | Read-only view of the 23 vanilla systems (from `data/scripts/world/systems/*.java`) |
| R19 | Preview image of the selected entity (textures and sprites from the game files) |
| R18 | Planet type filters and recommendations (distance, star type) |
| R20 | Filters and recommendations for stations, wrecks and other entities |
| R17 | Resize handles in the system view |
| R21 | Custom celestial objects (the mod's own entity, planet and star types) |
| RC-F1 | Planet conditions and ruins on uncolonised planets (needs SagaLib: Phase 4 batch) |

### Phase 3b: 0.98.5a support (tasks #47, then #48 at the checkpoint): **#47 done 2026-11-15**

#47 P1–P5 implemented (status and differences at the top of `TARGET-VERSION-ASSESSMENT.md`);
tests 187 green, svelte-check clean, screenshots checked. P6 waits for the first 0.98.5a-only
SagaLib feature. The in-game part is checklist section 12b (V1–V7), run at the checkpoint with
#48.

Decided 2026-11-15: **after Phase 3**. #47 (per-mod target game version, migration install and
page, version labels; `TARGET-VERSION-ASSESSMENT.md`, phases P1–P5) changes formats and the
per-version game definitions, and touches the same game index as Phase 3.

**Note:** at the checkpoint, **Vanguard Compact is built as a 0.98a mod** and then used to test
migrating to 0.98.5a with #47's tools (that is #48's part 2).

### Phase 4: SagaLib format batch (one new SagaLib version): **done 2026-11-15**

RC-F2 followed as **Phase 4b** on the user's decision (DESIGN-PHASE4.md §6). Its SagaLib part
(entity flags) is in SagaLib 1.1 too. Tests: SagaLib 60, editor 197.

SagaLib 1.1.0 (unreleased) and the editor side (design: [DESIGN-PHASE4.md](DESIGN-PHASE4.md)).
R16, R25, R26, RC-F1 (SagaLib part and fields), RC-F5, RC-F6 and (4b) RC-F2 are done.
svelte-check is clean and the screenshots are checked. Nothing has run in game yet (the list is
in INGAME-CHECKS "Untested").

Everything that changes what SagaLib reads, done together with its editor side:

| Item | What |
|---|---|
| R16 | Systems without a star (an empty centre and a light colour) |
| R25 | Objects that appear when a quest reaches a stage |
| R26 | Remove or replace objects during a quest, with warnings and guardrails |
| RC-F2 | Planet scenes without taking over the arrival (Arrive as an option, entity flags, interjection starts, a salvage preset, the takeover check's third result) |
| RC-F1 | SagaLib's condition-only market (with Phase 3's editor part) |
| RC-F5 | Spawn when the player is near |
| RC-F6 | Loot fields reserved, salvage CSV checks |

### Phase 5: fleets (M–L): **done 2026-11-15**

Scoped by the user (DESIGN-PHASE5.md):
- Built: named fleets, the doctrine preview and fleet type names. Repeat fleets are fresh but
  trackable, and people can be removed. The SagaLib part is in 1.1.
- Not built: editing ship roles.
- Tests: SagaLib 61, editor 202. svelte-check is clean and the screenshots are checked.

| Item | What |
|---|---|
| R23 (+ R4) | **Fleets tab**: ship roles per faction, the doctrine preview (an example fleet), fleet templates |
| R22 | Custom fleet types with their names |
| R27 | Named fleets: flagship and ship names, a captain and overrides, reusable for repeat encounters (needs SagaLib for the names: add to the Phase 4 batch if Phase 5 is designed in time, else a second small SagaLib version) |

### Phase 6: writing (M): **done 2026-11-15**

Design: [DESIGN-PHASE6.md](DESIGN-PHASE6.md). Built: the Script tab with Copy as Markdown,
spellcheck with a per-mod word list, punctuation checks on every player-visible text, five quest
templates and saved templates. Escort and smuggling templates are deferred (see R30). No SagaLib
change. Tests: editor 213, svelte-check clean.

| Item | What |
|---|---|
| R29 | Writing tools: script view, spellcheck, punctuation checks |
| R30 | Quest templates (after all node types and Phase 4's quest changes are settled) |

### Checkpoint: rebuild and walk

**Editor part done 2026-11-15**: Vanguard Compact rebuilt by hand in the app as
`mods\vanguard_by_hand` (prefix `vgh_`, 0.98a), W1–W7 walked, findings F17–F31 in INGAME-CHECKS
(F17–F26 fixed). W8 in game done by the user the same day: the quest end to end, the launcher
version, the commission title and the dev-mode profiles; the rest of the W8 list was accepted as
covered. #48 done the same day (pulled into #36): migrated to 0.98.5a in the editor (V1–V7),
played on a new 0.98.5a game, rule-file facts confirmed; carrying a save across 0.98a → 0.98.5a is
out of scope (user). **The checkpoint is complete; next is Phase 7.**

Decided 2026-11-15: **after Phase 6**. With Phases 0–6 done, the editor's workflow is the one a
modder will use. Then:
- rebuild the example mod, **Vanguard Compact, from scratch as a 0.98a mod**, by hand in the
  editor (the workflow walk, INGAME-CHECKS "Workflow checks" W1–W8, with Vanguard Compact as the
  mod), and run the in-game checks;
- **#48**: the 0.98.5a in-game tests, and migrating Vanguard Compact from 0.98a to 0.98.5a with
  #47's tools.

What the walk finds is fixed before Phase 7. **Heliopolis is not part of the checkpoint**: it is
built after everything (Phase 8), **as a real mod, no longer a test**.

### Phase 7: random content (L overall)

Design and the user's decisions: [DESIGN-PHASE7.md](DESIGN-PHASE7.md) (steps 7a–7e; SagaLib 1.2
tested in game after each step that changes it). **7a (random pools) done 2026-11-16**, waiting
for its in-game check (test mod `seven_a`). **7b (raids, bar scenes, place presets) done 2026-11-16** (test mod `seven_b`; no SagaLib change). **7c (random targets) done 2026-11-16** (test mod `seven_c`; SagaLib 1.2 `targets`, SF_IsTarget). **7d (at the target) done 2026-11-16** (test mod `seven_d`; details, person, SF_SpawnAtTarget, encounters at a target). **7e (loot, random encounters, scatter, deciv) done 2026-11-16** (test mod `seven_e`; salvage specials and roaming fleets deferred). **Phase 7 is built**; all of it waits for the in-game checks (seven_a … seven_e). In-game testing comes later (user, 2026-11-16), so
7b–7e are built in full, each with its own test mod and a local commit.

In the assessment's order:

1. RC-R7: the shared random pool model (`SF_RollPool`), **first**.
2. RC-F3 (test-context presets), RC-F4 (raid form), RC-R6 (bar scenes without a mission).
3. RC-R1 and RC-R1b: random targets, and Play mode for them.
4. RC-R3 (target facts), RC-R4 (people at the target), RC-R2 (spawn at the target, reusing R25 and
   R26).
5. RC-F7 loot tables, specials and defenders (after RC-F6).
6. RC-R9 random encounters, RC-R14 roaming fleets (with the Fleets tab), RC-R10 scatter, RC-R11
   decivilisation.

### Phase 8: large systems and release

Design and the user's decisions: [DESIGN-PHASE8.md](DESIGN-PHASE8.md) (2026-11-16): order 8a loot groups → 8b release
packaging → 8c translation (a runtime swap anyone can ship) → 8d world events + roaming fleets → 8e
the AI conversion guide.

| Item | What |
|---|---|
| RC-R12 | **(a) Done (8d-1, 2026-11-17): event schedulers, passed in game (eight_d). (b) Done (8d-3, 2026-11-17): progress events, passed in game (eight_d).** World events (research in FORMATS.md, design in DESIGN-PHASE8.md "8d") |
| RC-R14 | **Done (8d-2, 2026-11-17), passed in game (eight_d).** Roaming fleets (deferred from 7e; same scheduling as world events) |
| F7-a | **Done (8a, 2026-11-16), passed in game.** **Add to vanilla's loot groups** (moved from 7e, user 2026-11-16): a loot pool can add its entries to a vanilla drop group (rows in the mod's own drop_groups.csv; vanilla's rows stay). Checked in game: a mod's rows are added to the group. Warn about an item the vanilla group already has (two rows or one: not checked yet). |
| F7-b | **Done (8a), passed in game.** **A random item from a loot group as a quest reward** (moved from 7e) |
| F7-c | **Checked in game (8a): the rows don't add up, one wins; Check mod warns.** **Two mods adding the same item to one vanilla drop group** (user 2026-11-16, added to #36): do the rows stack (weights add up) or does one win? Test with two small throwaway mods like drop_merge_test; record it in FORMATS.md; decide whether Check mod should report it. Do together with F7-a. |
| R31 | **Done (8c, 2026-11-16), passed in game (8c-1 to 8c-5).** Translation export, as a runtime swap (DESIGN-PHASE8.md "8c") |
| R12 | **Done (8e, 2026-11-17): docs/AI-CONVERSION.md; untested until a modder tries it on their mod.** The AI conversion guide (last of the format work: it documents the final formats) |
| R32 | **Done (8b, 2026-11-16), passed in the app (8b-1 to 8b-3). Forum post draft greyed out (2026-11-17); it comes back as user-made post templates Saga Forge fills in.** Release packaging, then the next release |

### After everything: Heliopolis, a real mod

Built in the finished editor as a **real mod, no longer a test** (decided 2026-11-15), from the
planning room (`D:\Mod Planing Room`). The old guide in `Mod Guides/Heliopolis` is void; a new one
is written then if wanted.

## Decisions

- 2026-11-15: the checkpoint comes after Phase 6, with Vanguard Compact only; Heliopolis after
  everything, as a real mod.
- 2026-11-15: #47 after Phase 3; Vanguard Compact is built as a 0.98a mod at the checkpoint and
  used to test migrating to 0.98.5a (#48).
