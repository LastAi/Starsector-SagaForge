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
- **A market's memory** (`$market.…`, API source `CoreCampaignPluginImpl.updateMarketFacts`, 0.98a;
  task #67 U54, found in game 2026-11-24): `$id`, `$size`, `$stability`, `$isSurveyed`,
  `$surveyLevel`, `$isPlanetConditionMarketOnly`, `$daysExisted`, `$isHidden`, `$isPlayerOwned`,
  `$hasRuins`, `$hasUnexploredRuins`, `$tag:<tag>`, `$mc:<condition>`, `$ind:<industry>`, plus
  whatever rules and scripts set. **No owner key**: `$market.factionId` is never set, so a condition
  on it never matches (vanilla never uses it). The owner of the place a dialog is at is
  **`$faction.id`** (`RuleBasedInteractionDialogPluginImpl.updateMemory`: the interaction target's
  faction; vanilla: `$faction.id == hegemony`, 35 rules). Problems warns about `$market.factionId`.
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
- **Operators in a command line** (javap of `com.fs.starfarer.campaign.rules`, 0.98a-RC8; task #79):
  each script and condition line is split by `Misc.tokenize`. An unquoted `=` (also `==`, `!=`, `<`,
  `>`, `=-` …) is an operator token, also inside a word: `k=v` is `k`, `=`, `v`. A line whose first
  token isn't a `$variable` is a command, and a command line with any operator token (other than a
  leading `!`) throws `RuleException: Operators (except for '!') not allowed in command invocations`
  while the rules load; two operators in any line throw "Multiple operators". A double-quoted token is
  one literal, `=` and `$` included (`"text=Heads or tails?"`, `"who=$global.x"`: the game doesn't read
  the `$` there). That's why `SF_RunPlugin` takes each `"key=value"` in quotes.

## Plugins: the mod's own Java (code, 0.98a-RC8; task #79, SagaLib 1.4)

- **`SettingsAPI.getInstanceOfScript(className)`** (javap, `ScriptStore`): `Class.forName(name, true,
  <the script class loader>)` with the `Class` cached by name, then `newInstance()` on **every call**
  (a new object each time). Any `Exception` comes back as `RuntimeException("Problem loading class
  [<name>]", cause)`; a class not found isn't cached. The script class loader sees every enabled mod's
  jars (mod_info.json `"jars"`) and its loose `data/scripts` sources (Janino). SagaLib's
  `SF_RunPlugin` uses it (SagaLib FORMAT.md, "Plugins").
