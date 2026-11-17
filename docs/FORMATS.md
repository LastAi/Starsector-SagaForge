# Saga Forge: how the game reads and merges files (0.98a-RC8)

The facts Saga Forge's readers and writers rely on (PLAN.md §6). What changed in 0.98.5a-RC5 is in
the last section, [Starsector 0.98.5a](#starsector-0985a-code-2026-11-12). Each fact says how it
was checked:

- **code**: read in the game's engine (`starfarer_obf.jar`, disassembled with `javap`) or API
  source (`starfarer.api.zip`).
- **in game (pending)**: still to be confirmed with the test mod `mods\SagaForgeFormatTest`. See
  [INGAME-CHECKS.md](INGAME-CHECKS.md), M0.

Short names for obfuscated engine classes: `LoadingUtils` (merged CSV and JSON loading), the CSV
parser `com.fs.starfarer.loading.G`, the rules engine `com.fs.starfarer.campaign.rules.*`.

## Load order (code; game log)

- The game sorts enabled mods by mod_info `sortString`, or by `name` if there is none. It uses
  Java's case-sensitive `String.compareTo`. Folder names, mod ids and dependencies don't change
  the order. The log prints the list as "Running with the following mods (in order of priority)".
- Merged **CSV**: the first row seen for a key wins. Any mod's row beats vanilla's, and between
  mods the highest-priority one wins (earliest in that order). Rows are not merged column by
  column. The same key twice in one file is an error ("Duplicate key").
- Merged **JSON**: vanilla's file is the start, and each mod's file is merged in, in that order.
  For a single value the last mod wins.
- Saga Forge's index follows both rules: `src/main/install.ts` `sortLikeGame`, and `put()` in
  `src/main/gameindex.ts`.

## CSV comments (code)

- A row whose very first character is `#` is skipped by the CSV parser. This applies in every
  merged CSV, including `person_missions.csv` and `bar_events.csv`.
- A quoted `"#..."` row is **not** skipped:
  - In `rules.csv` it is still ignored, because the rules loader also skips ids that start with
    `#`.
  - In `person_missions.csv` it becomes a spec. Vanilla has one, harmless only because it has no
    person and no tags.
  - In `bar_events.csv` it would create an event with no plugin.
- Rule for Saga Forge: owned-block markers are written unquoted, with `#` in column 1:
  `# sagaforge:begin ...,,,,,,`.

## JSON merge (code)

Applies to `.faction`, `settings.json`, `custom_entities.json`, `planets.json`, `sounds.json`,
`terrain.json` and the others loaded through `LoadingUtils`:

- Objects are merged key by key, recursively.
- Arrays are **appended**. If the first element of a mod's array is `"core_clearArray"`, the
  array is emptied first. This is how a mod replaces a list; it also drops what lower-priority
  mods added.
- Exception: a 4-element array whose key contains `color` or `button` (any case), or any array
  whose key starts with `music_`, is **replaced**. So a color in a patch must have exactly 4
  numbers; a 3-number color would be appended to the original. Saga Forge flags that as an Error.
- Single values are overwritten.
- Files listed in mod_info `"replace"` are fully replaced. Saga Forge never writes `replace`.
- `settings.json` ignores mod values for a few launcher keys (`windowLocationY`, `maxMemoryMB`,
  …).

Saga Forge's copy of these rules: `mergeFactionJson` in `src/shared/faction.ts`.

## Factions (code; in game pending)

- `factions.csv` is merged with the `faction` column (the file path) as the key.
- A mod's `.faction` file at the same path as an existing one is merged into it (rules above). It
  doesn't need its own `factions.csv` row. UAF ships `player.faction` this way.
- A new faction needs a `.faction` file and a `factions.csv` row.
- Removing a list entry with a patch is impossible, except by replacing the whole list with
  `core_clearArray`. The editor offers a SagaLib scripted change instead (PLAN.md §4.1).
- **Confirmed in game (2026-11-11):** the test mod's patch turned Hegemony red (4-number color
  replaced) and made food illegal at Hegemony markets, shown in the faction menu (list appended).
  The new faction "Format Testers" showed in the intel tab with its flag and crest.

## Name lists (code, 0.98a; in game pending)

Checked in `PersonNameStore` and `ShipNameStore` (starfarer_obf.jar), 2026-11-15.

- `data/characters/person_names.csv` (`name,gender,usage,category`) is a merged spreadsheet keyed
  on all four columns, so a mod's rows are added to vanilla's.
  - `gender`: contains `m` and/or `f`; empty = both.
  - `usage`: contains `f` (first name) and/or `l` (last name).
  - `category`: one or more ids, split on commas and trimmed. Vanilla has `"old english"` with a
    space; ids with commas are impossible.
- A faction's `names` map (category → weight) is picked twice per person: once for the first name,
  once for the last. If the picked category has no first names (or last names) for the person's
  gender, the game takes a **random category** instead.
- `data/strings/ship_names.json` (list id → names) is merged JSON: a mod's list with an existing id
  is appended to it. A faction's `shipNameSources` (list id → weight) picks from them. The names of
  every list except `OMEGA`, `DERELICT_DRONE`, `THREAT` and `DWELLER` also go into a general pool.
