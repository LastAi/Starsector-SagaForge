# Converting an existing mod into Saga Forge (a guide for an AI)

Request R12 (INGAME-CHECKS "Open questions"), Phase 8e. This document is written **for an AI
assistant** (for example a Claude Code session) that a modder asks to bring an existing Starsector
mod into Saga Forge. A modder can read it too: it says what the AI will do and what it can't.

The goal: after the conversion the modder opens the mod in Saga Forge and finds its quests, people,
items, locations, encounters, events and dialog as **plans** they can edit, export and play, and a
**list of what stayed in code** (things Saga Forge can't express).

---

## 0. Before anything

- **Licence.** Only convert a mod the user made, or one whose licence or author allows it. Ask the
  user if you don't know. Never copy another author's files into the user's mod without that.
- **Work on a copy.** Make a copy of the mod folder (for example `<mod>_sf`) and convert the copy.
  Never change the original, the game folder or other mods.
- **The authorities.** This guide summarizes; the exact schema is in Saga Forge's source:
  `src/shared/model.ts` (every plan type, with comments), `src/shared/serialize.ts` (which file
  holds what), and SagaLib's `docs/FORMAT.md` (what the exported runtime files do in game).
  Read them when a field is unclear. Saga Forge's `docs/FORMATS.md` has the verified engine facts
  (how rules.csv, factions, drop groups, token replacement, routes and events behave).
- **The target game version** is the one the mod's `mod_info.json` names. If it differs from the
  installed game, mention it; Saga Forge's migration report handles the rest.

## 1. What Saga Forge reads already, and what it doesn't

| In the mod | Saga Forge without conversion | After conversion |
|---|---|---|
| `data/world/factions/*.faction`, `factions.csv` | **Read and edited directly** (additions and overrides) | nothing to do |
| `rules.csv` rows written by hand | kept untouched, shown on the Dialog page | conversations → **quest plans** (§4.6) |
| `commodities.csv`, `special_items.csv`, `descriptions.csv` rows | kept untouched | → **items** and **descriptions** plans |
| `person_missions.csv`, `bar_events.csv`, mission Java classes | kept untouched | → **quest plans** with a contact or bar start |
| Star systems, planets, markets, people made in Java | invisible | → **locations** and **people** plans |
| Fleets spawned in Java (scripts, listeners) | invisible | → **encounters** (quest-stage, periodic, near the player, roaming) |
| Event managers / event intel in Java | invisible | → **world events** / **progress events** |
| `drop_groups.csv` | kept untouched | → **pools** (`use: "loot"`, with `addsTo` for rows added to vanilla groups) |
| Anything else in Java | invisible | **listed as unconverted** (§5) |

## 2. Saga Forge's plan files (what you write)

All under `<mod>/sagaforge/`, JSON, each with `"format": 1`. Ids are lowercase `[a-z0-9_]`, start
with the mod's **prefix** (`project.json` › `prefix`, e.g. `vgc_`), and **keep the ids the original
mod used** wherever saves or other mods may know them (see §3).

| File | Holds (type in `model.ts`) |
|---|---|
| `project.json` | `ProjectFile`: `prefix`, options, ignores, owned quest ids, release details |
| `quests/<id>.quest.json` | `QuestPlan`: a quest or conversation as a graph (`nodes`, `edges`), its `start`, `stages`, `variables`, `rewards`, `requires` |
| `people.json` | `{ "people": PersonDef[] }`: name, faction, rank, post, portrait, placement, contact, phrases |
| `phrases.json` | `{ "phrases": Phrase[] }`: mod-wide conditional texts (`$prefix_token`) |
| `items.json` | `{ "items": ItemDef[] }`: commodities and special items with their CSV columns |
| `descriptions.json` | `{ "descriptions": Descriptions }`: `"<TYPE>:<id>"` → text1..3 |
| `locations/<id>.system.json` | `StarSystemDef`: a new system (`kind: "new"`) or additions to a vanilla one (`kind: "existing"`), its `entities` (planets, stations, belts, jump points, custom entities, markets) |
| `encounters/<id>.encounter.json` | `EncounterDef`: a fleet, where and when it spawns, behaviour, flags, comm dialog, outcomes |
| `fleets.json` | `FleetPlans`: named fleet templates (exact ships and names) and fleet type names |
| `types.json` | `ModTypes`: the mod's own custom entity and planet types |
| `names.json` | `NameLists`: person name pools, ship name lists |
| `pools.json` | `{ "pools": PoolPlan[] }`: random pools (branches, encounters, loot tables) |
| `events.json` | `{ "events": EventSchedulerPlan[] }`: world event schedulers (§4.8) |
| `progress.json` | `{ "progress": ProgressEventPlan[] }`: progress events (§4.8) |
| `scatter.json` | `{ "scatter": ScatterPlan[] }`: objects placed in random places at new game |
| `factions.json` | `FactionsRuntime`: starting relations and scripted faction changes |
| `test-profiles.json` | `{ "profiles": TestProfile[] }`: dev-mode test starts (useful for §6) |

Positions (`x`, `y` of quest nodes, Saga card positions) only matter for the editor's layout:
place nodes left to right in the order the conversation flows, about 240 apart.

## 3. Ids and saves (the most important rule)

Players' saves remember ids: quest ids and their stage ids (`$global.<quest>_step`), memory flags,
person ids, market and entity ids, faction ids, item ids, system tags. **A converted mod must keep
them**, or players lose their progress when they update.

- Use the original id as the plan id even when it doesn't start with the prefix (Check mod will
  warn about the prefix; ignore that warning with the reason "kept from before Saga Forge").
