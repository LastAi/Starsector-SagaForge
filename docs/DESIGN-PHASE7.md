# Phase 7 design: random content

Short record for [WORK-ORDER.md](WORK-ORDER.md) Phase 7 (2026-11-15). Requests: RC-R7, RC-F3,
RC-F4, RC-R6, RC-R1, RC-R1b, RC-R3, RC-R4, RC-R2, RC-F7, RC-R9, RC-R14, RC-R10, RC-R11 in
[INGAME-CHECKS.md](INGAME-CHECKS.md) ("Random content"). Research and the detailed model:
[RANDOM-CONTENT-ASSESSMENT.md](RANDOM-CONTENT-ASSESSMENT.md) §5 (targets), §6 (pools), §7 (world).

The phase is large (L), so it is built in five steps. Each ends with tests, svelte-check, the
docs and a short in-game list; SagaLib changes collect into **SagaLib 1.2** (format stays 1, new
optional fields, export requires 1.2 only when a mod uses them).

## Step 7a: random pools (RC-R7), first

**One pool model** for everything random (assessment §6.1): a pool has entries with a weight,
condition lines, a limit (once per playthrough / per object, cooldown days, at most N) and a
result. `pickOne` picks exactly one by weight (with an optional "nothing" weight); `rollEach`
rolls each entry on its own.

Where a modder meets it in 7a:
- **Branch node › Random**: the cases get weights (and the limits) instead of only conditions;
  "otherwise" becomes the "nothing" share. This is the everyday use: "30% the pirates are already
  there, 70% the wreck is quiet". Each case shows its **effective chance**.
- **Saga › Pools**: named pools the later steps use (loot, random encounters, scatter), with the
  same entry editor.

Export and runtime:
- `pickOne` → SagaLib command **`SF_RollPool <pool>`** (assessment §6.5): rules can't pick exactly
  one by weight. The pick goes to `$sagaforge_pick`, limits to memory keys; the command also works
  as a condition. Pools are written to `data/sagaforge/pools/<id>.json`.
- `rollEach` → plain vanilla rules (`RollProbability` + once-flags), no SagaLib needed.
- **Seeds**: per object (`Misc.getSalvageSeed`), else a stored global seed, mixed with the pool
  id and a draw counter, so a reload gives the same result (§6.3).
- SagaLib: `core/Pools.java` (pure, tested), used later by every other random backend.

Play mode: **Roll** (with the same random numbers as the game: `java.util.Random` ported exactly
to TypeScript, so golden cases check that Play and SagaLib pick the same entry from the same seed)
or **Force entry X**. Test profiles can force an entry (dev mode only). Checks: total weight 0
(error), an entry that can never be eligible (warning), `pickOne` without SagaLib (error with a
fix), generated flags in the flags registry.

## Step 7b: test contexts, raids, bar scenes (RC-F3, RC-F4, RC-R6)

- **Test-context presets**: a decivilised world, a ruins planet, a derelict, a bar; the ruins
  dialog chain as a fixture.
- **Raid form**: a quest step "the player raids the market" with its outcome in Play mode.
- **Bar scenes without a mission**: a start "a bar scene" (vanilla `AddBarEvent`), with a chance
  (a `rollEach` pool) and a once-limit; a Play-mode bar.

## Step 7c: random targets (RC-R1, RC-R1b)

A quest variable of type **target** becomes real (assessment §5.2): pick a system, planet, entity,
market, commodity or terrain by **requires** (all must hold) and **prefers** (ordered, each
dropped if it would leave nothing), exactly vanilla's `HubMissionWithSearch`. SagaLib runs the
search when the quest is offered; the result is an id in memory, with tokens (`_name`, `_system`,
`_dist`, `_faction`). Stage markers and Arrive nodes may name a target. "No match" means the quest
isn't offered (the editor explains this).

Play mode can't see the generated sector (§5.4): it asks **which target** and offers a mock target
with editable facts. A dev-mode sector snapshot from SagaLib is left for later.

## Step 7d: what happens at the target (RC-R3, RC-R4, RC-R2)

Facts of the picked target for Branch cases and phrases ("the target is decivilised"); a person
at the target (a staff post there, or created); objects placed at the target at a stage and
removed when the quest ends (the R25/R26 mechanism from Phase 4, pointed at a target).

## Step 7e: loot and the living sector (RC-F7, RC-R9, RC-R14, RC-R10, RC-R11)

Pools put to work: loot tables (vanilla `drop_groups.csv` where possible, after the in-game merge
check), salvage specials and defenders, random encounters near the player, roaming fleets,
scatter at new game (templates in N systems picked like targets), and decivilisation (protect
toggle, deciv as a target criterion).

## Decisions (user, 2026-11-15)

1–4 as proposed below: that step order; Branch › Random plus Saga › Pools; Play mode uses the
game's random numbers (ported `java.util.Random`); SagaLib 1.2 tested in game after each step that
changes it. 5 (sector snapshot) is decided when 7c is built.