- Saga Forge writes the mod's `person_names.csv` rows in an owned block (`names`). It merges its
  ship lists into the mod's `ship_names.json` by key, and remembers which keys it wrote
  (`project.exported.shipNames`).
- `data/world/factions/default_fleet_type_names.json` (fleet type → name) holds the names fleets
  get when their faction's `fleetTypeNames` doesn't name the type (`FactionAPI.getFleetTypeName`).

## Celestial types and vanilla systems (files and API source, 0.98a)

Checked 2026-11-15 for Phase 3.

**Stars and planets**
- Stars are the `data/config/planets.json` entries with `"isStar": true`. Mods add their own the
  same way (merged JSON).
- Planet textures are 1024×512; star textures are 512×256 or 1024×512.

**Custom entities**
- A `custom_entities.json` entry may set `baseId` and inherit the keys it doesn't set
  (e.g. `comm_relay_makeshift` → `comm_relay` → `base_campaign_objective`).
- Vanilla station sprites are 160×160 PNGs drawn at `spriteWidth`/`spriteHeight` 80, with
  `defaultRadius` 50 and `tags: ["station"]`.
- Saga Forge writes the mod's own types into its `custom_entities.json` and `planets.json`, merged
  by key, and remembers which keys it wrote (`project.exported.entityTypes` / `planetTypes`).

**Vanilla systems**
- Vanilla systems are built in `data/scripts/world/systems/*.java`; Corvus is created in
  `SectorGen.java`, but its bodies aren't in a shipped source file.
- Starmap ids follow the file name or the system name: `Eos.java` makes "Eos Exodus" (id `eos`),
  `TiaTaxet.java` makes "Tia" (id `tia`).
- Westernesse and parts of Galatia, Thule and Tyle use `StarSystemGenerator.addOrbitingEntities`
  (random), so those parts can't be read. Saga Forge's parser reads 451 bodies of 23 systems and
  skips 25 calls.
- SagaLib finds an addition's orbit focus with `getEntityById`, so additions can orbit a vanilla
  body by id. Bodies made with a `null` id get a random id and can't be targeted.

**Random generation** (`StarSystemGenerator`, `procgen/*.csv`)
- Orbit index around a star: `(startingRadius − starRadius − 750 − 250) / (800 × 1.25 + 400)`,
  i.e. about 1400 units per orbit after the first 1000.
- A planet type is possible when
  `habZoneStart + habOffsetMin + habOffset<AGE> ≤ index ≤ habZoneStart + habOffsetMax + habOffset<AGE>`.
- Weight = category frequency × category multiplier (age, star type, …) × type frequency × type
  multiplier. A missing multiplier column is 1 (`CategoryGenDataSpec.getMultiplier`).
- `habZoneStart` by star: yellow 3, red dwarf 2, neutron −3 (`star_gen_data.csv`).

## Faction custom keys (API source, 0.98a)

Read through `Factions.CUSTOM_*`:
- `postsNoBounties`: `SystemBountyManager` skips its markets, and `PirateBaseIntel` doesn't pick it
  to pay a base bounty.
- `makesPirateBases`: `PirateBaseManager.pickPirateFaction` picks among the factions that have it.
- `pirateBaseStationTypes`: station industry → weight. Missing: orbital station 5, mid 3, high 1.
- `patherBaseTypesSmall/Large`: only read for the Luddic Path, because the base manager is
  hard-coded to it.
- `punitiveExpeditionData`: being present lets the faction send expeditions.
  - `vsCompetitors`: commodity competition.
  - `vsFreePort`: the player's free ports.
  - `territorial`: the player's small colonies in systems it claims; these expeditions always
    bombard.
  - `canBombard`: bombard after two successful expeditions.
  - `canSendWithoutMilitaryBase`: its use is commented out.
