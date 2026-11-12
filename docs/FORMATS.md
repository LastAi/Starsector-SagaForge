# Saga Forge: how the game reads and merges files (0.98a-RC8)

The facts Saga Forge's readers and writers rely on (PLAN.md §6). Each one says how it was
checked:

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

## Token replacement (code)

- Plugins registered with `RulesAPI.addTokenReplacementGenerator(...)` are applied to a rule's
  text, its option labels and `AddText` lines. After that the game fills tokens from memory
  (`Misc.replaceTokensFromMemory`).
- The list is `transient`: it isn't saved. Vanilla's `CoreLifecyclePluginImpl.onGameLoad`
  re-adds its generators on every load, and SagaLib does the same.
- Tokens are matched case-sensitively. Vanilla registers variants (`$playerName`, `$PlayerName`,
  …) separately.

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