### As proposed

1. The step order above (pools first, then the small editor items, then targets, then the rest).
2. Pools appear as **Branch › Random** in quests plus **Saga › Pools** for reusable ones.
3. Play mode matches the game's random numbers exactly (ported `java.util.Random`), rather than
   only showing chances.
4. **SagaLib 1.2** is built up across 7a–7e and tested in game once at the end of each step that
   changes it (7a, 7c, 7d, 7e), not released in between.
5. Random targets in Play mode: mock targets now; the sector snapshot later (or never).

## Test mods (user, 2026-11-16)

In-game testing waits until later (scheduling), so every step is built in full and gets its own
throwaway test mod: `mods\seven_a`, `seven_b`, … (prefixes `sva_`, `svb_`, …; 0.98.5a; SagaLib
1.2; dev mode). Each has a small "Test Range" system and a dev-mode test profile that takes the
player there from the Ctrl+F9 menu (SagaLib 1.2: `startAt` works mid-game). Built by
`npx jiti scripts/build-test-mod.ts <name>` from `test/fixtures/phase7/<name>.ts`;
`test/testmods.test.ts` checks each against the game. One local commit per step (no push).

## Follow-ups and decisions (user, 2026-11-16)

The user went through the left-out items and the questions below:

- **Salvage specials (q. 12):** to look into later, together with two broader ideas: **plugin
  support** for modders who really want special things (their own Java, called by SagaLib), and
  **templates** for things Saga Forge can build from vanilla-style mechanics.