- Keep memory keys the original code sets (`$global.mymod_metBoss`) as they are: write them as
  `set` actions and conditions.
- A quest the original code ran as a Java `HubMission` keeps its mission id; its stages become
  plan stages whose `id` is the original stage enum's name in lower case, with `renamedFrom` listing
  any other name the saves may hold.
- Never invent a new id for something that already exists in players' saves.

## 4. Mapping code and data to plans

Read the mod's `src/` if it ships one. Otherwise look into the jar: `jar tf` lists the classes,
`javap -c -p` shows what a method calls (a decompiler shows it more readably, if the user has
one). The **vanilla API calls** tell you what the code builds:

### 4.1 Star systems (`SectorGeneratorPlugin`, `onNewGame`, `ModPlugin`)

| Code | Plan |
|---|---|
| `sector.createStarSystem("Name")`, `setBackgroundTextureFilename`, `getLocation().set(x, y)` | `StarSystemDef` `kind: "new"`, `name`, `hyperspace: [x, y]` |
| `system.initStar(id, type, radius, corona)` / `initNonStarCenter()` | `star` (type, radius, corona) / `starless` with `light` |
| `system.addPlanet(id, focus, name, type, angle, radius, orbitRadius, days)` | entity `kind: "planet"` with `orbit` `{ focus, angle, radius, days }` |
| `addPlanet` around a planet, `addCustomEntity` (stations, comm relays, nav buoys, sensor arrays, others), `addAsteroidBelt`, `addRingBand`, `JumpPointAPI`, a derelict ship | entity `kind`: `moon`, `station`, `commRelay`, `navBuoy`, `sensorArray`, `custom`, `asteroidBelt`, `ring`, `jumpPoint`, `derelict` |
| `planet.getMarket().addCondition(...)`, `setSurveyLevel` | entity `conditions`, `surveyed` |
| `Global.getFactory().createMarket(id, name, size)` + `addIndustry`, `addSubmarket`, `setFactionId`, `getEconomy().addMarket` | entity `market` (`MarketDef`: id, name, size, faction, conditions, industries, submarkets) |
| `getStarSystem("Corvus")` then add to it | `kind: "existing"` with the vanilla system's id as `id` |
| `autogenerateHyperspaceJumpPoints` | done by SagaLib for every new system |

### 4.2 People (`ImportantPeopleAPI`, `createPerson`, `ContactIntel`)

