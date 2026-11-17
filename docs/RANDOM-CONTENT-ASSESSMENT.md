# Randomized and runtime-generated content: assessment and hand-off notes

Status: assessment, **ready for hand-off** (task #35, 2026-11-15). Analysis and planning only:
nothing here is built, and PLAN.md is not changed. It builds on
[RUINS-ASSESSMENT.md](RUINS-ASSESSMENT.md) (task #34), whose gap ids G1–G11 and follow-ups F1–F9
are used below.

**Scope: base game only** (vanilla 0.98a, with 0.98.5a differences where found). Cross-mod work
(MagicLib bounties #27, compatibility review #31) does its own research and is not covered here.

Checked against:
- PLAN.md (§4.4, §4.5, §4.6, §6 rule 5, §11.2, §11.4);
- the code on `saga-forge-plan`, including session #21's uncommitted work (task #36) as of
  2026-11-14;
- SagaLib 1.0 (`mods/SagaLib`, `docs/FORMAT.md`);
- the 0.98a API source (`.cache/api-old`), the 0.98.5a API source (`.cache/api-new`), and
  `starsector-core/data`.

Legend: **Covered** = Saga Forge 1.0 does it · **Partly** = the mechanism exists but this kind
needs more · **Not covered** = nothing built or planned · **Not proposed** = left out on purpose.

---

## 0. Hand-off notes (decisions made, 2026-11-15)

| # | Question | Decision |
|---|---|---|
| 1 | Consolidate this work with #30's World events (§11.4)? | **Not decided here.** Another task consolidates. This document only supplies the research (§7) and the shared design (§6). |
| 2 | Where the shared target picker lives, and the MagicLib mapping | **Out of scope.** Only the base-game picker is described (§5). Cross-mod tasks handle their own parts. |
| 3 | Filing the follow-up tasks and their order | **Task #36 does the consolidation.** It turns §9's additions into tasks, or folds them into existing ones. Two constraints #36 should keep (§3): F2 changes the Wait/Arrive export, which its test mod checks (Q14), and F2 touches the same files #36 is editing. |
| 4 | Weighted "pick one" from rules: add a SagaLib command `SF_RollPool`? | **Written up as hand-off notes** (§6.5), for whoever builds the pool model. |

**For #36, in short:**
- Read §1 (what exists today), §3 (F1–F9 with sizes and dependencies), §9 (all proposed
  additions R1–R14 with sizes and suggested groupings) and §11 (what this assessment did *not*
  look at).
- Suggested groupings are "planets" (small items, F2 first) and "random content" (pool model
  first). They are suggestions only.

---

## 1. What we have today (Saga Forge 1.0 + SagaLib 1.0 + #36's work so far)

### 1.1 Editor model and export

| Area | What exists | Relevant limits |
|---|---|---|
| Quest starts | `contact` (person_missions.csv), `bar` (bar_events.csv), `option` (PopulateOptions, never takes over), `trigger` (a dialog on any trigger), `manual` | No "before a vanilla option" (interjection) start; no probability or once-limit on starts; no tag-pool contact start |
| Offer timing | `freq`, `prob`, rep range, importance, tags | Timeouts and durations are **hard-coded** in `export/runtime.ts`: contact timeout 30–60; bar duration 30–40, timeout 15–20, accepted timeout 60–90. `reqMission*` isn't used (prerequisites go into the start conditions) |
| Quest variables | `number`, `string`, `bool`, `entity`, `person`, `target` | `target` is a **stub**: `{kind, criteria: unknown[]}`, shown as "coming later", and export is blocked |
| Wait/Arrive | `arrive` at an entity, or wait N `days` | Arrive exports an `OpenInteractionDialog` rule (`$id ==`, step condition, once-flag `$global.<q>_<node>_done`). It **takes over the first visit** (§2) |
| Link node | modes `menu` (**new, #36**: back to the menu or close), `option`, `trigger`, `node` | No named "continue vanilla salvage" preset |
| Branch node | condition cases, plus an `else` case | No random or weighted case except through hand-written `RollProbability` lines |
| Action ops | credits, rep, item, set/unset flag (with days), reward, spawn/despawn encounter, start quest, story points, XP, raw line | No "spawn entity", no "set salvage spec / special / defenders" |
| Rewards | credits, rep, person rep, items, ships, XP, story points | No "random from a drop group" |
| Locations | new or existing systems; planets, stations, belts, rings, jump points, relays, derelicts, custom entities; markets | **Uncolonised planets can't have conditions** (no ruins). All placement is fixed coordinates at new game (or `addToExistingSaves`) |
| Encounters | fleet (fp or explicit), spawn `quest-stage` / `new-game` / `periodic`, behaviors patrol / guard / intercept / travel / ambush, comm dialog, outcomes | No `player-near` spawn, no roaming or route fleets, no random-encounter pool |
| Factions | full form for additions; patch-only overrides; `custom.engagesInHostilities` in the form | `makesPirateBases`, `pirateBaseStationTypes`, `patherBaseTypes*`, `punitiveExpeditionData`, `postsNoBounties` are only reachable as raw JSON |
| Checks | FireBest takeover check; flags registry with typo hints; "wreck used by a quest but unguarded" (`checks/quests.ts`) | No "interjection" result; no pool or target checks |
| Game index | factions, people, **core-world markets** (`econ/*.json`), **hand-made system positions** (`starmap.json`), items, conditions, planet types, rules (all rule files on 0.98.5a) | **No procgen sector**: procgen systems, planets, themes, ruins and derelicts don't exist in game files. This matters for Play mode with random targets (§5.4) |

### 1.2 SagaLib runtime pieces that the designs below reuse

- **`SagaQuest extends HubMissionWithBarEvent`**, which is built on `HubMissionWithSearch`. So
  vanilla's whole search API (`require*` / `prefer*` / `pick*`) and spawn API (`spawn*`,
  `triggerSpawn*`) can be called inside `create()` with no new base class.
- **State only in memory keys** (`$global.<q>_state`, `_step`, `_<var>`). That is save-safe, so
  random results should be stored the same way (as ids and flags).
- **Trigger queue** (`core/Triggers.java`, `$global.sagaforge_pending`): fires rules outside a
  dialog and survives saves.
- **Day counter and manager tick** (`$global.sagaforge_days`, `EncounterManager.tick`): runs
  timers, periodic spawns and stage-end despawns.
- **`SF_BackToMenu`**: clears options and runs `FireAll PopulateOptions`. If nothing adds an
  option, it closes the dialog (so it is safe at wrecks).
- **Ambush behavior**: springs when the player comes within 1600 units in the same system.
- **Quest JSON `format: 1`** reserves `targets: []` ("SagaLib must ignore it"). Other new
  optional fields are possible, but **an old SagaLib silently ignores them**. A mod that uses
  them must require the newer SagaLib version in `mod_info.json`.
- One active instance per quest id: a repeatable quest with a random target runs one at a time.

### 1.3 Documents that already cover parts of this

| Document | What it covers |
|---|---|
| RUINS-ASSESSMENT.md | G1–G11, F1–F9 (§3 here updates them) |
| GAME-0.98.5a-ASSESSMENT.md I7 | `parts` commodity and `parts_10/33/50` drop groups (loot tables) |
| TEST-MOD-CHECKLIST.md | Q14 tests Wait/Arrive; line 248 lists the ruins follow-ups as "planned" and points only at RUINS-ASSESSMENT. **#36 owns that file**, so it should add a pointer to this document |
| PLAN.md | §11.2 random targets, §11.4 world events: intent only |

---

## 2. What changed since RUINS-ASSESSMENT

- **1.0 shipped (2026-11-11) without F1–F6.** "Before #32 fixes the M3–M5 designs" is past.
  Those designs are now 1.0's formats, and every follow-up is a post-1.0 addition.
- **G7 (planet takeover) still stands, but is narrower.** The Arrive rule runs once, so only the
  first visit loses vanilla's planet opening (survey, "Explore the ruins", other options). The
  branch then ends in `SF_BackToMenu`, which re-fires the planet's `PopulateOptions`, but never
  vanilla's own `OpenInteractionDialog` chain.
- **#36 added Link mode `menu`**, the general "hand back" that F2 asked for.
- **The game index has no procgen data** (§1.1). F8/R1's Play mode can't draw a real ruins planet
  from it (§5.4).

---

## 3. Ruins follow-ups F1–F9: confirmed scope, size, dependencies

| # | Scope (confirmed / adjusted) | Size | Depends on | Suggested grouping (for #36) |
|---|---|---|---|---|
| F1 | **Confirmed.** `conditions` + `surveyed` on planet/moon entities, a condition picker, "generate like vanilla", a SagaLib condition-only market, and an info check: "can't colonise until explored". **Add** a `wasCivilized` toggle, so a designer can build a "dead colony" the way vanilla's decivilisation leaves one: `decivilized` + ruins sized by the old colony + pre-surveyed (§7.1). | S | SagaLib min-version bump | Planets |
| F2 | **Adjusted** (details below). Planet scenes without a takeover. The Link `menu` mode exists; still to do: entity flags during steps, an interjection start, a "continue vanilla salvage" preset, the third result of the takeover check, and an Arrive export that adds an option. | M | F3 presets (UI only) | Planets, **first** |
| F3 | **Confirmed**, plus a **decivilised world** Test-context preset, the ruins chain and the RDSM/gaData fixtures. | S | — | Planets |
| F4 | **Confirmed.** Raid form + Play outcome (`AddRaidObjective`, `$raidDifficulty`, `mktRaidNonMarket`; vanilla only). | S | — | Planets |
| F5 | **Adjusted.** `spawn.when: 'player-near'` (range in ly, or "in system"), checked in SagaLib's manager tick, like vanilla's `beginWithinHyperspaceRangeTrigger`. The existing ambush spring is unchanged. Later: `at` = a target variable (R1). | S | R1 for the target part only | Planets |
| F6 | **Adjusted.** Reserve `loot?` on `SystemEntity` and `Reward`, and add the two salvage CSVs to the format checks. **Verify how `drop_groups.csv` merges**: it decides whether additions to a vanilla group are possible at all (§6.2, §10). Also needs a SagaLib min-version bump. | XS | — | Planets |
| F7 | **Adjusted: broadened.** Loot tables, salvage specials and defenders become the first users of the **shared pool model** (§6). Drop groups are pools with a CSV backend; specials are pools with a SagaLib backend. Includes `SF_SalvageSpec`, `SF_SetSpecial`, `SF_SetDefenders`, and a random-from-group reward. | L | F1, F6, R7, Encounters (exists) | Random content |
| F8 | **Adjusted: broadened** into R1–R4 (§5). The ruins criteria are one group in a criteria model that mirrors `HubMissionWithSearch` 1:1. The MagicLib side is left to its own task. | M | R1 | Random content |
| F9 | **Out of scope here** (cross-mod, #31). Unchanged from RUINS-ASSESSMENT. | — | — | #31 |

### F2 in detail (the one that changes an existing export)

1. **Entity flags during steps.** Quest JSON gets
   `entityFlags: [{ entity, flag, fromStep, toStep }]`. SagaLib sets the flag on a step change and
   clears it outside the range; on load it recomputes them from `$global.<q>_step`. This is what
   vanilla's `setFlag(entity, flag, false, stages…)` does.
2. **The Arrive export becomes an option**:
   - a `PopulateOptions` rule on `$id == <entity>`, the step condition and the entity flag;
   - one option (its text set on the node), leading to the arrive text;
   - the branch ends with Link `menu`, or with the salvage preset.
   - **Opt-in "Take over the arrival"** keeps today's `OpenInteractionDialog` rule, for scenes
     that must interrupt (a hail on arrival).
3. **Interjection start** (G4): "before a vanilla option" (`salExplore`, …) with extra conditions,
   a probability and a once-limit (per entity or per playthrough). The fields are the same limit
   fields as the pool model (§6.1).
4. **Takeover check, third result**: *interjection* is allowed when every path ends in a hand-back
   Link and a once-limit or probability gates it. It is an **Error** if a path doesn't hand back.
5. **Save effect**: none, because dialog isn't saved. Re-run the Vanguard Compact walkthrough step
   that uses Arrive, and the test mod's **Q14**.
6. **Order constraints for #36**:
   - F2 should land **before** the workflow test mod is built, or Q14 has to be tested twice.
   - It edits `export/questrules.ts`, `checks/quests.ts` and `model.ts`, which #36 is editing
     now, so the two must not run in parallel.

---

## 4. Coverage by content kind (base game)

Columns: **Vanilla** (files, classes, rules) · **How a mod adds to it the vanilla way** ·
**Coverage** · **Proposal** (R*n* in §9, F*n* in §3) · **Overlaps** with loot tables, random
targets, Encounters and the flags registry.

### 4.1 Quests that send the player to a randomized location

| Kind | Vanilla | Mod way | Coverage | Proposal | Overlaps |
|---|---|---|---|---|---|
| Pick an existing system, planet, entity, market, commodity market or terrain by criteria | `HubMissionWithSearch`: `require*` / `prefer*` + `pickSystem/Planet/Entity/Market/Commodity/Terrain` in `create()`. Null → `create()` returns false → mission aborted, hub offers another | Java mission class | **Partly** (stub only) | R1 | F8 ruins criteria; Encounters `at` (F5) |
| Spawn the quest's own place in a picked system | `BaseHubMission.spawnMissionNode / spawnEntity / spawnDerelict* / spawnDebrisField / spawnShipGraveyard(LocData)`. `EntityLocationType`: `HIDDEN`, `HIDDEN_NOT_NEAR_STAR`, `ORBITING_PLANET(_OR_STAR)`, `UNCOMMON`, `ANY`, `ORBITING_PARAM`. Stage-deferred `triggerSpawn*` (`HubMissionWithTriggers`). Spawned things get `NOT_RANDOM_MISSION_TARGET` and are removed when the mission ends | Java | **Not covered** (Locations are fixed, built at new game) | R2 | Locations (entity kinds), loot (cache contents), Encounters (guards) |
| Variations from the picked target | `if` chains or `rollProbability` on target facts (decivilised, pulsar, remnant theme, base flag) → `$<prefix>_variation`. Read **from the result**, because a prefer may have been dropped (`GACelestialObject`) | Java + rules conditions | **Not covered** | R3 | Branch node, phrases, flags registry |
| Target tokens in text | `updateInteractionDataImpl()`: `set("$rdsm_planetName", …)`, `_systemName`, `_dist`, `_reward`; `Call $global.<ref> showMap` | Java | **Not covered** | R1 | Token chips; "token nothing sets" check (G11) |
| A person at the target | `findOrCreatePerson(faction, market, …, posts)`, `getPersonAtMarketPost`, `findOrCreateTrader/Criminal` | Java | **Not covered** | R4 | People page |
| One copy at a time / one per target | `setGlobalReference`, `set{Person,Market,Entity}MissionRef`, `requireSystemNotAlreadyUsedForStory` + `setSystemWasUsedForStory` | Java | **Partly** (one active instance per quest) | R1 | Pool limits (§6) |
| Fallbacks and widening | No loop. Prefers apply in order; a prefer that would empty the set is skipped. Widening = tight-to-loose prefers (`GAProjectZiggurat`); a second search after `resetSearch()` (`ExtractionMission`); `preferSystemUnexplored` also adds "not entered for 365 days" | Java | **Not covered** | R1 | — |
| Offer frequency and timing | `person_missions.csv` (`freq`, timeouts, rep, importance, `reqMission*`, `tagsAll/Any/NotAny`, tags `priority` / `non_repeatable`); `bar_events.csv` (`freq`, `prob`, duration, timeout, accepted timeout); `BaseMissionHub.updateOfferedMissions` (seed per 30 days, 1–3 offers) | CSV rows | **Partly** (timing hard-coded, no tag pools) | R5 | Saga overview prerequisites |

### 4.2 Events triggered from random pools

| Kind | Vanilla | Mod way | Coverage | Proposal | Overlaps |
|---|---|---|---|---|---|
| Salvage loot | `salvage_entity_gen_data.csv` (`drop_value` budgets; `drop_random` as `group:N`, `0.5`, `3-4`, `3x5000`) + `drop_groups.csv` (`commodity, group, freq`; entries: commodity, `nothing`, `wpn_`, `ftr_`, `item_<id>[:data]`, filter queries `wpn_:{tier:3,tags:[…]}`). Per-entity `addDropRandom/Value`. Seed `$salvageSeed`, `Misc.getRandom(seed, 100)`. 0.98.5a adds `parts_10/33/50` | New spec rows; new groups; extra rows in a vanilla group (**merge unverified**) | **Not covered** | F6, F7 → R7 | Items page (Used by), rewards, derelicts |
| Salvage specials (sleeper pods, ship recovery, cargo manifest, transmitter trap, …) | `SalvageSpecialAssigner.pickSpecialFor`: **hard-coded** weights per entity type (the "Nothing" weight = chance of no special); `Misc.setSalvageSpecial`; seed level 50 | **No hook.** A script calls `Misc.setSalvageSpecial` after generation | **Not covered** | F7 → R7 (SagaLib backend) | Ruins G6 |
| Salvage defenders | Spec columns `probDefenders`, `defFaction`, `minStr`, `maxStr`, `probStation`; `MemFlags.SALVAGE_DEFENDER_OVERRIDE`; GenericPlugin `SalvageDefenderModificationPlugin` | Spec columns; memory override | **Not covered** | F7 | Encounters fleet form |
| Salvage "explore stories" | Rules on `$option == salExplore` + `$customType`, `!$didSpecialExploreStory`, `$player.exploredX`, **`RollProbability p`** (seed = salvage seed + rule-id hash + month). Stories compete in FireBest, with no weights. Fallback `sal_noDefenders` → `FireBest CheckSalvageSpecial` | rules.csv rows | **Partly** (`trigger` start + Link; no interjection, probability or once fields) | F2 + R7 (`SF_RollPool` for weighted picks) | Flags registry (generated once-flags) |
| Ghost-ship / abyss hint stories | `$gsType` from an enum; `UniqueEncounter` set | Not extendable | **Not proposed** | — | — |
| Bar events (missions) | `bar_events.csv` → `SpecBarEventCreator`; `BarEventManager` picks by `freq` every ~0.5 days, with a cap; `prob` rolled per market (seeded) | CSV row | **Covered** (timing hard-coded: R5) | R5 | — |
| Bar scenes without a mission | Trigger `AddBarEvents` + `AddBarEvent <id> "option" "desc"`, gated by `RollProbability` + once-flags; random intercepts on `$option == marketVisitBar` with `RollProbability x score:10` | rules.csv rows | **Partly** (by hand with a `trigger` start; no preset; Play has no bar context) | R6 | Hook presets (G5) |
| Contact mission pool | `person_missions.csv` by person, or by tag pool (`tagsAll/Any/NotAny` against the person's tags + faction) | CSV rows | **Covered** for one named person; tag pools not offered | R5 | People page |
| Random encounters near the player | `enc/EncounterManager.CREATORS` (static list; `getFrequencyForPoint`; point and creator timeouts; points from `EncounterPointProvider`); `NearbyEventsEvent` distress calls (hard-coded); `SensorGhostManager.CREATORS` | Java: `CREATORS.add` in `onApplicationLoad`; `ListenerManager.addListener(EncounterPointProvider)` | **Not covered** | R9 | Encounters (fleet, comm dialog, outcomes), pools |
| Sector-gen themes (derelicts, remnants, ruins, misc; caches, stations) | `SectorThemeGenerator.generators` (static list; weight share of constellations); inside each theme, hard-coded pickers | Java: own `ThemeGenerator` in `onNewGame` | **Not covered** | R10 (scatter by script after gen, not a theme generator) | Locations, R1 criteria, loot, specials |
| Procgen weights (`planet_gen_data`, `condition_gen_data`, `star_gen_data`, `name_gen_data`, …) | CSVs merged by id; new rows with `frequency 0` = placed by hand only | CSV rows | **Not proposed** (global; same reason as in the ruins assessment) | — | Read-only: the condition picker (F1) |

### 4.3 Content added to the sector at runtime

| Kind | Vanilla | Mod way | Coverage | Proposal | Overlaps |
|---|---|---|---|---|---|
| Decivilisation | `intel/deciv/DecivTracker` (stability samples, `deciv*` settings). It leaves `decivilized`, ruins sized by the colony (pre-surveyed), `$wasCivilized`, a neutral owner and a condition-only market; stations become `Misc.setAbandonedStationMarket`. Opt-out `$core_noDeciv` | `ColonyDecivListener`; `DecivTracker.decivilize(...)`; `decivRemove` column on conditions | **Not covered**. Note: **our own markets can decivilise** | F1, F3, R1 criterion, R11 | Ruins, world events, Locations |
| Battle debris and derelicts | `CoreScript.generateOrAddToDebrisFieldFromBattle` (`Misc.addDebrisField`, `addSalvageEntity(WRECK)` with `EXPIRES`) | Own listener + the same helpers | **Not proposed** (engine behavior) | — | — |
| Mission-spawned salvage | `BaseHubMission.spawn*`, removed at the end | Java | **Not covered** | R2 | Loot |
| Random derelicts and distress calls near the player | `NearbyEventsEvent` (hard-coded) | Not extendable | **Not proposed**; R9 gives the same kind of content | R9 | — |
| Route fleets (traders, mercs, scavengers per ruins system, pilgrims, academy, patrols) | `RouteManager` (real fleets only within 1.6 ly of the player); `BaseRouteFleetManager` subclasses (`RuinsFleetRouteManager`: every 1–14 days, small 10 / medium 15 / large 5); `MiscFleetRouteManager.CREATORS`; `MilitaryBase` patrols; `DisposableFleetManager` subclasses | Java: subclass + `sector.addScript`; `RouteManager.addRoute`; `MiscFleetRouteManager.CREATORS.add` | **Partly** (`periodic` keeps one fleet alive at a place) | R14 | Encounters, pools |
| Hidden bases (pirate, Pather) | `PirateBaseManager` (`BaseEventManager`, 2–3 concurrent; system weight by theme tag × stable locations; faction from `"makesPirateBases": true`); `LuddicPathBaseManager` (`patherBaseTypesSmall/Large`) | **Data**: faction `custom` keys | **Partly** (only `engagesInHostilities` in the form) | R13 | Factions page |
| Event intel with progress (colony crises / Hostile Activity, Hyperspace Topography, Tri-Tachyon raiding, Persean League) | `BaseEventIntel`: progress, stages, monthly + one-time factors, **randomized stages** (roll at X, reset below Y, fire at the stage). HA: `addActivity(factor, cause)`; event weight = `getEventFrequency × (0.1 + 0.9 × progress share)`, no repeat; fired events are `FleetGroupIntel` / `GenericRaidFGI` raids and blockades | Java: `ColonyCrisesSetupListener` → `addActivity`; `BaseOneTimeFactor`; own `BaseEventIntel` | **Not covered** (§11.4 intent only) | R12 | World events, pools, Encounters |
| Concurrent random events (person and system bounties, faction hostilities, punitive expeditions) | `BaseEventManager` subclasses; `PunitiveExpeditionManager` (faction anger and threshold, `punitiveExpeditionData`) | Faction custom keys; Java subclasses | **Partly** (`engagesInHostilities` only) | R13, R12 | — |
| 0.98.5a additions | `intel/events/sd/*` (Askonia standoff: `SDDevastation`, `SDResolution`, factors), `SupportFleetSpawner`, `PlanetExplosionScript` (**Sindria can be destroyed**), `MercAbyssExpedition`; HA `ESCALATE_PROGRESS` 550 → 595 | as above | **Not covered**; read-only knowledge | Fixed targets on Sindria need a "target gone" path (see §11); random targets cope by construction | #47 per-mod target version |

---

## 5. Random targets: proposed model (R1–R4, base game)

### 5.1 Vanilla semantics to copy exactly

- **Requires** are AND. **Prefers** are applied in order, and any prefer that would empty the set
  is skipped. The prefer list *is* the fallback chain.
- **Planets, entities and terrain** are picked in two tiers: system first, then the thing in it.
  - The fallback order is preferred-in-preferred, then preferred-in-matching, then
    matching-in-preferred, then any match.
  - A `systemPrefsFirst` switch maps to `searchMakeSystemPreferencesMoreImportant`.
- **Automatic exclusions**: `THEME_HIDDEN` systems, `NOT_RANDOM_MISSION_TARGET`, `EXPIRES`,
  asteroids, and invalid mission markets. The editor shows them as fixed, read-only lines.
- **Nothing found** means the quest isn't offered and the hub offers another. The editor should
  explain this, because designers will expect an error.
- **Vanilla quirks**, documented rather than copied:
  - `pickMarket` and `pickCommodity` ignore system criteria, so the editor hides system criteria
    for market targets and offers market-location criteria instead.
  - `pickTerrain`'s preferred-system tier is always empty (a bug, line ~2483).

### 5.2 Model (replaces `criteria: unknown[]`)

```ts
interface TargetDef {                      // a quest variable of type 'target'
  pick: 'system' | 'planet' | 'entity' | 'market' | 'commodity' | 'terrain' | 'fixed'
  require: Criterion[]                     // AND
  prefer: Criterion[]                      // ordered; each dropped if it empties the set
  systemPrefsFirst?: boolean
  orElse?: TargetDef                       // a second search after resetSearch (ExtractionMission)
  candidates?: { ref: EntityRef; weight: number }[]   // pick 'fixed': a weighted pool of fixed places (§6)
  spawn?: SpawnAtTarget                    // R2
  exclusive?: 'global' | 'per-target'      // setGlobalReference / set*MissionRef
  markUsedForStory?: boolean               // setSystemWasUsedForStory
  facts: string[]                          // R3: facts exposed as tokens and Branch conditions
}
type Criterion = { kind: CriterionKind; mode?: 'all' | 'any' | 'notAll' | 'notAny'; args: unknown[] }
```

| Group | Criteria (all from `HubMissionWithSearch`) |
|---|---|
| System | theme tags; unexplored / not entered for N days; inner sector / fringe; within or outside N ly of the giver, a place or the player; direction (+ "direction of other missions"); black hole / pulsar / nebula / safe stars; has base; has colony of faction; counts (jump points, planets, dense); not used for story |
| Planet | gas giant; populated; tags; conditions; survey level; **ruins (size)**; **unexplored ruins**; not near a jump point |
| Entity | custom entity type; tags; memory flags; undiscovered |
| Market | faction / not / hostile to / custom flags; size; stability; military; spaceport; hidden; memory flag; conditions; industries; tactically bombardable |
| Commodity | legal / illegal; available; demand; surplus / deficit; price |
| Terrain | type; tags; special name |

### 5.3 Runtime, tokens, variations, people

- **Runtime (SagaLib).** `SagaQuest.create()` runs the searches in the listed order.
  - Each result is stored as an **id** in `$global.<q>_<var>`, with facts in
    `$global.<q>_<var>_<fact>`.
  - A stage `marker` may name a target variable.
  - The searches fill the reserved `targets` array; mods that use it must require the newer
    SagaLib.
- **Tokens.** `$<q>_<var>_name`, `_system`, `_dist` (ly from the giver), `_faction`, plus the
  chosen facts. The "token nothing sets" check must know them.
- **Variations (R3).** Facts such as `isDeciv`, `theme`, `hasPulsar`, `ruinsSize` and
  `factionHostile` are read from the **result**. They drive Branch conditions and phrase cases.
- **People (R4).** A `person` variable with "at the target market: post X, else create one of
  faction F" → `getPersonAtMarketPost` / `findOrCreatePerson`.

### 5.4 Play mode can't see the procgen sector (new finding)

The game index only has the core-world markets and the hand-made system positions (§1.1).
Procgen systems, planets, themes, ruins and derelicts exist only in a running game, so Play mode
**can't** draw a real random target for most criteria. Options, to be decided when R1 is built:

| Option | Cost | Notes |
|---|---|---|
| (a) **Designer picks the variation**: Play mode asks "which target?" and offers a mock target with editable facts (name, system, decivilised, theme, …) | S | Always works; tests every variation. **Recommended baseline.** |
| (b) Draw from the hand-made part of the index only (core markets and their factions) | S | Useful for market targets in the core worlds; useless for ruins and themes |
| (c) **Sector snapshot from SagaLib dev tools**: in dev mode, SagaLib writes systems, planets, tags, conditions and markets as JSON through the game's `common` file API, and the editor imports it | M | Real numbers for the zero-match warning. **Verify** the common-file location and size; the write is done by the game in its own folder, never by the editor |

The **zero-match warning** therefore needs (c). Without it, the editor can only check that the
criteria are consistent.

---

## 6. One shared design for random pools (R7)

The findings support **one pool model with several backends**. Vanilla already has a pool for
most uses, and Saga Forge should **write into it**. SagaLib draws only where vanilla has no data
hook.

### 6.1 Model

```ts
interface RandomPool {
  id: string                         // prefixed: vgc_ruins_stories
  draw: 'pickOne' | 'rollEach'       // weighted single pick | each entry rolls its own chance
  about: 'entity' | 'offer' | 'world' | 'newGame'   // what one draw is about: sets the seed and the "once" scope
  count?: number | [number, number]  // draws per use (drop_random's "3-4")
  nothingWeight?: number             // explicit "nothing happens" weight (vanilla's "Nothing" / `nothing` rows)
  extends?: string                   // a vanilla pool we ADD to (e.g. drop group "rare_tech"); never replaces rows
  entries: PoolEntry[]
}
interface PoolEntry {
  id: string
  weight: number                     // pickOne: relative weight; rollEach: probability 0..1
  conditions: string[]               // rules.csv condition syntax, as in Branch cases
  limit?: {
    once?: 'playthrough' | 'entity' | 'target'
    cooldownDays?: number
    max?: number                     // at most N times per playthrough
  }
  then: PoolResult
}
type PoolResult =
  | { kind: 'loot'; item: ItemRef | 'nothing' | string /* wpn_/ftr_/item_ query */ }
  | { kind: 'special'; special: SpecialDef }
  | { kind: 'scene'; quest: QuestRef }                // a story / interjection (a dialog-kind quest)
  | { kind: 'startQuest'; quest: QuestRef }
  | { kind: 'encounter'; encounter: string }
  | { kind: 'place'; template: string; at: TargetDef }  // scatter at new game (R10)
  | { kind: 'event'; event: string }                  // world events (§7)
  | { kind: 'target'; ref: EntityRef }                // fixed-candidate targets
```

### 6.2 Backends: who rolls the dice

| Pool use | Backend | What's written | Needs SagaLib |
|---|---|---|---|
| Salvage loot | vanilla | `drop_groups.csv` rows (`freq` = weight, `nothing` = `nothingWeight`); spec `drop_random` = `group:count` | no |
| Adding to a vanilla drop group | vanilla | extra rows for group `rare_tech` in our file. **Only if the merge verify passes**; otherwise the editor says it can't be done additively and offers a new group instead | no |
| Contact and bar offers | vanilla | `person_missions.csv` / `bar_events.csv` rows (`freq`, `prob`, timeouts, tag pools) | the quest does |
| Story interjections and bar scenes (`rollEach`) | vanilla rules | one rule per entry: conditions + `RollProbability p` + once-flag lines, ending in a hand-back | no |
| Story interjections (`pickOne`) | SagaLib command | `SF_RollPool` (§6.5) | yes |
| Salvage specials and defenders | SagaLib | entity field, or `SF_SetSpecial` / `SF_SetDefenders` drawing from the pool | yes |
| Random encounters (R9) | SagaLib | one `EPEncounterCreator` in `EncounterManager.CREATORS`. Its frequency = the sum of eligible entry weights, then a weighted pick | yes |
| Scatter at new game (R10) | SagaLib | after procgen, per draw: pick a place by `TargetDef`, build the template | yes |
| World events (R12) | SagaLib | event scheduler (§7.2) | yes |
| Fixed-candidate targets | SagaLib | weighted pick in `SagaQuest.create()` | yes |

### 6.3 Seeds (stable results; reloading doesn't re-roll)

| `about` | Seed | Matches vanilla |
|---|---|---|
| entity | `Misc.getSalvageSeed(entity)` mixed with the pool id, through `Misc.getRandom(seed, level)` | `RollProbability`, salvage streams |
| offer | the hub's generation random (`genRandom` in `create()`) | contact and bar offers (30-day refresh) |
| world | a seed stored once in `$global.sagaforge_seed`, mixed with the pool id and a draw counter | stored seeds in `BaseEventManager` users |
| newGame | derived from the sector seed (**verify** which seed is available when SagaLib builds after procgen; vanilla themes use `StarSystemGenerator.random` during generation) | theme generators |

- The `rollEach` backend uses vanilla `RollProbability`. Its seed includes the **month**, so a
  failed roll can succeed on a visit next month. Document this ("may appear on a later visit"),
  don't fight it.
- Results that must persist are **memory keys** (once-flags, the picked entry), never Java
  objects (the PLAN §6 save rule).

### 6.4 Editor and checks

- A **Pools** section on the Saga page, next to the flags registry, plus inline editing where a
  pool is used (a Loot tab on an entity, a "random scene" start).
- Each entry shows its **effective chance** (weight / total, after conditions in the current test
  context) and the "nothing" share.
- **Play mode:** roll, or **force entry X**. Test profiles can force a result (honored in dev mode
  only).
- **Flags registry:** generated once and cooldown flags are listed as "generated by pool X".
- **Checks:**
  - an entry that can never be eligible → Warning;
  - a pool with total weight 0 → Error;
  - a `pickOne` pool without SagaLib → Error, with the fix "use rollEach or add SagaLib";
  - `extends` while the merge is unverified → Warning.
- **Never replace vanilla rows** (project rule). `extends` only appends; "copy vanilla's values"
  creates a new id.

### 6.5 Hand-off notes: `SF_RollPool`

**Why it's needed.** Vanilla rules can't do a weighted "pick exactly one".
- `FireBest` picks by specificity and score, and `RollProbability` rolls each rule on its own.
- So with three stories at 0.3 each, the result can be "none" or "the most specific one wins".
  It is never "A 50%, B 30%, C 20%".
- Vanilla's own salvage stories live with that. A modder who wants real weights needs a command.

**Shape** (a rule command, like vanilla's `RollProbability`):

```
SF_RollPool <poolId> [scope]          scope: entity (default in an entity dialog) | global
```

1. Read the pool from SagaLib's content index: `data/sagaforge/pools/<id>.json`, the same
   `RandomPool` JSON as §6.1, listed in `content.csv` like other content.
2. Keep the eligible entries:
   - every condition line is true (evaluated with SagaLib's existing condition engine,
     `RuleCommands.conditions`, against the dialog's memory map);
   - the once / cooldown / max limit isn't used up.
3. Seed:
   - `scope entity`: `Misc.getRandom(Misc.getSalvageSeed(target) ^ hash(poolId), drawCount)`;
   - `scope global`: the stored `$global.sagaforge_seed` with the same mixing.

   `drawCount` is a counter in memory (`$<pool>_draws`), so a second draw on the same entity
   differs from the first, but a reload gives the same sequence.
4. Pick with a `WeightedRandomPicker`, including the `nothingWeight` entry.
5. Write the result:
   - `$sagaforge_pick = <entryId>` (or `nothing`) on the **local** memory (expire 0, like vanilla's
     dialog-scoped keys);
   - also `$<pool>_last = <entryId>` on the entity or global memory, so later rules can refer to
     it;
   - mark the limit: `$global.<pool>_<entry>_done`, or `$<pool>_<entry>_done` on the entity, or a
     timed key for cooldowns.
6. Return `true` if an entry (not `nothing`) was picked, so the command also works as a
   **condition** ("this rule only matches if the pool gives something"), like `RollProbability`.

**Export pattern** (generated by the editor):

```
rule <pool>_roll      trigger: <hook>      conditions: <hook conditions> ; SF_RollPool <pool>
                                            script:     FireBest <pool>_picked
rule <pool>_<entryA>  trigger: <pool>_picked  conditions: $sagaforge_pick == <entryA>   → the entry's scene
rule <pool>_<entryB>  trigger: <pool>_picked  conditions: $sagaforge_pick == <entryB>   → …
rule <pool>_nothing   trigger: <pool>_picked  conditions: $sagaforge_pick == nothing    → hand back (Link menu / salvage preset)
```

The `<hook>` rule must itself satisfy the takeover check (F2): it is an interjection gated by the
pool, and every path ends in a hand-back.

**Open points for the builder:**
- **Seed source when the dialog has no target** (a bar, a comm link): fall back to the market's
  or person's id hash, or the global seed. Decide, then document in FORMAT.md.
- **Condition evaluation context.** SagaLib's condition engine must see the same memory map as
  the rule (`$entity`, `$market`, `$player`, `$global`). It already does for `requires`, but test
  this against a salvage dialog.
- **Golden tests:** add pool cases to `test/golden` so the editor's Play mode and the Java runtime
  pick the same entry from the same seed. This needs a shared, deterministic PRNG and **not**
  `java.util.Random` semantics re-implemented loosely: either port `java.util.Random`'s LCG
  exactly to TypeScript, or have Play mode show the distribution rather than reproduce the
  in-game pick.
- **Limits when the player reloads** before the scene finishes. Mark the limit when the entry's
  scene starts (at pick time), like vanilla's `$didSpecialExploreStory`, which is set at the start
  of the story.
- **Save safety:** only memory keys are written. A removed pool or entry leaves harmless keys
  behind; an unknown pool id logs an error and returns false (no crash), as other `SF_` commands
  do.
- **The same picker code** is reused by every other SagaLib backend (specials, random encounters,
  scatter, world events, fixed-candidate targets). Build it once as `core/Pools.java` (pure,
  testable, like `QuestLogic`) with a thin game wrapper.

### 6.6 Why not separate pickers

Ruins specials, story interjections, drop groups, fixed-candidate targets, random encounters and
world events all need the same five fields: weight, conditions, once/cooldown, seed, result.
Built separately, modders would face four ways of saying "once per playthrough" and four Play-mode
UIs.

The only thing that is **not** a pool is the criteria search (§5). It stays its own model;
`TargetDef` is used inside pools (`place`, `target`), and pools inside targets (`candidates`).

---

## 7. Runtime-added content and world events: facts for §11.4

Research §11.4 asked for. Copy into FORMATS.md when Events is designed.

### 7.1 Decivilisation

- A modder's own markets **can decivilise** (zero stability for months).
- Offer **"protect from decivilisation"** per market (`$core_noDeciv`, as pirate bases use).
- Offer **"colony decivilised"** as an event trigger (`ColonyDecivListener`, through SagaLib).
- Let designers build deciv worlds by hand (F1 + `wasCivilized`).

### 7.2 Two vanilla shapes for "world events"

1. **Concurrent random events** (`BaseEventManager`): keep between *min* and *max* alive, check
   every *interval*, and create one by weighted pick. Bounties, pirate bases and faction
   hostilities work this way.
   - Proposed SagaLib **event scheduler** with exactly these fields, drawing from a pool
     (`about: 'world'`).
   - Each event = conditions + actions (the quest Action nodes) + an optional news intel with a
     duration.
   - It runs on SagaLib's existing manager tick and trigger queue.
2. **Progress events** (`BaseEventIntel`): a progress bar, factors (monthly and one-time), and
   stages. A randomized stage rolls an outcome when progress crosses a threshold. Colony crises
   work this way. Two ways in:
   - **(a)** Add a factor and cause to Hostile Activity (`ColonyCrisesSetupListener` →
     `addActivity`). That needs a data-driven `BaseHostileActivityFactor` in SagaLib, which is
     large, must stay save-compatible, and changes the crisis for every player.
   - **(b)** A mod's **own** progress event: a SagaLib `BaseEventIntel` subclass driven by JSON
     (stages, factors fed by flags and quest outcomes, randomized stage outcomes from a pool).
     **Recommended first.**

### 7.3 Fleets that come and go

`periodic` Encounters cover "always one at this place". Missing are **roaming fleets** (R14) that
exist only near the player and travel between places. Vanilla does this with
`RouteManager.addRoute` + `RouteFleetSpawner`, or with a `MiscFleetRouteManager.CREATORS` creator
(pilgrims). Proposed: `spawn.when: 'roaming'`, with source and destination targets, a frequency
and a cap, run as one SagaLib route source.

### 7.4 Data-only hooks in faction files (R13)

These faction `custom` keys drive runtime content with no code:
- `makesPirateBases`, `pirateBaseStationTypes`
- `patherBaseTypesSmall/Large`
- `engagesInHostilities` (already in the form)
- `punitiveExpeditionData` (`vsCompetitors`, `vsFreePort`, `canBombard`, `territorial`)
- `postsNoBounties`

They belong in a "Behavior" group of the Faction form for **additions**. On **overrides** of
vanilla factions they are a scripted, clearly marked change (PLAN §4.1), because they change
vanilla's sector.

### 7.5 General extension mechanisms seen (for SagaLib design)

- `sector.addScript` (guarded by `hasScript`).
- Schedulers to subclass: `BaseEventManager`, `BaseRouteFleetManager`, `DisposableFleetManager`.
- `RouteManager.addRoute`.
- `ListenerManager` listeners: `ColonyDecivListener`, `ColonyCrisesSetupListener`,
  `EncounterPointProvider`, `EconomyTickListener`, `DiscoverEntityListener`, …
- `GenericPluginManager` (priority-based, **not** weighted).
- `CampaignPlugin` `pick*`.
- Static registries filled in `onApplicationLoad` (`EncounterManager.CREATORS`,
  `MiscFleetRouteManager.CREATORS`, `SectorThemeGenerator.generators`).
- `BaseEventIntel.addFactor`.

---

## 8. Overlap summary

| Shared piece | Used by | Rule |
|---|---|---|
| **Pool model** (§6) | loot, specials, defenders, story interjections, bar scenes, random encounters, scatter, world events, fixed-candidate targets | one model, one limits vocabulary, one SagaLib picker (`core/Pools.java`) |
| **TargetDef** (§5) | random quest targets, spawn-at-target, Encounters `at`, scatter placement, world-event locations | one criteria model mapped to `HubMissionWithSearch` |
| **Loot tables** (F7) | ruins, derelicts, custom entities, spawned caches (R2), scatter templates (R10), rewards | drop groups are pools with the CSV backend |
| **Encounters** | defenders (F7), near-target spawns (F5), random encounters (R9), roaming fleets (R14), event raids (R12) | one fleet form; new spawn kinds, not new fleet editors |
| **Flags registry** | once / cooldown flags from pools, entity flags (F2), target facts (R3) | generated keys are listed with their generator |
| **Takeover check** (§6 rule 5) | Arrive (F2), interjections, `SF_RollPool` hooks | one check with three results |

---

## 9. Proposed additions (for #36 to consolidate)

The F*n* items are in §3. These are new:

| Id | Addition | Size | Suggested grouping |
|---|---|---|---|
| R1 | **Random targets**: `TargetDef`, SagaLib → `HubMissionWithSearch`, ids in memory, tokens, a zero-match explanation | M | Random content |
| R1b | **Play mode for targets**: designer-picked mock targets (§5.4 a); optional dev-mode sector snapshot (§5.4 c) | S (+M for c) | Random content |
| R2 | **Spawn at target**: mission node, derelict, debris, cache with loot, graveyard, custom entity; can wait for a stage; removed at the end | M | Random content |
| R3 | **Target facts and variations**, read from the result; Branch and phrase conditions | S | Random content (with R1) |
| R4 | **People at the target** (post at the market, else created) | S | Random content |
| R5 | **Offer timing fields** (bar duration and timeouts, contact timeouts, `priority` / `non_repeatable`) and **tag-pool contact starts** (`tagsAll/Any/NotAny`) | XS | Planets (small), or #36 directly |
| R6 | **Bar scene start** without a mission (`AddBarEvents` + `AddBarEvent`, probability, once-limit; Play-mode bar context) | S | Planets |
| R7 | **Shared random pool model** (§6) incl. `SF_RollPool` (§6.5), `core/Pools.java`, chance view, force-entry, generated flags, checks | M | Random content, **first** |
| R9 | **Random encounters** from a pool, through one SagaLib `EPEncounterCreator` | M | Random content or Events |
| R10 | **Scatter at new game**: place entity templates in N systems chosen by `TargetDef`, with loot, specials and defenders, sector-seeded, with existence checks | M | Random content |
| R11 | **Decivilisation**: "protect from deciv" toggle (Planets); deciv event trigger (Events); deciv criterion (R1) | S | split |
| R12 | **World events**: a SagaLib event scheduler (`BaseEventManager` shape) and the mod's own progress events (`BaseEventIntel` shape); Hostile Activity factors later | L | Events (§11.4) |
| R13 | **Faction runtime keys** in the Faction form (bases, punitive expeditions, bounties) | S | Planets or #36 (Faction form) |
| R14 | **Roaming fleets** (`spawn.when: 'roaming'`, a SagaLib route source) | M | Random content or Events |

Order constraints:
- F2 before #36's test mod, and not in parallel with #36's export edits (§3).
- R7 before F7, R9, R10, R12 and R14.
- R1 before R2, R3, R4, F5's target part, R10 and F8.
- F6 before F7.

---

## 10. In-game verifies to add (INGAME-CHECKS), each with a fallback

- **`drop_groups.csv` merge** (F6): does a mod's row for an existing group append, and does a
  duplicate `commodity`+`group` row replace or add? Fallback: new groups only, referenced from our
  own specs.
- **Condition-only market from SagaLib** shows "Explore the ruins" (F1).
- **`$salvageSpecId` set by an interjection** before `CheckSalvageSpecial` is the one
  `BeginSalvage` uses (F7/G3). Fallback: the `PopulateOptions` re-set (RUINS-ASSESSMENT G3).
- **Arrive as a `PopulateOptions` option** at a planet, a station and a wreck (F2). At a wreck,
  `SF_BackToMenu` closes the dialog when nothing is added.
- **`SF_RollPool` stability**: same entity and pool give the same result after a reload (R7).
- **A random target with zero matches**: the quest isn't offered and the contact offers another
  (R1).
- **Sector snapshot write** through the game's common-file API in dev mode (R1b option c): where
  it lands, and its size on a full sector.

---

## 11. Not covered or not looked at by this assessment

So #36 knows where the research stops:

| Topic | Status | Why it may matter |
|---|---|---|
| **Cross-mod content** (MagicLib bounties, other mods' pools, rows that replace vanilla ones) | Out of scope (decision 2) | The cross-mod tasks do their own research. One base-game fact found on the way is kept here: the `drop_groups.csv` merge verify (§10) |
| **0.98.5a in depth** | Only differences spotted while reading 0.98a: the `sd/*` events, `SupportFleetSpawner`, `PlanetExplosionScript`, the HA threshold, `parts` drop groups | A full pass over `api-new` for new random pools was not done. **Fixed targets on markets that can now disappear** (Sindria) need a "target gone" path in quests: not designed |
| **Custom interaction plugins** for spawned or scattered entities (`CampaignPlugin.pickInteractionDialogPlugin`, `custom_entities.json` interaction settings) | Not looked at | R2 and R10 entities use the rule-based dialog by default; whether that's always true for every entity type is unverified |
| **Officer, admin and name pools** (sleeper-pod officers, `CryopodOfficerGen`, `name_gen_data`) | Noted only | "Random person" results in pools (R4, specials) could use them |
| **News intel** (`BaseIntelPlugin` news, `Global.getSector().getIntelManager()` notifications) | Not looked at | World events (R12) need it for "the sector changed" messages |
| **Codex** (0.98a codex entries for new entities and items) | Not looked at | Scattered or spawned content may need codex entries or `hide_in_codex` |
| **Abyss, hyperspace terrain, slipstreams** as places | Not looked at beyond the encounter creators | Targets "in hyperspace" or in the abyss: vanilla criteria exist (`requireMarketNotInHyperspace`, abyss flags), but they aren't catalogued |
| **Story missions** (Galatia Academy, Ziggurat) beyond their search patterns | Only the search and variation code read | Their stage triggers (`beginWithinHyperspaceRangeTrigger` and others) are a fuller list of "when" options for F5 and R2 |
| **`HubMissionWithTriggers` trigger catalogue** | Partly (spawn and location triggers) | A complete list would give R2, F5 and R12 a shared "when" vocabulary |
| **Performance and save size** of SagaLib pools, scatter and snapshots | Not looked at | Scatter with N = 50 entities (as some mods do) and a sector snapshot both need measuring |
| **`RollProbability` seed formula** | Read by the research pass, not checked line by line | §6.3 relies on "stable per target and month"; check the source before documenting it in FORMATS.md |
| **Procgen weights as a feature** | Not proposed on purpose | Global and hard to undo (same reason as in the ruins assessment) |
| **Player-built objectives, colony abandonment, market takeovers** | Mechanisms noted (`BuildObjectiveTypePicker`, `AbandonMarketPlugin`), not assessed | Probably out of Saga Forge's scope; possible world-event triggers |