- The game's class loader refuses most of `java.io`, `java.nio.file.File*`, `java.lang.reflect` and
  `javax.script` in mod classes (SagaLib's SandboxTests): a plugin can't use them either.
- **What Saga Forge exports**: a Plugin node `<n>` of quest `<q>` with declared results is a rule
  `<q>_<n>` (the node's entry) with `SF_RunPlugin <class> "quest=<q>" "node=<n>" "key=value"…` then
  `FireBest <q>_<n>_result`; one rule per connected result on trigger `<q>_<n>_result` with the
  condition `$global.<q>_<n>_result == <result>`; and a fallback `<q>_<n>_next` with no conditions
  (FireBest prefers the rule with more conditions) that continues at "otherwise". A node without
  results (or none connected) is one rule: the line, then what follows. An Action's "Run a plugin"
  is the same line with its quest and node; a world event's or progress stage's has neither (its
  result goes to SagaLib's local `$sagaforge_plugin_result`).
- The editor lists the classes of the jars the mod's `mod_info.json` names under `"jars"` from each
  jar's zip central directory and the class files' headers (`src/main/jars.ts`; no Java needed): a
  class is a plugin when it implements `lastai.sagalib.api.SagaPlugin`, directly or through a
  superclass or interface in those jars, and is public and not abstract.
- **Recipe: a plugin jar for a mod** (what `mods/seventynine_a/build.sh` does):
  1. Write a class that implements `lastai.sagalib.api.SagaPlugin`:
     ```java
     package mymod.plugins;
     import lastai.sagalib.api.SagaPlugin;
     import lastai.sagalib.api.SagaPluginContext;
     import java.util.Map;
     public class ShrinkMarkets implements SagaPlugin {
         public String run(SagaPluginContext ctx, Map<String, String> args) {
             int by = Integer.parseInt(args.containsKey("by") ? args.get("by") : "1");
             // … the work, e.g. Global.getSector().getEconomy().getMarketsCopy() …
             ctx.addText("Every colony shrinks by " + by + ".");
             return "done"; // a result the Plugin node declares, or null for none
         }
     }
     ```
     A public class with a public no-argument constructor; keep no state in fields (a new instance runs
     each time).
  2. Compile against the game's API and SagaLib's jar, for Java 8 bytecode (what SagaLib uses; the
     game runs Java 17, so `--release 17` works too):
     `javac --release 8 -cp "<Starsector>/starsector-core/starfarer.api.jar;<mods>/SagaLib/jars/SagaLib.jar" -d build src/mymod/plugins/*.java`
     (use `:` instead of `;` on Linux; add `json.jar`, `log4j-1.2.9.jar`, `lwjgl.jar` from
     starsector-core if the code uses them). Then `jar cf jars/mymod_plugins.jar -C build .`
  3. List the jar in the mod's `mod_info.json`: `"jars": ["jars/mymod_plugins.jar"]`. Don't put
     SagaLib's classes into it; Saga Forge's export adds the SagaLib 1.4.0 dependency.
  4. In Saga Forge, press **Rescan jars** on the Plugin node (or save, which reads the mod again): the
     class shows in the picker.

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

## One-name characters (API source and javap, 0.98a-RC8 and 0.98.5a-RC5; task #79)

- **Vanilla's person tokens** (`CoreRuleTokenReplacementGeneratorImpl`): for the active person (the
  dialog target's `getActivePerson()`, else a fleet's commander) `$PersonName` and `$personName` =
  `getFullName()`, `$personFirstName` = `getFirst()`, `$personLastName` = `getLast()`. **0.98.5a adds**
  `$PersonFirstName` and `$PersonLastName` (and `$PlayerFirstName`, `$PlayerLastName`); 0.98a has no
  capitalised first or last name token. The player's `$playerLastName` falls back to the first name
  when the last is blank; the active person's tokens have no such fallback.
- `FullName.getFullName()` is `(first + " " + last).trim()`, and `Person.getNameString()` returns it.
  In the engine (`starfarer_obf.jar`) every class that reads a FullName for display calls
  `getFullName()` (comm directory, market info, officer data, intel and dialog UI classes); the only
  engine use of `getFirst()` / `getLast()` is `FleetMember.writeReplace`, which drops a "steady",
  level-1 captain whose first **and** last names are both empty when saving (a one-name person keeps
  a last name, so isn't affected). So a one-name person, first name empty and the name in the last
  slot, shows as just the one name everywhere in vanilla's UI by the code; **in game pending**: the
  comm directory, intel (Contacts) and a fleet's tooltip and dialog (INGAME-CHECKS "Task #79
  one-name characters").
- Where vanilla's API uses the first name: the generator above; `BaseHubMission` puts
  `$personFirstName` into the mission's memory (generators replace before memory, so a generator's
  value wins); `BaseEventPlugin.addPersonTokens` (`$<prefix>FirstName`, old event intel);
  `FleetInteractionDialogPluginImpl` (`$firstName` in the `fleetInteractionDialog` strings, which no
  vanilla string uses); `CoreCampaignPluginImpl` (the player's `$firstName` memory key). Vanilla's
  rules.csv uses `$personFirstName` twice.
- **Generators are merged in list order** (`CampaignEngine$3.getTokenReplacements`: a new HashMap,
  `putAll` of each generator's map in turn), so for the same token **the later generator wins**, then
  the merged tokens are replaced longest first. Vanilla adds its generator in
  `CoreLifecyclePluginImpl.onGameLoad`; `ModManager.getEnabledModPlugins` lists the core lifecycle
  plugin before every mod's plugin, so a generator a mod adds in its own `onGameLoad` comes after
  vanilla's (on a new game too: `onGameLoad(true)` runs after `onNewGameAfterTimePass`). One added
  earlier (in `onNewGameAfterEconomyLoad`) comes before it and loses. SagaLib's one-name generator is
  added in `onGameLoad` for that reason (SagaLib FORMAT.md, "One-name characters").
- Saga Forge: **People › One name** stores `oneName: true` with the one name in `name.last`
  (`src/shared/personname.ts`); exported as `"oneName": true` with `name.first` empty. The person's
  `$<id>_firstName` token is the one name. Play and the dialog preview fill `$personFirstName` /
  `$PersonFirstName` with it as SagaLib does. Another mod's person whose index name is one word is
  read as a one-name person.

## Node groups (Saga Forge's own format; task #67 U43, 2026-11-23)

Not a game format: how Saga Forge keeps node groups. The game never sees a group; the export
writes the normal nodes it stands for. Shared code: `src/shared/nodegroups.ts`.

- **A definition** (`<id>.group.json`): `format` (1), `id` (lowercase words joined by dots, the
  first one a namespace: `sagaforge.` for the built-in ones, an author's or a mod's prefix for
  others), `label`, `description`, `version` (a number the author bumps) and `changes` (what changed,
  shown on Replace), `requires` (`{"sagalib": "1.4.0", "game": "0.98a"}`, shown), `summary` (the
  card's text, with `{{field}}`), `fields`, `entry`, `exits`, `nodes`, `edges`.
- **Fields**: `{key, label, type, default?, options?, help?, required?}`; types `text`, `longtext`,
  `number`, `bool`, `choice` (`options`: values or `{value, label}`), and the pickers `faction`,
  `person`, `encounter`, `item`, `quest`, `place`. Filled in automatically and never shown:
  `{{prefix}}` (the mod's prefix), `{{instance}}` (the placed node's id), `{{quest}}` (the quest's id).
- **Nodes** are normal quest nodes (any type but Start and group: no groups inside groups), with
  ids local to the group. In any string, `{{key}}` is replaced by the field's value (a string that
  is only `{{key}}` takes the value's type, so `"amount": "{{amount}}"` stays a number). Any object
  (a node, an option, an action) may have `"if"`: `key`, `!key`, `key == value`, `key != value`,
  joined with `&&` / `||`; when false it is left out (with its edges).
- **`entry`**: the node incoming connections go to. **`exits`**: `{key, label, node, handle}`, the
  placed node's output dots; a connection from exit `key` leaves from `node`'s output `handle`
  inside. **`edges`**: `{from, handle, to}` between the group's nodes.
- **Placed** (a quest node `{"type": "group", "group": <id>, "values": {...}, "title"?}`): a missing
  value is the field's default. Expanded ids are `<placed id>__<node id>`, and a dialog's option ids
  get the same prefix (option ids are the quest's), so a group can be placed many times; rule ids
  and text keys stay stable while the placed node keeps its id.
- **Identity**: `id` names the group across versions; the **hash** (computed from the content with
  sorted keys, never written) is one exact version. Same id and hash = the same group, shown once.
  Same id, another hash: the higher `version` is newer; the same version is "a modified copy".
- **Where groups live**: built in (`src/shared/groups`, read-only); the **library** (Settings › Node
  group library, default Saga Forge's data folder › nodegroups), offered in every mod; the **mod's
  copies** (`sagaforge/nodegroups/<id>.group.json`). Placing a group copies it into the mod: a mod
  never depends on files outside it. One version per id in a mod.
- **Replace** (another version of the mod's copy): values are kept by field key where the type is
  the same (a choice value the new version doesn't list goes back to the default); new fields take
  their defaults; dropped fields and connections from exits that are gone are listed before
  confirming. **Expand into nodes** replaces a placed group with its nodes (ids `<placed>_<node>`),
  one way.
- **Built in**: `sagaforge.fleet_response` (Fleet response, below).

### The hail on contact and the Fleet response (rules.csv and API source, 0.98a; task #67 U43)

Vanilla's interception, as the Knights of Ludd's "sacred protectors" and the Hegemony's
investigators: `BeginFleetEncounter` (fired when the fleet screen opens) runs
`MakeOtherFleetPreventDisengage <reason> true` and `HailPlayer`, which opens the fleet's comm link
(`OpenCommLink`) at once. Branches end with `ShowDefaultVisual` + `EndConversation NO_CONTINUE`
(vanilla's `cutCommLinkNoText`): back to the fleet screen. Flags are set per reason
(`Misc.setFlagWithReason`); `MakeOtherFleetAllowDisengage` beats prevent, and prevent only holds
while the fleet's AI chooses to engage (a much stronger player can leave).

- Saga Forge's hail: `<encounter>_hail`, `BeginFleetEncounter`, `$entity.sagaforge_encounter == <id>
  score:1000` + `!$sagaforge_hailed`; `$sagaforge_hailed = true 0` (once per meeting), `FleetDesc`,
  `MakeOtherFleetPreventDisengage hail true`, `HailPlayer`. Only with a comm-link dialog. A warning
  when "player may disengage" is on (it would let the player leave anyway).
- Fleet response: let them go = `SF_Despawn` (SagaLib 1.4: without an id, the dialog's fleet; its
  encounter's outcome is avoided and it withdraws); fight = `MakeOtherFleetAllowDisengage sagaforge
  false`, `MakeOtherFleetHostile sagaforge true`, `MakeOtherFleetAggressive sagaforge true`,
  `MakeOtherFleetPreventDisengage sagaforge true`; flee = `MakeOtherFleetPreventDisengage sagaforge
  false`, `… hail false`, `$entity.sagaforge_fled = true`. Each then cuts the comm link.

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
  - **A place without a market that isn't a planet** (a plain station, a custom object) gets only
    `defaultOpenDialog` (`ShowDefaultVisual`, `PrintDescription 3`, option Leave): it never fires
    `PopulateOptions`, so menu options added there never show (found in game with `sixtytwo_a`,
    2026-11-18). Problems warns; an Arrive there must take over the arrival.
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
  group replaces that row's weight instead of adding to it. Problems warns about it (Phase 8a for
  loot pools that add to a group; task #65 also for the mod's hand-written rows).
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

## Other mods and frameworks (installed mods and engine code, 2026-11-17; task #31)

The facts behind PLAN.md §10. Each mod is listed with the version it was checked against. Other
versions may differ. Read-only: nothing was changed in `D:\Starsector`. Nexerelin's classes were
read with `javap` and from the `.java` and `.kt` files its jar carries. LunaLib and MagicLib ship
their sources in `src/`.

### mod_info.json and dependencies (code, 0.98a-RC8 and 0.98.5a-RC5)

- The launcher's `ModManager` reads only these keys: `id`, `name`, `author`, `version`,
  `description`, `gameVersion`, `jars`, `modPlugin`, `dependencies`, `replace`, `sortString`,
  `totalConversion`, `utility`, `requiredMemoryMB`, `baseMemoryRequired`,
  `coreLifecyclePlugin`. The list is the same in both versions.
- **There is no optional or soft dependency key.** A listed dependency must be enabled. Mods
  that support another mod optionally don't list it. Instead they ship data files only that mod
  reads, which are never read without it, and check
  `Global.getSettings().getModManager().isModEnabled(id)` in code where they need to (our
  ReadAloud's LunaLib bridge does). RAT ships Nexerelin config files and has its Nexerelin
  dependency commented out in `mod_info.json`.
- Dependencies don't change the load order (see "Load order" above). **ModPlugins run in mod order**
  (code, 0.98a-RC8, task #63): `ModManager.getEnabledModPlugins()` is the core lifecycle plugin
  (`coreLifecyclePlugin`) first, then one plugin per enabled mod with a `modPlugin`, in the order of
  `getEnabledMods()`, the sorted list of "Load order". `CampaignGameManager` calls
  `onNewGameAfterEconomyLoad` (and the other hooks) by iterating that list. So Nexerelin's hooks run
  before SagaLib's ("Nexerelin" < "SagaLib"), unless a `sortString` changes the order. **Seen in game**
  (2026-11-19, INGAME-CHECKS "Task #63" (b)): the log's mod list reads Nexerelin, sixtythree_a,
  SagaLib, and Nexerelin's last relations line ("Saving independent player relations …", 314146 ms)
  comes just before SagaLib's relations lines (314149 ms).

### What the installed mods depend on (mod_info.json and data files)

26 third-party mods with a `mod_info.json` (Arma Armatura counted once). Hard dependencies:

| Library | Hard dependents | Notes |
|---|---|---|
| LazyLib 3.0.0 (`lw_lazylib`) | 16 | Code utilities only, no content format. |
| MagicLib 1.5.6 (`MagicLib`) | 8 | Bounties (task #27), achievements, mod settings, paintjobs. |
| Ashlib 2.2.4 (`ashlib`) | 5 | Kaysaar's UI and code library (AoTD, UAF). No content format. |
| LunaLib 2.0.5 (`lunalib`) | 3 | Settings pages; also used **optionally** by 7 more (below). |
| GraphicsLib 1.12.2 (`shaderLib`) | 3 | Combat visuals. |
| Building Menu Overhaul 2.1.0 (`bmo`) | 3 | Colony build menu (AoTD). |
| AoTD Theory of Toolbox 1.0.13 | 2 | AoTD's economy module. |
| PatchLib 1.0.3 (`patchlib`) | 1 | Patches core game code at runtime. |
| Nexerelin 0.12.2d (`nexerelin`) | **0** | Supported **optionally** by 5 faction mods (below). |

Files mods ship for a framework **without** a hard dependency on it (optional support through
data):

- `data/config/LunaSettings.csv`: 10 mods, of which 7 don't depend on LunaLib (AoTD Dreams of
  Past and Vaults of Knowledge, Arma Armatura, MagicLib, Officer Extension, Variants Lib,
  GraphicsLib).
- `data/config/exerelinFactionConfig/`: Arma Armatura, HMI, Industrial.Evolution, RAT and UAF,
  none of which depends on Nexerelin.
- `data/config/magic_achievements.csv`: Nexerelin and AoTD Vaults of Knowledge. VoK doesn't depend
  on MagicLib.
- `data/config/modFiles/magicBounty_data.json`: HMI. `data/config/vayraBounties/`: Arma Armatura,
  HMI, Industrial.Evolution.
- `data/config/version/version_files.csv` (Version Checker): 22 of 26 mods. Version Checker itself
  is not installed, and MagicLib 1.5.6 doesn't bundle it. Saga Forge already writes these files
  (release packaging, Phase 8b).

### Versions by installed mods: runtime setters (javap, 0.98a-RC8; task #64)

What SagaLib can change after startup, so it can have versions (PLAN.md §10.6):

- `FactionAPI`: `setDisplayNameOverride`, `setDisplayNameWithArticleOverride`,
  `setFactionLogoOverride`, `setFactionCrestOverride`, `setSecondaryColorOverride`,
  `setShowInIntelTab`, `addKnownShip` / `removeKnownShip` (and weapons, fighters),
  `makeCommodityIllegal` / `makeCommodityLegal`, and `getDoctrine()` with a setter per value.
  **There is no setter for the long display name** (`displayNameLong`) in 0.98a.
- `CommoditySpecAPI` and `SpecialItemSpecAPI`: `setName`, `setIconName`, `setBasePrice`
  (`setDesc` on special items). They are set at application load, before any save, so item
  versions follow the mods installed now, not a save's start record.
- People: `ImportantPeopleAPI.getPeopleCopy()` lists the important people (the sector snapshot
  reads it, plus each market's people).
- `SettingsAPI.writeTextFileToCommon(name, text)` writes into `saves/common/` with `.data` added to
  the name (`sagaforge_snapshot.json.data`). Confirmed in game 2026-11-18 (task #64, check (f)).
- The game gives the staff it generates at a market (portmaster, administrator, supply officer)
  ids like `p_2ef2`, new every game: a snapshot can't use them as fixed ids.

### Presence by the market's owner (javap and rules.csv, 0.98a-RC8; task #70)

- Rules can read the market's owner as **`$faction.id`** (444 uses in vanilla's rules.csv), but no
  vanilla command compares two factions: `RepIsAtWorst` / `RepGTE` are the player's standing. So
  SagaLib 1.3 adds the condition **`SF_FactionRep <factionA> <factionB> <level>`** (`notHostile` =
  Inhospitable or better).
- `FactionAPI.getRelationshipLevel(String)` returns a `RepLevel`; `isAtWorst(String, RepLevel)`
  and `isHostileTo(String)` exist too. `RepLevel` is an enum, worst first: `VENGEFUL`, `HOSTILE`,
  `INHOSPITABLE`, `SUSPICIOUS`, `NEUTRAL`, `FAVORABLE`, `WELCOMING`, `FRIENDLY`, `COOPERATIVE`, with
  `isAtWorst(RepLevel)` / `isAtBest(RepLevel)`. Saga Forge's `defs.repLevels` thresholds turn the
  mod's starting relation values into levels (previews and Play mode).
- `CommDirectoryAPI.getEntryForPerson(PersonAPI|String)` returns a `CommDirectoryEntryAPI`, which
  has `isHidden()` / `setHidden(boolean)`: a person can be hidden from the comm directory without
  removing them from the market (save-safe, reversible). `addPerson` / `removePerson` list them at
  another market's comm directory.
- `BaseMissionHub` keeps the missions it offered in a **transient** `offered` list (rebuilt after
  load and every update interval); `BaseMissionHub.set(person, new BaseMissionHub(person))` gives a
  person a fresh hub, so their offers are created anew (SagaLib does this when a contact leaves).
- Most vanilla starting relations are set in code (`SectorGen`), not in data files, so the editor
  only knows the mod's own (Factions page); Play mode asks for other pairs.

### Nexerelin 0.12.2d (code: ExerelinCore.jar classes and sources)

**Random sector** ("random core worlds" at new game):
- At new game Nexerelin sets **sector memory `$nex_randomSector`** (`ExerelinConstants
  .MEMORY_KEY_RANDOM_SECTOR`, in `ExerelinNewGameSetup.generateStarSystems`): `true` in a random
  sector, `false` with the hand-made core worlds. In `rules.csv` it reads as
  **`$global.nex_randomSector`**. It's unset without Nexerelin, which counts as false. So no
  bridge is needed to tell the two apart. `SectorManager` also keeps `$nex_corvusMode`
  (`setCorvusMode`) and a static `SectorManager.getCorvusMode()`.
- Nexerelin's own new-game tooltip: "The Academy storyline will be disabled in random sector, and
  some features (such as missions or Colony Crises) from the base game or other mods may not be
  usable."
- Vanilla's named people are created by `People.create()`
  (`CoreLifecyclePluginImpl.onNewGameAfterEconomyLoad`), each one **only if their market exists**
  (`getEconomy().getMarket("…")`, `if (market != null)`). In a random sector the hand-made
  markets don't exist, so those people don't either. Nexerelin adds back a few landmarks with
  their people: Galatia Academy (`People.createAcademyPersonnel`, Sebestyen shown), Kanta's Den
  with Kanta, Brother Cotton (`StartSetupPostTimePass`), and the Prism Freeport. Which landmarks
  exist depends on Nexerelin's version and settings.
- `customStarts.json` entries have `"randomSector"`: `0` both, `1` random only, `-1` hand-made
  only. `customScenarios.json` has `"randomSectorOnly"`. Both need a Java class (`className`).

**Market owner changes** (invasions, rebellions, buying a colony, …):
- All go through `SectorManager.transferMarket(market, newOwner, oldOwner, playerInvolved,
  isCapture, factionsToNotify, repChangeStrength[, …])`. It sets the market's and its entity's
  faction and moves station fleets. In the comm directory it **changes the faction only of
  people whose post is in `POSTS_TO_CHANGE_ON_CAPTURE`**: base, outpost and station commander,
  portmaster, supply officer, administrator. **A quest contact with any other post keeps their
  faction.**
- Then `NexUtilsMarket.reportMarketTransferred` calls every `exerelin.utilities.InvasionListener`
  in the listener manager (`reportMarketTransfered(...)`, Nexerelin's spelling). Only that call is
  current; the interface's other methods are for legacy invasions. Vanilla has no event for a
  market changing owner. Without a bridge, the only way to notice is to compare
  `market.getFactionId()` with the remembered one.
- **A market can be protected from invasion through memory**: `NexUtilsMarket.canBeInvaded`
  returns false when the market's memory has `$nex_uninvadable = true` (rules:
  `$market.nex_uninvadable`). The older entity tag `nex_uninvadable` is deprecated. This is
  plain memory, so no bridge is needed.

**Checked for task #61** (sources in `ExerelinCore.jar`, 2026-11-18; in game: INGAME-CHECKS.md,
"Task #61"):
- **When the flag is set.** `ExerelinNewGameSetup` is Nexerelin's `newGameCreationEntryPoint`
  (its `data/config/settings.json`), a `SectorGeneratorPlugin`; `generateStarSystems` sets
  `$nex_randomSector` (= `!corvusMode`) before it builds anything. The entry point runs before the
  mods' `onNewGame`: **confirmed in game 2026-11-18** (SagaLib read the flag in its `onNewGame` and
  skipped hand-made-only content in a random sector). Saga Forge's random-sector support was then
  put on hold (PLAN.md §10.3); these facts stay for when it comes back.
- **The posts re-flagged on capture**, as vanilla `Ranks` ids: `baseCommander`, `outpostCommander`,
  `stationCommander`, `portmaster`, `supplyOfficer`, `administrator` (`SectorManager
  .POSTS_TO_CHANGE_ON_CAPTURE`; faction leaders are left out on purpose, says its comment).
  `transferMarket` then calls `market.setFactionId(newOwner)`, so comparing `getFactionId()` with
  the remembered owner notices every capture.
- **`canBeInvaded`** (`NexUtilsMarket`) is false for a market whose memory has `$nex_uninvadable`
  (`ExerelinConstants.MEMORY_KEY_UNINVADABLE`), and also for abandoned stations, fleets, hidden
  markets, neutral factions, markets not in the economy, and (for the player) the player's own.
  It applies to every invasion, the player's too. **Confirmed in game 2026-11-18**: a market with
  `$nex_uninvadable` (SagaLib's "Protect from invasion") shows "Invade …" greyed out, with the
  tooltip "This is not an invadable market."; an unprotected market of the same faction can be
  invaded. Changing a market's faction (SagaLib's dev menu, like `transferMarket`'s
  `setFactionId`) is noticed by SagaLib's daily owner check, and each outcome (keep going, fail, go
  to a stage with its follow-up dialog) ran.
- How Saga Forge uses it (PLAN.md §10.3): "If a market of this quest changes owner" (SagaLib
  compares owners once a day: `ownerChange`), the contact-post warning, and "Protect from invasion"
  on the mod's markets (SagaLib sets `$nex_uninvadable`). SagaLib's FORMAT.md, "Places a quest
  needs, markets changing owner". The random-sector condition is on hold.

**Faction config** (`exerelinFactionConfig`):
- A faction is only configured if Nexerelin knows it: its built-in list, plus the rows of
  **`data/config/exerelinFactionConfig/mod_factions.csv`** (merged CSV, key column `faction`, case
  sensitive), kept only if the faction exists (`doesFactionExist`). A row for a faction from a mod
  that isn't installed is ignored.
- Each faction's file is **`data/config/exerelinFactionConfig/<factionId>.json`**, loaded with
  `getMergedJSONForMod(…, "nexerelin")`, so files from several mods merge like any merged JSON.
- A faction with no config gets the **neutral** config (`neutral.json`:
  `"playableFaction":false, "corvusCompatible":true`): it can't be picked at the start.
- Keys read by `NexFactionConfig.loadFactionConfig` (all optional, `opt*` with defaults):
  `playableFaction` (true), `startingFaction` (= playable), `enabledByDefault` (= starting),
  `corvusCompatible` (false), `pirateFaction`, `isPirateNeutral`, `hostileToAll`,
  `spawnAsFactionId`, `freeStart`, `ngcTooltip`, `difficultyString`, `isPlayerRuled`,
  `useStrategicAI` (= not pirate), `canInvade`, `invasionOnlyRetake`, `invasionFleetSizeMod`,
  `invasionPointMult`, `invasionStrengthBonusAttack/Defend`, `responseFleetSizeMod`,
  `marketSpawnWeight`, `noHomeworld`, `noRandomStartLocation`, `noStartingContact`,
  `noMissionTarget`, `noRandomizeRelations`, `noSyncRelations`, `disableDiplomacy`,
  `allowAgentActions`, `allowPrisonerActions`, `dropPrisoners`, `freeMarket`, `tariffMult`,
  `morality`, `alignments`, `diplomacyTraits`, `allowRandomDiplomacyTraits`, `factionsLiked` /
  `Disliked` / `Neutral`, `positiveDiplomacyExtra`, `negativeDiplomacyExtra`,
  **`startRelationships`** (`{factionId: -1..1, "default": …}`),
  `useConfigRelationshipsInNonRandomSector`, fleet names (`invasionFleetName`,
  `invasionSupportFleetName`, `responseFleetName`, `defenceFleetName`,
  `asteroidMiningFleetName`, `gasMiningFleetName`, `vengeanceLevelNames`, `vengeanceFleetNames`,
  `vengeanceFleetNamesSingle`, `rebelFleetSuffix`), `vengeanceFleetSizeMult`, `specialForces*`,
  `stabilizeCommodities`, `customRebelFaction` / `customRebelFleetId`, `industrySeeds`,
  `bonusSeeds`, `industrySpawnMults`, `customStations` / defence stations,
  `miningVariantsOrWings`, `startSpecialItems`, `groundBattleSettings`, `strategyPriorityMults`,
  `colonyExpeditionChance`, `maxColonyDistance`, `colonyTargetValuator`,
  `factionConditionSubplugin`, `factionIdForHqResponse`, `showIntelEvenIfDead`,
  `directoryUseShortName`, `raidsFromBases`, `patrolSizeMult`. UAF's `uaf.json` is a typical
  full example; HMI and RAT ship smaller ones.
- **Starting relations** (`DiplomacyManager.initFactionRelationships`, called from Nexerelin's
  `onNewGameAfterEconomyLoad`; javap, task #63). The new-game option "Reset relations" is
  `StartRelationsMode` DEFAULT ("no"), RANDOM ("randomize") or FLATTEN ("flatten"):
  - Hand-made sector, "no", and Nexerelin's own setting `useConfigRelationshipsInNonRandomSector`
    off (its default): vanilla's relations are loaded (`VanillaSystemsGenerator
    .initFactionRelationships`), then each faction whose config sets
    `useConfigRelationshipsInNonRandomSector` gets `applyFactionRelationshipsFromConfig`: its
    `hostileToAll` handling, then every `startRelationships` pair (`setRelationship`, both ways).
  - Otherwise (a random sector, or "randomize"/"flatten"): every pair is set to 0, pirate factions
    to -0.6 with everyone (not `isPirateNeutral` ones); then each faction is randomized if the mode
    is "randomize" and it isn't in the do-not-randomize list (factions with `noRandomizeRelations`,
    and pirates unless "apply to pirates" is on), else it gets `applyFactionRelationshipsFromConfig`.
    Randomizing skips pairs with a kept faction. "flatten" then resets every faction afterwards.
  - `hostileToAll` is a number: 1 sets it at best Hostile (-0.6) with everyone but the player
    (Inhospitable, -0.4), 2 the player too, 3 Vengeful (-1) with everyone.
- **What Saga Forge does with it (#63)**: Export writes the faction's relations (without mod
  conditions) as `startRelationships` with `useConfigRelationshipsInNonRandomSector: true`, so they
  apply in both sectors and are randomized only by "randomize" (and not for a kept faction).
  SagaLib sets its starting relations in its own `onNewGameAfterEconomyLoad`, which runs after
  Nexerelin's (ModPlugins run in mod order, above), so it would otherwise overwrite Nexerelin's
  random and flattened values. SagaLib 1.3 therefore leaves the relations of a faction listed in
  `factions.json` "nexerelin" to Nexerelin when Nexerelin is enabled and the mod ships the file;
  relations with mod conditions aren't in the config and stay SagaLib's.
- **The player's relations when joining a faction** (seen in game, 2026-11-19, "Task #63" (b)): at
  the end of `initFactionRelationships`, Nexerelin copies the joined faction's relations to the player
  once (`syncPlayerRelationshipsToFaction`, unless `noSyncRelations`). A relation SagaLib sets later
  (one with mod conditions) is therefore not copied: Test 63 Compact was Vengeful with the Luddic
  Church, the player who joined it Neutral. Neither mod's bug, the order they run in; left as it is
  (user, 2026-11-19: don't work around Nexerelin's implementation), and Problems says so on the
  relations that stay SagaLib's.
- **New-game list** (`Nex_NGCListFactionsV2`, `NexConfig.getFactions(false, true)`): every configured
  faction with `startingFaction`, sorted by name, shown as "<name> (<difficultyString>)" with
  `ngcTooltip`. The fleet choice (`Nex_NGCStartFleetOptionsV2`) offers a fleet type only if the
  config has fleets for it (`startShipsSolo`, `…CombatSmall`, `…CombatLarge`, `…TradeSmall`,
  `…TradeLarge`, `…CarrierSmall`, `…CarrierLarge`, `…ExplorerSmall`, `…ExplorerLarge`, `…Super`,
  `…GrandFleet`; each a list of fleets, a fleet a list of variant ids). Below them a **Custom** button
  is always offered (`Nex_NGCCustomStartFleet`: a fleet built from the faction's known ships;
  Independent's for the player faction), so a starting faction without ready-made fleets offers only
  Custom. The config used is the faction joined (`PlayerFactionStore.getPlayerFactionIdNGC()`); free
  start and own faction use `player` (Nexerelin's `player.json`, a built-in faction config, also loaded
  as merged JSON, so a mod's `player.json` appends fleets to it: the merge appends lists; Saga
  Forge writes one with only the `startShips…` lists for Fleets › New-game fleets. Seen in game (2026-11-19,
  INGAME-CHECKS "Task #63" (f)): Frigate (classic) 1 / 5 became 1 / 6).
- `corvusCompatible`: read into the config and by `NexUtilsFaction.isCorvusCompatible`, which nothing
  in 0.12.2d's classes calls.
- Diplomacy traits (`data/config/exerelin/factionTraits.json`): paranoid, predatory, pacifist,
  helps_allies, irredentist, stalwart, weak-willed, foreverwar, selfrighteous, temperamental,
  dislikes_ai, hates_ai, likes_ai, envious, submissive, neutralist, monopolist, law_and_order,
  anarchist, lowprofile, devious, monstrous, domain_claimant, domain_loyalist, domain_rebel ("rebel"
  is commented out). Alignments: corporate, technocratic, militarist, diplomatic, ideological,
  hierarchical. Morality: good, neutral (default), amoral, evil.

**Quest skip** (`data/config/exerelin/questSkip.json`, merged JSON):
- `questChains.<id>`: `name`, `image`, `sortKey`, `quests` (ids), optional `plugin`, `tooltip`.
  `quests.<id>`: `name`, `tooltip`, `idsToForceOn/OffWhenEnabled/Disabled`, `sectorMemFlags`
  (sector memory = `$global.*`), `playerMemFlags`, `peopleToUnhide`, optional `plugin` (a
  `QuestSkipPlugin` class, needed for rewards) and `tooltipCreator`.
- The player picks the quests to skip on the new-game screen; Nexerelin sets the listed memory
  flags. A SagaLib quest's end state is plain memory (`$global.<quest>_state`, vanilla's
  `$<quest>_missionCompleted`, SagaLib's FORMAT.md), so the flags are enough to end it.
- **Read in the code (task #65, 2026-11-19; `QuestChainSkipEntry.kt`, `QuestSkipEntry.java`,
  `BaseQuestSkipPlugin.java`, `ExerelinModPlugin.java`, `Nex_NGCQuestSkipPanel.java` from the jar):**
  - **The memory flags are only applied through a plugin.** `onNewGameAfterEconomyLoad` calls
    `chain.plugin?.applyMemKeys()` and each skipped quest's `plugin?.applyMemKeys()`; nothing else
    calls `QuestSkipEntry.applyMemKeys`. An entry without a chain or quest plugin sets **nothing**.
    `BaseQuestSkipPlugin.applyMemKeys` applies every skipped quest of its chain, so one chain plugin
    covers them. Plugins are created by class name (`NexUtils.instantiateClassByName`) once, when the
    list loads, and kept for every new game (no sector state in them).
  - Order of a new game: `onNewGame` → `onNewGameAfterProcGen` → `onNewGameAfterEconomyLoad` (flags)
    → `onNewGameAfterTimePass` (`unhidePeople`, then the plugins' own hook). Nexerelin's hooks run
    before SagaLib's (mod order), so the flags are there when SagaLib's run.
  - `peopleToUnhide` works without a plugin (`onNewGameAfterTimePass`), but `unhidePeople` stops at
    the first person that doesn't exist (`return`) and throws on a person with a market but no
    comm-directory entry (`getEntryForPerson(p).setHidden(false)`).
  - Loading: `initEntries` reads the merged file in one `try`; a chain without `name` or `image`
    (`getString`), or a `plugin` class that can't be created, stops the chains after it from loading.
    A quest id in `quests` without an entry stops the rest of that chain (`addQuestsById`).
  - The skip screen: one row per chain (its image and name, `tooltip` on hover), one button per
    quest, `BUTTON_WIDTH` ≈ 1.8 × a new-game button: Nexerelin's own names are at most 18 characters.
    Checking a button forces `idsToForceOnWhenEnabled` on; unchecking forces
    `idsToForceOffWhenDisabled` off (Nexerelin's own entries list the whole chain explicitly). The
    choice is remembered across games in the common data (`nex_questSkip`).
  - Images: the panel draws `image` by path and loads nothing (`addImage`); a mod's own image must be
    loaded by the game (listed in `settings.json` › `graphics`).
- **As built (task #65)**: Saga › Quest skip; each chain's `plugin` is SagaLib 1.3's
  `lastai.sagalib.bridge.nexerelin.SagaQuestSkipPlugin`, which also gives the skipped ending's rewards
  after the time pass (SagaLib's FORMAT.md, "Nexerelin quest skip"). Saga Forge doesn't write
  `peopleToUnhide` (SagaLib's plugin shows people itself, safely).

### LunaLib 2.0.5 (sources in the mod's `src/lunalib`)

- **`data/config/LunaSettings.csv`**, one per mod, read by `LunaSettingsLoader.loadDefault()`
  with `Global.getSettings().loadCSV(path, mod.id)` for **every enabled mod**. It is not a
  merged CSV: each mod's own file. A mod can ship it without depending on LunaLib, and seven
  installed mods do (above).
- Columns: `fieldID` (empty = skipped), `fieldName`, `fieldType`, `defaultValue`,
  `secondaryValue`, `fieldDescription` (older name `fieldTooltip`), `minValue`, `maxValue`
  (Int/Double; default 0 and 100), `tab` (empty = the main tab).
- Field types: `Boolean`, `Int`, `Double`, `String`, `Radio` (the default is one option,
  `secondaryValue` lists the options separated by commas; read as a String), `Keycode`, `Color`,
  `Text` and `Header` (layout only, no value). Used across the installed mods: Boolean 125,
  Double 78, Int 76, Header 59, Keycode 14, Text 12, Radio 11, String 4, Color 1.
- The player's values are saved in the game's common data,
  **`saves/common/LunaSettings/<modId>.json`**. They're **shared by every save**, not stored in
  a save.
- API (`lunalib.lunaSettings.LunaSettings`, static): `getBoolean`, `getInt`, `getDouble`,
  `getFloat`, `getString`, `getColor(modId, fieldId)`. Each returns null when the field is
  unknown. `addSettingsListener(LunaSettingsListener)`: `settingsChanged(modId)` is called when
  the player saves settings in LunaLib's menu. `SettingsCreator.refresh()` doesn't call it
  (found while building ReadAloud).
- Optional mod icon in the menu: `data/config/LunaSettingsConfig.json`,
  `{ "<modId>": { "iconPath": "graphics/…png" } }`.
- Since the CSV is read with the game's own `loadCSV`, **SagaLib can read the defaults without
  LunaLib** and only needs a bridge for the player's values.
- Read in the source while building task #62 (`LunaSettingsLoader.kt`, `LunaSettingsConfigLoader.kt`,
  `KeybindsScript.kt`):
  - `LunaSettingsConfig.json` is read with `getMergedJSONForMod(path, "lunalib")`: each mod's file
    is merged into LunaLib's own by key, so a mod writes only its own `"<modId>"` entry. 2.0.5 loads
    the icon texture itself (`loadTexture`), so it needs no preloading. Any square size works;
    40×40 is drawn unscaled.
  - `minValue` / `maxValue` are only read for Int and Double. A missing or unreadable `minValue`
    sets the **maximum** to 0 (a bug), so Saga Forge always writes both.
  - Boolean defaults go through Kotlin's `toBoolean()` (anything but "true", in any case, is
    false); Int through `toInt()` (no decimals). Radio has no type conversion: a String.
  - **Header and Text rows draw `defaultValue`**, not `fieldName` (`LunaSettingsUISettingsPanel.kt`;
    found in game 2026-11-18: rows with only a `fieldName` showed empty). A Text line highlights
    words in `[brackets]`. `fieldDescription` is printed under a field's label, not shown on hover.
  - In the campaign the menu opens with the "Settings Keybind" (default keycode 61, **F3**) or
    **Shift+F2**; in the main menu with its **Mod Settings** button.
- **As built (task #62, SagaLib 1.3)**: Saga Forge writes the mod's `LunaSettings.csv` in an owned
  block (`# sagaforge:begin settings`, hand-written rows stay) and lists it in `content.csv` as type
  `settings`; SagaLib reads it with `loadCSV` and sets `$global.<fieldID>` for Boolean, Int, Double,
  Radio and String on every load (SagaLib's `docs/FORMAT.md`, "Mod settings (LunaLib)"). The
  bridge (`src-optional/lunalib`) reads the player's values with `LunaSettings.get…` and applies a
  menu change at once through `LunaSettingsListener` while a campaign runs.

### MagicLib 1.5.6 achievements (sources in the mod's `src/org/magiclib/achievements`)

- **`data/config/magic_achievements.csv`**, loaded per enabled mod with `loadCSV`. Columns: `id`
  (prefixed), `name`, `description` (past tense), `tooltip`, `script` (a `MagicAchievement`
  class; the generic `org.magiclib.achievements.MagicAchievement` works for achievements that
  code completes, as Nexerelin's quest achievements do), `image`, `spoilerLevel` (`VISIBLE`,
  `SPOILER`, `HIDDEN`), `rarity` (`COMMON` … `LEGENDARY`).
- Completed with `MagicAchievementManager.getInstance().completeAchievement(id)`. No rule command
  does it (MagicLib's `ruleCommandPackages` is `org.magiclib.bounty.rulecmd` only), so the call
  needs a bridge. Progress is kept in the common data (`magic_achievements.json`), shared by every
  save.
- **Read in the code (task #65, 2026-11-19; `MagicAchievementManager.getSpecsFromFiles`,
  `MagicAchievement`, `MagicAchievementIntel`):**
  - Every row is read with `getString` for `id`, `name`, `description`, **`tooltip`** and `script`:
    the `tooltip` column must exist (it may be empty), or the row is skipped with a log warning.
    `image`, `spoilerLevel` and `rarity` are optional. A second row with an id already read (any
    mod, in mod order) is skipped with a warning.
  - `completeAchievement(player, textPanel)` does nothing for one already complete; with a text panel
    MagicLib's intel sends its notice into the dialog. `getAchievement(id)` is null for an unknown id
    and while achievements are turned off in MagicLib's settings (`areAchievementsEnabled`).
  - The list (Intel › Achievements) draws `image` square at 48×48 by path and loads nothing; a missing
    texture falls back to the rarity's image. A mod's own image must be loaded by the game
    (`settings.json` › `graphics`).
- **As built (task #65)**: Saga › Achievements writes the rows (owned block); `SF_Achievement`
  (SagaLib 1.3, `MagicAchievementsBridge`) completes one with the player and the dialog's text panel.

### MagicLib 1.5.6 bounties (sources in the mod's `src/org/magiclib/bounty`; task #27, 2026-11-18)

Checked against MagicLib 1.5.6 (`mod_info.json` version 1.5.6, gameVersion 0.98a-RC7; it needs
LazyLib). Only the 0.98a install (`D:\Starsector`) has MagicLib, so the in-game check runs there.
Read from `MagicBountyLoader`, `MagicBountySpec`, `MagicBountyCoordinator`, `ActiveBounty`,
`MagicCampaign` (`isAvailableAtMarket`, `isAvailableToPlayer`, `findSuitableTarget`),
`MagicBountyUtilsInternal`, `MagicBountyHVB`, the Kotlin board (`intel/MagicBountyInfo.kt`) and the
shipped templates `data/config/modFiles/magicBounty_data_BLANK.json` and `_example.json`.

**The file and how it is read.**

- `data/config/modFiles/magicBounty_data.json`, one per mod: a JSON object, **bounty id → bounty**.
  `loadBountyData` calls `loadJSON(path, modId)` for every enabled mod in mod order and copies each
  key into one object, so **a later mod's bounty with the same id replaces an earlier one**; nothing
  else is merged. A mod without the file is skipped ("not found in" is ignored). The loose JSON of
  the game is accepted (`#` comments, trailing commas: HMI's and MagicLib's own files use both). A
  file that can't be read stops the game at startup in dev mode ("Malformed MagicBounty_data.json")
  and shows a campaign message otherwise.
- `magicBounty_data_testing.json` replaces it when MagicLib's test mode is on (MagicLib's own
  setting, not ours).
- Bounties are loaded on a new game and **again on every save load** (`bounty_board_reloadAll`
  defaults to true): bounties not taken yet are dropped and re-read from the files, so a changed
  file reaches existing saves; taken ones (their `job_memKey` is in memory) keep the old data. In
  dev mode every bounty is re-read on load.
- Each bounty is then validated (`validateAndCorrectIds`), and **an invalid bounty is removed with
  only a log line**: `fleet_faction` must be set (unless `existing_target_memkey`) and every faction
  id must exist, `fleet_flagship_variant` must be set and exist (a variant of the game, or a file in
  `data/config/modFiles/magicBounty_variants/<id>.variant`), every `fleet_preset_ships` variant must
  exist. In dev mode MagicLib also loads and checks every bounty once at startup
  (`onApplicationLoad`), before a sector exists: the faction lookup then throws, and the log has
  "Something went wrong when validating <id>" (a NullPointerException) for **every** mod's bounty,
  still followed by "<id> : VALID"; harmless (seen in game 2026-11-18, HMI's bounties too). Faction
  ids are matched **loosely** (`MagicStringMatcher.findBestFactionMatch`: a near
  name is "corrected" with a log line), so a typo can silently pick another faction.
- `required_mods_id: [ids]`: the bounty is skipped unless all of these mods are enabled (MagicLib's
  own "only with"; there is no "only without").
- The id is the key and must be unique across all mods (prefix it). `job_memKey` defaults to
  `"$" + id`.

**Fields** (all optional unless noted; missing number = -1 or 0, missing boolean = false unless
noted; the loader reads `getInt`, so a fraction in an int field is cut):

| Group | Keys | Meaning |
|---|---|---|
| Offer (where) | `trigger_market_id` [ids] | Offered at these markets. **Quirk:** at any other market it is still offered unless one of the listed ids is also an *entity* id that exists (`getEntityById`), so list the market id **and** its entity id when they differ (vanilla's are the same; Saga Forge's aren't). |
| | `trigger_marketFaction_any` [ids], `trigger_marketFaction_alliedWith` | The market's faction is one of these, or (with alliedWith) is at least Welcoming to one. |
| | `trigger_marketFaction_none` [ids], `trigger_marketFaction_enemyWith` | Not at these factions' markets; with enemyWith a market hostile to one of them passes at once. |
| | `trigger_market_minSize` | Market size at least. |
| Offer (who, when) | `trigger_player_minLevel`, `trigger_min_days_elapsed`, `trigger_min_fleet_size` (player fleet points) | |
| | `trigger_memKeys_all` / `_any` / `_none` {"$key": bool} | **Sector (global) memory only**, compared as **Booleans** (`getBoolean`): `{"$vgc_done": true}` is `$global.vgc_done` in rules. A string value (such as SagaLib's `$<quest>_state == success`) can't be tested. `_none`: no key may hold that value. |
| | `trigger_playerRelationship_atLeast` / `_atMost` {faction: -1..1} | At least / at most that reputation (`RepLevel.getLevelFor`); with several factions, any one is enough. |
| | `trigger_weight_mult` (default 1) | Weight on the board's random pick. |
| | `trigger_giverTargetRelationship_atLeast` / `_atMost` | Read, not used by the 1.5.6 board. |
| Job | `job_name` (default "Unnamed job"), `job_description`, `job_comm_reply`, `job_intel_success`, `job_intel_failure`, `job_intel_expired`, `job_pick_option` | Texts (below). `job_comm_reply`: the target's answer when hailed (`""` = MagicLib's default line, missing = no answer). |
| | `job_forFaction` | The faction that pays: reputation goes to it, and the board shows it. |
| | `job_credit_reward`, `job_reward_scaling`, `job_reputation_reward` (0–100, default 5), `job_item_reward` {id: count} | Credits and reputation are paid on success. **Items are added to the battle's loot**, not given: each id is tried as a commodity, weapon, fighter wing, hullmod, then special item (`"<special> <data>"`, e.g. `"ship_bp buffalo"`). |
| | `job_deadline` (days, -1 = none), `job_type` (`assassination` = disable the flagship, default; `destruction` = destroy it, no recovery; `obliteration` = the whole fleet; `neutralization` = two thirds), `job_difficultyDescription` (`auto`, `none` or a text) | |
| | `job_show_type`, `job_show_captain` (default true), `job_show_fleet` (`none`, `text`, `flagship`, `flagshipText`, `preset`, `presetText`, `vanilla`, `all`), `job_show_distance` (`none`, `vague`, `distance`, `system`, `vanilla`, `vanillaDistance`, `exact`), `job_show_arrow` | What the board shows. Enum values are matched without case. |
| | `job_memKey` | Set to false on accept; true when it ends, with `<key>_succeeded`, `<key>_failed` (flagship salvaged) or `<key>_expired` (deadline, or ended without the player) also set to true. |
| | `job_pick_script`, `job_conclusion_script` | A **rules.csv trigger** fired with `FireBest` on accept / on the end (in the open dialog, or without one). Not a class. |
| | `existing_target_memkey` | The bounty is on an existing fleet with this memory key; the target and fleet fields are then ignored. |
| Target | `target_first_name`, `target_last_name`, `target_portrait` (a settings.json portrait id or path), `target_gender` (`MALE`, `FEMALE`, `UNDEFINED`), `target_rank`, `target_post`, `target_personality`, `target_level`, `target_elite_skills` (-1 = normal), `target_skill_preference` (`GENERIC`, `PHASE`, `CARRIER`), `target_skills` {skill: level} (replaces the random skills), `target_aiCoreId` (an AI captain), `target_importantPersonId` (use that person from the important people instead) | |
| Fleet (required) | `fleet_faction`, `fleet_flagship_variant` (a list picks one at random) | Validated (above). |
| | `fleet_name`, `fleet_flagship_name`, `fleet_flagship_alwaysRecoverable` (old: `fleet_flagship_recoverable`), `fleet_flagship_autofit`, `fleet_preset_ships` {variant: count}, `fleet_preset_autofit`, `fleet_composition_faction` (the extra ships' faction, default `fleet_faction`), `fleet_composition_quality` (default 1; below 0 = 2, no d-mods), `fleet_transponder`, `fleet_no_retreat`, `fleet_attitude` (`HOSTILE`, `NEUTRAL`, `DEFAULT`), `fleet_musicSetId` | |
| | `fleet_min_FP` (old: `fleet_min_DP`), `fleet_scaling_multiplier` | Random ships of the composition faction are added up to the minimum, and up to the player's fleet points times the multiplier (0 = no scaling). |
| | `fleet_behavior` | `PASSIVE` (orbits passively), `AGGRESSIVE` (defends the spot), `ROAMING` (patrols the system), anything else: orbits aggressively. |
| Location | `location_entitiesID` (old: `location_marketIDs`) [entity ids] | First choice: one of these entities (at random) if any exists. |
| | `location_marketFactions` [ids] | Next: the primary entity of any market of these factions. |
| | `location_distance` (`CORE`, `CLOSE`, `FAR`) | Then a system search. Bands measured **from the sector's centre**: under a third of the sector's width, under two thirds, beyond. The band is a preference: the others are tried in order (`CORE` → close, far; `CLOSE` → far, core; `FAR` → close, core); empty = random order. |
| | `location_themes` [system tags] | Systems with any one of these tags; `procgen_no_theme` = a plain procedural system (`theme_misc`, `theme_misc_skip`, `theme_core_unpopulated`), `procgen_no_theme_pulsar_blackhole` = the same without a pulsar or black hole. Empty = every system. |
| | `location_themes_blacklist` [system tags] | Removes systems with any of them (tags also in `location_themes` are taken out). `theme_already_occupied` also removes every system with a market (and adds MagicLib's `merged_themes_blacklist` of other mods' themes), `no_pulsar_blackhole` removes pulsars and black holes. `theme_hidden` is always added, and dropped again only if nothing is found. |
| | `location_entities` [entity tags] | What to spawn at in the picked system (`planet`, `stable_location`, `jump_point`, `gate`, `station`, `debris`, `wreck`, …; tags, not custom entity types). Default: stable location, planet, jump point. |
| | `location_prioritizeUnexplored` | Systems the player never entered first, then the rest of the band. |
| | `location_defaultToAnyEntity` | No system with the themes: use every system; no entity of the types in a band: any entity of a system in that band. False: try the next band, then give up. |

If no place is found the bounty isn't created ("No suitable spawn location", log only).

**When and where it is offered (1.5.6).** The old bar option is switched off
(`ShouldShowMagicBountyBoard` returns false). Bounties are in the intel screen's **bounty board**
(`BountyBoardIntelPlugin`): a bounty is listed while the player is **within 10 light-years of a
market that passes the offer checks**, and the player checks pass. Listing it creates the
`ActiveBounty` (the place is picked and the fleet spawned then); accepting it is a button there.
A finished or dismissed bounty is never offered again (MagicLib keeps the completed ids).

**Texts.** Shown with MagicLib's `addPara`: `==text==` is highlighted, `\n` starts a new paragraph,
`^` capitalises the next letter, and the text goes through `String.format`, so **a percent sign is
written `%%`**. Tokens (case-insensitive): `$sonDaughterChild`, `$fatherMotherParent`,
`$manWomanPerson`, `$hisHerTheir`, `$heSheThey`, `$heIsSheIsTheyAre`, `$himHerThem`,
`$himselfHerselfThemselves` (all about the target), `$system`, `$location`, `$constellation`,
`$shipName`, `$shipFleet`, `$givingFaction`, `$rewardFaction`, `$targetFaction` (old: `$faction`),
`$reward`, `$name`, `$firstName`, `$lastName`. **Every other `$` becomes `==error==`**, so rules.csv
tokens and SagaLib phrases can't be used.

**Rule commands** (`ruleCommandPackages` = `org.magiclib.bounty.rulecmd`): `ShowMagicBountyBoardCmd`,
`ShouldShowMagicBountyBoard`, `MagicBountyCommsReplyCmd`, and the example `BountyScriptExample`.
MagicLib's own `rules.csv` has the comm reply rule (`$entity.MagicLib_Bounty_target_hasReply`).
A mod that only ships the bounty file needs none of them, so **the file works as optional
content**: without MagicLib nothing reads it.

**Taking a bounty from code** (read for task #59, SagaLib 1.3's bridge `src-optional/magiclib`).
MagicLib's own board and its old bar event both do the same two steps, and so does the bridge:
`MagicBountyCoordinator.getInstance().createActiveBounty(id, spec)` (only if
`getActiveBounty(id)` is null: the place is picked with the location fields and the fleet is
created then; null back = no place or no fleet, logged by MagicLib), then
`activeBounty.acceptBounty(source, calculateCreditReward(pre, post), spec.job_reputation_reward,
spec.job_forFaction)`, with the coordinator's pre- and post-scaling multipliers. The spec comes
from `MagicBountyLoader.getBountyData(id)` (the loaded, valid bounties). Accepting spawns the
fleet at the place, sets `job_memKey` false, adds the bounty's intel and runs `job_pick_script`.
The bar event writes `MagicTxt.getString("mb_accepted") + job_name` ("Accepted job: …") into the
dialog; the bridge does too.

- `createActiveBounty` **doesn't check the triggers** (markets, memory keys, level …), so a quest
  can give a bounty the board never offers. The board lists a bounty in stage `Accepted`
  whatever its triggers say (`MagicBountyInfo.shouldShow`), and an offered one only when its
  triggers pass. So **"never on the board"** is a trigger nobody sets:
  `"trigger_memKeys_all": {"$sagaforge_bounty_quest_only": true}`.
- Stages (`ActiveBounty.Stage`): `NotAccepted`, `Accepted`, `FailedSalvagedFlagship`,
  `ExpiredAfterAccepting`, `Dismissed`, `ExpiredWithoutAccepting` (it is offered again later, and sets no
  memory key: `job_deadline` counts from acceptance, `getDaysRemainingToComplete`; MagicLib 1.5.6 source, task #69),
  `EndedWithoutPlayerInvolvement`, `Succeeded`. A finished bounty leaves the active list once its
  intel is gone and is kept in `getCompletedBounties()`. **The memory keys outlast both**, so
  SagaLib reads the state from them: key unset = not taken, false = accepted, true = ended, plus
  `_succeeded`, `_failed` (salvaged flagship) or `_expired` (expired after accepting, or ended
  without the player); `Dismissed` sets the key true without an outcome key.
- **Deadlines are off by default in 1.5.6** (in game and source, task #69): `getDaysRemainingToComplete`
  is infinite unless `MagicBountyCoordinator.DEADLINES_ENABLED`, which is false until the player changes
  LunaLib's MagicLib setting "Enable Bounty Deadlines" (default false; read only in a LunaLib change
  listener, not on load, so it is off again after a restart until changed). Without it a bounty
  "expires" only when it ends without the player (`EndedWithoutPlayerInvolvement`).
- **A finished bounty can come back in the board's details pane** (seen in game 2026-11-18, task
  #59): the pane keeps showing the last bounty selected, and drawing it (`layoutPanel`, also
  `decorateListItem`) calls `createActiveBounty` when MagicLib has no active entry for the id, as
  after a finished bounty is moved to the completed list. So the finished bounty shows again
  there with a new captain and "Accept the job" (the list itself hides it). That's MagicLib's
  board, for any bounty; SagaLib's state still reads the memory keys (succeeded), and
  `SF_StartBounty` refuses a bounty that has ended.
- Classes: `org.magiclib.bounty.{MagicBountyCoordinator, ActiveBounty, MagicBountyLoader,
  MagicBountySpec}` and `org.magiclib.util.MagicTxt` are Java (MagicLib.jar, class version 61,
  so Java 17); the bridge compiles with `--release 8` against them without trouble.

**The older format: `data/config/vayraBounties/unique_bounty_data.csv`** (Vayra's "high value
bounties"). MagicLib converts its rows into bounties (`MagicBountyHVB.convertHVBs`), but **only when
Vayra's Sector isn't running them itself** (`vayrasector` off, or its unique bounties off). Read with
`getMergedSpreadsheetDataForMod("bounty_id", …, "MagicLib")`, so every mod's rows are merged by
`bounty_id`. Columns: `bounty_id, level, rank, firstName, lastName, captainPersonality, fleetName,
flagshipName, gender, faction, portrait, greetingText, suppressIntel, postedByFaction, creditReward,
repReward, intelText, flagshipVariantId, fleetVariantIds, minimumFleetFP, playerFPScalingFactor,
maximumFleetFP, chanceToAutoRecover, specialItemRewards, neverSpawnUnlessBountiesCompleted,
neverSpawnWhenFactionHostile, neverSpawnWhenFactionNonHostile, neverSpawnBeforeCycle,
neverSpawnBeforeLevel, neverSpawnBeforeFleetPoints`. How they map: offered at size 3+ markets of
`postedByFaction` (or friendly to it), job name "High value bounty: <first> <last>", memory key
`$HVB_<id>` (so `neverSpawnUnlessBountiesCompleted` becomes `$HVB_<id>_succeeded` checks), no
deadline, weight 0.25, minimum cycle as days after 206, a level above 15 halved, `hvb_hostile`
becomes MagicLib's `ML_bounty` faction, location: a close plain or misc system without colonies.
`rank`, `suppressIntel` and `maximumFleetFP` are read by Vayra's Sector only. Arma Armatura, HMI and
Industrial.Evolution still ship rows. **Saga Forge writes only the JSON format**: it does
everything the CSV does, and the CSV is skipped whenever Vayra's Sector runs.

### Libraries with nothing for Saga Forge (2026-11-17)

LazyLib, GraphicsLib, Ashlib, Building Menu Overhaul, AoTD Theory of Toolbox, PatchLib (patches
core code at runtime), RetroLib (ship retrofits), sidebarLib (UI), VideoLib (video on panels and
planets through Java plugins), Variants Lib (fleet variant selection through Java plugins and
settings), Particle Engine, Officer Extension, Crew Replacer, Second-in-Command. None has a
campaign content format that a quest, faction, person or location would use. The decisions are
in PLAN.md §10. (Theory of Toolbox and BMO are looked at more closely in "Economy and colony mods"
below, task #66; the decision is unchanged.)

### Optional mods and mod conditions (task #60, SagaLib 1.3; code 2026-11-17)

What the build relies on, checked in the API jar (`javap`, 0.98a-RC8) and in SagaLib's tests. The
in-game results are recorded below when the test mod `sixty_a` has run (INGAME-CHECKS.md, "Task
#60").

- `Global.getSettings().getModManager().isModEnabled(id)` tells whether a mod is enabled, as ReadAloud
  uses it. SagaLib asks it for each optional and incompatible mod of a content mod's
  `data/sagaforge/mods.json` and keeps a **start record** in sector memory
  (`$global.sagaforge_mod_<owner>_<mod>` = on/off), taken in `onNewGame` (before systems are built)
  or on the first load that sees the content mod; SagaLib's FORMAT.md, "Other mods and mod
  conditions".
- `FactionAPI.setShowInIntelTab(boolean)` and `isShowInIntelTab()` exist (0.98a and 0.98.5a), so a
  faction the game always loads can be hidden from the intel tab at runtime. The `.faction` key
  `showInIntelTab` can't depend on mods.
- `CampaignUIAPI.showInteractionDialog(plugin, entity)` shows the one-time notice (the same way
  SagaLib's dev menu and profile picker open), after the campaign is on screen; `addMessage` is the
  fallback.
- Every rule command in `rules.csv` is looked up when the game loads the rules, so a guarded rule
  can't use an optional mod's own command (seen with SagaLib switched off, 2026-11-15).
  `SF_HasMod` is SagaLib's, so a mod using it depends on SagaLib (the export adds it).
- A rule's conditions all have to hold: "any of" needs its own command, `SF_HasAnyMod`. A
  negated command (`!SF_HasMod x`) is vanilla rule syntax.
- **Checked in game (2026-11-17, sixty_a, 0.98a-RC8)**: a patch of an optional mod's `.faction` at
  that mod's path does nothing without the mod: the game loads a `.faction` only through a
  `factions.csv` row (its log names each one: "Loading JSON from [… (data/world/factions/x.faction)]"),
  and sixty_a lists only its own. With the mod, its file and then ours are merged, in mod order.
- **Checked in game**: the start record, `SF_HasMod`, the skipped items, the "added since" and
  "possibly conflicting" notices (once per save; the log on every load) work as described
  (INGAME-CHECKS.md, "Task #60").
- **Seen in game**: a save made with a content mod that has its own commodities (HMI's `red_water`
  in a market) does not load at all without it: "Error loading saved game … CommodityOnMarket
  .readResolve … Commodity with id red_water not found". The game stops before any mod's code runs,
  so removing such a mod mid-save can't be handled by SagaLib; the "was removed" notice only applies
  to small mods.
- **Answered (#63, code)**: ModPlugins run in mod order (Nexerelin's `onNewGameAfterEconomyLoad`
  before SagaLib's); see "mod_info.json and dependencies".

### Economy and colony mods (installed mods, 0.98a-RC8; task #66, 2026-11-19)

The facts behind PLAN.md §10.8. Read from the installed mods' data files and with `javap` on their
jars (none ships sources in the jar; Seats of Power has `jars/src.rar`). "Merged" means the mod reads
the file with `getMergedSpreadsheetDataForMod(key, path, modId)` or `getMergedSpreadsheetData(key,
path)`, so another mod can ship rows at the same path, keyed by that column.

**AoTD and Industrial.Evolution are never played together** (user, 2026-11-19). Neither
`mod_info.json` says so (the game has no key for it, see "mod_info.json and dependencies"). A mod can
support both optionally, but no player has both.

#### Vanilla's commodity search (API, 0.98a-RC8)

- `HubMissionWithSearch.pickCommodity()` runs the market search, then picks a `CommodityOnMarketAPI`
  (a commodity **at** a market) from every matching market's `getAllCommodities()`, skipping
  `isMeta()` and `isNonEcon()` ones. 36 criteria, each `require…` / `prefer…`: `CommodityIsNotPersonnel`,
  `CommodityLegal` / `Illegal` (to the market's faction), `CommodityIs(id)` (one id per call, all
  must hold), `CommodityTags(ReqMode, tags…)`, and `AtLeast` / `AtMost` for `Available`, `Demand`,
  `Production`, `Surplus`, `Deficit` (economy units, ints) and `BasePrice` (float).
- Tradeable economy commodities in vanilla (`commodities.csv`, not `nonecon` and not `meta`): supplies,
  fuel, crew, marines, food, organics, volatiles, ore, rare_ore, metals, rare_metals, heavy_machinery,
  domestic_goods, organs, drugs, hand_weapons, luxury_goods, lobster. `ships` is `meta`; AI cores,
  survey data, blueprints, ship_weapons and credits are `nonecon`.
- Amounts are in **economy units**; real cargo units = units × the commodity's `econUnit`
  (`CommoditySpecAPI.getEconUnit()`).
- (Task #75, API source 0.98a-RC8 and 0.98.5a-RC5.) `requireCommodityIs(id)` adds one requirement per
  call and all must hold, so "one of these commodities" can't be built from it. `getSearch()` is
  public and `SearchData.commodityReqs` is a public list of `CommodityRequirement`
  (`commodityMatchesRequirement(CommodityOnMarketAPI)`), so SagaLib adds its own "id is one of"
  requirement there. `pickCommodity()` resets the search afterwards.
- vanilla's `econUnit` (commodities.csv): supplies 750, fuel 1500, crew 500, marines 100, food 2000,
  organics 1500, volatiles 200, ore 5000, rare_ore 500, metals 2000, rare_metals 200,
  heavy_machinery 300, domestic_goods 1000, organs 200, drugs 400, hand_weapons 200, luxury_goods 500,
  lobster 500. So 0.1 economy units is 200 food or 20 transplutonics. Vanilla's own
  `CheapCommodityMission` sizes its amount by value (credits ÷ base price), not by `econUnit`.
- Rule commands read `$` arguments from memory: `AddRemoveCommodity`, `PlayerHasCargo` and
  `ShowResCost` use `Token.getString/getFloat(memoryMap)`, and `AddRemoveCommodity <id> - <qty>`
  (a lone `-` is an operator token) takes. Memory numbers stored as Floats print as "200.0" in text, so
  SagaLib stores a commodity target's numbers as Integers.

#### AoTD - Theory of Toolbox 1.0.13 (`aotd_theory_of_toolbox`; needs LazyLib, Ashlib, BMO)

AoTD's economy module; Vaults of Knowledge and Seats of Power depend on it.
- **Game version**: 1.0.13 refuses to run on anything but exactly 0.98a-RC8
  (`onAboutToStartGeneratingCodex`). A 0.98.5a version comes out once 0.98.5a's final RC is out, and
  it works the same way, including the replacement API jar (user, from ToT's developer, 2026-11-19).
  The facts here are 1.0.13's until that version is checked.
- **Its own `starfarer.api.jar`** (`0.98a/starfarer.api.jar`, plus a patcher in `dev/`): the player
  copies it over the game's. Compared class by class with the RC8 jar, **only
  `impl/campaign/econ/impl/BaseIndustry.class` differs**, with the same method signatures. Only
  `getMaxDeficit(String...)` changed: when `isModEnabled("aotd_theory_of_toolbox")`, a market's local
  supply goes to its industries in their `order`; otherwise it works as vanilla. So code compiled against
  the vanilla jar (SagaLib) runs unchanged with it. Without the swapped jar, ToT logs "Market Test
  Failed" and asks for it. The install here (`D:\Starsector`) still has the vanilla jar.
- **Replaces the sector's economy** by reflection: `AoTDEconomy extends
  com.fs.starfarer.campaign.econ.Economy`, set into the sector's private `economy` field. Markets get
  `AoTDCommodityOnMarket` objects (a `CommodityOnMarket` subclass) with their own getters:
  - **`getMaxDemand()` returns `min(1, demand)`**: always 0 or 1 (bytecode `iconst_1; getfield demand;
    Math.min`). Vanilla's `…DemandAtLeast(n)` for n ≥ 2 never matches.
  - `getMaxSupply()` returns its own `supply`. `getDeficitQuantity()` and `getExcessQuantity()` use their
    own formulas (deficit minus trade, excess from `econUnit × 3`). They still measure shortage and
    surplus, but the numbers don't mean what vanilla's do.
  - `getAvailable()` still works: the available stat gets a flat `aotd_local` modifier (the stockpile).
  - **Found in game (task #75, 2026-11-19)**: with ToT, vanilla's `…DeficitAtLeast(1)` almost only
    matches **lobster** (its only producer is Volturn): a commodity target "legal, not personnel, not
    military, the market is short of it, prefer expensive" picked lobster at four markets in a row. A
    quest that wants variety under ToT shouldn't require a shortage (prefer it instead). ToT's units
    were seen as documented: domestic_goods econUnit 250, crew 2500.
- **Economy units per commodity**: `data/campaign/aotd_econ_sheet.csv`, merged (key `commodityId`, mod
  `aotd_theory_of_toolbox`). Header: `commodityId,supplyEconUnitMult,demandEconUnitMult,
  calculationScript,internalCut,externalCut,econUnitMult`. ToT's 19 rows cover the 18 commodities above
  plus `ships`. `econUnitMult` ≠ 1 multiplies the spec's `econUnit` by reflection (`setEconUnit`) for the
  whole game, for example crew ×5, food ×0.1, rare_metals ×10, domestic_goods ×0.25. A commodity
  with no row keeps its `econUnit` and gets defaults (multipliers 1, cuts 0.05 / 0.15). VoK ships 4 rows
  for its own commodities.
- **Other changes**: replaces the open, black, military and local-resources submarket plugins (and
  Nexerelin's and HMI's versions; `aotd_submarket_plugin_replacement_map.csv`); makes `spaceport` and
  `population` `ALWAYS_ACTIVE_NON_PENDING`; trade contracts and Grand Wonders (code only: public static
  registration, `GrandWonderAPI` industry plugins); 4 market conditions of its own, 1 industry
  (`aotd_gw_construction_site`), 1 rule (`AoTDFleetCheck`). Its state is Java objects in memory
  (`$aotd_trade_manager`, `$aotd_industry_data`, …), with no flags a rule could read.

#### AoTD - Vaults of Knowledge 5.0.7 (`aotd_vok`; needs ToT, BMO, Ashlib, LazyLib)

Research. It replaces no vanilla industry, commodity, item, condition or submarket id. It does override
33 vanilla salvage entities (`procgen/salvage_entity_gen_data.csv`: derelict probes and motherships,
caches, research stations, `ruins_*`) and adds rows to vanilla's `rare_tech` / `rare_tech_low` drop
groups.
- **Techs**: `data/campaign/aotd_tech_options.csv`, merged (key `id`, mod `aotd_vok`): another mod can add
  techs with data only. Header: `id,name,tier,timeToResearch,reqToResearchFirst,itemReqToResearch,iconId,
  rewards,columnNumber,rowNumber,isResearchedFromStart,otherReq,tags,modId`. Sample:
  `aotd_tech_agriculture,Agriculture Industrialization,1,15,aotd_tech_rudimentary_eq,research_databank:3,
  farming2,farming:industry,0,7,false,,,aotd_vok`. The columns:
  - `reqToResearchFirst`: tech ids, comma-separated, or `none`.
  - `itemReqToResearch`: `id:qty,…` (commodities or special items).
  - `rewards`: `value:type` lines, type `industry|ship|weapon|hullmod|special_ability|modifier` (a
    `modifier` is only text; its effect is coded per tech).
  - `otherReq`: `$key:Shown text`, checked as `Global.getSector().getMemory().is(key, true)`, so a
    **global memory flag** (vanilla examples `$playerCanUseGates`). A quest can make a tech researchable by
    setting it.
  - `tier` 0–5, `columnNumber` / `rowNumber` place it in the tree, `iconId` is a
    `graphics.ui_icons_tech_tree.<iconId>` entry in `settings.json`, and `modId` groups the techs.
  - (Task #77, `ResearchOptionSpec.initSpecFromJson` and VoK's UI with `javap`, 5.0.7.) **How the row is
    read**, and what breaks it:
    - `tier`, `timeToResearch`, `columnNumber`, `rowNumber` are `getInt`, `isResearchedFromStart` is
      `getBoolean`: a cell that isn't a whole number / true / false throws while the game loads
      (the loader wraps it in a RuntimeException).
    - `reqToResearchFirst` is split on ","; only the exact text `none` means no prerequisite. **An
      empty cell makes "" a prerequisite**, so the tech can never be researched.
    - `itemReqToResearch`: each "," entry is split on ":" and kept only with exactly two parts
      (`Integer.parseInt` on the second). VoK's own `aotd_tech_dual_trade_system` has
      `research_databank10`, which is silently skipped.
    - `rewards`: split on newlines, each line on ":", taking parts 0 (value) and 1 (type), into a
      HashMap keyed by value (a value twice is kept once; the order isn't kept). **An empty cell or a
      line without ":" throws while the game loads** (VoK's own file has neither). A colon inside a
      modifier's text makes the type the text after it (unknown → `UNIDENTIFIED`).
    - `otherReq`: split on ":", used only with exactly two parts (key, text), so the shown text can't
      have a colon. It's re-checked as `Global.getSector().getMemory().is(key, true)`.
    - `modId`: VoK's research screen has one tree per mod id (`modIDsRepo`), named with
      `getModSpec(modId).getName()`, so a mod's own techs get a tree of their own and their columns
      and rows don't meet VoK's.
    - **Tier 0 is researched at once** (seen in game 2026-11-20, task #77; `AoTDVokModPlugin` on load):
      every player tech whose tier is at or below `AoTDSettingsManager.getHighestTierEnabled()` (VoK's
      tier-unlock settings; tier 0 by default) is set researched on each load, whatever
      `isResearchedFromStart` says. AI factions get tiers 0 and 1 the same way (`advance`).
    - Research costs are paid from the databanks in the player's **research storage** (a colony's), not
      the fleet's cargo ("You have 0 stored in Research Storages" with 5 in cargo).
    - In the research screen a mod's tree is drawn left to right by tier, then `columnNumber`;
      `rowNumber` is the line.
    - `iconId`: drawn with `getSettings().getSpriteName("ui_icons_tech_tree", iconId)`, which fails for
      a key no `settings.json` lists. VoK's own icons are 320×320 PNGs in `graphics/icons/tech`.
- **Granting a tech**: Java only. `AoTDMainResearchManager.getInstance().getManagerForPlayer()
  .getResearchOptionFromRepo(id).setResearched(true)`, then `AoTDListenerUtilis.finishedResearch(id,
  faction)` (VoK's console command `research_tech` does exactly this). Asking: `isResearchedForPlayer(id)`,
  `haveFactionResearchedCertainTech(faction, id)`. The state is a Java object in persistent data
  (`$aotd_vok_manager`), not memory, so rules can't read it and no rule command grants a tech.
  (Task #77, `javap -c`.) `getManagerForPlayer()` is the player faction's manager;
  `getResearchOptionFromRepo(id)` returns null for an id VoK doesn't have. `isResearchedForPlayer(id)`
  is true when **the faction that commissions the player or the player's faction** has it.
  `haveFactionResearchedCertainTech(faction, id)` is false for a faction VoK has no manager for, and
  **for every AI faction it answers from one fixed list** (`AoTDFactionResearchManager.AI_FACTION_TECHS_START`,
  21 of VoK's own techs: ind_base_template, rudimentary_eq, agriculture, exoskeletons, nanometal,
  hull_manufacture, aquatic_agriculture, hazmat_equipment, antimatter_production, spaceport_expansion,
  improved_fertilizers, advanced_mining_equipment, alloy_production, orbital_assembly, consumer,
  drug_production, maglev, resort_tech, advanced_logistic, dual_trade_system, streamlined_production,
  each `aotd_tech_` + that). AI factions never "research" any other tech, another mod's included.
  SagaLib 1.4's VoK bridge uses these (its FORMAT.md, "Vaults of Knowledge research").
- **Faction research stance**: `data/campaign/aotd_faction_behaviour.csv`, merged across all mods (key
  `factionId`, `getMergedSpreadsheetData`). Header: `factionId,researchStance,forbidden_tech,db_cash_mult,
  db_rep_mult,initResponse,dialogSelectOptionName,dialogDismayOptionName,responseAfter`. Stances:
  MERCENARY, PRIORITIZE, BALANCE, RESTRICTIVE, CLEANSE. It decides how the faction buys databanks
  (credits and reputation multipliers, the dialog lines).
  (Task #77, `FactionResearchAttitudeData.getDataFromCSV`, `ResearchSell`.) `researchStance` goes
  through `AoTDAIStance.valueOf`; an unknown name (and a faction with no row) is `DEFAULT`, and
  `ResearchSell`'s `personCanAcceptDbs` turns the databank trade down for `DEFAULT`. The enum also has
  `SPECIAL` and `NEGLECT`, which no file uses. **Who buys** (rule `databanks_turnInOption`, PopulateOptions,
  `$isPerson` + `ResearchSell personCanAcceptDbs`; seen in game 2026-11-20): only a person whose post is
  base, station or outpost commander or administrator, of a faction with a VoK research manager and
  attitude data. An agent or other contact never gets the option. Without databanks in cargo the option
  is there but disabled. **In 5.0.7 the option never shows** (seen in game 2026-11-20 at Tri-Tachyon's and
  an independent administrator, with databanks in cargo): `execute` returns the `personCanAcceptDbs`
  answer before it sets `buysDatabanks`, which that check requires, so it is always false. The stance and
  multipliers are read but have no effect on the player until VoK fixes it. `db_cash_mult` / `db_rep_mult` are `getDouble` (an empty
  or non-number cell throws while loading); `forbidden_tech` is split on ","; an empty dialog line
  falls back to VoK's own default. VoK's own rows multiply by 0.2–3 (credits) and 0.2–1 (reputation).
  The file's header ends with an empty column (`…,responseAfter,`).
- **Items**: `research_databank` (commodity, `nonecon`, price 5000) is the main research cost and the
  obvious quest reward. 13 special items (`omega_processor`, `turing_engine`, `aotd_shrouded_*`, …) and 7
  more commodities (`advanced_components`, `water`, `refined_metal`, …).
- **Locked vanilla industries**: only in the build menu (BMO requirement listeners: aquaculture, farming,
  mining, refining, heavyindustry, orbitalworks, lightindustry, fuelprod, commerce, megaport). An
  industry added in code (`market.addIndustry`, as SagaLib does) runs normally. But on **AI faction
  markets** VoK's `AIColonyManagerListener` swaps industries once that faction has researched the
  upgrade (heavyindustry → orbitalworks, lightindustry → `aotd_commercial_manu`, fuelprod →
  `aotd_fuel_refinery`, mining → `aotd_mining_megaplex`), so a mod's NPC market can change with VoK.
- **Code only** (rows exist, but each needs a Java class): research projects, special projects
  (`aotd_projects.csv`), megastructures (`aotd_megastructure*.csv`).
- `LunaSettings.csv`: research speed and tier unlocks (`aotd_research_speed_multiplier`,
  `aotd_tier_1_unlock` … `aotd_tier_experimental_unlock`); `magic_achievements.csv`: 13 achievements.

#### AoTD - Seats of Power 3.2.1 (`aotd_sop`) and Dreams of Past 3.0.6 (`Cryo_but_better`)

- **SoP**: policies (`aotd_policies.csv`, merged key `id`), ambitions (`aotd_ambitions.csv`,
  `aotd_ambitions_tasks.csv`), faction capital and timeline. Every row names a Java class. All of it is
  the player faction's (singletons `$aotd_faction_manager`, `$aotd_amb_manager`). No rule commands. The
  capital is a market condition, `aotd_capital`, so `MarketHasCondition aotd_capital` reads it.
  `tag_data.json` is vanilla's intel-tag file (one filter tag). It replaces no vanilla id.
- **DoP** replaces vanilla's `cryorevival` industry (plugin `DisabledVanillaCryoRevIndustry`, upkeep
  10) and adds `cryoorganharvester`, `reawakening_facility`, 2 conditions and the `ark` entity. It doesn't
  need ToT.

#### Building Menu Overhaul 2.1.0 (`bmo`)

The colony build menu. It reads every enabled mod's `data/campaign/industries.csv` (`loadCSV` per mod)
and makes a filter tag per mod, so a mod's industries are grouped under its name with no work. Its
extension points (upgrade paths, build requirements) are Java (`UpgradePathManager`,
`AdditionalReqManager`). No data format.

#### Industrial.Evolution 4.1.b (`IndEvo`; needs LazyLib, MagicLib, LunaLib, GraphicsLib)

Content, not a new economy: vanilla's supply, demand and prices work as usual.
- **Replaces** vanilla's `commerce` industry (plugin `indevo.industries.TradeCenter`) and the
  `wormhole_anchor` item's plugin; `settings.json` changes `adminSalaryTier1..3`; it prepends a "Type:"
  line to every industry description.
- **Every market**: `IndEvo_ressCond` is put on every market in the economy on each load and economy
  tick. It adds `IndEvo_parts` supply and demand to heavy industry (and the optional Corruption, off by
  default).
- **Commodities**: `IndEvo_parts` (Ship Components, an economy commodity, base price 120, in vanilla's
  `extended` drop group), `IndEvo_rare_parts` (Relic Components), `IndEvo_pet_food`. 42 special items:
  VPC chips (`IndEvo_vpc_*`), forge templates, industry items (`IndEvo_log_core`, `IndEvo_neurals`,
  `IndEvo_transmitter`, `IndEvo_simulator`), consumables (`IndEvo_consumable_*`), pets.
- **Industries**: 45 new. Most check `isPlayerOwned()` in their effects, so on an NPC market they only
  have their supply and demand. Ruins industries need the condition `IndEvo_RuinsCondition`. Each is
  switched by a LunaLib setting with the industry's id.
- **New game**: places industries on vanilla markets, the Galatia Academy market, core-world and
  derelict artillery stations, minefields and Gacha stations. Derelict artillery skips systems tagged
  `theme_hidden`, `theme_special`, `system_cut_off_from_hyper` or `system_abyssal` and planets tagged
  `not_random_mission_target`, and picks themed (remnant, derelict, ruins) systems.
- **Merged lists another mod can add to** (key `id`, mod `IndEvo`, path from IndEvo's `settings.json`;
  one column `id`): `data/config/indEvo/embassy_whitelist.csv` (**factions** that can have an embassy:
  persean, tritachyon, hegemony, …), `custom_order_blacklist.csv` (factions without custom orders; the
  faction memory key `$IndEvo_customOrderAllowed` overrides it either way),
  `reverse_engineering_whitelist.csv` and `printing_whitelist.csv` (hull ids),
  `lab_commodity_whitelist.csv`, `ruins_industry_whitelist.csv`, `bureau_industry_whitelist.csv`,
  `shipping_submarkets_whitelist.csv`, `world_tree_whitelist.csv`, `rural_polity_blacklist.csv`,
  `hidden_arcologies_*.csv` (planet types). Also merged: `data/campaign/pets.csv`.
- **Rule commands** (selection): `IndEvo_marketHasIndustry`, `IndEvo_marketIsPlayerOwned`,
  `IndEvo_HasGenericSpecialItemInCargo`. They are IndEvo's own commands, so they can't be used in an
  optional mod's rules (§10.2).
- Ships `data/config/exerelinFactionConfig/` and `vayraBounties/` without depending on them.

#### Other installed mods with colony content

Only new ids, no new economy: Random Assortment of Things 3.3.1 (7 commodities, all `nonecon`; 2
industries; 11 conditions; 8 items), United Aurora Federation 0.8.4c (9 commodities, 6 of them economy
goods; 6 industries; 22 conditions; 23 items), Hazard Mining Incorporated 0.5.0e (`red_water` economy,
`mess_nano`; 12 industries), Arma Armatura 3.3.8 (4 `nonecon` commodities, 3 industries), Crew Replacer
0.7.8 and Second-in-Command 2.1.1 (`nonecon` / `meta` commodities). **Nexerelin 0.12.2d** changes only
the `script` column of vanilla's `pirate_activity` and `comm_relay` conditions and of the `open_market`,
`black_market`, `storage`, `generic_military` and `local_resources` submarkets, and adds `prisoner`
(`nonecon`).

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
- **A quote mark at the very end of an option label is dropped** (seen in game 2026-11-20, task #77):
  `Grant VoK's "Agriculture Industrialization"` showed as `Grant VoK's "Agriculture Industrialization`.
  A quote inside the label stays (`Has the player researched "Granted Gift" (test 77)?` was shown whole).
  Saga Forge warns about a label ending in `"` (options, start options, arrival options).
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