| Code | Plan |
|---|---|
| `createPerson()`, `setId`, `setName(new FullName(first, last, gender))`, `setFaction`, `setRankId`, `setPostId`, `setPortraitSprite`, `setVoice` | `PersonDef` |
| `market.getCommDirectory().addPerson(p)`, `market.addPerson(p)` | `placement: { at: "market", market, inCommDirectory }` |
| `ContactIntel.addPotentialContact`, contact tags | `contact` (types, importance) |
| Texts that change with conditions | `phrases` (cases with `when` conditions) |

### 4.3 Items and descriptions

- Rows of the mod's `commodities.csv` / `special_items.csv` → `ItemDef` (the editor keeps the CSV
  columns; copy the values). Descriptions rows → `descriptions.json` (`"RESOURCE:<id>"`,
  `"CUSTOM:<id>"`, `"PLANET:<id>"`, …).

### 4.4 Quests (`HubMissionWithBarEvent`, `HubMissionWithSearch`, `BaseHubMission`, `person_missions.csv`, `bar_events.csv`)

| Code | Plan |
|---|---|
| `person_missions.csv` row (person, mission class) | `start: { kind: "contact", person, … }` |
| `bar_events.csv` row | `start: { kind: "bar", … }` |
| `setStartingStage`, `setSuccessStage`, `setFailureStage`, stage enum | `stages` (id, title, journal, nextStep), `end` nodes with `outcome` |
| `addStageDescription`, `getStageDescriptionText`, `addNextStepText` | stage `journal`, `nextStep` |
| `requireSystem…`, `preferMarket…`, `pickSystem()` etc. (`HubMissionWithSearch`) | a `target` variable (`TargetDef`: `pick`, `require` / `prefer` criteria; the editor's criteria list mirrors vanilla's) |
| `setCreditReward`, `setRepFactionChangesMedium`, `addRewards` | `rewards` |
| `spawnEntity`, `spawnDerelict` | the `spawnAtTarget` action |
| `beginStageTrigger` + `triggerCreateFleet…` + `triggerSpawnFleetNear` | an **encounter** spawned at that stage (`spawn.when: "quest-stage"`, `quest`, `stage`) |
| `makeImportant(entity, flag, stage)`, arriving at it | `wait` node, `mode: "arrive"`, with the entity |
| `setTimeLimit`, days passing | `wait` node `mode: "days"` |
| `callEvent` / `callAction` in its rules | its dialog (§4.6) |

### 4.5 Fleets