- **Additions to vanilla's drop groups, a random-from-group reward (q. 12):** after the user's
  in-game merge check of `drop_groups.csv`. **Checked 2026-11-16: a mod's rows are added to the
  vanilla group**, so both can be built: **moved to Phase 8** (WORK-ORDER F7-a, F7-b). Two mods
  adding the same item to one vanilla group: noted for the cross-mod work (#31).
- **Roaming fleets (q. 13):** Phase 8, with world events.
- **Target extras (q. 6):** noted; the user will ask modders whether they want or need them.
  **Commodity targets need a delicate touch**: two major mods change how vanilla's economy and
  planetary industry work. **Terrain targets** look too obscure: most mods would rather spawn a
  matching place with randomized elements than match a random existing one.
- **More spawn kinds (q. 10):** to look at, like specials.
- **rdsm fixtures (q. 5):** right to leave out of Phase 7; an outstanding test case (INGAME-CHECKS
  "Untested").
- **Q. 1:** done: the editor warns about a start option or a menu-option Arrive at a wreck; the
  7a in-game list explains why the test uses planets.
- **Q. 2:** the user OK'd the CLAUDE.md line, but Carrier's hook blocks this session from editing
  D:\ModTools\CLAUDE.md; the user adds it.
- **Q. 3, 4, 6, 8, 10 (q. 15):** fine as built. **Q. 7 (search before the offer):** not now; only
  if a modder makes a case for it.
- **Q. 9:** done: an Arrive at what was spawned at a target, or at an entity pick, **takes over
  by default** (it can still be set to a menu option; then a warning).
- **Q. 14:** done: a scatter has **Measured from** (a place; empty = the player).

## Questions for later (recorded while working; my suggestion was used)

Asked up front: the user is away while 7b–7e are built, so questions that come up are written
here with the choice made, to discuss afterwards.

1. **7a test targets.** Derelict wrecks don't fire `PopulateOptions` (vanilla's salvage rules take
   their dialog), so a start option at a wreck never shows. *Used:* uncolonised planets for the
   per-object pool test. *Later:* should a start option at a wreck (or any place whose dialog
   doesn't fire `PopulateOptions`) be a warning in the editor? (Ties to the open RC-F2 check.)
2. **CLAUDE.md "Our mods"** lists every new mod, but this session may not edit it. *Proposed
   line:* "mods\seven_a\ (and later seven_b … seven_e): throwaway Phase 7 test mods for Saga
   Forge, one per step, 0.98.5a, need SagaLib 1.2 and dev mode; Ctrl+F9 › the step's 'go to Test
   Range' profile; built by `npx jiti scripts/build-test-mod.ts <name>`."
3. **7b raids have no "failed" output.** Vanilla's raids can't fail (only marines are lost), so
   the Raid node has **Raid done** and **Backed out**. *Later:* a "lost many marines" branch
   would need a condition on the losses (not in vanilla's memory); not planned.
4. **7b bar scenes: "back to the menu" means the bar.** Vanilla's bar waits for `BarCMD
   returnFromEvent`; the market menu (`SF_BackToMenu`) would leave the bar half open. *Used:* in a
   bar scene, Link › back to the menu and loose ends export as `BarCMD returnFromEvent true`.
5. **7b left out the rdsm fixtures** (G11: vanilla's two rdsm text bugs as flags-registry
   regression cases). *Used:* deferred; they test the flags registry, not random content.
6. **7c pick kinds.** Built: system, planet, entity, market (56 of vanilla's criteria). *Left
   for later:* commodity and terrain picks, a weighted pool of fixed places (a Random branch
   already covers "one of these three"), `setSystemWasUsedForStory` and vanilla's exclusive
   mission references. *Later:* which of these does a real mod need first?
7. **7c: when the search runs.** Contacts and bars create the mission when offering it, so the
   offer text can name the target. Any other start (an option, a trigger) creates it at the first
   Stage node, so only texts after that can; if nothing matches, the quest doesn't start (the
   editor says so in an Info line; seven_c 7c-4 shows the Branch on `SF_QuestState` to handle
   it). *Used:* vanilla's own behaviour, no extra "search now" command. *Later:* a "search before
   the offer" action if modders want option starts to name the target in the offer.
8. **7c targets are stored at offer time** in `$global` (as vanilla stores its mission refs in
   the mission). A re-offer searches again; an active quest keeps its pick.
9. **7d: entity targets and spawns need a takeover.** A spawned cache or probe (and an entity
   pick) has vanilla's salvage dialog, which never shows menu options. *Used:* a warning on such
   an Arrive ("set it to takes over the arrival"), and seven_d's cache arrival takes over, then
   hands back to vanilla's cache dialog. *Later:* make "takes over" the default for those.
10. **7d spawn kinds.** Built: a custom entity type or a faction's derelict ship. *Left for
    later:* vanilla's debris field, mission node and ship graveyard spawns (one Action each).
11. **7d details are fixed** (always stored, no per-target choice), as the assessment's "facts"
    list; Booleans so `$global.<q>_<v>_deciv` works as a condition. `theme` stays a text list for
    texts, with four theme-family Booleans for conditions.
12. **7e salvage specials, vanilla drop groups, random rewards: deferred.** Specials need one of
    vanilla's special data objects per kind (ship recovery, sleeper pods, cargo manifest, …), each
    with its own fields: worth a small form per kind later. Adding rows to vanilla's drop groups
    waits for the in-game merge check (user's decision). A "random item from a group" reward can
    use a loot pool once that check is done. *Later:* which special kinds first?
13. **7e roaming fleets (RC-R14): deferred.** They need vanilla's RouteManager (a route source
    whose data is saved), a larger and riskier piece than the rest of 7e. Random encounters
    (RC-R9), "player near" and periodic encounters cover the common cases. *Later:* build it with
    world events (Phase 8, RC-R12), which needs the same scheduling.
14. **7e scatter ranges** are measured from the player (there is no quest giver at new game), and
    each copy goes to a different system. *Later:* a "from a place" choice if needed.
15. **7e random-encounter fleets** use the encounter's fleet, flags and comm dialog, but not its
    spawn settings or quest outcomes, and despawn the vanilla way. An encounter used only by a pool
    needs no place or quest (the checks know).

## From the first in-game tests (2026-11-16)

- **Bar scenes and interjections roll per month** (vanilla's `RollProbability` seeds with the
  month): explained in the editor, FORMATS.md; a bar shows at most 3 such scenes per visit.
- **Ruins in a system with a colony are explored at new game** (vanilla's `updateKnownPlanets`):
  the editor warns; seven_b's ruins planet moved to a system without a colony. **User: add the
  option** → done: Locations › a ruins planet › **Ruins stay unexplored** (SagaLib 1.2 restores
  them in `onNewGameAfterTimePass`).
- **Systems placed on vanilla ones** (found in game): the editor warns below 3,000 units; the test
  ranges moved. The old example mod VanguardCompact (void, rebuilt later) is 2,921 from Duzahk, so
  it would get the warning too.
- **Outside the sector** (user): allowed, with a warning that can be dismissed (secret places in
  the dark beyond the map).
- **Question for the user:** with SagaLib 1.2 clearing the clouds around new systems, should any
  mod with a new system require SagaLib 1.2 (today plain systems need no minimum version, so an
  older SagaLib would leave them inside the clouds)? It changes the example mod's reference files.
- **Hyperspace clouds** (a modder's report): SagaLib clears them around every new system, as
  vanilla's SectorGen does for its own, and once on load for saves made before the fix.
- **A beaten quest fleet that survives breaks off and leaves** (SagaLib 1.2): found with a
  dev-mode win, but a normal win where the enemy retreats does the same.
- **7d: avoiding dangerous systems** (user's question): already possible with Must › System tags ›
  "none of" theme_remnant_main, theme_remnant_secondary (and similar), or Must › "An interesting
  system" (vanilla's own filter, which also leaves out unsafe systems). **User: add the preset** →
  done: **+ Avoid dangerous systems** (Must › System tags › none of theme_unsafe,
  theme_remnant_main, theme_remnant_secondary).