- Faction `voices`: importance level → voice weights (`FactionAPI.pickVoice(importance)`).
- `variantOverrides`: variant → weight; a hull with a listed variant only uses listed variants
  (vanilla's comment).

## rules.csv (code)

- Loaded as a merged CSV keyed by `id`. When two sources use the same id, only the
  highest-priority one survives. Saga Forge treats a shared id as an Error.
- Column `options`: `[order:]id:text` per line.
- Order when a rule fires (`FireBest.applyRule` in the API source):
  1. **Options** first: the options column plus script commands that add options, sorted. The
     old options are cleared unless the rule keeps them.
  2. Then the **text**.
  3. Then the rest of the **script**.

  So `SetEnabled`, `SetTooltip` and the like find the options already there, and everything a
  script adds to the text panel (`AddText`, "Gained" lines from `AddCredits` /
  `AddRemoveCommodity`, reputation lines) comes **after** the rule's text. For displays placed
  between paragraphs, the export splits the text into `AddText` lines around them (PLAN.md §4.9
  fallback).
- `FireAll`: adds the options of every matching rule first, then text and script per rule.
- A condition line `score:N` adds N to the rule's FireBest score (vanilla: `$id == rao score:1000`).
  FireBest picks the matching rule with the highest score. The score is the number of conditions
  plus any `score:` values.
- A condition line can be negated with a leading `!` (about 1,700 uses in vanilla).
- **Memory expiry**: in a script line `$key = value N`, N is the expiry in days, a negative N never
  expires, and `$key = value 0` expires on the first campaign tick while the game isn't paused.
  Dialogs pause the game, so in practice the key lasts until the dialog closes. Vanilla uses
  `= true 0` 873 times, e.g. `$askedCommission`.
  - **Confirmed in game (2026-11-11):** the show-once option was gone after picking it and came
    back after leaving and docking again. `$playerName` was filled in an option label.
- `ruleCommandPackages` (`settings.json`) lists from every mod are combined. The game searches
  the packages in order, core first, so a vanilla command shadows a mod command with the same
  name. SagaLib's commands all start with `SF_`.
- 0.98.5a loads more than one rules file: see [Rule file list](#rule-file-list-code-in-game-pending).

## Token replacement (code)

- Plugins registered with `RulesAPI.addTokenReplacementGenerator(...)` are applied to a rule's
  text, its option labels and `AddText` lines. After that the game fills tokens from memory
  (`Misc.replaceTokensFromMemory`).
- The list is `transient`: it isn't saved. Vanilla's `CoreLifecyclePluginImpl.onGameLoad`
  re-adds its generators on every load, and SagaLib does the same.
- Tokens are matched case-sensitively. Vanilla registers variants (`$playerName`, `$PlayerName`,
  …) separately.
- **How the game replaces** (`CampaignEngine$3.performTokenReplacement`, read from the jar,
  2026-11-16): it collects every generator's map, sorts the tokens longest first, and runs
  `text.replaceAll("(?s)\\" + token, value)` for each. The **value is not quoted**: a `$` or `\`
  in it is read as a regex group reference (an exception or lost characters), so generators must
  return `Matcher.quoteReplacement(value)` (SagaLib does since Phase 8c). The token itself is a
  regex after the escaped `$`: `.` matches any character, `-` and `_` are literal.
- **Which rule id a generator gets** (FireBest/FireAll.applyRule in the API source; seen in game,
  2026-11-16): the rule's **text** with the matched rule's id, its **script lines** with the rule's
  own id (`RuleAPI.runScript`), but its **option labels and option commands** (tooltips, story
  options, bar scene options: everything run in the options pass) with the id of the rule that
  called FireAll/FireBest, or `null` when the game fires the trigger itself (PopulateOptions,
  DialogOptionSelected). A generator that scopes its tokens by rule id must make option tokens for
  every rule.
- **Rule command parameters** (`Misc.tokenize`): a quoted parameter is a LITERAL even when it
  starts with `$`, so `AddText "$x"` and `SetTextHighlights "$x"` get token replacement (through
  `getStringWithTokenReplacement(ruleId, …)`); an unquoted `$x` is a memory variable. Replaced
  with the firing rule's id: AddText, AddTextSmall, SetTextHighlights, SetTooltip, SetTooltipHighlights,
  AddBarEvent (option, blurb), AddRaidObjective (name). With **another id** (the parameter's own
  text): AddRaidObjective's tooltip, SetStoryOption's log text. **No replacement**: ShowMapMarker's
  title and text (`getString`).

## Hub missions (API source)

- `PersonMissionSpec.createMission()` / `BarEventSpec.createMission()` create the plugin
  instance, call `setMissionId(<row id>)`, and only then does the hub call `create()`. One
  generic class can serve every quest (PLAN.md §3.2).
- Memory keys vanilla writes:
  - `$<id>_stage`: interaction-target memory, expire 0.
  - `$<id>_missionCompleted`: sector memory, when `setCompletedKey()` is used.
  - `$<id>_ref`: on spawned fleets.
  - `$missionImportant`, `$requiredForMissions`.

## Items (code; confirmed in game)

- `commodities.csv` / `special_items.csv`: a row with an existing id replaces the whole row. The
  editor writes rows for new ids only.
- A non-economic commodity needs:
  - a numeric `order` and `stack size`;
  - the columns `id`, `name`, `icon`, `demand class`, `origin`, `price variability`, `sound id`
    and `sound id drop` present (they may be empty);
  - `demand class` = its own id, a base price, and the tag `nonecon`.

- **Confirmed in game (2026-11-11):** the test mod's nonecon commodity showed in cargo with its icon
  and its `descriptions.csv` RESOURCE text. But markets **do** trade it, at price 0: no
  commodity tag stops trading; only illegal goods can't be traded.
- **Quest items are therefore special items** with the tag `mission_item` (vanilla's Janus
  Device, Planetkiller). `BaseSpecialItemPlugin` (and `GenericSpecialItemPlugin`, which extends
  it) refuses to sell them ("Can not remove item"). The Quest item preset makes one. Saga Forge
  gives and takes special items with `AddRemoveAnyItem SPECIAL <id> <n>` instead of
  `AddRemoveCommodity`. Its description is the `desc` column of `special_items.csv`.

## Illustrations (code; confirmed in game)

- `settings.json` → `graphics` → `illustrations` is merged by key, so a mod adds its own keys.
  `ShowImageVisual <key>` shows one.
- **Confirmed in game (2026-11-11):** `ShowImageVisual sfs_test_image` showed the mod's own image.

## Campaign hotkeys and dev tools (code)

- Two ways to react to keys on the campaign map:
  - a `CampaignInputListener` registered with
    `Global.getSector().getListenerManager().addListener(obj, true)`. `true` means transient,
    so it must be re-added on load. Used by sidebarLib, ashlib and AoTD.
  - an EveryFrameScript polling `Keyboard.isKeyDown`. Used by LunaLib and our own mods.
- `getCampaignUI().showInteractionDialog(plugin, target)` opens a dialog from either. It returns
  false if a dialog is already open.
- SagaLib uses the listener, so key presses can be consumed. Its JSON reload re-reads quest,
  people and phrase definitions. Saved objects hold only ids (PLAN.md §6), so reloading them is
  safe. Already-built systems and spawned fleets are not rebuilt.

## The dialog window (measured from a screenshot)

- Text font: `settings.json` `defaultFont` = `graphics/fonts/insignia15LTaa.fnt`. Option buttons
  hard-code `insignia21LTaa.fnt`, and the dialog title uses `orbitron24aabold.fnt`.
- Colors from `settings.json`: `standardTextColor`, `hColor` (highlights), `buttonText`,
  `buttonBg`, `buttonBgDark`, `buttonShortcut`, `storyOptionColor`.
- The window size is hard-coded in the engine, not in `settings.json`. A 0.98a screenshot
  (3440×1440, UI scale 1.25, 2026-11-11) shows:
  - the **text column on the left**, about 500 px wide at 1×, and the visual on the **right**,
    about 480 px (an illustration at its own size), with no frame around either;
  - the text in the order rule text, then script `AddText`, then "Gained" lines;
  - the picked option repeated in the text in the option color;
  - "Gained 1¢" and "Gained 1× Test black box" in green, with no icon;
  - the options as plain lines under "You decide to…": number in the shortcut color, text in
    `buttonText`, keys as `[Esc]`.

  The preview (`dialog` in `src/shared/defs/0.98a.json`: 1000 wide, text 500, visual 480)
  follows this.
- Number keys 1–9 and 0 select the first 10 options. Options beyond 10 have no key. Saga Forge
  warns above 10 options.

## Campaign fleets and dialogs (found in game, 2026-11-11)

- **An asteroid belt's or ring's location is its centre** (the star it circles), not the band.
  A fleet placed "at" the belt sat at the star. SagaLib now places it on the band
  (`BaseRingTerrain.params.middleRadius`), next to the quest stage's marker when that marker is
  in the same system.
- **Quest fleets get fought by patrols.** The pirate ambush was destroyed by Haven's patrols
  before the player met it (the log said "defeated" with no player battle). SagaLib sets
  `FLEET_IGNORES_OTHER_FLEETS` + `FLEET_IGNORED_BY_OTHER_FLEETS` on encounter fleets.
  `FLEET_IGNORES_OTHER_FLEETS` also ignores the player unless `FLEET_DO_NOT_IGNORE_PLAYER` is
  set, as MagicLib's bounty fleets do.
- **A belt made only with `addAsteroidBelt` is hard to see in flight:** just scattered rocks.
  Vanilla adds `addRingBand(..., "misc", "rings_asteroids0", ...)` bands under it; SagaLib's
  SystemBuilder now does the same.
- **Campaign scripts run while a save is still loading.** The game advances them during its last
  loading stages, before the campaign UI exists; `showInteractionDialog` then throws a fatal
  NullPointerException. SagaLib's scripts wait for `Global.getCurrentState() == GameState.CAMPAIGN`
  plus half a second before doing anything.
- **`FireAll PopulateOptions` at a custom entity (a wreck) adds nothing,** so the dialog was left
  with its old options. With SagaLib, a branch ends with `SF_BackToMenu`: that clears the options
  and fires PopulateOptions, and if no rule adds an option it closes the dialog.

## Places, raids and bar scenes (rules.csv and API source, 0.98.5a; Phase 7b, 2026-11-16)

Not checked in game yet (INGAME-CHECKS "Phase 7b").

- **Place presets** (the Test context's "Place"): what vanilla's rules test at each kind of place.
  - Uncolonised planet: `surveyOpen` on `OpenInteractionDialog` with
    `$market.isPlanetConditionMarketOnly` (a condition-only market); it fires
    `FireAll PopulateOptions`, so mods add options there.
  - Ruins: `salRuins_<size>` on `PopulateOptions` with `$market.isSurveyed`,
    `$market.mc:ruins_<size>`, `!$market.ruinsExplored`, `!$tag:gas_giant`; option
    `5:salExplore:Explore the ruins`. `salRuins_alreadyExplored` after.
  - Decivilised world: `surveyOpenDeciv` (score 100) with `$market.wasCivilized` +
    `$market.mc:decivilized`.
  - **A derelict wreck's dialog never fires `PopulateOptions`**: vanilla's salvage rules
    (`PopulateSalvageOptions1/2`) build its menu. An option start at a wreck never shows; use an
    interjection on `salExplore` or a takeover on `OpenInteractionDialog`.
- **Story raids** (`MarketCMD.raidNonMarket`, `AddRaidObjective`; vanilla's bffi, lke and gaATG
  raids): set `$raidDifficulty` (defender strength; 0 = the market's ground defences),
  `$raidGoBackTrigger` (default `PopulateOptions`), `$raidRestrictToTrigger` (only that objective
  in the menu) and `$raidContinueTrigger` (default `OpenInteractionDialog`), all with expiry `0`;
  then `AddRaidObjective <icon> "<name>" <danger> <xp> <trigger> true ["tooltip"]` and the option
  `mktRaidNonMarket`. Danger levels: NONE, MINIMAL, LOW, MEDIUM, HIGH, EXTREME. On success the
  objective's trigger fires (FireAll; vanilla shows text there), then vanilla's result screens,
  then the continue trigger (where the story goes on). "Go back" fires the go-back trigger. **There
  is no failure**: a raid always goes through, only losses vary. The icon is a `raidObjectives`
  id from settings.json (`genericIcon`).
- **Bar scenes without a mission** (`BarCMD`, `AddBarEvent`): when a bar opens, vanilla fires
  `AddBarEvents` (FireAll); `AddBarEvent <option id> "<option>" "<blurb>"` adds an option and a
  description line for this visit only (`$core_tempBarEvents`, expiry 0). The option's text is a
  parameter, so a ":" in it is kept. Picking it fires `DialogOptionSelected`; the scene ends with
  `BarCMD returnFromEvent [true]` (`true` = a "Continue" first). Vanilla gates its scenes with
  flags; a chance is `RollProbability` on the `AddBarEvents` rule. **`RollProbability` is not
  rolled per visit** (found in game, 2026-11-16): its seed is the place's salvage seed, the rule id
  and the **month**, so a place gives the same answer for a whole month (a 50% bar scene is there
  all month or not at all). The bar shows at most `maxBarEvents` (3 in 0.98.5a) of these scenes
  per visit.
- **Fixed vanilla systems are not avoided** (found in game, 2026-11-16: Test Range E was built 200
  units from Mayasura and their stars overlapped). Vanilla's core systems sit at fixed points
  (`data/campaign/starmap.json`, 24 in 0.98.5a, closest pair Corvus/Duzahk 3,065 units apart).
  Vanilla's random systems (`SectorProcGen`) blot out the cells around every system that exists
  when they are made, so they avoid systems a mod builds in `onNewGame`; but nothing moves a mod's
  system off a fixed vanilla one. The editor warns below 3,000 units.
- **Hyperspace clouds around new systems** (reported 2026-11-16 by a modder watching the tests):
  vanilla's `SectorGen` clears the storm clouds around every star system that exists when it
  runs (`NebulaEditor` on the `HyperspaceTerrainPlugin` from `Misc.getHyperspaceTerrain()`: two
  `clearArc` calls, radius = `getMaxRadiusInHyperspace() * 0.5` plus one or two tile sizes, the
  second with noise threshold 0.25). Mods build their systems later, so they must do the same
  (vanilla's TTBlackSite and procgen do). SagaLib 1.2 does it after building each new system, and
  once on load for systems an older SagaLib built.
- **Ruins in a system with a colony are explored at new game** (found in game, 2026-11-16):
  `CoreLifecyclePluginImpl.updateKnownPlanets()` (onNewGameAfterEconomyLoad, new game only) marks
  every system that has a real colony entered, all its planets fully surveyed and their ruins
  explored (`$ruinsExplored`), so "Explore the ruins" never shows there.

## Loot, defenders, encounter points, decivilisation (data and API source, 0.98.5a; Phase 7e)

Not checked in game yet (INGAME-CHECKS "Phase 7e").

- **`data/campaign/procgen/drop_groups.csv`**: `commodity,group,freq`. `commodity` is a commodity
  id, `item_<special item>[:<data>]`, `wpn_<weapon>`, `ftr_<wing>` (vanilla also uses filter syntax
  such as `"item_modspec:{tier:3}"`), or `nothing` (its weight). **A mod's rows are added to
  vanilla's groups** (checked in game 2026-11-16, 0.98.5a, test mod drop_merge_test: a row
  `alpha_core,basic,41` gave alpha cores *and* vanilla's metals from the same group, about half
  each, as the combined weights 41 / 82 predict). So a mod can extend a vanilla group without
  replacing it. **The same row from two mods doesn't add up: one wins** (checked in game
  2026-11-16, test mods eight_a + eight_a_twin, both `alpha_core,ai_cores1,100`: 23 and 20 alpha
  cores of 40 rolls with one mod, 18 and 20 with both; adding up would have given about 26). The
  merge apparently keys rows by item and group, so a second mod's row for an item already in the
  group replaces that row's weight instead of adding to it.
- An entity's salvage rolls its spec's groups plus `SectorEntityToken.addDropRandom(group, chances)`
  and `addDropValue(group, value)`. Defenders: `Misc.setDefenderOverride(entity, new
  DefenderDataOverride(faction, prob, minStr, maxStr, maxSize))`.
- **Random encounters**: `EncounterManager.CREATORS` (a static list) of `EPEncounterCreator`s. At an
  encounter point (`EncounterPoint`: `ep_type_slipstream`, `ep_type_outside_system`, abyssal) each
  creator gives `getFrequencyForPoint` (vanilla's ~10), one is picked by weight and
  `createEncounter` spawns; point timeouts 30–90 days. Vanilla's own fleets lie in wait
  (`ORBIT_AGGRESSIVE`) and despawn with `MissionFleetAutoDespawn`. Creators must hold no state
  (shared across saves).
- **Decivilisation**: `DecivTracker`; `$core_noDeciv` on a market's memory stops it (pirate and
  Pather bases set it). `ColonyDecivListener.reportColonyDecivilized(market, fullyDestroyed)`.
- **Mission spawning** (`BaseHubMission.spawnEntity` / `spawnDerelict` with `LocData` and an
  `EntityLocationType`): tags the entity `REMOVE_ON_MISSION_OVER` and records it as a change, so it
  is removed when the mission ends. `findOrCreatePerson(faction, market, cleanUp, rank, posts…)`:
  an existing post holder, else a new person, removed at mission end if new.

## Mission search (API source, 0.98.5a; Phase 7c, 2026-11-16)

Not checked in game yet (INGAME-CHECKS "Phase 7c").

- `HubMissionWithSearch` (every hub mission, so SagaLib's `SagaQuest`) has `require…` and
  `prefer…` methods per criterion and `pickSystem/Planet/Entity/Market/Commodity/Terrain()`.
  Requires are AND; prefers are applied in order and one that would leave nothing is skipped (the
  prefer list is the fallback chain). Planets and entities are picked system-first in tiers;
  `searchMakeSystemPreferencesMoreImportant(true)` makes a preferred system win over a preferred
  planet elsewhere. `resetSearch()` clears the criteria.
- `pickMarket` and `pickCommodity` ignore system criteria. A few criteria exist only as require
  (`requireSystemHasSafeStars`, `requireSystemNotAlreadyUsedForStory`,
  `requireMarketFactionNotPlayer`).
- Hidden-theme systems, `NOT_RANDOM_MISSION_TARGET`, expiring entities and asteroids are left
  out automatically.
- `create()` returning false (or a pick of null) means the mission isn't offered; the hub offers
  another.
- Text tokens resolve prefixed memory keys: vanilla's own rules use `$global.jethroName` in
  texts, so `$global.<quest>_<var>_name` works.

## World events, news and roaming fleets (API source 0.98.5a and installed mods; Phase 8d, 2026-11-17)

Paths under `api/impl/campaign/` of the API source.

**Concurrent random events, `intel/BaseEventManager`** (bounties, pirate bases, hostilities):
- Abstract `getMinConcurrent`, `getMaxConcurrent`, `createEvent` (null = skip); optional
  `getBaseInterval` (1 day, ×0.75–1.25), `getUpdateMaxInterval` (10 days), `getHardLimit`.
  Every ~10 days the current max walks ±1 between min and max (5 % re-roll); when the interval
  fires and fewer than the current max are active, `createEvent()` is called. **No weighted pick
  built in**: `createEvent` decides. Ending intel isn't counted.
- A sector script found again through sector memory (`$core_personBountyManager`). **Not
  transient**: the manager and its list of events are saved by class name. Its constructor calls
  the subclass's min/max/interval before the subclass's fields exist (a data-driven subclass must
  default, then rebuild its timers). In dev mode a manager with no events runs its timer 1000×
  faster. `addEvent()` is 0.98.5a only.

**News intel**:
- `intel/misc/FleetLogIntel` has a duration (`setDuration`), an icon and removes itself
  (`shouldRemoveIntel`) when its days are over unless marked important: the simplest titled news
  item. A subclass sets `getName`, `createSmallDescription`, `addBulletPoints`,
  `getMapLocation` (an entity or null) and `getIntelTags` (remove `Tags.INTEL_FLEET_LOG`, add
  the tag: `INTEL_MAJOR_EVENT` "Major events", `INTEL_COLONIES` "Colony threats",
  `INTEL_HOSTILITIES`, `INTEL_MILITARY`, `INTEL_EXPLORATION`, `INTEL_STORY`, or any string).
- `getIntelManager().addIntel(intel)` notifies at once; `queueIntel` + `setPostingLocation` +
  `setPostingRangeLY` deliver it in comm range ("local news"). `MessageIntel` +
  `getCampaignUI().addMessage` is a corner message without an intel entry.

**Progress events, `intel/events/BaseEventIntel`** (colony crises, Hyperspace Topography):
- progress 0..max (default 1000); stages `EventStageData` (id, progress, one-off, repeatable,
  icon size, randomized: `setRandomized(id, type, resetAt, rollAt, …)` rolls `rollData` when
  progress reaches rollAt, resets at or below resetAt); factors (`EventFactor`; `BaseEventFactor`
  monthly, `BaseOneTimeFactor` shown 30 days). Monthly progress through `reportEconomyTick`.
  `setProgress` fires `notifyStageReached` and an intel update per new stage.
- **Stage ids must be Java enums** (`((Enum) id).ordinal()`) and **a stage at progress 0 must
  exist** (null pointer otherwise). The event, its factors and the enum are saved by class name.
  Smallest example: `ht/HyperspaceTopographyEventIntel` (one instance in sector memory,
  `addFactorCreateIfNecessary`, `readResolve` re-runs `setup()` to migrate saves).
- UI: `addEventProgressBar`, a marker and tooltip per stage, factor tables; default tag "Major
  events". Installed mods (Arma Armatura "ATAC Combat Analysis", AoTD Dreams of Past "Awakening
  Procedure", AoTD Vaults of Knowledge research contracts) follow it: 0–1000, 4–6 stages, icons
  under `settings.json` "events" (48 px, start 64 px), one bullet line per stage reached, title
  "Name - Place". **None of them define events in JSON or CSV**; all are Java. Only AoTD Seats of
  Power touches vanilla crises, behind a player choice and as a visible factor.

**Roaming fleets** (`fleets/RouteManager`, saved, ticked by CoreScript):
- `addRoute(source, market, seed, OptionalFleetData, RouteFleetSpawner[, custom])` and
  `RouteSegment`s (stay `(id, days, entity)`, travel `(id, from, to)`, about hyperspace
  distance / 1500 + 6 days). The route moves abstractly; a real fleet is made by
  `spawnFleet(route)` when the route is within 1.6 LY of the player and despawned when far (more
  than 4 LY, or 3 LY and unseen 60 days), never in battle. While real,
  `RouteFleetAssignmentAI` walks the segments. The spawner is saved inside the route.
- `BaseRouteFleetManager(minInterval, maxInterval)`: `getRouteSourceId`, `getMaxFleets`,
  `addRouteFleetIfPossible`. `MiscFleetRouteManager.CREATORS` (pilgrims) is a static list with one
  shared cap of 8 and no mod uses it; `DisposableFleetManager` spawns throwaway fleets in the
  player's system (no A-to-B travel). Mods use RouteFleetSpawner from industries (Arma Armatura,
  UAF) or `RouteFleetAssignmentAI` routes (AoTD).

**Timers and flags**: `MemoryAPI.set(key, value, expireDays)` expires by itself;
`DelayedActionScript` (a named class: an anonymous one is saved under its anonymous name);
`EconomyTickListener` for monthly hooks; `IntervalUtil`, `TimeoutTracker`.

## Starsector 0.98.5a (code, 2026-11-12)

Compared against 0.98.5a-RC5 (`D:\Starsector_98_5a`). The full comparison, with the risks and
ideas, is [GAME-0.98.5a-ASSESSMENT.md](GAME-0.98.5a-ASSESSMENT.md); the items to try in game are
in [INGAME-CHECKS.md](INGAME-CHECKS.md), "0.98.5a".

### Game version (code)

- `starfarer_obf.jar` → `com/fs/starfarer/Version.class` holds the constants `versionOnly`
  (`"0.98.5a-RC5"`) and `versionString` (`"Starsector 0.98.5a-RC5"`). 0.98a-RC8's has the same
  layout.
- A fresh install has **no `starsector.log`** until the game has run once, so the log's
  "Starting Starsector … launcher" line can't be the only source.
- Saga Forge reads the jar's constant pool (`src/main/gameversion.ts`) and uses the log only as a
  fallback. New mods get the detected version as `gameVersion` in `mod_info.json`.
- The definitions for a version are picked on the part before `-RC`: `0.98.5a…` gets
  `src/shared/defs/0.98.5a.json` (a patch on `0.98a.json`), `0.98a…` gets 0.98a. Note that
  `0.98a` sorts **before** `0.98.5a`: compare game versions with `cmpGameVersions`
  (`src/shared/version.ts`), not as plain strings.

### Rule file list (code; checked in game 2026-11-15)

**In game (0.98.5a-RC5, test mods `SagaForgeRulesTestA`/`B`, task #48):**
- The same id and trigger in `rules.csv` and a second listed file stops the game at load, as the
  code says.
- The same id with **different triggers** in two listed files loads, and **both rules fire**.
  Saga Forge keeps a shared id an Error anyway.
- A mod's `data/campaign/rules/askoniaCrisis2.csv` row with a vanilla id **replaces** vanilla's
  row there.
- Dev-mode reload of a changed listed file: an edited text **didn't show** on reopening the option.
  Not confirmed either way; don't rely on it (idea I5 stays unproven).

The code facts:

- `settings.json` has a new list, `"rules": ["data/campaign/rules.csv",
  "data/campaign/rules/askoniaCrisis2.csv"]`. Like every `settings.json` array it **appends**
  across mods. The engine (`campaign.rules.Rules`) reads the merged list once at startup; with
  no `rules` key it would fail, so this is 0.98.5a-only.
- Each listed path is loaded on its own as a **merged CSV keyed by `id`** (`LoadingUtils`), so a
  mod still overrides a vanilla row by shipping the same id **at the same path**.
- After loading a file, each rule is checked against the rules already loaded **for its trigger**:
  the same id there throws `RuntimeException("Duplicate rule id: …")`. So the same id in two
  *different* listed files, with the same trigger, should stop the game at load (the comment in
  `settings.json`: "same-ID rules within these files clash instead of overriding"). The same id
  with different triggers isn't caught by that check. Not tried in game yet.
- **Option labels can't contain ":"** (seen in game): an options line is `order:id:text`, and the
  game splits at every colon, showing only the piece after the id ("95:opt:SFR test B: pick me"
  shows "SFR test B"). Vanilla never uses one. Saga Forge warns about a colon in an option, start
  option or arrival option, and its preview cuts the label the same way.
- Vanilla 0.98.5a: 10,615 rules in `rules.csv` and 5,510 (the Sindrian Diktat storyline) in
  `rules/askoniaCrisis2.csv`.
- In dev mode the engine compares each listed file's modification time and reloads changed files
  (not tried in game).
- Saga Forge's index (`src/main/gameindex.ts`) reads the merged list, falls back to
  `data/campaign/rules.csv` when the key is missing (0.98a), and reads **every listed path in
  every source**. A mod that isn't enabled isn't in the merged settings, so its own listed files are
  read as well. Each row records its file (`RuleRow.file`), so the clash check, Play mode, the
  Dialog browser and the flags scan all see `askoniaCrisis2.csv`. Saga Forge still exports to
  `data/campaign/rules.csv`, which works on both versions.

### Player portraits (code)

- `player.faction` → `portraits` has two new lists, `player_male` and `player_female`. They feed
  the **new-game portrait picker** (`SpecStore`, `getMalePortraitForNewGame`).
- On the player faction, `standard_male` / `standard_female` are now a separate, shorter list.
  So a patch that adds to `portraits.standard_*` no longer adds new-game portraits; add to
  `player_male` / `player_female` instead. Both merge like any faction list (appended).
- The Factions page shows "New-game portraits" fields for `player` when the 0.98.5a definitions
  are in use.

### Rule commands and ids (API source)

New and changed commands are in `src/shared/defs/0.98.5a.json`, built by
`scripts/build-defs-0985a.cjs` from both versions' `starfarer.api.zip`. In short:

- **New:** `PersonCMD makeImportant|makeUnimportant [person] [reason]` and
  `PersonCMD isContact [person]`; `HasContactFromFaction <faction> [vipBlacklist]`;
  `MarketHasIndustry <id…>` (any of them); `PersonIsDefaultMarketPost [person]`;
  `ShowPlayerPerson`; `FinishVisualFadeFast`; `SellToFleet willBuyStuff|selectStuff`; `SDR_CMD`
  (story only).
- `PersonCMD` reads the **second argument as a person id whenever there are two or more**, so
  `PersonCMD makeImportant $flag` without a person doesn't work as its comment says. Write the
  person id: `PersonCMD makeImportant <person> <reason>`.
- **Changed:** `RepIsAtWorst` / `RepIsAtBest` (and their subclasses `RepGTE` / `RepLTE`) take one
  argument (the level: the active person, else the entity's faction), or a faction **or person
  id** plus the level. `SetPersonHidden <true|false>` alone means the active person.
  `MovePersonToMarket <person> [market] [forceAddToComms]`. Multi-purpose commands gained actions
  (`MiscCMD`, `MarketCMD`, `HA_CMD`, `PK_CMD`, `TT_CMD`, `DwellerCMD`, `SalvageEntity`).
- `RepGTE` / `RepLTE` take a **reputation level**, not a number, in both versions. Play mode
  treats them like `RepIsAtWorst` / `RepIsAtBest`.
- **New ids:** ranks `artificialIntelligence`, `criminal`, `fugitive`; posts `personnelOfficer`,
  `underworldBoss`, `exile`, `associate_academician`, `assistant_academician`, `gammaCore`,
  `betaCore`, `alphaCore`; 12 code people (the Seven Sons mission, `SDSevenSons`, creates eight of
  them when it starts); faction `diktat_achilles` and entity type `asteroid_base` (both read from the game
  data; the Locations page offers an "Asteroid base" entity when the game has the type).
- **New tokens:** `$PersonFirstName` / `$PersonLastName` (case variants, filled by
  `CoreRuleTokenReplacementGeneratorImpl`; hub missions also store them in memory).

### Other 0.98.5a facts (code)

- **Launcher version check** (`ModManager$VersionInfo`): `0.98a-RC8` parses as major `0.98`,
  minor `8` (the RC), no patch; `0.98.5a-RC5` as major `0.98`, minor `5`, patch `5`. RC minors are
  skipped, so the patch differs: `PATCH_MISMATCH`, the mildest level. Which message the launcher
  shows for it is not traced yet (INGAME-CHECKS).
- `settings.json` now has `"devMode": false` by default. Dev tools, rule debug logging and the
  rules reload above need it set to `true` (in the game's own `settings.json`, your own step).
- `IsSoughtByPatrols` skips fleets with `FLEET_IGNORES_OTHER_FLEETS`, so SagaLib's encounter
  fleets (see "Quest fleets get fought by patrols" above) no longer make the player count as
  sought by patrols.
- Commission pay (`FactionCommissionIntel`): stipend `15000 + 3500 × active non-mercenary
  officers` (was `20000 + 5000 × player level`), bounty 500 per frigate-equivalent (was 300), and
  no bounty for factions with `custom.noBountyForDefeating`.
- `commodities.csv` has a new column `sell price mult` after `base price`. Columns are read by
  name, so the editor's rows (own header) still load.