| Code | Plan |
|---|---|
| `FleetFactoryV3.createFleet(new FleetParamsV3(...))` at a place, kept or respawned | `EncounterDef` with `spawn.when` `"periodic"` / `"new-game"` / `"player-near"` |
| A fleet only during a quest stage | `"quest-stage"` |
| `addVariant` lists, a named flagship captain | `fleet.size: "template"` + a `fleets.json` template |
| `addAssignment(ORBIT_AGGRESSIVE / PATROL_SYSTEM / GO_TO_LOCATION …)` | `behavior`: `ambush`, `guard`, `patrol`, `intercept-player`, `travel` |
| `RouteManager.addRoute` between markets, `BaseRouteFleetManager` | `spawn.when: "roaming"` (`at`, `to`, `days`, `max`, `stayDays`, `roundTrip`) |
| `MemFlags.MEMORY_KEY_MAKE_HOSTILE`, `…NO_REP_IMPACT`, important | `flags` |
| A comm-link greeting in rules (`OpenCommLink` with the fleet's flag) | a comm dialog quest (§4.6) |
| `EncounterManager.CREATORS` (random encounters) | an encounter **pool** (`use: "encounters"`, `points`) |

### 4.6 Dialog (rules.csv): "adopt hand-written dialog" (PLAN §11.6)

Each conversation becomes one `QuestPlan` (`kind: "dialog"` if it has no stages, else `"quest"`):

- The first rule's `trigger` and `conditions` → the `start` (`kind: "trigger"` for any trigger, or
  `"option"` for an option added to a place's menu on `PopulateOptions`).
- Each rule that shows text and options → a `dialog` node: `text` (paragraphs as in the CSV; `OR`
  variants stay), `options` (`id`, `text`, `tooltip`, conditions on their own small rule),
  `highlights` (from `SetTextHighlights`), displays (`AddText`, `ShowImageVisual`…).
- An option's follow-up rule (`$option == <id>`) → an edge from that option to the next node.
- Several follow-ups chosen by conditions → a `branch` node (cases with conditions).
- Script lines → an `action` node with the matching ops (`set`, `unset`, `credits`, `rep`,
  `item`, …); anything without an op stays as a `line` op (any rules.csv script command).
- `FireBest X` / `FireAll X` to another trigger → a `link` node (`mode: "trigger"`).
- `ShowDefaultVisual`, `EndConversation`, back to the place's menu → `link` nodes (`mode: "menu"`).
- Keep the original **rule ids out**: Saga Forge writes its own owned blocks. After converting a
  conversation, **delete its hand-written rows** from the copy's `rules.csv` (otherwise both run).
  Keep rows you didn't convert.

### 4.7 Loot and random content

- `drop_groups.csv` rows of the mod's own groups → `PoolPlan` `use: "loot"`; rows that add to a
  vanilla group → the same with `addsTo: "<vanilla group>"`.
- `addDropRandom` / `addDropValue` on a salvage entity → the entity's `loot`;
  `Misc.setDefenderOverride` → `defenders`.
- Objects placed in random systems at new game → `scatter.json`.

### 4.8 Events

| Code | Plan |
|---|---|
| A `BaseEventManager` subclass making intel now and then (bounties, raids, news) | an **event scheduler** (`events.json`): min/max running, interval, events with weight, conditions, duration, news item, start/end actions |
| A one-off news intel (`BaseIntelPlugin` / `FleetLogIntel` with a title and text) | a world event's `news` |
| A `BaseEventIntel` subclass (progress bar, stages, factors) | a **progress event** (`progress.json`): stages with actions or random outcomes, monthly factors with conditions; one-time factors → "Add progress" actions where the code called `addFactor` |
| Code that changes a faction's relations over time | `factions.json` scripted changes |

## 5. What stays in code: the "unconverted" list

Convert a script when its **effect** can be expressed in plans (a system, a person, a quest step,
a fleet, an event). When it can't (custom combat or ship code, hullmods, UI panels, abilities,
industries' effects, economy changes, AI, anything reading or writing data Saga Forge has no form
for), **leave it in the copy unchanged** and list it.

Write `sagaforge/UNCONVERTED.md` in the copy (Saga Forge ignores it; releases leave the folder out):

```markdown
# Not converted (stays in code)

| Class or file | What it does | Why it can't be expressed | Still needed? |
|---|---|---|---|
| data.scripts.MyIndustry | +2 stability per AI core installed | industry effects have no Saga Forge form | yes: keep the jar |
| data/hullmods/... | ... | ... | ... |
```

Then tell the user, in plain words: what was converted, what is in this list, and whether the mod
still needs its jar (it does as long as any row says "yes").

## 6. Checking the result

1. Open the copy in Saga Forge (it becomes the active mod). Fix every **error** in Problems; read
   the warnings (each says what goes wrong in game). Use **Check mod** to compare with the game and
   every installed mod.
2. Use **Play** on each quest: the conversation should read and branch as the original did.
3. **Export** (it writes rules.csv blocks and SagaLib's JSON into the copy; hand-written rows stay).
   The copy now needs **SagaLib**; Export adds the dependency.
4. Add **test profiles** (Saga › Test profiles) that start at each converted quest's stages and
   at the converted places (`startAt`), so the user can jump there with Ctrl+F9 in dev mode.
5. Give the user an in-game checklist in plain words: for each converted piece, where to go and
   what they should see, compared with the original (the original and the copy must not be enabled
   together: they share ids).
6. Save compatibility: load a save made with the original mod into the copy. Quest stages, people
   and places should carry on. Saga Forge's save warnings (Problems › Save warnings) list ids that
   changed.

## 7. Report to the user

End with a short summary: the plan files written (by kind and count), the rows removed from the
copy's rules.csv, the unconverted list, what to test in game (the checklist), and any id that had
to change (with why). Ask before anything that would change the original mod.
