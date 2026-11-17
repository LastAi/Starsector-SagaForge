# Starsector 0.98.5a: impact on Saga Forge and SagaLib

Assessment for task #45, 2026-11-12. Analysis only: no editor or SagaLib code was changed, and the
current install (`D:\Starsector`, 0.98a-RC8) was not updated.

**Status (2026-11-12, task #46):** R1–R4 are done in the editor (CHANGELOG "Unreleased"), with the
0.98.5a facts in FORMATS.md and the in-game items in INGAME-CHECKS.md, "0.98.5a". Still open: R5
(optional), R6/S1 version bumps at release, R7 is covered by the INGAME-CHECKS setup line, and
§4 step 3 (the in-game run).

## How this was checked

- **Game files**: every non-media file of `D:\Starsector\starsector-core` (0.98a-RC8) was compared
  with `D:\Starsector_98_5a\starsector-core` (0.98.5a-RC5, the version string in
  `com.fs.starfarer.Version`). The diffs that matter here are quoted below.
- **API source**: `starfarer.api.zip` from both versions, diffed: 395 files changed, 75 added, none
  removed.
- **Engine**: the rules loader (`campaign.rules.Rules`), the portrait loading in `SpecStore` and
  the launcher's version check (`ModManager$VersionInfo`) were disassembled with `javap`.
- **SagaLib**: compiled against the 0.98.5a jars into `.cache/sagalib-0985a-check` (not into
  `jars/`). Result: compiles, **all 56 tests pass**, and the 115 class files are **byte-identical**
  to a build against 0.98a. The shipped `SagaLib.jar` therefore links unchanged on 0.98.5a.
- **Release notes**: the forum thread
  (<https://fractalsoftworks.com/forum/index.php?topic=35147.0>) could not be read from here. Both
  the fetch tool and PowerShell got a Cloudflare challenge or HTTP 402, and so did the releases
  blog. Headline items came from search-result summaries only:
  - the Sindrian Diktat storyline;
  - **Survival Mode** (the code calls it "extended mode");
  - Domain-grade Parts that repair d-mods;
  - inactive officers;
  - support fleets from a Military Base;
  - scavengers who buy salvage;
  - faction commission bounties +66%, and the stipend now based on officers;
  - a hotfix on 2026-11-11 for a main-menu mission crash.

  Everything else here comes from the files, so line items that only change engine behaviour
  could be missing. **Action:** someone with a browser should skim the notes' modding section for
  anything not covered here.

Severity: **High** = wrong output or missed data without a warning. **Medium** = misleading or
outdated, but nothing breaks. **Low** = polish or wording.

---

## 1. Required changes and risks

### 1.1 Saga Forge (editor)

| # | Severity | What changed in 0.98.5a | Effect on Saga Forge | Proposed change |
|---|---|---|---|---|
| R1 | **High** | `settings.json` has a new key, `"rules": ["data/campaign/rules.csv", "data/campaign/rules/askoniaCrisis2.csv"]`. The engine (`Rules`) loads **every** file in that list, each as a merged CSV keyed by `id`, so mods still override rows at the same path. The comment says same-id rules in *different* listed files clash instead of overriding. Vanilla moved **5,510 rules** (the new Diktat storyline) into `rules/askoniaCrisis2.csv`; `rules.csv` itself has 10,615. | `gameindex.ts` reads only `data/campaign/rules.csv` for each source, so the index misses a third of vanilla's dialog. As a result:<br>• the id-clash check can't see collisions with those rules;<br>• Play mode / Test context and the "existing dialog" views don't know them;<br>• the flags scan misses their `$` keys. | Read the merged `settings.json` `rules` list (arrays append across mods) and parse **every listed path in every source**. Keep `data/campaign/rules.csv` as the fallback when the key is missing (0.98a). Record which file each row came from. Add a FORMATS.md entry ("rules.csv → rule file list, 0.98.5a, code") and an INGAME-CHECKS item: does a mod row with the same id in a *different* listed file crash or get ignored? |
| R2 | Medium | Version string `0.98.5a-RC5`. A fresh install has **no `starsector.log`** (none ships in the new folder). | `readGameVersion` only reads the log, so a fresh install reports no version.<br>• `defsFor()` falls back to the 0.98a definitions anyway: `"0.98.5a…"` doesn't start with `"0.98a"`. Right now that's harmless because 0.98a is the only built-in set.<br>• **New mods get `gameVersion: "0.98a-RC8"`** (`index.ts:180` uses `defsFor(null).gameVersion`). | Also read the version from `starfarer_obf.jar` (`com/fs/starfarer/Version.class` holds the literal `Starsector 0.98.5a-RC5`), and use the log only as a fallback. Make `defsFor` treat `0.98.5a` as its own version (see R3). |
| R3 | Medium | The game definitions changed. **New rule commands**:<br>• `PersonCMD makeImportant/makeUnimportant [person] [$flag]`<br>• `HasContactFromFaction <faction> [vipBlacklist]`<br>• `MarketHasIndustry <id…>` (true if the market has any of them)<br>• `PersonIsDefaultMarketPost [person]`<br>• `ShowPlayerPerson`<br>• `FinishVisualFadeFast`<br>• `SellToFleet` (salvage)<br>• `SDR_CMD` (story only)<br>**Changed parameters**:<br>• `RepIsAtWorst` / `RepIsAtBest` (and `RepGTE`): one argument = active person, else the entity's faction; the first argument may now be a **person id**<br>• `SetPersonHidden <bool>` with no person = active person<br>• `MovePersonToMarket <person> [market] [forceAddToComms]`<br>**New ids**:<br>• posts `personnelOfficer`, `underworldBoss`, `exile`, `associate_academician`, `assistant_academician`, `gammaCore`/`betaCore`/`alphaCore`<br>• ranks `artificialIntelligence`, `criminal`, `fugitive`<br>• faction `diktat_achilles` (Sindrian Reformers)<br>• code people `achilles_andrada`, `hector_andrada`, `hercules_andrada`, `bellamy_kanta`, `ko_jove`, `faro_inesis`, `simisola`, `benoit`, `lott`, `gallu_blanc`, `maeus_moroz`, `crasis`, `aureolin`<br>• entity `asteroid_base`<br>**New tokens**: hub missions set `$PersonFirstName` / `$PersonLastName` | The command picker, parameter hints, rank/post pickers, the people list and the token list are all 0.98a-only. Mods written against 0.98.5a get false "unknown command / unknown person" problems. | Add `src/shared/defs/0.98.5a.json` (or a patch that `extends` 0.98a) with the items in the left column. Regenerate it the same way 0.98a.json was made, but from the 0.98.5a API source. Pick it when the version starts with `0.98.5a`. |
| R4 | Medium | `player.faction` portraits: new keys `player_male` / `player_female` feed the **new-game portrait picker** (`SpecStore` → `getMalePortraitForNewGame`). `standard_male` / `standard_female` on the player faction is now a different, shorter list (e.g. for the player's own officers). | A faction patch on `player` that adds to `portraits.standard_*` **no longer adds new-game portraits**. That is the usual reason to patch `player.faction`. Saga Forge has no player-portrait feature yet, but the faction form lets anyone patch `player`. | In the faction form, when the faction is `player`, show `portraits.player_male` / `player_female` fields, with field help explaining the split (needs 0.98.5a defs). FORMATS.md entry. |
| R5 | Low | `commodities.csv` got a new column, `sell price mult`, inserted after `base price`. `ship_data.csv` got `parts/dmod`, `salary` and `salMult`. | None found. The game and Saga Forge both read CSVs **by column name**, and the editor writes commodity rows with its own header (`COMMODITIES_HEADER`), so old rows still load. No ids were removed from ship, weapon, hullmod, skill, industry, condition or special-item data. The only removed files are the variants `kite_Stock` and `ziggurat_HF`, which nothing of ours references. | Optional: add `sell price mult` to `COMMODITIES_HEADER` (empty by default) once 0.98.5a is the target. No change is needed for 0.98a output. |
| R6 | Low | The launcher compares versions as `0.98a-RC8` → major `0.98`, minor `8` (RC), no patch, and `0.98.5a-RC5` → major `0.98`, minor `5` (RC), patch `5`. RC minors are skipped, so the **patch differs**: `PATCH_MISMATCH`. | Mods marked `0.98a-RC8` (SagaLib 1.0, Vanguard Compact, anything the editor creates today) are classed `PATCH_MISMATCH`. That is the launcher's mildest level, which should be its *"Warning: … might run with this one"* message, but which of the two messages it shows was not traced; **check in the launcher**. | When 0.98.5a is the target, the editor should write the detected game version (R2) into new mods' `mod_info.json`. SagaLib and the example mod need a version bump at release. |
| R7 | Low | `settings.json` now has `"devMode": false` by default. | Docs that tell testers to use dev tools (INGAME-CHECKS.md, the TEST-MOD-CHECKLIST "In game" steps) must say to turn on dev mode in `settings.json`. Debug rule logging and the new rules hot-reload (I5) also depend on it. | Add one line to INGAME-CHECKS.md setup when the in-game checks move to 0.98.5a. |

### 1.2 SagaLib (runtime mod)

| # | Severity | What changed | Effect | Proposed change |
|---|---|---|---|---|
| S1 | none | Every game API class SagaLib imports still exists, and the bytecode is unchanged. Changed classes it uses: `FactionAPI`, `InteractionDialogAPI` (methods added), `MemFlags`, `Ranks`, `Factions`, `Entities` (constants added), `FactionCommissionIntel`, `DerelictShipEntityPlugin`, `AddRemoveCommodity`, `BarCMD` (one added null check), `MusicPlayerPluginImpl`, `Misc`. | The 1.0 jar runs on 0.98.5a as it is; nothing to rebuild. It logs one harmless warning at load, because `Saga.KNOWN_GAME_VERSIONS` lists only `0.98a-RC8`. | At release, bump `gameVersion` in `mod_info.json` (R6) and add `0.98.5a-RC5` to `KNOWN_GAME_VERSIONS`. |
| S2 | Low (good) | `IsSoughtByPatrols` now **skips fleets with `FLEET_IGNORES_OTHER_FLEETS`**. | SagaLib sets that flag on encounter fleets (FORMATS.md, "Quest fleets get fought by patrols"), so ambush fleets no longer make the player count as "sought by patrols". This matches what we wanted. | Note in FORMATS.md. |
| S3 | Low | `FactionCommissionIntel`:<br>• stipend = `15000 + 3500 × active non-mercenary officers` (was `20000 + 5000 × player level`);<br>• bounty 500 per frigate-equivalent (was 300);<br>• ×0.1 income in Survival Mode;<br>• **no bounty for factions with `custom.noBountyForDefeating`** (set on Remnants, Derelict, Omega, Threat, Dweller);<br>• new "Annulled" update. | SagaLib's commission path (`GamePlayer.setCommission`, dev profiles) uses the same calls and still works. A Saga Forge faction that offers commissions gets the new pay automatically. | None needed. See idea I3 for the new faction flag. |
| S4 | Low | Survival Mode (`Misc.isExtended()`): derelict ships spawn in worse condition (`ext_reduceDerelictQuality`), Galatia's derelicts can't be recovered, many prices and salaries scale, and mission rewards get a distance bonus (I4). | A SagaLib wreck with an **explicit** condition is unaffected. One left to vanilla's random roll will skew to wrecked or battered in Survival saves. Fixed SagaLib credit rewards are not scaled, so they feel larger in Survival's tighter economy. | Mention this in the editor's reward and wreck field help. See I4. |
| S5 | Low | Vanilla Askonia rework: Sindria can end the storyline devastated, and `diktat_achilles` (Sindrian Reformers) can take over. Some unnamed entities now have ids (`askonia_nav_buoy`, `askonia_sensor_array`). Many vanilla people now have the `no_random_missions` tag, and some posts changed. | A quest that places people or targets at Sindrian markets can find the owner or the market changed mid-save. Same class of risk as Nexerelin invasions (§11.7). | The "market must still exist / have the expected owner" checks planned for §11.2 and #31 should include vanilla story outcomes, not only Nexerelin. |
| S6 | — | New saves are needed for Survival Mode only; it is picked at new game. SagaLib saves only ids (PLAN §6). | Nothing found that breaks SagaLib state in a save continued from 0.98a. **Not tested in game**: continuing a 0.98a save that has a running SagaLib quest on 0.98.5a. | Add it to the in-game list for the 0.98.5a move. |

### 1.3 Nothing to do

These were checked and need no change:

- `person_missions.csv` and `bar_events.csv` headers and loading (only vanilla frequencies changed);
- `special_items.csv` columns;
- `market_conditions.csv` (one name typo fixed; `water_surface` is now tagged `planet_search`);
- `.faction` merge rules;
- `custom_entities.json` format;
- `factions.csv`;
- `FleetFactoryV3` / `FleetParamsV3`, `RuleBasedInteractionDialogPluginImpl`, `CoreReputationPlugin`, `FireAll`, `FireBest` (only a comment added).

`secondaryUIColor` already existed in 0.98a, and the form already offers it; vanilla uses it for the first time.

---

## 2. Integration ideas

| # | Idea | Where it fits | Size |
|---|---|---|---|
| I1 | **Own rules file per mod.** 0.98.5a lets a mod add `"rules": ["data/campaign/rules/<modid>.csv"]` to its `settings.json` (arrays append) and keep its dialog out of the shared `rules.csv`. Benefits: no owned-block markers needed in a shared file, cleaner diffs, and hand-written rows untouched. Costs: **0.98.5a-only**, so a mod exported this way breaks on 0.98a. Same-id behaviour across files must be checked in game first. | Export option after R1, default off until 0.98a support is dropped. | M |
| I2 | **New vanilla commands in dialog presets.**<br>• `PersonCMD makeImportant/makeUnimportant` gives a quest NPC vanilla's "important" marker without SagaLib.<br>• `MarketHasIndustry` gives "only if the market has a military base / waystation" conditions.<br>• `HasContactFromFaction` gives "only if the player has a contact in faction X".<br>• `RepIsAtWorst <level>` with one argument gives "this person likes the player" checks without naming the person.<br>• `ShowPlayerPerson` shows the player's portrait in a scene.<br>• `MovePersonToMarket … true` moves a quest giver and lists them on the comms board. | Condition/action presets in the inspector (#30, or #36 if small); Play mode support for each. | S–M |
| I3 | **Faction flag `custom.noBountyForDefeating`.** Gives monster/automated factions (Remnant-like) no commission bounty. Expose it as a Behavior checkbox. | Faction form (#30, or #36). | XS |
| I4 | **Distance-scaled rewards.** `Misc.getModifiedMissionReward(target, reward)` adds vanilla's distance-from-Askonia bonus (settings `missionRewardMinDist` 10, `MaxDist` 32, `MaxBonusFraction` 0.65, `BonusCap` 150000; `ext_` variants in Survival). A per-quest SagaLib option "scale like vanilla bounties" would match vanilla balance. **Needs a SagaLib built for 0.98.5a**: the method doesn't exist in 0.98a, so call it reflectively or drop 0.98a. | SagaLib 1.1 + quest reward form; pairs with §11.2 random targets. | S |
| I5 | **Faster dialog iteration.** In dev mode, 0.98.5a's `Rules` checks each listed rules file's modification time and reloads changed files (engine code; not checked in game). With "Export dialog only", a modder could edit text and see it in the running game without restarting. SagaLib's F-key JSON reload already does the same for quest JSON. | Docs plus a "Live test" note in the Export dialog; INGAME-CHECKS item first. | XS (docs) |
| I6 | **Survival Mode awareness.**<br>• Expose `Misc.isExtended()` as a SagaLib condition (`SF_IsSurvivalMode`, or a `$global` flag set at load), so quests can give different rewards or text in Survival saves.<br>• Show both values for prices and rewards in field help. | SagaLib 1.1 + editor condition preset. | S |
| I7 | **Domain-grade Parts as a reward.** New commodity `parts` (base price 10,000, `nonecon`) and drop groups `parts_10` / `parts_33` / `parts_50`, now in most salvage and ruins drops. Quest rewards and loot tables (RUINS-ASSESSMENT F7) can offer it like any commodity. Item pickers get it from the index automatically, but it's worth a preset ("Domain-grade parts ×N"). | Reward presets (#30); F7 loot tables. | XS |
| I8 | **`asteroid_base` entity type.** New vanilla custom entity with an interaction dialog, a neutrino signature, discovery XP and its own description. A good default for "hidden base" locations: smugglers, rendezvous points. It shows in the entity-type picker automatically; add a Location preset. | Locations (#30 / #35 random locations). | XS |
| I9 | **New encounter music ids** `music_encounter_discovery`, `_tense`, `_anomalous`, `_diktat`. The music picker reads `sounds.json`, so these appear automatically; suggest them in encounter and entity presets. | Encounters page help. | XS |
| I10 | **`FactionAPI.setDescIdOverride(id)`**: switch a faction's intel description at runtime. A natural SagaLib action, "faction description changes after the quest" (e.g. a reformed faction), fitting §11.4 world events. 0.98.5a-only API. | SagaLib action + event design (§11.4). | S |
| I11 | **`$PersonFirstName` / `$PersonLastName` tokens.** Now set by vanilla hub missions. Saga Forge's Play mode already has `personFirstName`; add the vanilla-style token names to the token list so text written in the vanilla way previews correctly. | Defs (R3). | XS |
| I12 | **`no_random_missions` tag** on SagaLib people: keeps vanilla missions (VIP transport, GA deliver VIP) from using a quest NPC as a random target. Add it as a checkbox on the People page, default on for story characters. | People form (#30, or #36). | XS |

---

## 3. Effect on the existing tasks (mod-related tasks #27 and #31 out of scope)

### #41 Draft checklist of everything the editor can create (active in another session)

- No 1.0 workflow breaks on 0.98.5a. But the checklist is written for 0.98a, and testing it on
  0.98.5a would hit **R1** (vanilla Askonia dialog missing from Test context and clash checks) and
  **R4** (player portraits).
- Suggestion: one line under "Suggested setup" saying which game version the run used. If the run
  is on 0.98.5a, note that dev mode is off by default (R7).
- Possible future rows for section 13 (planned): own rules file per mod (I1), Survival-mode
  conditions (I6).
- No edit was made to the checklist; the other session owns it.

### #42 Fix missing default special-item icon, crest size hint, add quest icon field

- **Crest size hint**: 0.98.5a's new crest (`crest_sindrian_diktat_reformer.png`) is **256×256**,
  like `crest_hegemony.png`, and the new flag is 410×256. Hints based on 0.98a sizes stay correct.
- **Quest icon field** (`person_missions.csv` `icon` column): vanilla's new mission icons
  (`seven_sons.png`, `heir_to_andrada.png`) are **64×64** in `graphics/icons/missions/`, the same
  as 0.98a's. The field and its hint need no change; the picker will list them if it scans that
  folder.
- **Default special-item icon**: no change to special items' columns or plugins. The new
  `domain_parts.png` cargo icon is 80×80 (a commodity).

### #36 Full workflow checks and user-requested workflow updates

- Do **R1** before or during this pass if it runs on 0.98.5a. Otherwise the Test context and the
  existing-dialog views are visibly incomplete for Askonia.
- Candidates for "small convenience" items: I3, I12, the `player` portrait fields from R4, and
  `secondarySegments` next to `secondaryUIColor` in the Colors tab. The number is the count of
  coloured segments in the faction's UI stripe; vanilla's Reformers use 6.
- First-launch flow: the game-version detection fix (R2) belongs here, because a fresh 0.98.5a
  install has no log.

### #39 Forum release post: Saga Forge 1.0 + SagaLib 1.0

- The 1.0 releases were tested on **0.98a-RC8** and are titled `[0.98a]`. Under FORUM_POST_RULES
  the title starts with the game version.
- Recommendation: post 1.0 as `[0.98a]` now. Add one line that SagaLib 1.0 also **loads on
  0.98.5a** (binary check above), but in-game testing on 0.98.5a is pending, and the launcher shows
  a version warning (R6).
- Alternatively, wait for a 1.0.1 with R1–R3 and post as `[0.98.5a]`, if most players have
  already moved. **Ask the user.**

### #30 Saga Forge after 1.0: editor features

- **R3** (0.98.5a definitions) is the base for everything else here. It belongs at the start of
  #30 if it isn't done as a separate update task.
- §11.2 random targets: `MarketHasIndustry`, `HasContactFromFaction` and the reward distance
  bonus (I4) are new building blocks. Random-target criteria should avoid people tagged
  `no_random_missions`, as vanilla does.
- §11.3 quest templates: vanilla's reward scaling (I4) and Survival-mode values (I6) should feed
  the templates' "typical rewards".
- §11.4 world events: 0.98.5a's Diktat storyline is a large new reference for `BaseEventIntel`
  use, with points, factors and stages: `intel/events/sd/SDDevastation`, `SDResolution` and about
  30 factor classes. Add it to the "Research first" list. I10 (description override) is a
  ready-made event action.
- §11.5 translation export: own rules files (I1) would make a translation mod simpler, since it
  overrides one file.

### #35 Plan randomized and runtime-generated content: ruins follow-ups, random locations, random event pools

- **F6 / F7 (loot tables)**: `salvage_entity_gen_data.csv` and `drop_groups.csv` changed
  **content only, not columns**.
  - New groups `parts_10` / `parts_33` / `parts_50` are added to derelicts, caches, habitats and
    every `ruins_*` spec (e.g. `ruins_vast` drops `parts_50:2x300000`).
  - The loot-table editor's vanilla presets and expected-loot preview must be generated from the
    installed game, not hard-coded from 0.98a.
  - Survival mode scales salvage (`ext_*SalvageDropFraction`, `ext_partsSpecialSalvageDropFraction`).
    The preview could show both modes.
- **F1 (ruins planets)**: `condition_gen_data.csv` changed one value (`farmland_bountiful`). No
  structural change.
- **G6 salvage specials**: `ShipRecoverySpecial`, `SleeperPodsSpecial`, `CargoManifestSpecial`,
  `SurveyDataSpecial` and `SalvageDefenderInteraction` changed, mostly Survival-mode scaling and
  defender handling. Re-read them before designing `SF_SetSpecial` / `SF_SetDefenders`.
- **Random locations**: the new `asteroid_base` entity (I8) is a ready vanilla type for
  random hideouts. `MiscellaneousThemeGenerator` gained Survival-mode branches; check them when
  copying vanilla's placement rules.
- **Random event pools**: same reference as #30 §11.4 (the `sd` event package).

---

## 4. Suggested order when the projects move to 0.98.5a

1. R1 (rules file list in the index), R2 (version from the jar), R3 (0.98.5a definitions): one
   editor update, with tests: a fixture `settings.json` with two rule files, and version parsing.
2. FORMATS.md: the 0.98.5a entries from this document (rules list, portrait keys,
   `IsSoughtByPatrols`, commission formula, launcher version levels).
3. In-game checks on 0.98.5a with throwaway saves:
   - SagaLib 1.0 + Vanguard Compact on a new game;
   - continuing a 0.98a save with a running quest;
   - the launcher message for `0.98a-RC8` mods;
   - same-id rules across two listed files;
   - dev-mode rules hot reload.
4. Release bump: `gameVersion` in SagaLib, Vanguard Compact and the editor's new-mod default.
   Release titles become `[0.98.5a]`.
5. Ideas I1–I12 as they fit #30 / #35.
