# In-game checks

What only a person playing the game can confirm, collected per milestone (PLAN.md §7, §8).
Everything else is covered by the automated tests (`npm test`, and `bash build.sh` in
`mods\SagaLib`).

## Results for 1.0

- **Acceptance walkthrough (M6–M8, steps 1–12 below): passed in game on 2026-11-11**, Starsector
  0.98a-RC8. Step 11 (an update with a renamed stage keeps a save's progress) is the 1.0 "done
  when". Step 12 ran with the full mod list (126 mods), and the log had no errors from our mods.
  The fixes found on the way are listed in the steps (9b) and in `docs/FORMATS.md`.
- **Skipped:** step 6's "other pirate fleets keep vanilla's greetings". No other pirate fleet was
  met during the run; the comm dialog is scoped to the ambush fleet (`$entity.sagaforge_encounter`),
  so this is left to be seen in normal play.
- **M0 formats:** the items recorded as "Confirmed in game (2026-11-11)" in `docs/FORMATS.md`.
- The per-milestone lists (M1–M7) were not run item by item; the walkthrough covers their main
  paths.
- **Linux: on hold** until a dedicated Linux tester is found (see the last section).

## M0: formats (test mod `mods\SagaForgeFormatTest`)

Setup: link `D:\ModTools\mods\SagaForgeFormatTest` into `D:\Starsector\mods`, enable it, and
start a **throwaway** game. It turns Hegemony red on purpose.

1. The game loads without errors, so the unquoted `#` rows in `rules.csv`,
   `person_missions.csv` and `bar_events.csv` are skipped.
2. Hegemony's color is red everywhere (intel tab, map). This means a 4-number color in a patch
   **replaces** the original.
3. At a Hegemony market, food is illegal **and** the usual illegal goods still are. This means
   patch lists are **appended**.
4. The intel tab → Factions lists "Format Testers" with the test mod's flag and crest.
5. Dock at any market. The menu has "SF test for <your name>: show-once option". Your name is
   filled in, which confirms tokens work in option labels.
6. Pick it, and:
   - the test mod's illustration appears on the left;
   - the text shows, in order: "1. This is the rule's text…", then "2. This line comes from an
     AddText script line.", then the "gained 1 credit" and "gained 1 Test black box" lines;
   - the option is gone from the menu.
7. Leave the market and dock again. The option is back (`= true 0` lasts until the dialog
   closes).
8. The cargo screen shows the Test black box with the box icon, and its tooltip shows the
   description from `descriptions.csv`. The market's trade screen doesn't buy or sell it.
9. Take a screenshot of the dialog from step 6 at your normal UI scale, and note the scale. It
   sets the dialog preview's size and line breaks (M2).

Then disable the test mod. Saves made with it keep the black box in cargo; use a throwaway save.

## M1: factions

In Saga Forge, with a test mod as the active mod:

1. **+ New faction** "Vanguard Compact", pick a logo and a crest (they are copied into the mod), and
   add a few known hulls. Save, then link the mod into the game and start a new game. The faction
   appears in the intel tab with its colors, logo and crest.
2. **+ Change a faction…** → Hegemony: add a hull and a blueprint tag, set a hull frequency. Save.
   `data/world/factions/hegemony.faction` in the mod contains only those changes. In game the
   Hegemony still has all its usual ships; with dev mode, its fleets can include the added hull.
3. Try to remove a vanilla hull from the override: the editor refuses and offers a SagaLib
   scripted change instead (applied once SagaLib exists, M5).

## M2: dialog preview

1. Compare the Dialog browser's preview of a vanilla conversation with the game, for example
   Admiral Rao's greeting (`defaultRaoGreeting`), with an illustration
   (`gaDataDecivInteractionRaid`) and a "Gained" line. Check the line breaks, colors, option
   look and spacing, and report what differs. The window size is still an estimate (M0 check 9).

## M3: quest planner

No in-game checks: planning and Play mode run in the editor.

## M4: dialog and items

In a test mod: a conversation-only quest (a market or person option with a few Dialog nodes, a
show-once option and a Link back to the menu), a quest item, a Description tab text, and the mod's
own illustration. Then **Export**:

1. The conversation works in game next to the installed mods. The show-once option disappears
   after it is picked and comes back next visit (once per conversation), or never (once ever).
2. Re-export after changing one line: only the owned block in `rules.csv` changes, and any
   hand-written rows above and below it stay byte for byte the same.
3. Edit a row inside the block by hand and export again. The editor stops and offers Show diff,
   Overwrite and Detach.
4. The quest item appears in cargo with its icon and description. The illustration shows.

## M5: SagaLib quests, people, phrases, dev tools

Most of this is covered by the walkthrough below. These items are specific to SagaLib:

1. The log shows `[SagaLib] content: … 0 errors` on load.
2. A contact placed at a **vanilla** market (e.g. Jangala) offers her quest: "Do you have any
   work" lists it, and accepting adds it to the intel mission list.
3. A stage change shows a journal update in the dialog, and the stage's marker is highlighted on
   the map.
4. `SF_Reward` prints the "Gained" credits, reputation, item, XP and story point lines.
   Completing the quest marks it Completed, and she becomes a potential contact.
5. Each `SF_Show` display draws correctly: faction callout, heading, cargo grid, ship list.
6. A save made mid-quest:
   - edit a stage's text and load: progress is kept;
   - remove the stage and load: the intel says "changed by an update", and Abandon works.
7. Abandoning, and running out of a time limit, both behave like vanilla missions.
8. Known guesses to watch:
   - `SF_ShowFleets` without a spawned fleet;
   - dev-menu reload, which may be cached by the game's `loadJSON`;
   - phrase conditions that need a dialog count as false.

## M6–M7: SagaLib systems and encounters

1. An **older save** (made before the example mod was enabled) gains Kestrel once on load,
   because `addToExistingSaves` is on. Loading again doesn't duplicate it.
2. After the story-point bluff, the fleet heads for a jump point and leaves. No stray empty dialog
   appears, and `$global.vgc_signal_heard` is true.
3. After beating the fleet, a short dialog continues the quest *after* the post-battle screen,
   not inside it.
4. Moving the quest to "return" while the fleet is still out makes it leave (despawn on stage
   end).
5. A quest with a 1-day Wait timer fires its trigger about a day later.

## M6–M8: the acceptance walkthrough (Vanguard Compact)

Setup:
- Link `D:\ModTools\mods\SagaLib` and `D:\ModTools\mods\VanguardCompact` into `D:\Starsector\mods`
  and enable both.
- If you change the example in Saga Forge, export it again. To rebuild it from scratch, run
  `npx jiti scripts/build-example.ts` in `tools\saga-forge`.

1. **New game**: the game loads with no errors in `starsector.log` (search for `[SagaLib]`).
2. **Faction**: the intel tab lists the Vanguard Compact with its flag and crest. It starts
   hostile to the Hegemony and welcoming to the Independents. The Hegemony keeps its usual ships
   and colors.
3. **Location**:
   - Kestrel is on the map near Duzahk.
   - In the system: Kestrel I, Haven Station (a Vanguard market of size 5), the Kestrel Belt, the
     convoy wreck, a jump point and a comm relay.
   - Haven Station's description shows.
4. **Contact**: Commodore Ilse Reyes is in Haven Station's comm directory, with her portrait and
   rank. Her title for you is "Captain" at first.
5. **Quest offer**:
   - Talking to her offers "Ask about the missing convoy".
   - The offer text shows "Kestrel belt" and "60,000" highlighted.
   - "What's the catch?" disappears after you ask it.
   - The story-point option costs 1 story point and doubles the pay.
   - "Not interested." returns to her menu.
6. **Accept**:
   - The quest appears in the journal at "Find the convoy", with a map marker on the wreck.
   - The Belt ambush fleet (Belt Raiders, pirates) waits in the belt.
   - Its comm link shows the custom greeting, while other pirate fleets keep vanilla's greetings.
7. **Ambush**:
   - Beat the fleet (or bluff it away with a story point). The quest continues.
   - Visiting the wreck shows the wreck illustration and "Gained 1 Convoy black box", with the
     icon and the description in the cargo tooltip. It is a special item with `mission_item`:
     markets refuse it ("Can not remove item"), unlike the M0 test commodity.
8. **Report**:
   - The journal moves to "Report to Reyes".
   - Docking at Haven Station shows the arrival text, then Reyes's report.
   - Handing over the black box completes the quest with credits and reputation (double if you
     used the story option).
   - Docking again shows the normal market.
9. **Commission**: take a Vanguard commission and talk to Reyes. She now calls you "Commander
   <your name>". Salvage Rights is offered only after The Lost Convoy succeeded.
   - Haven Station's comm directory has one Station Commander (Reyes); vanilla's generated one is
     gone (log: "takes over the post").
9b. **The wreck is protected** (found in testing, 2026-11-11):
   - Before The Lost Convoy, and between the two quests, visiting the wreck shows "Compact
     property" with only Leave: no Explore, no salvage, no ship recovery.
   - Salvage Rights: accept, fly to the wreck. The rights text shows, "Begin salvage" completes the
     quest, and vanilla's own wreck dialog follows (Explore, salvage, recovery).
   - After salvaging it the wreck is gone and stays gone after save and load.
10. **Dev mode** (`devMode` true in `starsector-core/data/config/settings.json`, your own step):
    - On a new game SagaLib offers the test profiles. "Convoy found, report to Reyes" starts the
      quest at its second step.
    - Ctrl+F9 opens the dev menu: apply a profile, jump a quest to a step, reload the JSON after
      editing a stage's text in Saga Forge (Export, then reload). The new text shows without a
      restart.
11. **Update with a renamed stage** (the 1.0 "done when"):
    - In Saga Forge, Export, then **Mark as released** 1.0.0.
    - Play to the "Find the convoy" stage and save.
    - Back in Saga Forge, change the stage id `search` to `find` with **Keep the old id as an
      alias**. Set the version to 1.1.0 in `mod_info.json`, then Export.
    - Load the save: the quest is still at "Find the convoy" (now `find`), and `starsector.log`
      shows SagaLib's reconciliation line.
12. **Other mods**: with your usual mod list enabled too, the game still loads and vanilla
    dialog behaves as before.

## 0.98.5a

Facts from the code that need a run of Starsector 0.98.5a (docs/FORMATS.md, "Starsector
0.98.5a"). Use **throwaway saves** and a copy of a save, never the only one.

> **Run by the user, 2026-11-15 (task #48):** 1a crashed at load as expected; 1b and 1c pass (both
> same-id rules fire; the askoniaCrisis2 row is replaced). Option labels were cut at their second
> colon: the game splits options at every ":" (FORMATS.md; Saga Forge now warns). 2 (dev-mode
> reload): the edit didn't show; not confirmed. 3, 5 and the migrated `vanguard_by_hand` 1.2.0 on a
> new 0.98.5a game with SagaLib 1.1: pass, including Survival Mode. **4 is out of scope (user's
> decision)**: players don't carry saves across a game version change like 0.98a → 0.98.5a; only
> RC/letter updates (bug fixes that keep saves) are expected to continue a save.

Setup: in `starsector-core/data/config/settings.json` of the 0.98.5a install, set `"devMode":true`
(it is `false` by default since 0.98.5a; your own step, the editor never writes there). Items 1–3
need a small throwaway test mod, for example a copy of `mods\SagaForgeFormatTest` with the extra
files named below.

1. **Same-id rules across listed files.** The test mod adds
   `"rules": ["data/campaign/rules/sfs_extra.csv"]` to its `settings.json`, with one row whose id
   is also used in its own `data/campaign/rules.csv`:
   - a. same id, **same trigger** in both files: expected a crash at load with "Duplicate rule
     id: …" in `starsector.log`;
   - b. same id, **different triggers**: does the game load, and do both rules fire?
   - c. a row in the mod's `data/campaign/rules/askoniaCrisis2.csv` with the id of a vanilla row
     there (same path): it should **replace** vanilla's row, as `rules.csv` rows do.

   Record the results in FORMATS.md ("Rule file list"). Saga Forge already treats a shared id as
   an Error; if b. loads quietly, keep it an Error anyway.
2. **Dev-mode rules reload.** With the game running and dev mode on, change the text of the test
   mod's rule in `sfs_extra.csv` and save the file. Open the dialog again: does the new text show
   without a restart? Then the same for a row in the mod's `rules.csv`. (Idea I5: a quicker
   edit-and-look loop with "Export dialog only".)
3. **Launcher warning for 0.98a mods.** Enable SagaLib 1.0 and Vanguard Compact (both
   `gameVersion` `0.98a-RC8`) and open the launcher's mod list. Note the exact message for them
   (`PATCH_MISMATCH`: the mild "might run with this one" warning, or a stronger one?).
4. **Continuing a 0.98a save.** Copy a 0.98a-RC8 save that has a running Vanguard Compact quest
   (SagaLib 1.0) into the 0.98.5a `saves` folder and load it:
   - it loads, `starsector.log` has `[SagaLib] content: … 0 errors` and no new warnings from our
     mods (one known warning: SagaLib doesn't list `0.98.5a-RC5` in `KNOWN_GAME_VERSIONS` yet);
   - the quest is still at its stage with its map marker, and can be finished;
   - Haven Station, Reyes and the wreck's protection are as they were.
5. **New game on 0.98.5a** with SagaLib and Vanguard Compact: the walkthrough steps 1–9 above
   still pass.
   **Test mods for 1–2** (2026-11-15): `mods\SagaForgeRulesTestA` (1a only: same id and trigger in
   `rules.csv` and a second listed file, expected to stop the game) and `mods\SagaForgeRulesTestB`
   (1b: `sfr_dup` adds "SFR test B: pick me" at any market, its answer is the same id in
   `sfr_extra.csv`; 1c: at a Diktat market in dev mode the grey option reads "SFR OVERRIDE …";
   2: edit "EDIT ME" in `sfr_extra.csv`). Enable one at a time.
6. **Checked 2026-11-15 (walk, editor only):** status bar `Starsector 0.98.5a-RC5`, definitions
   `0.98.5a-RC5` in use, the Dialog browser lists the SDR rules (16,199 rules from 2 listed rule
   files), pickers label new ids ("Criminal · 0.98.5a only"). Migrating `vanguard_by_hand` (V1–V3,
   V5 in TEST-MOD-CHECKLIST §12b) exported 1.2.0 with `gameVersion` `0.98.5a-RC5`; a 0.98a
   snapshot is in its `sagaforge/backups`. Not looked at: the `player` override's New-game
   portraits fields.
   **Saga Forge against the 0.98.5a install** (editor only, no game run): pick
   `D:\Starsector_98_5a` in Settings. The status bar says `Starsector 0.98.5a-RC5` even though
   that install has no `starsector.log`; Settings → Definitions says `0.98.5a-RC5` is in use; the
   Dialog browser finds Askonia rules from `askoniaCrisis2.csv` (search `SDR` or `Achilles`); a
   new mod's `mod_info.json` has `"gameVersion": "0.98.5a-RC5"`; the `player` faction override
   shows "New-game portraits" fields.

## Untested: left for the workflow test mod

Features built without an in-game check, on purpose: the workflow test mod
(`docs/TEST-MOD-CHECKLIST.md`) uses all of them and is run in game. After that run, check this list
against what it covered; anything it missed still needs its own check.

- **Vanilla's rdsm text bugs as test cases** (outstanding, user 2026-11-16; RUINS-ASSESSMENT
  G11): vanilla's ruins mission reads `$rdsm_variant` (set as `$rdsm_variation`) and uses
  `$rdsm_marketName` (never set). The flags registry should flag both ("did you mean", "token
  nothing sets"). Make them regression cases next time the flags registry is worked on.
- **Quest icon** (task #42, 2026-11-14): a quest with its own icon (Quest settings › Icon › Pick…,
  copied to `graphics/icons/missions/<quest id>.png`) shows it in the intel screen and the
  contact's mission list; a quest with the field empty shows vanilla's `data_retrieval.png`.
  Checklist step Q9, asset A7.
- **Default special-item icon** (task #42): a new special item whose icon was never picked shows
  vanilla's `graphics/icons/cargo/chip1.png` in cargo (it pointed at a missing file before).
- **Check mod's missing-icon error** (task #42): editor only, covered by `test/icons.test.ts`;
  worth one look in the app (an item with a wrong icon path is listed under Problems after Check
  mod).
- **256×256 crest** (task #42): the Vanguard Compact crest, redrawn at 256×256, shows correctly in
  the intel tab and dialog faction callouts.
- **Name lists** (task #36 Phase 2, R3): a faction whose Person name sets is only the mod's pool
  gives its officers, administrators and contacts names from it (both genders), and its ships names
  from the mod's ship list. A pool with no last names: confirm the game borrows them from a random
  category (FORMATS.md, "Name lists"). Try one-name cats (the Heliopolis plan).
- **Fleet type names** (Phase 2): an encounter with a fleet type of the mod's own shows the name
  set in its faction's Fleet type names.
- **Additions orbiting a vanilla body** (Phase 3, R14): a station added to Askonia orbiting
  `sindria` (picked in Orbits) appears next to Sindria in game.
- **The mod's own types** (Phase 3, R21): an entity type that behaves like `station_side02` with
  the mod's own sprite shows that sprite, can have a market and be docked at. A planet type based
  on `barren` with its own texture shows the texture. A star type based on a vanilla star works as
  a new system's star (corona, light).
- **SagaLib 1.1** (Phase 4, needs SagaLib 1.1 installed; DESIGN-PHASE4.md). Nothing of it has
  run in game yet:
  - A starless system with its light colour.
  - An uncolonised planet showing its conditions and survey level.
  - An object that appears at a stage: not there before, there after, also after a reload.
  - A replacement: a station that becomes a wreck at the same spot.
  - A removal of the mod's own object, and of a vanilla object without a market.
  - A vanilla station with a market: kept with `keep`, decivilized with `decivilize`.
  - A player-near encounter at a range and "anywhere in the system".
  - The launcher with the `"version": "1.1.0"` dependency against SagaLib 1.0 and 1.1.
    **Checked 2026-11-15 (user)**: the mod runs with SagaLib 1.1, alone and with the usual mods.
    With SagaLib switched off in `enabled_mods.json` by hand, the launcher doesn't stop it (with
    1.0's dependency without a version it did); the game then fails loading rules with
    `Command [SF_Despawn] not found`. Decided: fine. It only happens when the enabled list is changed
    by hand or the launcher's warnings are ignored.
  - How the mod's own `drop_groups.csv` merges with vanilla's.
  - **Named fleets (Phase 5):**
    - An encounter using a named fleet shows its ship names ("CAT Thirty Days"), its flagship
      and its captain.
    - Beaten twice, `$global.sagaforge_fleet_<id>_defeats` is 2.
    - With "the captain dies", the captain is gone after the defeat: not at their market, and
      the next spawn has the fleet's own officer.
    - **Remove a person** from an Action does the same.
    - A fleet type name from Fleets › Fleet type names names a fleet of a faction that doesn't
      name that type.
  - **RC-F2 (Phase 4b):**
    - An Arrive option at a planet with a market, a station and an unguarded wreck: does
      `PopulateOptions` add it at each? At a wreck, vanilla's salvage dialog may not fire
      PopulateOptions; if not, those Arrives need "takes over the arrival".
    - A takeover Arrive still answers at a locked wreck at its step.
    - The place stands out on the map while the quest waits there (entity flags).
    - An interjection on `salExplore` at a derelict: it cuts in at its chance, at most once per
      object, and "Hand back" continues vanilla's salvage in the same dialog.
- **Random pools (Phase 7a, SagaLib 1.2)**, with `vanguard_by_hand` 1.3.0 on 0.98.5a, its
  conversation "Dock rumours" (Haven Station › "Ask the dockmaster for rumours": a Random branch,
  weights Pirates 3 / Survivor 2 once per playthrough / Rich 4 with 100,000 credits / nothing 2):
  - the log says `[SagaLib] content: … 1 pools …` and, per ask, `pool vgh_dock_rumours_rumour
    (object vgh_kestrel_station) picked …`;
  - asking again can give another reply; "Survivor" comes at most once per playthrough; "Rich"
    only with 100,000 credits or more; sometimes "Nothing new";
  - **stable**: save, ask (note the reply), load that save, ask again: the same reply;
  - each reply's Thanks returns to the station's menu.
- **System grid, test mod `grid_test`** (user, 2026-11-16; SagaLib 1.2, new game; enable alone or
  with the seven_* mods): 459 systems 3,000 units apart over the top-left quarter of the sector,
  made as the editor's New system makes them; 5 sit near Westernesse and Zagan on purpose.
  Rebuild: `npx jiti scripts/build-test-mod.ts grid_test`. Check:
  - how long the new game and a load take with it (compare with it off);
  - the map: the grid fills the top-left quarter; vanilla's random constellations should avoid it
    (the log's "closest other system after random generation" lines, one per grid system);
  - hyperspace inside the grid is free of storm clouds around each system;
  - near Westernesse and Zagan: how close is too close in game (the editor warns below 3,000);
  - Ctrl+F9 › "Grid: go to the middle of the grid".
- **Test Ranges moved** (2026-11-16): Test Range E had been placed 200 units from vanilla's
  Mayasura (their stars overlapped) and D 825 from it. All test ranges now sit north of the core
  worlds, at least 5,200 units from any vanilla system and 3,000 from each other
  (A 1000,5500 · B 4000,5500 · B Ruins 7000,5500 · C 1000,8500 · D 4000,8500 · E 7000,8500).
  **Start a new game**: existing saves keep the old positions. The Ctrl+F9 profiles still take
  you there.
- **Hyperspace clouds around new systems** (SagaLib 1.2 fix, 2026-11-16): on a **new game**, fly
  to any Test Range in hyperspace: no storm clouds right around the system, as around vanilla's
  systems. In an **existing** save, the clouds around the Test Ranges are gone after the next load
  (the log has no "clearing hyperspace … failed").
- **Phase 7 results (user, 2026-11-16, 0.98.5a):** passed: 7a (all); 7b-1, 7b-2, 7b-4 (ruins in
  their own system offer "Explore the ruins"), 7b-5 (ruins kept unexplored); 7c (all); 7d-1, 7d-2,
  7d-3 (and a beaten fleet that survives runs off); the safe-system filter over repeated 7d-1
  picks; 7e-1 to 7e-4 (no drop_groups errors in the log; the 2 hull-spec errors are vanilla's own);
  hyperspace clouds cleared around new systems; vanilla's random systems avoid ours (log spacing
  report, grid_test); 7b-3 (the gambler shows in about half of the months, and Watch a hand returns to the bar). **Skipped (user):** 7e-5 deciv
  guard. **Drop-group merge: passed** (drop_merge_test): a mod's
  row is **added** to a vanilla group (alpha cores and vanilla's metals from `basic` in both
  caches: A 6 cores / 3 metals, B 6 / 2).
- **Phase 7a: random pools, test mod `seven_a`** (SagaLib 1.2, 0.98.5a, dev mode, a throwaway
  save; enable `seven_a` + SagaLib 1.2; it replaces the "Dock rumours" check above, which can
  still be done too). Rebuild: `npx jiti scripts/build-test-mod.ts seven_a`.
  - **7a-0 teleport**: on a running game, Ctrl+F9 › Apply a test profile › **7a: go to Test
    Range A**. The menu closes and the fleet is next to Range Control A (system Test Range A).
    The log says `profile: player fleet moved to Range Control A`. (New in SagaLib 1.2: before,
    startAt only worked at a new game.)
  - **7a-1 inline pool, rolled for the world** (Range Control A › "Test 7a-1, roll the dice"):
    Roll a few dozen times. Common shows most; **Rare** at most 2 times in total; **Once** at most
    once in the whole game; **Daily** not again until a day has passed (wait a day, it can come
    back); **Rich** never with 50,000 credits, possible after profile **7a: rich**; Nothing
    sometimes. Each roll logs `pool sva_dice_roll (world) picked …`.
  - **7a-1 stable**: save, roll 3 times (note them), load, roll 3 times: the same three.
  - **7a-1 force**: profile **7a: force the next dice roll to Rare**, then Roll: Rare, and the log
    says `(forced)`; the roll after that is random again.
  - **Why rocks, not wrecks (context for 7a-2):** a per-object pool is meant for things like
    wrecks ("each wreck gives its own find"), so the first version of this test put the option on
    two derelict wrecks. Reading vanilla's rules while building it showed that a derelict's dialog
    is built by the salvage rules (`PopulateSalvageOptions1/2`), which never fire `PopulateOptions`,
    the trigger that menu options are added on. An option at a wreck would never have appeared, so
    the test moved to two uncolonised planets (vanilla's `surveyOpen` does fire `PopulateOptions`).
    Per-object pools work the same at any object. Since then (user, 2026-11-16) the editor warns
    about a start option or a menu-option Arrive at a wreck. Optional extra check: give a wreck a
    start option by hand and confirm it never shows.
  - **7a-2 named pool, per object** (the uncolonised planets Test rock A and B › "Test 7a-2, scan
    the rock"): **Data
    core** at most once per rock (so once at A and once at B); **Beacon** at most once in the whole
    game; the log says `pool sva_rock_finds (object sva_rock_a) picked …`. Save, scan A twice,
    load, scan A twice: the same two. Profile **7a: force the next rock scan to Data core** forces
    the next scan at either rock.
  - **7a-3 Leave**: Leave on each dialog goes back to the place's own menu.
- **Phase 7b: raids, bar scenes, place presets, test mod `seven_b`** (no new SagaLib command; the
  teleport needs SagaLib 1.2; 0.98.5a, dev mode, a throwaway save). Rebuild:
  `npx jiti scripts/build-test-mod.ts seven_b`. Start with Ctrl+F9 › **7b: go to Test Range B
  (with 200 marines)**.
  - **7b-1 raid** (Test outpost B › "Test 7b-1, raid the outpost" › Plan a raid): the briefing,
    then **Continue** opens vanilla's raid menu with one objective, "Seize the smugglers' ledger"
    (danger medium, its tooltip on hover). Commit marines: the "during the raid" text shows,
    then vanilla's result screens (losses, experience), then "Test 7b-1 passed". Again, but **Go
    back** in the raid menu: the planet's own menu. Does the raid menu offer anything else (it
    shouldn't: `$raidRestrictToTrigger`)?
  - **7b-2 bar scene, once** (Range Control B › bar): the blurb line "a nervous spacer keeps
    glancing at the door" and the option "Test 7b-2, talk to the nervous spacer". Both endings
    (Ask › Nod, or Leave them be) show **Continue** and then the bar again (other patrons, leave
    the bar). Leave the bar and enter it again: the spacer is gone for good.
  - **Result 2026-11-16:** 7b-1 to 7b-3 passed. The gambler (7b-3) never showed: vanilla's
    `RollProbability` is rolled per place and per **month**, not per visit, so a failed 50% roll
    holds for the whole month. 7b-5 showed "Establish a colony", no "Explore the ruins": vanilla
    marks ruins in a system with a colony as explored at new game. Both are vanilla behaviour; the
    editor now explains the first and warns about the second. Re-test 7b-3 as below.
  - **7b-3 bar scene, 50% per month** (re-test): check the bar for "Test 7b-3, watch the gambler",
    then let a month pass (rest or travel) and check again, over several months: it is there in
    roughly half of the months, every visit within such a month (it was written as "each visit",
    which was wrong). "Watch a hand" goes back to the bar, not to the colony's menu.
  - **7b-4 place preset vs the game** (re-test, **new game**: Ctrl+F9 › "7b: go to the ruins
    planet"): Test ruins B now sits in its own system without a colony ("Test Range B Ruins"),
    so vanilla's planet dialog should offer "Explore the ruins" (and no "Establish a colony" until
    they are explored). In the editor, Quests › any conversation ›
    Test context › Place "Planet with vast ruins, unexplored" shows the same option in Play (from
    a Link into PopulateOptions). Report anything the game shows that the preset doesn't.
  - **7b-5 ruins kept unexplored** (new game; "Test kept ruins B", in Test Range B itself, which has a
    colony): unlike vanilla's rule for colonised systems, it offers "Explore the ruins"; the log
    says `ruins of svb_kept_ruins stay unexplored`.
  - The log has no `[SagaLib]` errors for seven_b.
- **Phase 7c: random targets, test mod `seven_c`** (SagaLib 1.2, 0.98.5a, dev mode, a throwaway
  save; best on a **new game**, so there are unexplored systems). Rebuild:
  `npx jiti scripts/build-test-mod.ts seven_c`. Ctrl+F9 › **7c: go to Test Range C**, then dock at
  Range Control C. Each "Test 7c-N" option is a quest; Accept runs vanilla's search.
  - **7c-1 planet** ("a planet with ruins"): the next text names an uncolonised planet within 25
    light-years, its system and distance (ruins preferred). The journal and the map mark it. Fly
    there: its menu has "Test 7c-1, search the ruins" (and only there); picking it completes the
    quest. The log: `quest svc_ruin: target ruin = <id> (<name>, <system>)`.
  - **7c-2 market** ("a Hegemony market"): a Hegemony colony of size 5+ (a military base
    preferred) with faction "Hegemony". Docking there shows "Test 7c-2, report to the garrison".
  - **7c-3 system** ("a star system"): a system within 15 light-years (unexplored, ruins or
    derelicts preferred); the map marks its centre; "Test 7c-3, scan the system" is in the menu
    of any planet or station there that has one.
  - **7c-4 impossible**: Accept says "Test 7c-4 passed: nothing matched"; the journal has no
    entry; the log says `no planet matches target "none", so it isn't offered now` and
    `SF_Start svc_never …: not started (… a random target found nothing …)`.
  - **Stable**: save after accepting 7c-1, load: the same target, marker and texts.
  - **The texts' tokens**: no `$global.…` is shown raw in any 7c text.
- **Phase 7d: at the random target, test mod `seven_d`** (SagaLib 1.2, 0.98.5a, dev mode, a new
  throwaway game is best). Rebuild: `npx jiti scripts/build-test-mod.ts seven_d`. Ctrl+F9 › **7d:
  go to Test Range D**, dock at Range Control D.
  - 7d-1 and 7d-3 now **avoid dangerous systems** (no theme_unsafe or active Remnant system), so a
    pick like the Remnant system in the first test shouldn't happen again.
  - **7d-1 details** ("what the target is like"): the text says which Branch case won
    (decivilised, ruins, gas giant or none) and prints the details. Fly to the planet and compare:
    its conditions (decivilized, ruins_*), "Explore the ruins", the system's look. Report any
    detail that disagrees (e.g. "ruins true" on a planet without ruins).
  - **7d-2 person and cache** ("a person and a cache"): the text names a colony and a portmaster
    or supply officer; the journal and the map mark the person's colony. Their comm-directory
    entry has "Test 7d-2, ask about the cache". After it, a supply cache appears near the colony
    (marked); flying to it shows "Test 7d-2 passed" first, then vanilla's own cache dialog.
    Check: if the person was new, they are gone from the comm directory after the quest ends; the
    cache disappears when the quest ends.
  - **7d-3 encounter at the target** ("pirates at the target"): a small pirate fleet "Test 7d-3
    pirates" sits at the picked planet (not at Range Control D); beating it shows "Test 7d-3
    passed".
  - **Load**: save after accepting each, load: the same picks, person, cache and fleet.
- **Phase 7e: loot, encounters, scatter, test mod `seven_e`** (SagaLib 1.2, 0.98.5a, dev mode).
  Rebuild: `npx jiti scripts/build-test-mod.ts seven_e`. Ctrl+F9 › **7e: go to Test Range E**.
  - **Load order**: the game loads with seven_e's `drop_groups.csv` (the mod's own group
    `sve_cache_loot` only). Check the log for drop-group errors.
  - **7e-1 loot**: "Test 7e-1 cache" (a supply cache) and "Test 7e-1 wreck": their salvage gives
    metals, supplies or an alpha core more than vanilla's caches do (4 rolls of the mod's group plus
    1 of rare_tech; the wreck about 4,000 credits' worth). Report what each gave.
  - **7e-2 defenders**: the cache is guarded: approaching it, vanilla's salvage defenders (pirates,
    strength 10–20) appear before salvage.
  - **7e-3 random encounters**: fly through slipstreams and along system edges in hyperspace for a
    while (the pool's frequency is 200, far above vanilla's ~10): "Test 7e-3 raiders" (pirates,
    20 points) appear lying in wait at such points, and leave when you're far away. The log says
    `random encounter sve_raiders spawned at an encounter point`.
  - **7e-4 scatter**: on a **new game** (or this save's first load with seven_e: it is also for
    existing saves), the log says `scatter sve_beacons: placed N of 3` and names each probe's
    system. They are measured from Range Control E ("Measured from"), so all three are within 25
    light-years of Test Range E, wherever the player starts. Range Control E › "Test 7e, what did SagaLib place?" shows the number. Visit one: a
    derelict probe "Test 7e-4 probe" with the mod's loot (and Remnant defenders about half the
    time). Load again: no second set.
  - **7e-5 deciv guard**: Range Control E never decivilises (hard to see: `$core_noDeciv` is in
    its memory, Ctrl+F9 doesn't show it; the dev console `listmemory` or a long game would).
- **Phase 8d-1: world events, test mod `eight_d`** (SagaLib 1.2, dev mode). Link it into the mods
  folder; rebuild with `npx jiti scripts/build-test-mod.ts eight_d`. One scheduler, "Test 8d news",
  keeps 1–2 of three events running and checks every 3 days (dev mode may make it faster):
  market boom (5 days), pirate raid (4 days), one-time event (once).
  - **8d-1 on its own**: Ctrl+F9 › "8d: go to Test Range 8D", then let time pass (unpause) about
    a week. Within a day or two a notification appears and the intel screen lists a "Test 8d: …"
    news item under its tab (Major events, Hostilities or Story) with its text and, for the boom
    and the raid, Range Control 8D on the map. The boom gives 100 credits. Over about two weeks
    several events come and go, never more than two at once; the one-time event never comes twice.
  - **8d-2 raid**: Ctrl+F9 › "8d: go to Test Range 8D and start the pirate raid": within a few
    hours the "pirates near Range Control 8D" news, and a pirate patrol "Test 8d raiders" near the
    station (not hostile on its own). After about 4 days it leaves (despawns).
  - **8d-3 boom**: Ctrl+F9 › "…start the market boom": the boom news and +100 credits at once.
  - **8d-4 save**: save while an event runs, load: the news items are still there, the running
    event ends on time, the scheduler goes on.
  - starsector.log: "events sed_news: start …" / "end …" lines.
- **Phase 8d-3: progress events, test mod `eight_d`** (rebuild it; restart the game for SagaLib).
  "Test 8d: unrest at Range Control 8D" starts at once: a red bar to 1000, stages Rumours (300),
  Riots (600, a random outcome: calm +50 credits ×2, burn −5 reputation with the independents ×1)
  and Settled (1000, +500 XP), then it starts over at 0. Monthly: +50 always, +150 while the market
  boom runs.
  - **8d-P1**: load a save with eight_d (or Ctrl+F9 › "8d: go to Test Range 8D"). Intel › Major
    events lists the event: a red bar with three stage markers (hover: title, text, progress
    needed) and the monthly factors.
  - **8d-P2**: Range Control 8D › "Test 8d-P, stir up unrest (+250)" › Agree, twice: the bar jumps
    by 250 each time, "You stirred up the crowd" is listed as a one-time factor; at 300 an update
    "Rumours" and +10 credits (no dialog box).
  - **8d-P3**: twice more: Riots, with "calm" (+50 credits) or "burn" (reputation −5); the text under
    the bar is the stage's. $global.sed_unrest_riots_outcome shows which (dev console or dump memory).
  - **8d-P4**: on to 1000 (or wait months): Settled, +500 XP, the bar starts over at 0.
  - **8d-P5 save**: save mid-way, load: the bar, factors and stages are as they were.
  - **First run (user, 2026-11-17)**: the game stopped ("Fatal: Texture [stage_unknown] from category
    [events] not found") when the intel screen drew a stage marker: vanilla has only
    stage_unknown_good / _bad / _neutral. Fixed (neutral, or bad for a red event); SagaLib's tests now
    check every sprite name it asks for against the game's settings.json. **Re-run passed** (user):
    P1 bar, markers with tooltips and monthly factors; P2 +250 per stir with the one-time factor and
    Rumours (+10 credits) without a dialog box; P3 Riots; P4 Settled (+500 XP) and the bar back at 0;
    P5 save/load.
- **Phase 8d-2: roaming fleets, test mod `eight_d`** (rebuild it; restart the game for SagaLib).
  "Test 8d roaming traders" (independent, small) leave Range Control 8D for Range Outpost 8D (in
  the same system) about every 2 days, at most 2 on the way, stay 2 days and come back.
  - **8d-R1**: Ctrl+F9 › "8d: go to Test Range 8D", stay in the system and let a week pass. Within
    about 2 days a "Test 8d roaming traders" fleet appears at Range Control 8D, flies to Range
    Outpost 8D, waits about 2 days and flies back; never more than 2 at once. Log: "roaming fleet
    sed_traders leaves Range Control 8D for Range Outpost 8D and back" and "… appears near the player".
  - **8d-R2 only near the player**: jump to hyperspace and fly well away (more than ~4 light-years)
    for a few days, come back: the fleets were gone while you were away (vanilla's routes) and
    reappear where their route has got to.
  - **8d-R3 save**: save while one is on the way, load: it is still on its route.
  - **First results (user, 2026-11-17)**: 8d-R1 passed (never more than 2, they wait at the
    outpost). Found: the fleets were named "No name for type [tradeSmall]": the test mod used
    "tradeSmall", vanilla's id is "smallTrader" (named "Trader"). Fixed in eight_d; Check mod now
    warns about a fleet type nothing names (with a "did you mean" for the same words in another
    order). **Re-run passed** (user): the fleets are named "Trader"; R2 (gone while the player is
    far, back on their route) and R3 (save/load) passed.
  - **First results (user, 2026-11-17)**: 8d-3 passed (boom news, +100 credits); the news item
    lists under Major events (and Local) with its text and Range Control 8D on the map. Found: the
    boom's "Gained 100¢" opened an empty dialog with Continue. Fixed: world event actions run
    quietly (text without options closes at once; with options the dialog stays); to check again.
  - **More results (user)**: events came and went (log: boom, once, raid, boom, raid… never two
    of one at once); the one-time event came once (Story tab); the raid spawned the pirate fleet
    "Pirate Corsair" at the station, neutral; 8d-4 save/load passed. **Asked**: two "market boom"
    entries were listed together. Cause: the boom ended after 5 days and came back while its first
    news item (shown 10 days) was still listed. Changed: by default an event runs once at a time
    and a new run's news replaces the older entry; a new option "can run several at once" lets an
    event stack (each run its own news and end). **Re-check passed** (user): one boom entry.
- **Phase 8c: translation, test mods `eight_c` + `eight_c_xx`** (SagaLib 1.2, dev mode). Link both
  into the mods folder; rebuild with `npx jiti scripts/build-test-mod.ts eight_c` (and `eight_c_xx`).
  "XX" is a made-up language: a translated text starts with `[XX] `, a translated name ends in ` XX`.
  - **8c-1 original** (eight_c only, eight_c_xx off; any save, or a new game). Ctrl+F9 › "8c: go to
    Test Range 8C". The system is "Test Range 8C", the planet "Range Rock", the market "Range
    Control 8C Market"; Range Control 8C › "Test 8c-1, talk to the range chief": the text greets you
    as "Captain <your last name>" (a phrase inside a token), "Test Range" is highlighted, an added
    line, options "Agree" (tooltip "A tooltip on the option.") and "Leave". Agree: the quest
    stays active, so Intel (E) › Missions shows "Test 8c-1: a translated conversation" with stage
    "Talked to the chief", its journal text and the next step "Nothing more to do". (A save from
    the first build may already have it finished: start the check from a new game or an older save.) The cargo has a "Test box" with its description. **Nothing shows `$sft-`.**
  - **8c-2 translated** (quit, enable eight_c_xx too, load the 8c-1 save). The same steps: every text
    starts with [XX] (the greeting still has your name; "Test Range" still highlighted in the
    translated text); the option tooltip too; system "Test Range 8C XX", planet "Range Rock XX",
    market "Range Control 8C Market XX" **in the old save** (names the save keeps); "Test box XX"
    and its [XX] description; the contact "Ada XX Lindqvist XX". Two lines fall back on purpose:
    the stage title stays "Talked to the chief" (its translation was made for an older text) and
    the next-step line stays "Nothing more to do" (empty). starsector.log: "content: … translations:
    eight_c (xx, 23 lines from eight_c_xx)".
  - **8c-3 back** (quit, disable eight_c_xx, load the 8c-2 save): every name and text is the
    original again, the system and market too.
  - **8c-4 renamed by the player** (optional): with eight_c_xx on, the names the player can change
    (none here: the market isn't the player's) are kept; skip unless you colonise Range Rock and
    rename it, then toggle eight_c_xx: your name stays.
  - **8c-5 in Saga Forge**: "+ Translation" › eight_c, code `de`, Deutsch: creates `eight_c_de`
    (active), the Translation page lists 23 texts, all To do. Type one, Save translation: the CSV in
    `eight_c_de/data/sagaforge/translations/eight_c.de.csv` has it. Delete `eight_c_de` afterwards.
- **Phase 8b: release packaging** (no new test mod; uses `eight_a`, any game version). In Saga Forge
  with `eight_a` active:
  - **8b-1 release details**: Export › open *Release details*, enter Version file
    `https://raw.githubusercontent.com/me/eight_a/main/eight_a.version`, forum thread `12345`,
    a catch line. The file list shows `eight_a.version` (new) and `version_files.csv`. Export.
    Both files are in the mod; the details are still there when the dialog is opened again.
  - **8b-2 mark and pack**: after Export, Version `1.0.0`, keep "Also pack …" on, *Mark as
    released*. A green line names the zip and the forum post; *Show in folder* opens the releases
    folder (`tools/saga-forge/.userdata/releases` when run from source). The zip
    `[0.98.5a] Saga Forge test 8a loot groups 1.0.0.zip` holds one folder with `mod_info.json`,
    `data/…`, `eight_a.version`, no `sagaforge/`, no `data/sagaforge/dev/`. The forum post
    opens in a text editor and reads in the order of FORUM_POST_RULES.md, with [WRITE: …] parts.
  - **8b-3 guard**: Mark as released `1.0.1` without exporting it first: refused ("Export again
    with version 1.0.1"). Mark `1.0.0` again: asks to replace the snapshot, then the zip.
    Settings › Releases folder › Change… to a folder inside `D:/ModTools/mods/eight_a`: refused.
  - **8b-4 in game (optional)**: remove the `eight_a` link from `Starsector/mods`, unzip the zip
    there, start the game: the launcher lists the mod, it loads without errors, and with dev mode
    on, Ctrl+F9 shows no 8a profiles (they stay out of releases). Afterwards delete the unzipped
    folder and link `eight_a` again. Version Checker isn't installed, so its update check isn't
    tested.
- **Phase 8 results (user, 2026-11-16):**
  - **8a passed.** 8a-1 (eight_a only): cache A 23, cache B 20 alpha cores of 40 rolls (expected
    about 20): "Adds to" works. 8a-2 (with eight_a_twin): C 18, D 20, so **one row wins** (adding
    up would give about 26; recorded in FORMATS.md, the duplicate warning now says so). 8a-3: five
    rewards of 1,000 credits with 2, 2, 2, 2 and 1 items.
  - **8c-1 failed**: option labels showed their token (`$sft-sec_talk_start-o_sec_talk_start-`).
    The game fills option labels with the calling rule's id, or none, not the option's rule
    (FORMATS.md "Token replacement"). Fixed in SagaLib (TextTokens fills option, tooltip and bar
    scene tokens for every rule); 8c to be run again.
  - **8c-1 and 8c-2 passed** (second run): original texts, phrase in the greeting, highlight,
    AddText, options; with eight_c_xx every dialog text, option, tooltip, the quest name and journal
    text show [XX], names in the old save follow (Range Control 8C XX), the empty next-step line
    falls back to the original. One miss, in the test translation itself: its highlight was
    "[XX] Test Range", which isn't in the translated text, so nothing was highlighted. The
    Translation page now warns about that (a highlight must appear in the rule's text as
    translated); eight_c_xx keeps the words.
  - **8c-3 passed**: with eight_c_xx disabled, the same save shows every text and name in the
    original again (journal, dialog, "Range Control 8C": names the save keeps go back too).
  - **Re-run with the fixed eight_c_xx passed**: "Test Range" stays highlighted in the translated
    text; "Test box XX" with "[XX] …" description; "Range Control 8C Market XX", "Test Range 8C XX
    Star System". Dev mode's red "Copies of campaign data in memory: 3" after several reloads is
    normal (user, confirmed with other modders: it happens without mods and clears after 40 s to
    2 min).
  - **8b-1, 8b-2 passed** (user): Export wrote eight_a.version and version_files.csv; Mark as
    released packed the zip and the forum post draft (forum post change requests may follow).
    8b-3: a releases folder inside a mod is refused with its message (passed); Mark as released
    1.0.1 without exporting it was refused but showed nothing (the message only showed before
    exporting). Fixed: the release section shows it; **passed** on the re-check. Seen there and
    fixed: at about 1,500 px wide the header's "+ Translation" overlapped Save (the mod list now
    shrinks first and the "Active mod" label hides below 1,600 px), and an empty file box after
    "0 files written".
  - **8c-5 passed** (user): "+ Translation" made eight_c_de, the page lists the texts, a typed
    line is saved to the CSV.
- **Phase 8a: loot groups, test mods `eight_a` + `eight_a_twin`** (SagaLib 1.2, dev mode, any save:
  the system is added on load). Link both into the mods folder; rebuild with
  `npx jiti scripts/build-test-mod.ts eight_a` (and `eight_a_twin`). Count **alpha cores**: a supply
  cache never drops cores on its own, and vanilla's `ai_cores1` (nothing 100, gamma 5) never gives
  alpha cores, so every alpha core comes from the added row(s).
  - **Run 1, eight_a only** (eight_a_twin off). Ctrl+F9 › "8a: go to Test Range 8A (with 60 heavy
    machinery)". Salvage **Core cache A** and **Core cache B** (40 rolls each) and note the alpha
    cores of each. Expected about **20 per cache** (100 / 205 of the rolls): proves Saga Forge's
    "Adds to" export works (F7-a).
  - **Run 2, eight_a + eight_a_twin** (quit, enable the twin, load the same save). Salvage **Core
    cache C** and **D**, note the alpha cores. About **26 per cache** = the two mods' rows **add
    up** (200 / 305); about **20** = **one row wins**. (F7-c.)
  - **8a-3 reward** (Range Control 8A › "Test 8a-3, collect a random reward" › Accept,
    repeatable): "Gained 1,000 credits" and "Gained …" lines for 3 rolls of vanilla's
    `rare_tech` (often nothing, sometimes cores, blueprints, …). Accept it a few times. (F7-b.)
  - **Afterwards** disable eight_a and eight_a_twin: they change vanilla's `ai_cores1` loot.
- **Faction runtime keys** (Phase 2, RC-R13): a new faction with Makes pirate bases gets hidden
  bases over time; Posts no bounties keeps system bounties off its markets; punitive expeditions
  arrive against a player colony for a switched-on reason (slow to see; dev mode helps).

- **Task #60: optional and required mods, conditional content, test mod `sixty_a`** (SagaLib 1.3,
  **0.98a** install `D:\Starsector`, where the other mods are; dev mode). Build it with
  `npx jiti scripts/build-test-mod.ts sixty_a` and link `D:\ModTools\mods\sixty_a` into
  `D:\Starsector\mods` (the game folder is read-only for Saga Forge: link it yourself). It lists
  **Hazard Mining Incorporated** (`HMI`, needs LazyLib and MagicLib) as optional and **Crew
  Replacer** (`aaacrew_replacer`) as incompatible. SagaLib 1.3 is the workspace build (the jar in
  `mods\SagaLib`). Throwaway saves only. Near "Test Range 60" (Ctrl+F9 › "60: go to Test Range
  60"), at Range Control 60:
  - only with HMI: the HMI Beacon 60 (nav buoy), Mara Voss (HMI's faction, in the comm directory;
    automatic), the options "Test 60, HMI contract" and, after it, "Test 60, HMI follow-up"
    (inherited), the relation of the mod's faction "Test 60 Friends" with HMI (automatic);
  - only without HMI: the Quiet Beacon 60, "Test 60 Friends" hidden from the intel tab;
  - "Test 60, which mods count?": a phrase (with / otherwise), an option only with and one only
    without HMI, and a Branch test (case with HMI / otherwise);
  - a patch of HMI's own faction (`hmi.faction` adds the vanilla Hound to its known ships).
  - **(a) with HMI enabled at new game**: start a new game with HMI, LazyLib, MagicLib, SagaLib and
    sixty_a (Crew Replacer off). The HMI beacon is there, the quiet one isn't; Mara Voss is in the
    comm directory; both quest options show (the follow-up after finishing the contract); "which
    mods count?" says "HMI counts…", offers "Ask about Hazard Mining" (not the quiet-sector one),
    and the Branch test takes the case with HMI. Intel › factions lists "Test 60 Friends", welcoming
    to H.M.I. Ctrl+F9 › **Mods**: HMI optional, at start on, now on, counts; Crew Replacer
    incompatible, at start off. starsector.log: no SagaLib errors.
  - **(b) with HMI disabled**: a new game without HMI (and its libraries if nothing else needs
    them). sixty_a loads cleanly (no errors from it or SagaLib); the quiet beacon is there, the HMI
    beacon and Mara Voss aren't; no HMI quest options; "which mods count?" says "HMI does not
    count…", offers the quiet-sector option, and the Branch takes "otherwise"; "Test 60 Friends" is
    not in the intel tab. The log has one info line per skipped item ("skipped object
    sxa_hmi_beacon of sixty_a: needs HMI (not enabled)", person, relation …), and Ctrl+F9 › Mods
    lists them with why.
  - **(c) HMI added to a running save**: save the game from (b), enable HMI, load. A dialog says once
    "Saga Forge test #60: optional mods was set up for the mods this game started with. Hazard
    Mining Incorporated was added since, …"; nothing of sixty_a's HMI content appears (no beacon,
    no Mara Voss, no options; the conversation still says "does not count"). Save, load again: no
    dialog (the log repeats the warning on every load). Ctrl+F9 › Mods: HMI at start off, now on,
    doesn't count.
  - **(d) the incompatible mod**: enable Crew Replacer with sixty_a (new game or a running save).
    The log has "[SagaLib] mods: Saga Forge test #60: optional mods: the author marks Crew Replacer
    as possibly conflicting: Test #60: a made-up conflict, to see the warning", and a dialog shows it
    once per save (not again after save/load).
  - **(e) the patch of HMI's faction without HMI**: in (b) the game loaded without an error about
    `hmi.faction` (the game loads a .faction only through a factions.csv row, and sixty_a has none
    for HMI). With HMI (a), H.M.I.'s known ships include the Hound (dev console, or HMI fleets with
    Hounds over time). Record the result in FORMATS.md, "Other mods and frameworks".
  - **Also look at**: an optional mod removed from a running save (from (a), disable HMI, load):
    the "was removed after this game started" dialog once; what was already built stays (the HMI
    beacon, Mara Voss), SagaLib doesn't clean up; the HMI quest options are gone.
  - **Still to confirm (FORMATS.md)**: mods' startup code runs in mod order (Nexerelin before
    SagaLib), for #63; not needed by this test mod.
  - **First results (user, 2026-11-17, 0.98a-RC8)**: **(a) passed**: HMI beacon there and the
    quiet one not, Mara Voss in the comm directory, both quest options (follow-up after the
    contract), "which mods count?" phrase, option and Branch with HMI; dev menu › Mods: HMI at start
    on, now on, counts; Crew Replacer at start off; skipped the quiet beacon and the
    hideFromIntelTab change; no SagaLib errors in the log; Intel › Factions lists "Test 60 Friends"
    with its relation to H.M.I. as intended. **(b) passed**: the opposite content, "Test 60
    Friends" not in the intel tab; dev menu lists the two quests, the person, the HMI beacon and the
    relation as "needs HMI (not enabled)"; the info lines in the log, no SagaLib errors. **(c)
    passed**: the "was added since" dialog once, no HMI content, dev menu: HMI at start off, now on,
    doesn't count, every item "needs HMI (not enabled when this game started)"; no dialog after
    save/load. **(d) passed**: the "possibly conflicting" dialog once with the reason, the same line in
    the log on every load ("[SagaLib] mods: …"), no dialog after save/load. **(e) passed** (from the
    game's log, which names every .faction file it loads): with HMI, HMI's hmi.faction then
    sixty_a's (merged, ours after it); without HMI, sixty_a's hmi.faction is never loaded and the
    game runs normally. **(f) dropped** (user, 2026-11-17: out of scope): the save from (a) didn't
    load without HMI: the game itself stops ("Error loading saved game … CommodityOnMarket.readResolve
    … Commodity with id red_water not found", HMI's commodity in a market) before SagaLib runs.
    Removing a mod with its own factions, commodities or markets breaks a save in vanilla; the
    "was removed" notice can only show for small mods (utilities, a few rules), which is fine.
    **Task #60 in-game check: done.**

- **Task #64: versions by installed mods, other mods' content, sector snapshot** (SagaLib 1.3,
  **0.98a** install `D:\Starsector`, dev mode, throwaway saves only). Three test mods, all to be
  linked into `D:\Starsector\mods` by you (the game folder is read-only for Saga Forge):
  `mods\sixtyfour_a` (the mod with versions, prefix `sfa_`; needs SagaLib), its optional mods
  `mods\sixtyfour_j` ("Saga Forge 64: Java stand-in" = Mod1, a Java mod, no SagaLib; rebuild its jar
  with `bash build.sh` in its folder) and `mods\sixtyfour_b` ("Saga Forge 64: Saga Forge stand-in" =
  Mod2, made with Saga Forge). Rebuild the two Saga Forge mods with
  `npx jiti scripts/build-test-mod.ts sixtyfour_a` / `sixtyfour_b`. The Reyes example: Ilse Reyes
  at Range Control 64 (Test Range 64); Mod1 moves her to Haven Port (Haven 64J, the Java mod's
  market); Mod2 makes her Ilse Okafor with another portrait; with both, her conversation ("Test 64,
  talk to Reyes", at the station where she is) opens with the SWAPPED line. Ctrl+F9 › "64: go to
  Test Range 64" / "64: go to Haven Port (only with Mod1)".

```
(a) Base: a new game without Mod1 and Mod2
  1. Enable SagaLib and sixtyfour_a only. New game, Ctrl+F9 › "64: go to Test Range 64".
  2. Range Control 64's comm directory has Ilse Reyes (mercenary portrait).
  3. "Test 64, talk to Reyes": "I'm Ilse Reyes." (her own dialog); "Ask where she works": Range Control 64.
  4. Intel › Factions: "Reyes Guild" (not "(Mod2)"); no relation with the Haven Harbor Authority.
  5. No "Test 64, after Mod2's errand" option. Ctrl+F9 › Versions: every item "base".
  6. starsector.log: no SagaLib errors.

(b) Mod1 (the Java stand-in) at new game
  1. Enable SagaLib, sixtyfour_a and sixtyfour_j. New game.
  2. Haven 64J exists (log: "[sixtyfour_j] built Haven 64J"); Ctrl+F9 › "64: go to Haven Port".
  3. Haven Port's comm directory has Ilse Reyes (and Mara Quell, the Java mod's portmaster);
     Range Control 64's doesn't.
  4. "Test 64, talk to Reyes" is at Haven Port (not at Range Control 64); "I'm Ilse Reyes."
  5. Intel › Factions › Reyes Guild: a relation with the Haven Harbor Authority (0.6).
  6. Ctrl+F9 › Versions: sfa_reyes "sixtyfour_j", sfa_meet "sixtyfour_j", factions "sixtyfour_j".

(c) Mod2 (the Saga Forge stand-in) at new game
  1. Enable SagaLib, sixtyfour_a and sixtyfour_b. New game.
  2. Range Control 64: Ilse Okafor, corporate portrait. "Test 64, talk to Reyes": "I'm Ilse Okafor."
  3. Intel › Factions: "Reyes Guild (Mod2)" (a scripted change of the Mod2 version).
  4. Ctrl+F9 › "64B: go to Outpost 64B": "Test 64B, run an errand", accept (it ends at once).
     Back at Range Control 64: "Test 64, after Mod2's errand" is offered now.

(d) Both mods at new game
  1. Enable SagaLib, sixtyfour_a, sixtyfour_j and sixtyfour_b. New game.
  2. Haven Port: Ilse Okafor with the corporate portrait.
  3. "Test 64, talk to Reyes" at Haven Port: the SWAPPED line ("Okafor, Haven Port, and a story I owe you.").
  4. Reyes Guild (Mod2) with the relation to the Haven Harbor Authority.
  5. Ctrl+F9 › Versions: sfa_reyes and sfa_meet "sixtyfour_b+sixtyfour_j".

(e) A mod added to a running save changes nothing
  1. Save the game from (b) (Mod1 only). Enable sixtyfour_b too, load.
  2. #60's dialog once: "Saga Forge test #64: versions was set up for the mods this game started
     with. Saga Forge 64: Saga Forge stand-in was added since, …".
  3. Reyes is still Ilse Reyes with the mercenary portrait at Haven Port; the conversation still
     shows her own dialog (not the swapped one); "Reyes Guild" without "(Mod2)".
  4. Ctrl+F9 › Versions: still "sixtyfour_j". Save, load again: no dialog, nothing changes.

(f) The sector snapshot makes the Java mod's market pickable and checked
  1. In game from (b) or (d): Ctrl+F9 › "Write sector snapshot". The log names the file
     (saves/common/sagaforge_snapshot.json.data).
  2. In Saga Forge, open sixtyfour_a. Problems: "entity "sfj_port" … isn't known, so it isn't
     checked" (Reyes, Mod1 version; and the conversation).
  3. Saga › Mods › Seen in game › "Import from the game". It lists Saga Forge 64: Java stand-in:
     1 system, 1 market, 1 person (and maybe places).
  4. Those "not checked" warnings are gone. People › Ilse Reyes › Versions › the Java stand-in
     cell: the Market picker offers Haven Port; Quests › Places offers it too.
  5. Ctrl+F9 › Versions page lists every versioned item with its mods and the chosen version.

(g) Also look at (SagaLib's own list)
  - Load save A, then save B in one session: each keeps its own versions.
  - A faction change in a translation: a scripted displayName and a translated name together.
```

  - **First results (user, 2026-11-18, 0.98a-RC8)**: **(a) passed**: Ilse Reyes in Range Control
    64's comm directory, her own dialog with the name token filled, "Reyes Guild" with only the
    Hegemony relation, no "after Mod2's errand" option, dev menu › Versions: 3 items base; log
    clean. **Found from the log**: SagaLib said quest sfa_meet "mentions [sixtyfour_j]" only,
    because the swapped node lives in rules.csv, not in the quest's JSON. So with both mods it
    would never have set `$global.sfv_sfa_meet_sixtyfour_b`, and (d)'s swapped line couldn't
    show. **Fixed**: a SagaLib file now names every mod of the item's versions (an empty version
    where its JSON doesn't change). sixtyfour_a rebuilt; (b)–(g) to run on the rebuilt mod.
    **(b) passed** (rebuilt mod): the log has "[sixtyfour_j] built Haven 64J"; Reyes at Haven Port
    (not at Range Control 64), the conversation there; Reyes Guild friendly (60) with the Haven
    Harbor Authority; dev menu › Versions: all 3 "sixtyfour_j", and sfa_meet now mentions both
    mods (the fix works); log: "set 2 starting faction relations", no SagaLib warnings (no
    "listed in market" warning), only vanilla's own hull spec error. **(c) passed**: Ilse Okafor
    with the corporate portrait at Range Control 64, "I'm Ilse Okafor." from the token, "Reyes
    Guild (Mod2)" in Intel › Factions (scripted displayName of the Mod2 version), sixtyfour_b's
    errand at Outpost 64B, then "Test 64, after Mod2's errand" offered at Range Control 64 (not
    before the errand; another
    Saga Forge mod's quest as a prerequisite); dev menu › Versions: all 3 "sixtyfour_b".
    **(d) passed**: Ilse Okafor (corporate portrait) at Haven Port; "Test 64, talk to Reyes" there
    opens with the SWAPPED line (the extra rule with both sfv_ flags); "Reyes Guild (Mod2)",
    friendly with the Haven Harbor Authority; dev menu › Versions: all 3 "sixtyfour_b+sixtyfour_j".
    (Haven Port shows two portmasters, Mara Quell and vanilla's generated one: the Java stand-in's
    own code adds hers without removing vanilla's; not Saga Forge's or SagaLib's.)
    **(e) passed**: the save from (b) loaded with sixtyfour_b added: the "was added since" dialog
    once; Reyes stays Ilse Reyes (mercenary portrait) at Haven Port, her own dialog (not the
    swapped one), "Reyes Guild" without "(Mod2)"; dev menu › Versions: still "sixtyfour_j"; saved
    and loaded again: no dialog.
    **(f) passed, with two fixes**: "Write sector snapshot" wrote
    `saves/common/sagaforge_snapshot.json.data` (the `.data` name confirmed); before the import,
    the four "sfj_port isn't known" warnings; Saga › Mods › Import from the game listed the Java
    stand-in; the warnings went away and Haven Port (sfj_port) is offered in the People market
    picker and in Quests › Places. **Found**: the import also added sixtyfour_a's own system,
    places and people (so Test Range 64 "clashed" with itself), because the prefix taken from a
    mod id was its first part (`sixtyfour_`, shared by sixtyfour_a and sixtyfour_j), and the mod
    being edited wasn't skipped; and vanilla's generated staff at Haven Port (`p_2ef2`, …, new ids
    every game) were added as people. **Fixed**: the snapshot never adds the mod being edited, a mod
    id is matched whole (`sixtyfour_j_`), a prefix two mods share ties to neither, and people are
    tied by their id only. Replayed on the same snapshot file: only the Java stand-in's 1 system, 14
    places, Haven Port and Mara Quell. Confirmed in the app after a restart (no new import): Saga ›
    Mods lists only the Java stand-in (1 system, 14 places, 1 market, 1 person); the self-clash
    warning is gone. The one warning left, "0 units from the game's Grid C21 R07", is the throwaway
    grid_test mod's grid of systems on the same spot (only if both are enabled).
    **(g) passed**: the (b) and (d) saves loaded one after the other in one session each keep their
    own versions. **Task #64 in-game check: done.**

- **Task #27: MagicLib bounties** (docs/DESIGN-MAGICLIB-BOUNTIES.md; **0.98a** install
  `D:\Starsector`, where MagicLib 1.5.6 and LazyLib are; dev mode, throwaway saves only). Test mod
  `mods\twentyseven_a` (prefix `tsa_`; needs SagaLib 1.3; MagicLib is **optional** in its list, so
  its `mod_info.json` doesn't name MagicLib), to be linked into `D:\Starsector\mods` by you.
  Rebuild with `npx jiti scripts/build-test-mod.ts twentyseven_a`. Enable SagaLib, LazyLib,
  MagicLib and twentyseven_a; new game; Ctrl+F9 › "27: go to Test Range 27" (also sets the
  independents to Welcoming, which tsa_b_hunt needs). Two bounties in
  `data/config/modFiles/magicBounty_data.json`:
  - **(a) the board**: Intel › the bounty board lists "Test 27 (a): Kasimir's raiders" and "Test 27:
    hunt the Lantern Gang", paid by the Independents. starsector.log (dev mode): "tsa_b_raiders :
    VALID", "tsa_b_hunt : VALID", no "INVALID" for them.
  - **(b) offered only here**: fly to the core worlds (more than 10 light-years from Test Range 27):
    neither bounty is listed there (the market id **and** the station's entity id in
    `trigger_market_id`, FORMATS.md's quirk). Back at Test Range 27 they are listed again.
  - **(c) the raiders**: open it: the text has "Vell Kasimir" highlighted, "Target Rock 27", "Test
    Range 27" and "15,000" (MagicLib's `$name`, `$location`, `$system`, `$reward`), no "==error==".
    Accept: the map arrow points at Target Rock 27; four pirate ships (flagship an Enforcer) wait
    there, hostile; hail them: "Range Control sent you? Vell Kasimir doesn't run." Win (disable the
    flagship): 15,000 credits, +5 with the Independents, the success text. At Range Control 27,
    "Test 27, bounty status" › Check: "Only the raiders bounty succeeded".
  - **(d) the hunt**: the text names a planet and its system and says "100% of the pay" (one percent
    sign, from `%%`). The board says which system (`job_show_distance: system`). Accept: a pirate
    fleet "Lantern Gang" (an Enforcer and random pirate ships, about 40 points) at a planet in a
    system without a colony, pulsar or black hole, preferably a ruins or derelict system. Destroy
    the whole fleet (obliteration): 20,000 credits, +5 Independents, 5 heavy armaments in the loot.
    Status: "Both bounties succeeded". Time limit 60 days (the board shows it).
  - **(e) only as a bounty**: neither fleet is spawned by SagaLib as well: starsector.log has no
    "[SagaLib] … encounter tsa_raiders" or "encounter tsa_hunters" lines (SagaLib logs every
    spawn), only one Kasimir fleet at Target Rock 27; Lantern Gang isn't a SagaLib quest (no intel
    entry besides MagicLib's). (The dev menu has no encounter page.)
  - **(f) without MagicLib**: disable MagicLib (keep the rest), new game: twentyseven_a loads, no
    error about `magicBounty_data.json`; the station and "bounty status" ("No bounty has succeeded
    yet") work.
  - Record the results here and anything new about MagicLib in FORMATS.md, "MagicLib 1.5.6
    bounties".
  - **First results (user, 2026-11-18, 0.98a-RC8)**: **(a) passed**: the board at Test Range 27
    lists both, paid by the Independents. **(b) passed**: in the core worlds the bounty list is
    empty (the details pane still shows the last bounty opened, MagicLib's own panel). **(c), (d)
    passed**: the hunt's text names Beta Suroclarile IV-C in Beta Suroclarile and "100%" (one
    sign); obliteration, 20,000¢, "upwards of 5 other ships"; Kasimir's Raiders (four ships) and
    the hail "Range Control sent you? Vell Kasimir doesn't run."; status: both succeeded. Found:
    the status texts named `$global.…_succeeded`, which rules.csv fills in ("true and true"):
    reworded in the test mod. **(e) passed** (from starsector.log): no SagaLib line for
    tsa_raiders or tsa_hunters (SagaLib built only the system, the market and the profile); MagicLib
    logged both bounties VALID, their rewards, and "Despawning bounty … with stage Succeeded" for
    each. The log also has "Something went wrong when validating tsa_b_hunt / tsa_b_raiders"
    (a NullPointerException in `MagicStringMatcher.findBestFactionMatch`): MagicLib's dev-mode
    check at startup runs before a sector exists, so it fails the same way for every mod's bounties
    (HMI's too), still marks them VALID, and the check when the game loads has no warning. Harmless
    (FORMATS.md). **(f) passed**: a new game with LazyLib, SagaLib and twentyseven_a only (no
    MagicLib): nothing in the log about `magicBounty_data.json` (the game itself never reads it),
    no errors from the mod or SagaLib ("[SagaLib] content: 0 quests, 2 people, … 1 systems, 0
    encounters": the bounty-only sources aren't SagaLib content); the system, market and profile
    built as before. The only ERROR lines are the hull specs `flare` and `module_hightech_decor`,
    which every earlier log has too. **Task #27 in-game check: done.**

- **Task #59: MagicLib bounties from quests** (DESIGN-MAGICLIB-BOUNTIES.md §6; SagaLib 1.3's
  MagicLib bridge; **0.98a** install `D:\Starsector`; dev mode, throwaway saves only). Same test mod
  as #27, `mods\twentyseven_a` (1.1.0, already linked), rebuilt with its "Test 59" content; SagaLib
  rebuilt with the bridge (`bash build.sh` in `mods\SagaLib` says "built magiclib"). Test Range 27
  moved on the map (it crowded Test Range 60), so start a new game. At Range Control 27: "Test 59,
  ask about Range Control's contract" starts the bounty "Test 59: the Ghost" (never on the board)
  after testing whether it is available; "Test 59, report on the Ghost" reads its state; the board
  bounty "Test 59 (e): the Ghost's partner" needs the contract to have succeeded.

```
(a) The bridge loads
  1. Enable SagaLib, LazyLib, MagicLib and twentyseven_a; dev mode. New game, Ctrl+F9 › "27: go to Test Range 27".
  2. starsector.log: "[SagaLib] MagicLib bridge loaded: quests can start and check MagicLib bounties";
     MagicLib's "tsa_b_ghost : VALID" and "tsa_b_partner : VALID".
  3. Ctrl+F9 › Mods: "MagicLib bounties: bridge ready".
  4. Intel › bounty board at Test Range 27: the two #27 bounties; neither "Test 59: the Ghost" nor "Test 59 (e): the Ghost's partner".

(b) The quest starts the bounty
  1. Range Control 27: "Test 59, ask about Range Control's contract" › "Sign the contract".
  2. The dialog shows MagicLib's highlighted "Accepted job: Test 59: the Ghost", then "Test 59 (b): contract signed …".
  3. Intel: the journal entry "Test 59: Range Control's contract" (Hunt the Ghost) and MagicLib's bounty
     "Test 59: the Ghost" (10,000 credits, Test Range 27); the bounty board lists it as accepted;
     the map arrow points at Ghost Shoal 27.
  4. Back in the station's menu "Test 59, ask about …" is gone. starsector.log: "SF_StartBounty in rule
     tsa_job_take: bounty tsa_b_ghost accepted for the player".

(c) Still running
  1. Without fighting: "Test 59, report on the Ghost": "Test 59 (c): MagicLib says the bounty is still active …".
  2. Back: the report option is offered again.

(d) Succeeded
  1. Fly to Ghost Shoal 27 and beat the Ghost (a Cerberus with a Hound; disable the flagship).
     MagicLib pays 10,000 credits and +3 with the Independents and shows its success text.
  2. Range Control 27, "Test 59, report on the Ghost": "Test 59 (d) passed …"; the journal moves the
     contract to completed.

(e) SagaLib's quest-ended key reaches MagicLib
  1. Open the bounty board at Test Range 27 again: "Test 59 (e): the Ghost's partner" is listed now
     (MagicLib's trigger reads $sagaforge_success_tsa_job). Taking it is optional.

(f) Without MagicLib
  1. Disable MagicLib (keep LazyLib, SagaLib and twentyseven_a). New game, Ctrl+F9 › "27: go to Test Range 27".
  2. starsector.log: "[SagaLib] MagicLib isn't enabled: quests see its bounties as unavailable"; no
     SagaLib errors, nothing about MagicLib classes (no NoClassDefFoundError).
  3. Ctrl+F9 › Mods: "MagicLib bounties: MagicLib isn't enabled (quests see every bounty as unavailable)".
  4. Range Control 27: "Test 59, ask about Range Control's contract" › "Sign the contract": "Test 59 (f):
     the bounty isn't available here. MagicLib isn't installed …". No Test 59 journal entry; the
     option is still offered.

(g) Optional: MagicLib added to the running save from (f)
  1. Save. Enable MagicLib, load: #60's notice once ("… MagicLib was added since …").
  2. "Sign the contract" still says the bounty isn't available (MagicLib wasn't enabled when the game started).
```

  - Record the results here, and anything new about MagicLib in FORMATS.md, "MagicLib 1.5.6
    bounties" ("Taking a bounty from code").
  - **First results (user, 2026-11-18, 0.98a-RC8)**: **(a) passed**: the log has "[SagaLib]
    MagicLib bridge loaded …" and MagicLib's "tsa_b_ghost : VALID" / "tsa_b_partner : VALID" (after
    its usual harmless "Something went wrong when validating" at startup); dev menu › Mods: "bridge
    ready", MagicLib "at start on, now on: counts"; the board lists only the two #27 bounties.
    **(b) passed**: "Accepted job: Test 59: the Ghost" (highlighted), the journal entry, "(b):
    contract signed"; the board shows the Ghost as accepted (10,000¢, Test Range 27, "Ghost Shoal 27"
    from `$location`); "Test 59, ask about …" gone, "report on the Ghost" offered; log: "SF_StartBounty
    in rule tsa_job_take: bounty tsa_b_ghost accepted for the player". **(c) passed** (still active;
    the option came back). **(d) passed**: MagicLib "Despawning bounty tsa_b_ghost with stage
    Succeeded"; the report says "(d) passed", the journal moves the contract to Completed, the
    report option is gone. **(e) passed**: the board lists "Test 59 (e): the Ghost's partner"
    (8,000¢); before the success MagicLib logged "Requirement not met: memKeys_all
    $sagaforge_success_tsa_job key not found", after it no more. No SagaLib warnings or errors.
    **Found (MagicLib's board, not SagaLib)**: the details pane still showed the finished Ghost (the
    last bounty selected), now with a new captain and "Accept the job": drawing a bounty whose
    active entry MagicLib has cleaned up calls `createActiveBounty` again (`MagicBountyInfo.layoutPanel`),
    so the finished bounty is offered there once more. SagaLib still reads "succeeded" (the memory
    keys don't change), and SF_StartBounty refuses it. FORMATS.md has the note.
    **(f) passed** (new game with LazyLib, SagaLib and twentyseven_a, no MagicLib): the log has
    "[SagaLib] MagicLib isn't enabled: quests see its bounties as unavailable"; the game looked up
    SF_StartBounty in SagaLib's rule command package as usual (no MagicLib class loaded, no
    NoClassDefFoundError); no SagaLib warnings or errors, and the only ERROR lines are vanilla's two
    hull specs. Dev menu › Mods: "MagicLib isn't enabled (quests see every bounty as unavailable)",
    MagicLib "at start off, now off: doesn't count". "Sign the contract": "Test 59 (f): the bounty
    isn't available here …", and the option is still offered (the quest didn't start).
    **(g) passed**: the save from (f) loaded with MagicLib enabled: "MagicLib bridge loaded", #60's
    notice once ("… MagicLib was added since, so … plays on without its MagicLib content …", also a
    [SagaLib] WARN in the log), and "Sign the contract" still says the bounty isn't available
    (MagicLib doesn't count: it wasn't enabled when the game started). **Task #59 in-game check: done.**

- **Task #69: waiting for a MagicLib bounty's end** (DESIGN-MAGICLIB-BOUNTIES.md §7; SagaLib 1.3,
  no bridge needed; **0.98a** install `D:\Starsector`; dev mode, throwaway saves only). Same test
  mod, `mods\twentyseven_a`, now 1.2.0 with "Test 69" content: Watch Buoy 27 (a new planet in Test
  Range 27, where the Watcher and the Drifter wait), "Test 69, ask about the Watcher" (starts the
  bounty "Test 69: the Watcher", never on the board, then waits for it: no report option) and
  "Test 69 (c), ask about the Drifter" (waits for the board bounty "Test 69 (c): the Drifter", 2-day
  deadline). Rebuild SagaLib (`bash build.sh`) and start a new game (new planet).

```
(a) The quest starts the bounty and waits
  1. Enable SagaLib, LazyLib, MagicLib and twentyseven_a; dev mode. New game, Ctrl+F9 › "27: go to Test Range 27".
  2. Range Control 27: "Test 69, ask about the Watcher" › "Sign the contract": MagicLib's "Accepted job: Test 69: the Watcher",
     then "Test 69 (a): contract signed …". Intel: the journal entry "Test 69: the Watcher's contract" and MagicLib's bounty.
  3. "Go" goes back to the station's menu (no orange "ERROR: no rule found for option tsa_watch_ok"): no "Test 69, ask about
     the Watcher" and no report option for it.

(b) Succeeded: the quest goes on by itself
  1. Fly to Watch Buoy 27 and beat the Watcher (one Hound; disable it). MagicLib pays 6,000 credits and shows its success text.
  2. Without docking anywhere: after the battle's dialogs close, a new dialog opens by itself within about a quarter day:
     "Test 69 (b) passed: this dialog opened by itself …". "Good" closes it; the journal moves the contract to completed.
  3. starsector.log: "[SagaLib] quest tsa_watch: MagicLib bounty ended, fired tsa_watch_w_succeeded".

(c) Expired, and ended before the quest got there
  1. Intel › bounty board at Test Range 27: "Test 69 (c): the Drifter" › Accept the job (its 2 days count from
     accepting; an untaken bounty that runs out never ends for SagaLib). Don't fight it.
  2. MagicLib's deadlines are off by default: LunaLib's settings (F2) › MagicLib › turn "Enable Bounty Deadlines" on
     (if it shows on, turn it off and on: MagicLib reads it only when it changes). Then let more than 2 days pass
     (away from Watch Buoy 27), until MagicLib's intel says it ran out.
  3. Range Control 27: "Test 69 (c), ask about the Drifter" › "Tell them" › "Leave".
  4. As the dialog closes, a new one opens by itself: "Test 69 (c) passed: the Drifter's bounty had expired …".
     Log: "fired tsa_late_w_expired".

(d) Nothing else changed
  1. The Test 59 contract ("Test 59, ask about Range Control's contract") still works as before, report option included.
  2. starsector.log: no SagaLib warnings or errors.

(f) Without MagicLib
  1. Disable MagicLib (keep LazyLib, SagaLib and twentyseven_a). New game, Ctrl+F9 › "27: go to Test Range 27".
  2. Range Control 27: "Test 69, ask about the Watcher" › "Sign the contract": "Test 69 (f): the bounty isn't available here …";
     "Test 69 (c), ask about the Drifter" › "Tell them": "Test 69 (f): the Drifter's bounty isn't available …". No Test 69 journal entries.
  3. starsector.log: no SagaLib errors, no NoClassDefFoundError.
```

  - Record the results here.
  - **First run (user, 2026-11-19, 0.98a-RC8)**: (a) signing worked (MagicLib's "Accepted job", the
    journal entry, "(a): contract signed"), but "Go" showed "ERROR: no rule found for option tsa_watch_ok"
    and the failsafe "Exit dialog". The export skipped the rule of an option that is the only way into a
    node, expecting the node to answer it, which a Wait node never does (an Arrive was already exempt;
    "wait N days" had the same bug). Fixed in questrules.ts (every Wait), with a test; test mod rebuilt
    (rules.csv only). Run (a) again.
  - **Second run (user, 2026-11-19, 0.98a-RC8)**: **(a) passed** ("Go" back to the station's menu, no
    ERROR). **(b) passed**: after the Watcher was beaten MagicLib showed "Bounty Completed - Test 69: the
    Watcher, 6,000 received" and "Test 69 (b) passed …" opened by itself. (c): the quest was asked
    before the Drifter was taken; found that MagicLib counts `job_deadline` from acceptance
    (`ActiveBounty.getDaysRemainingToComplete`), and an untaken bounty that runs out ends
    "ExpiredWithoutAccepting" with no memory key (offered again later), so the Drifter must be accepted.
    Accepted ("You have accepted this bounty"), several days later still running: MagicLib 1.5.6's
    deadlines are off unless LunaLib's MagicLib setting "Enable Bounty Deadlines" is changed to on
    (FORMATS.md). Step (c)2 now says so; the bounty editor notes it for every deadline.
    **(c) passed** after turning "Enable Bounty Deadlines" on in LunaLib: the Drifter's bounty ended, and
    "Test 69 (c) passed: the Drifter's bounty had expired, and this dialog opened by itself" opened on its
    own (here the quest was waiting already; the ended-before order is covered by the golden case and
    Play). **(d) passed**: "Test 59, ask about Range Control's contract" › "Sign the contract" works as
    before ("Accepted job: Test 59: the Ghost", "(b): contract signed", "Go"). starsector.log: no [SagaLib]
    WARN or ERROR; "Despawning bounty tsa_b_watch with stage Succeeded" then "[SagaLib] quest tsa_watch:
    MagicLib bounty ended, fired tsa_watch_w_succeeded"; "Ending expired bounty tsa_b_late" then "… fired
    tsa_late_w_expired"; the only exceptions are MagicLib's usual startup "Something went wrong when
    validating" (as in #59). **(f) passed** (new game with LazyLib, SagaLib and twentyseven_a, no
    MagicLib): both options say "Test 69 (f): … isn't available …", with Back, and the quests don't start;
    the log has "[SagaLib] MagicLib isn't enabled: quests see its bounties as unavailable", no SagaLib
    warnings or errors, no NoClassDefFoundError, and only vanilla's two hull-spec ERROR lines.
    **Task #69 in-game check: done.**

- **Task #61: markets changing owner** (PLAN.md §10.3; SagaLib 1.3, no bridge; **0.98a** install
  `D:\Starsector`, where Nexerelin 0.12.2d is; dev mode, throwaway saves only). Test mod
  `mods\sixtyone_a` (prefix `soa_`), built by `npx jiti scripts/build-test-mod.ts sixtyone_a`; it
  needs a junction in `D:\Starsector\mods` like the other test mods (not made by Saga Forge: the
  install is read-only). Rebuild SagaLib first (`bash build.sh` in `mods\SagaLib`). At Range Control
  61 in "Test Range 61": three quests that watch Outpost 61 and Range Control 61 (keep going, fail,
  go to a stage). Bastion 61 (pirates) is protected from invasion, Outpost 61 (pirates) isn't.
  **The random sector was descoped on 2026-11-18** after its check passed (results below); its
  checks are in `docs/parked/README.md` for when the on-hold task comes back.

```
(a) A market changing owner mid-quest: the three outcomes
  1. Enable SagaLib, LazyLib, Nexerelin (and what it needs) and sixtyone_a; dev mode. New game
     (hand-made core worlds, Nexerelin's default). Ctrl+F9 › "61: go to Test Range 61".
  2. At Range Control 61 accept "Test 61, owner change - keep going", "… - fail" and
     "… - go to a stage" (three journal entries, each marking Outpost 61).
  3. Ctrl+F9 › "Change a market's owner": the three quests are listed with
     "soa_outpost=pirates soa_station=independent". Pick Outpost 61 › Hegemony: "3 quests reacted".
  4. keep going: its journal entry stays. At Range Control 61, "… - keep going - report":
     'Changed owner: "soa_outpost", new owner: "hegemony"'; done.
  5. fail: its journal entry is failed.
  6. go to a stage: after closing the dev menu a message opens: "news reaches you: soa_outpost now
     belongs to hegemony …" (Close); its journal entry is at "The outpost changed hands".
  7. starsector.log: "quest soa_keep: market soa_outpost changed owner to hegemony; it keeps going",
     and the same for soa_fail ("the quest fails") and soa_stage ("it goes to stage lost").
  8. Optional, the real thing: in a fresh game accept the three again and invade Outpost 61 with
     Nexerelin (marines, beat its defences): the same three outcomes within a day of the capture,
     new owner "player" (or your faction).

(b) A protected market is never an invasion target
  1. With a fleet and marines at Test Range 61 (the profile gives 500,000 credits to buy them):
     at Outpost 61 Nexerelin offers to invade; at Bastion 61 it doesn't.
  2. Optional: let a few months pass and watch Nexerelin's invasion intel: no invasion targets
     Bastion 61 (Outpost 61 may be targeted).
```

  - Record the results here, and anything new about Nexerelin in FORMATS.md, "Nexerelin 0.12.2d"
    ("Checked for task #61").
  - **Results (user, 2026-11-18, 0.98a-RC8, hand-made sector)**: **(a) steps 1–5 and 7 passed.**
    Dev menu › Change a market's owner, Outpost 61 › Hegemony; the log has "dev menu: market
    soa_outpost changed owner from pirates to hegemony" and the three lines (keeps going / the quest
    fails / it goes to stage lost); the journal moved "go to a stage" to "The outpost changed hands";
    "keep going"'s report showed 'Changed owner: "soa_outpost", new owner: "hegemony"' and completed
    (+100 credits). **Found and fixed (2026-11-18)**: the failed quest still offered its Arrive
    option ("Test 61 - fail - report"), whose End would have completed it: an Arrive's rule tested
    only `$global.<quest>_step`, so a quest that failed at that step (owner change, time limit) kept
    it. It now also tests `$global.<quest>_state == active` (test/expected/vanguard updated;
    sixtyone_a rebuilt). Also seen: "Test 61, owner change - go to a stage" was still offered and
    accepting it again set the active quest's step back to "go" (task #71: option-start quests stay
    offered). **Step 6 passed** (new game, the rebuilt mod, only "go to a stage" accepted): dev menu
    "1 quest reacted"; after closing it the message opened by itself, "Test 61 (a): news reaches you:
    soa_outpost now belongs to hegemony. The quest moved to stage …" with Close; the journal at "The
    outpost changed hands". **(b) passed**: at Bastion 61 "Invade Bastion 61" is greyed out with
    Nexerelin's tooltip "This is not an invadable market."; at Outpost 61 Nexerelin offers the
    invasion (it warns that the Hegemony, its owner now, isn't hostile yet). **Task #61 in-game
    check: done.** (Seen, not ours: with more than nine options the game shows "null." before
    Leave.)
  - **Before the descope (user, 2026-11-18, 0.98a-RC8, Nexerelin 0.12.2d, random core worlds)**: the
    random-sector check (old (a)) **passed**; the hand-made-sector check (old (b)) wasn't run.
    The log has "Nexerelin random sector: …", "skipped system corvus …" and "skipped person soa_clerk
    …" (so Nexerelin's flag is set before SagaLib's onNewGame); Test Range 61 was built (closest
    system after random generation: Beta Gobi, 11,772 units); no SagaLib warnings or errors. Dev menu
    › Mods: "Sector: Nexerelin random sector", skipped quest soa_handmade, person soa_clerk, system
    corvus, object soa_corvus_buoy. Range Control 61 doesn't offer the hand-made-only quest. The
    random-target version picked Airin (Kalico), marked it, and its report paid 100 credits. The
    kept version didn't start: "skipped quest soa_kept: needs place jangala, which doesn't exist in
    this game". **Found (not #61, task #71)**: an option-start quest stays offered after it was
    accepted and after it ended; the offer text showed the target's tokens raw, because an option
    start picks its target on accept (the test text was wrong; the mod now names the target in the
    report instead, and its profile adds supplies and fuel). That refusal is the part that stayed in
    #61 ("a quest isn't offered or started when a place it needs doesn't exist"): **passed in game**.
    The test mod was then rebuilt without the random-sector content (the Jangala quests, the clerk,
    the Corvus buoy).

- **Task #71: option-start quests stay offered; target tokens before the target is picked**
  (**0.98a** install `D:\Starsector`; dev mode, throwaway saves only; SagaLib unchanged, no rebuild
  needed). The export now adds the quest's state to the start rule of a quest (kind Quest) that
  starts from an option, a trigger, an interjection or a bar scene: `SF_QuestState <quest>
  notStarted`, or `!SF_QuestState <quest> active` when it is repeatable. Contacts and bar events are
  left to vanilla's hub; conversations have no state. Before, the option stayed while the quest ran
  and after it ended, and accepting again while it ran set its step back (seen in #61's check).
  Test mods `mods\sixtyone_a` and `mods\sixty_a` were rebuilt (only their start rules changed).
  The warning for target and variable tokens before the quest starts, and Play leaving them
  unfilled until then, are editor-only (npm test).

```
(a) An option-start quest stops offering itself (sixtyone_a; Nexerelin optional)
  1. Enable SagaLib and sixtyone_a (Nexerelin and what it needs may stay on); dev mode. New game, then
     Ctrl+F9 › "61: go to Test Range 61".
  2. Range Control 61's menu offers "Test 61, owner change - keep going", "… - fail" and
     "… - go to a stage". Pick "… - keep going" and accept.
  3. Back in the menu: "Test 61, owner change - keep going" is gone; "Test 61 - keep going - report"
     is there; "… - fail" and "… - go to a stage" are still offered.
  4. Leave, undock and dock again: "… - keep going" is still not offered.
  5. Pick "Test 61 - keep going - report": the quest completes (+100 credits). Back in the menu,
     and after docking again, "… - keep going" isn't offered (the quest isn't repeatable).

(b) Optional: a quest that ends right after accepting (sixty_a; needs Hazard Mining Incorporated)
  1. Enable SagaLib, HMI (and what it needs) and sixty_a; dev mode. New game, Ctrl+F9 › "60: go to
     Test Range 60".
  2. At Range Control 60 pick "Test 60, HMI contract (only with HMI)" and accept: it completes at
     once (+100 credits).
  3. Back in the menu: "Test 60, HMI contract" is gone; "Test 60, HMI follow-up (after the contract)"
     is offered. Accept it too: it completes, and its option is gone as well.
```

  - **Results (user, 2026-11-18, 0.98a-RC8, rebuilt sixtyone_a)**: **(a) passed**, run with "Test
    61, owner change - go to a stage" instead of "keep going" (the same quest pattern). After
    accepting ("Test 61 - go to a stage - Accepted") the menu offered "… - keep going" and "… -
    fail" but no longer "… - go to a stage"; after docking again it was still gone; after "Test 61 -
    go to a stage - report" (Completed, Gained 100¢) it stayed gone, and the other two were still
    offered. (The report's raw `$global.soa_stage_ownerChanged` / `_newOwner` tokens are expected:
    nothing changed owner. "null." before Leave with ten options is the game's, seen in #61.)
    (b) wasn't run; (a) covers the task's check. **Task #71 in-game check: done.**

- **Task #70: a character's presence depends on who controls their market** (SagaLib 1.3, no
  bridge; **0.98a** install `D:\Starsector`; dev mode, throwaway saves only). Test mod
  `mods\seventy_a` (prefix `sya_`), built by `npx jiti scripts/build-test-mod.ts seventy_a`; it
  needs a junction in `D:\Starsector\mods` like the other test mods (not made by Saga Forge: the
  install is read-only). Rebuild SagaLib first (`bash build.sh` in `mods\SagaLib`). In "Test Range
  70": Waypoint 70 (independent) has Captain Hale Varro, a Hegemony loyalist (contact), present only
  while the station's owner is at least Neutral with the Hegemony; while away he is listed at Refuge
  70 (hegemony). He offers "Test 70: the loyalist's job". Waypoint 70's menu has "Test 70, ask who
  runs the station" (a Branch on `SF_FactionRep $faction.id hegemony NEUTRAL`). Nexerelin may be on
  or off.

```
(a) Present: in the comm directory, and he offers his quest
  1. Enable SagaLib and seventy_a; dev mode. New game, then Ctrl+F9 › "70: go to Test Range 70"
     (it also makes you Neutral with the pirates, so Waypoint 70 stays dockable when they own it).
  2. starsector.log: no "person sya_loyal leaves" line (independent and Hegemony start Neutral).
  3. Waypoint 70 › comm directory: Hale Varro is listed. Talk to him: "Test 70: the loyalist's job"
     is offered (don't accept it).
  4. Refuge 70 › comm directory: Hale Varro is not listed.

(b) The station changes owner to a hostile faction: he leaves, the quest isn't offered
  1. Ctrl+F9 › "Change a market's owner": the text lists "sya_loyal at sya_station: owner at least
     NEUTRAL with hegemony (present now)". Pick Waypoint 70 › Pirates: "1 person left or came back".
  2. starsector.log: "person sya_loyal leaves sya_station: its owner pirates is below NEUTRAL with
     hegemony; they go to sya_refuge".
  3. Waypoint 70 › comm directory: Hale Varro is gone.
  4. Refuge 70 › comm directory: Hale Varro is listed. Talk to him: "Test 70: the loyalist's job"
     is not offered. starsector.log: "skipped quest sya_job: its contact sya_loyal is away" (once).

(c) Changing it back, or making peace, brings him back
  1. Ctrl+F9 › "Change a market's owner" › Waypoint 70 › Independent: "1 person left or came back";
     log "person sya_loyal is back at sya_station: …".
  2. Waypoint 70 › comm directory: Hale Varro is listed again and offers his quest; Refuge 70 no
     longer lists him.
  3. A war instead of an owner change: Ctrl+F9 › "War or peace" › "War: independent and hegemony
     hostile": he leaves (as in (b) 2–4). Then "Peace: independent and hegemony neutral": he is back.
  4. Save, load: he stays as he was (listed or not) after the load.

(d) SF_FactionRep in a dialog
  1. With Waypoint 70 independent and at peace: its menu › "Test 70, ask who runs the station": the
     text says "the station belongs to the independents. Captain Varro away: false". Pick "Does the owner
     get on with the Hegemony?": "SF_FactionRep says the owner is at least Neutral with the Hegemony".
  2. Ctrl+F9 › "War or peace" › "War: independent and hegemony hostile", ask again: "… belongs to
     independent. Captain Varro away: true", then "… worse than Neutral with the Hegemony".
  3. Optional: Peace again, change Waypoint 70's owner to Pirates (dev menu) and ask: "… belongs to
     pirates", "… worse than Neutral".
```

  - Record the results here.
  - **Results (user, 2026-11-18, 0.98a-RC8)**: **(a) passed.** Talking to Hale Varro at Waypoint 70
    offers "Test 70: the loyalist's job" (next to vanilla's Hegemony missions from his hub); Refuge
    70's comm directory doesn't list him. starsector.log: no "leaves" line, no SagaLib errors (no
    "people: … created" line either: he was created when Waypoint 70 was built, from its people list).
    **(b) passed.** Dev menu › Change a market's owner listed "sya_loyal at sya_station: owner at least
    NEUTRAL with hegemony (present now)"; Waypoint 70 › pirates: "No quest reacted. 1 person left or
    came back". Log: "dev menu: market sya_station changed owner from independent to pirates", "person
    sya_loyal leaves sya_station: its owner pirates is below NEUTRAL with hegemony; they go to
    sya_refuge", and on talking to him at Refuge 70 "skipped quest sya_job: its contact sya_loyal is
    away". Waypoint 70's comm directory no longer lists him; Refuge 70's does; there he offers only
    vanilla's observation-package mission (a new one: the hub was replaced), not the Test 70 job.
    **(c) passed.** Waypoint 70 › Independent: "person sya_loyal is back at sya_station: its owner
    independent is at least NEUTRAL with hegemony"; listed at Waypoint 70 again. War or peace showed
    "independent and hegemony (sya_loyal): NEUTRAL"; War: "now HOSTILE. 1 person left or came back",
    log "relation independent / hegemony set to -0.6" and "… leaves sya_station: its owner independent
    is below NEUTRAL with hegemony"; Peace (0): "… is back". Saved while away (after a second War) and
    loaded: no presence line on load (the flag didn't change) and Waypoint 70 still doesn't list him.
    No SagaLib errors.
    **(d) passed.** "Does the owner get on with the Hegemony?": independent at peace → "at least Neutral"
    (away: false); independent at war → "worse than Neutral" (away: true); pirate owner → "worse than
    Neutral" (away: true). So `SF_FactionRep $faction.id hegemony NEUTRAL` reads the real owner id.
    **Found (test text only)**: the offer text's `$faction.id` showed as "independent.id" / "pirate.id":
    in dialog *text* the game replaces its token `$faction` (the faction's name) before memory keys, so
    `$faction.<x>` can't be shown in text (conditions are unaffected). The test mod now says
    `$theFaction`. **Task #70 in-game check: done.**

- **Task #62: a LunaLib settings page for the mod** (SagaLib 1.3 with its LunaLib bridge;
  **0.98a** install `D:\Starsector`, where LunaLib 2.0.5 and LazyLib are; dev mode, throwaway saves
  only). Test mod `mods\sixtytwo_a` (prefix `sta_`), built by `npx jiti scripts/build-test-mod.ts
  sixtytwo_a`; it needs a junction in `D:\Starsector\mods` like the other test mods. Rebuild SagaLib
  first (`bash build.sh` in `mods\SagaLib`; it must print "built lunalib"). LunaLib is **not** in
  the test mod's `mod_info.json` (optional). Its page "Saga Forge test #62: LunaLib settings": a
  header, **Enable the courier job** (on/off, on), **Difficulty** (Easy / Normal / Hard, Normal),
  **Bonus pay (percent)** (0–300, 100) and a text line. In "Test Range 62", Waypoint 62's menu has
  "Test 62, check the settings" (the values as SagaLib set them, a Branch on the difficulty and on
  the bonus) and, while the switch is on, "Test 62 - the courier job" (repeatable): raiders (40
  fleet points by the doctrine, × 0.5 / 1 / 2.5 by difficulty) wait at Waypoint 62 while it runs;
  delivering at Drop 62 pays a 1,000¢ bonus × the bonus percent, then 10,000¢ × 0.5 / 1 / 2 by
  difficulty. LunaLib's menu opens with **F3** (or Shift+F2) in the campaign, or **Mod Settings** in
  the main menu.

```
(a) With LunaLib: the page shows, and the switch takes the job away without reloading
  1. Enable LazyLib, LunaLib, SagaLib and sixtytwo_a; dev mode. New game, then Ctrl+F9 ›
     "62: go to Test Range 62".
  2. starsector.log: "LunaLib bridge loaded: mod settings use the player's values from LunaLib's
     menu" and "settings of sixtytwo_a: 3 values (LunaLib)".
  3. F3: LunaLib's menu lists "Saga Forge test #62: LunaLib settings". Its page shows the header,
     the switch (ticked), Difficulty (Normal), Bonus pay (a slider 0–300 at 100) and the text line;
     each option's description is printed under its label.
  4. Dock at Waypoint 62: the menu has "Test 62 - the courier job" and "Test 62, check the settings".
     Check the settings: "Courier job enabled: true. Difficulty: Normal. Bonus: 100 percent."
  5. Leave, F3, untick "Enable the courier job", save the settings. starsector.log: "settings of
     sixtytwo_a saved in LunaLib's menu: sta_side_job true -> false".
  6. Dock at Waypoint 62 again (no reload): "Test 62 - the courier job" is gone; check the
     settings says "Courier job enabled: false".
  7. F3, tick it again, save: the job is offered again at the next docking.
  8. Ctrl+F9 › "Mod settings": each value, where it came from (LunaLib), its default and the bridge.

(b) The difficulty changes the raiders' size and the pay; the bonus percent changes the bonus
  1. F3: Difficulty Hard, Bonus pay 150; save. Dock, check the settings › "Ask about the
     difficulty": "the Branch says Hard"; "Ask about the bonus": "at least 150 percent".
  2. Take the courier job. starsector.log: "encounter sta_raiders: 40.0 fleet points scaled to
     100.0 by setting sta_difficulty". The "Test 62 Raiders" fleet at Waypoint 62 is clearly bigger
     than in step 5 (hover it, or look at it with the Hard and Easy runs side by side).
  3. Fly to Drop 62 › "Test 62 - deliver the parcel": "Gained 1,500¢" (the bonus) and then
     "Gained 20,000¢" (the pay). Log: "reward bonus: 1000 credits scaled to 1500 by setting
     sta_bonus" and "reward pay: 10000 credits scaled to 20000 by setting sta_difficulty".
  4. F3: Difficulty Easy, Bonus pay 100; save. Take the job again: raiders "scaled to 20.0",
     a small fleet; delivering pays "Gained 1,000¢" and "Gained 5,000¢".
  5. Changing the difficulty while the job runs leaves the raiders already spawned as they are
     (they were sized when they spawned); the pay follows the setting when it is paid.

(c) Without LunaLib: the mod loads and the defaults apply
  1. Disable LunaLib (keep the rest). New game (or load the save from (a)/(b)).
  2. The game loads with no error about LunaLib. starsector.log: "settings of sixtytwo_a: 3 values
     (defaults; LunaLib isn't enabled)", and no "LunaLib bridge" line.
  3. Ctrl+F9 › "62: go to Test Range 62", dock at Waypoint 62: the courier job is offered; check
     the settings: "true", "Normal", "100" (the defaults, whatever was saved in LunaLib's menu).
  4. Take the job: no "scaled" line for the raiders (Normal × 1, 40 points); delivering pays
     "Gained 1,000¢" and "Gained 10,000¢".
  5. Ctrl+F9 › "Mod settings": every value from its default; the bridge status says LunaLib isn't
     enabled.
```

  - Record the results here.
  - **Results (user, 2026-11-18, 0.98a-RC8, LunaLib 2.0.5)**: **(a) passed.** Log: "LunaLib bridge
    loaded …" and "settings of sixtytwo_a: 3 values (LunaLib)"; LunaLib loaded all five rows. The
    page shows the mod with its switch, choice and 0–300 slider; descriptions are printed under the
    labels (LunaLib has no hover tooltip). Waypoint 62 offered the job and "check the settings" said
    true / Normal / 100. Unticking the switch logged "settings of sixtytwo_a saved in LunaLib's menu:
    sta_side_job true -> false"; docking again without a reload, the job option was gone and the
    check said false; ticking it again brought the job back. Ctrl+F9 › Mod settings: "LunaLib: bridge
    ready", each value "from LunaLib (default …)".
    **Found and fixed**: the Header and Text line showed empty: LunaLib draws `defaultValue` for
    them, not `fieldName` (FORMATS.md). The export now writes the label in both; after the rebuild
    both showed. **Found**: a whole-number setting shown in dialog text reads "100.0" (memory numbers are
    Floats; conditions are fine). User, 2026-11-18: warn, don't change the type: Problems now warns.
    **(b) passed.** Hard / 150: the Branches said Hard and "at least 150"; log "encounter sta_raiders:
    40.0 fleet points scaled to 100.0" (a big fleet, ~15 ships), "reward bonus: 1000 credits scaled to
    1500" and "reward pay: 10000 credits scaled to 20000". Easy / 100: "scaled to 20.0" (a small fleet),
    "Gained 1,000¢" and "Gained 5,000¢" (log: pay scaled to 5000; the bonus at 100% logs nothing).
    **Found and fixed (test mod, plus a new Problems warning)**: Drop 62 is a station without a market,
    where vanilla's defaultOpenDialog shows only Leave and never fires PopulateOptions, so the Arrive's
    menu option never appeared (FORMATS.md). The Arrive now takes over the arrival, and Problems warns
    about an Arrive or option start at such a place. Then the takeover paid but the dialog closed at
    once (the end link "back to the menu" closes it where there is no menu), so the job now ends on a
    dialog with Leave. Problems now also warns about "takeover at a place without a menu, straight to back to the menu"
    (user, 2026-11-18).
    **(c) passed.** LunaLib disabled, same save: log "settings of sixtytwo_a: 3 values (defaults;
    LunaLib isn't enabled)", no LunaLib class loaded (the bridge never touched), no SagaLib errors.
    Check the settings: true / Normal / 100 (LunaLib's menu last had Easy); the raiders were 40 points
    (no "scaled" line); delivering paid "Gained 1,000¢" and "Gained 10,000¢". Ctrl+F9 › Mod settings:
    "LunaLib isn't enabled (every setting uses its default)", each value "default".
    **Task #62 in-game check: done.**

- **Task #63: Nexerelin faction config for the mod's own factions** (PLAN.md §10.3; data only,
  Nexerelin optional; SagaLib 1.3 leaves the starting relations to Nexerelin; **0.98a** install
  `D:\Starsector`, where Nexerelin 0.12.2d, LazyLib and MagicLib are; dev mode, throwaway saves only).
  Test mod `mods\sixtythree_a` (prefix `sth_`), built by `npx jiti scripts/build-test-mod.ts
  sixtythree_a`; it needs a junction in `D:\Starsector\mods` like the other test mods. Rebuild SagaLib
  first (`bash build.sh` in `mods\SagaLib`). Nexerelin is **not** in the test mod's `mod_info.json`.
  Two factions with a station each in "Test Range 63" (Compact Hold 63, Keepers Hold 63; Range Control
  63 is independent):
  - **Test 63 Compact** (`sth_compact`): starting faction, difficulty "Test", a tooltip, ready-made fleets
    Frigate (Lasher), small combat (two fleets) and small trade. Starting relations: Hegemony -0.6
    **Hostile**, Independent 0.55 **Friendly**, Tri-Tachyon 0.3 **Welcoming** (all three in its
    Nexerelin config), and Luddic Church -0.8 **Vengeful** *only with Nexerelin* (a relation with a mod
    condition: not in the config, SagaLib sets it after Nexerelin, never randomized).
  - **Test 63 Keepers** (`sth_keep`): starting faction (difficulty "Test, kept"), "Keep relations when
    randomized" on. Starting relations: Hegemony 0.6 **Friendly**, pirates -0.6 **Hostile**.
  - **The player faction** (free start, own faction): ready-made fleets added to Nexerelin's, one more
    Frigate (classic) fleet (a Kite) and one more Combat (small) fleet (Hammerhead + 2 Kites), in the
    mod's `data/config/exerelinFactionConfig/player.json` (only those lists).
  Relations are read in the intel tab › Factions (pick the faction; its relations list), or with the
  console. "starsector.log" lines are SagaLib's.

```
(a) Pickable in Nexerelin's new-game list
  1. Enable LazyLib, MagicLib, Nexerelin, SagaLib and sixtythree_a; dev mode. New game, the
     hand-made sector (not random), Reset relations: no.
  2. Join a faction › main factions: "Test 63 Compact (Test)" and "Test 63 Keepers (Test, kept)" are
     in the list, in their colors. Hovering Test 63 Compact shows "Test 63 (a): this tooltip comes from
     the faction's Nexerelin config, made in Saga Forge."
  3. Pick Test 63 Compact: the fleet choice offers Frigate (classic) (a Lasher), Combat (small) with
     < > (1 / 2: Hammerhead + Lasher, two Lashers) and Trade (small) (Buffalo + Lasher), plus
     Nexerelin's Custom button, and no other types. Start the game.
  4. You start as a member of Test 63 Compact (commissioned). Note where you start (Compact Hold 63
     or elsewhere).

(b) Starting relations as designed, hand-made sector
  1. The game from (a). starsector.log: "left 3 starting relations of sth_compact to Nexerelin (its
     faction config)" and "left 2 starting relations of sth_keep to Nexerelin", and "set 1 starting
     faction relations" (the Luddic Church one).
  2. Intel › Factions › Test 63 Compact: Hegemony Hostile, Independent Friendly, Tri-Tachyon
     Welcoming, Luddic Church Vengeful. Test 63 Keepers: Hegemony Friendly, Pirates Hostile.
  3. Nexerelin's diplomacy profile of Test 63 Compact (Intel › Factions, Nexerelin's page): morality
     Good, alignments diplomatic / corporate up and militarist down, traits Pacifist and Helps Allies.

(c) Random relations: randomized only when asked, and the kept faction keeps its own
  1. New game, hand-made sector, Reset relations: randomize. Start as anyone.
  2. Intel › Factions › Test 63 Keepers: Hegemony Friendly, Pirates Hostile (kept).
  3. Test 63 Compact: its relations with Hegemony, Independent and Tri-Tachyon are random (likely
     not Hostile / Friendly / Welcoming all three; repeat once if they happen to match). Luddic Church
     is still Vengeful (SagaLib sets it after Nexerelin: ModPlugins run in mod order, and "SagaLib"
     sorts after "Nexerelin").
  4. Optional: Reset relations: flatten. Test 63 Compact and Keepers are neutral with everyone
     (Nexerelin's flatten), except the Luddic Church line, which SagaLib still sets (Vengeful).

(d) A random sector (ON HOLD with the random sector, descoped 2026-11-18: skip; user, 2026-11-19)
  1. New game, random sector, Reset relations: no; Test 63 Compact and Keepers switched on in the
     faction list. Start as anyone.
  2. Test 63 Compact: Hegemony Hostile, Independent Friendly, Tri-Tachyon Welcoming, Luddic Church
     Vengeful. Test 63 Keepers: Hegemony Friendly, Pirates Hostile.

(e) Without Nexerelin, nothing changes
  1. Disable Nexerelin (keep the rest). New game (vanilla's sector).
  2. starsector.log: "set 5 starting faction relations", no "left … to Nexerelin" line, no error.
     (The Luddic Church relation is only with Nexerelin, so it is skipped.)
  3. Intel › Factions: Test 63 Compact Hegemony Hostile, Independent Friendly, Tri-Tachyon Welcoming,
     Luddic Church neutral; Test 63 Keepers Hegemony Friendly, Pirates Hostile, as SagaLib always set
     them.

(f) Ready-made fleets added to the player faction (free start)
  1. With Nexerelin (as in (a)): New game › Free start (hard). The fleet choice is Nexerelin's
     (your screenshot of 2026-11-19 had Frigate (classic) 1 / 5).
  2. Frigate (classic): one more fleet than without sixtythree_a (1 / 6); the last one is a lone Kite.
     Combat (small): < > now 1 / 2; the second is a Hammerhead and two Kites. Nexerelin's own fleets
     are all still there, in their order.
  3. Optional, to compare: disable sixtythree_a: back to 1 / 5 and a single Combat (small) fleet.
```

  - Record the results here.
  - **Results (user, 2026-11-19, 0.98a-RC8, Nexerelin 0.12.2d)**: **(a) passed.** The new-game list
    (Factions: Pir - Tri) has "Test 63 Compact (Test)" and "Test 63 Keepers (Test, kept)"; hovering
    Compact shows the config's tooltip. Joining it shows its description ("Test 63: a faction with a
    full Nexerelin config.") and the fleet choice Frigate (classic), Combat (small) 1 / 2 and Trade
    (small), plus Custom, nothing else. Picking Trade (small) gave a Buffalo Mk.II and a Lasher.
    Commissioned, started at Compact Hold 63.
    **(b) passed** (steps 1 and 2; step 3, Nexerelin's diplomacy profile, not looked at). Log:
    "set 1 starting faction relations", "left 2 starting relations of sth_keep to Nexerelin (its
    faction config)", "left 3 … of sth_compact …"; the mod list reads Nexerelin, sixtythree_a, SagaLib,
    and Nexerelin's last relations line comes 3 ms before SagaLib's (ModPlugins run in mod order, seen
    in game). Test 63 Compact: Hegemony Hostile -60, Tri-Tachyon Welcoming 30, Independent Friendly 55,
    Luddic Church Vengeful -80. Test 63 Keepers: Hegemony Friendly 60, Pirates Hostile -60.
    **Found**: the player, who joined Test 63 Compact, was Neutral with the Luddic Church (the other
    relations matched Compact's). Nexerelin copies the joined faction's relations to the player at the
    end of its setup, before SagaLib sets the relation with a mod condition. User, 2026-11-19: not a
    bug of either mod, don't work around Nexerelin; documented (FORMATS.md) and Problems' line on the
    relations that stay SagaLib's now says a joining player doesn't get them.
    **(c) passed** (Random, joined Independent). Test 63 Compact: Hegemony, Independent and Tri-Tachyon
    no longer Hostile / Friendly / Welcoming (none among its allies or enemies: randomized, here near
    neutral); Luddic Church still Vengeful -80 (SagaLib, after Nexerelin). Test 63 Keepers: Hegemony
    Friendly 60, Pirates Hostile -60 (kept). Both Hostile -60 with the Luddic Path and the pirates:
    Nexerelin's pirate rule in that mode, not ours. **Step 4 (Flatten) passed** (joined the Persean
    League): Test 63 Compact neutral with everyone but the Luddic Church, still Vengeful -80; Test 63
    Keepers neutral with everyone but Pirates Hostile -60 (its Hegemony Friendly is gone too: "keep
    relations" only protects from Random, Flatten resets every faction afterwards; the pirates are
    Nexerelin's pirate rule).
    **(e) passed** (Nexerelin disabled). Log: "skipped relation sth_compact/luddic_church of
    sixtythree_a: needs nexerelin (not enabled)", "set 5 starting faction relations", no "left … to
    Nexerelin" line, no SagaLib error. Test 63 Compact: Tri-Tachyon Welcoming 30, Independent Friendly
    55, Hegemony Hostile -60, Luddic Church neutral; Test 63 Keepers: Hegemony Friendly 60, Pirates
    Hostile -60.
    **(d) on hold** (the random sector). **(f) passed**: Free start (hard) shows Frigate (classic)
    1 / 6 (was 1 / 5) and Combat (small) 1 / 2 (was one fleet): the mod's player.json is appended to
    Nexerelin's by the game's merge, Nexerelin's fleets all still there.
    **Task #63 in-game check: done** (2026-11-19; (d) on hold with the random sector).

- **Task #65: Nexerelin quest skip, MagicLib achievements, shared drop groups** (PLAN.md §10, "Later"
  rows, §10.7 question 5; SagaLib 1.3's Nexerelin plugin and MagicLib bridge; **0.98a** install
  `D:\Starsector`, where Nexerelin 0.12.2d, MagicLib 1.5.6 and LazyLib are; dev mode, throwaway saves
  only). Test mod `mods\sixtyfive_a` (prefix `sfv_`), built by `npx jiti scripts/build-test-mod.ts
  sixtyfive_a`; it needs a junction in `D:\Starsector\mods` like the other test mods. Rebuild SagaLib
  first (`bash build.sh` in `mods\SagaLib`: it must say "built magiclib" and "built nexerelin").
  Neither Nexerelin nor MagicLib is in the test mod's `mod_info.json`. At Waypoint 65 ("Test Range 65";
  Ctrl+F9 › "65: go to Test Range 65"):
  - **Test 65: the first job** (`sfv_first`): Accept, then Help (sets `$global.sfv_first_helped`, +500
    XP, success with 5,000 credits and the achievement "Test 65: first job done") or Refuse (failure).
  - **Test 65: the second job** (`sfv_second`): offered only after the first ended in success; its
    end unlocks the hidden achievement "Test 65: second job done".
  - **Test 65, check the skip**: prints the first job's state, step, flag, completed key and
    `$global.sagaforge_skipped_sfv_first`, the second job's state, and a Branch on
    `SF_QuestDone sfv_first success`.
  - Saga › Quest skip: chain "Test 65" (sorted last) with "Test 65: first" (a skip means Help) and
    "Test 65: second".
  Achievements are kept in `saves/common` (MagicLib's `magic_achievements.json`), not in a save: once
  unlocked, they stay unlocked for later runs (MagicLib's list has no reset, and Console Commands
  isn't installed). Run (a) before (b): (a) unlocks only the second job's achievement.

```
(a) The chain on Nexerelin's new-game screen, and a skip sets the chosen ending
  1. Enable LazyLib, MagicLib, Nexerelin, SagaLib and sixtyfive_a; dev mode. New game (hand-made
     sector), any start.
  2. In the new-game options, Skip story ("Set completed quests"): a row "Test 65" with its icon,
     after Nexerelin's rows, with the buttons "Test 65: first" and "Test 65: second". Hovering
     the row and each button shows its tooltip.
  3. Check "Test 65: second": "Test 65: first" is checked with it. Uncheck "Test 65: first":
     "Test 65: second" is unchecked too. Leave only "Test 65: first" checked. Start the game.
  4. starsector.log: "quest skip: sfv_first skipped through Nexerelin (state success, 2 reward(s)
     given)"; no SagaLib or Nexerelin error. The credits went up by 5,000 and the XP by 500 at the
     start (compare with a start without the skip, or the log's credit lines).
  5. Ctrl+F9 › 65, at Waypoint 65: "Test 65 - the first job" is NOT offered; "Test 65 - the second
     job" IS offered. Its text says "Helped in the first job: true".
  6. "Test 65, check the skip": first job success, step done, helped true, completed key true,
     skipped through Nexerelin true; second job (empty: not started). Ask whether it's done:
     "SF_QuestDone sfv_first success is true".
  7. Take and finish the second job: it ends in success; with MagicLib, its achievement notice.

(b) A quest end unlocks the achievement, and MagicLib lists it
  1. New game without skipping (or a new save; Skip story: nothing checked). Ctrl+F9 › 65.
  2. Intel › Achievements (MagicLib): "Test 65: first job done" is listed (visible, common), not yet
     unlocked; "Test 65: second job done" isn't shown (hidden).
  3. "Test 65 - the first job" › Accept › Test 65 - help: the dialog shows the 5,000 credits and
     MagicLib's achievement notice. "Test 65 - the second job" is offered now.
  4. Intel › Achievements: "Test 65: first job done" unlocked, with the job's icon (not MagicLib's
     default image). starsector.log: "SF_Achievement in rule …: achievement sfv_first_done
     unlocked" and MagicLib's "Achievement completed! sfv_first_done".
  5. Optional: Refuse instead (a new game): the job fails, no achievement, the second job isn't
     offered.

(c) Without MagicLib: the mod loads and nothing happens
  1. Disable MagicLib (keep Nexerelin, or disable both). The game starts; no error about
     magic_achievements.csv or SF_Achievement.
  2. New game, Ctrl+F9 › 65, play the first job to Help: it ends in success with the credits, no
     achievement notice, the dialog goes on. starsector.log: one line "achievement sfv_first_done not
     unlocked: MagicLib isn't enabled".
  3. Without Nexerelin too: no Skip story screen; the mod loads, no error about questSkip.json.

(d) Shared drop groups (Saga Forge only)
  1. In Saga Forge, with the 0.98.5a install (D:\Starsector_98_5a, where eight_a and eight_a_twin are
     junctioned), open eight_a: Problems shows the warning on loot pool "More alpha cores":
     "ai_cores1" already has "alpha_core" (eight_a_twin) … only one weight counts. (The automated
     test reads the same two files: test/crossmod65.test.ts.)
```

  **(a) passed** (2026-11-19, 0.98a-RC8, Nexerelin 0.12.2d, MagicLib 1.5.6): the "Test 65" row with its
  icon (so an image listed in settings.json graphics is loaded and drawn by path), both buttons and
  tooltips, forcing on and off as designed. Log: "quest skip: sfv_first skipped through Nexerelin
  (state success, 2 reward(s) given)", no error. Check the skip: success, step done, helped true,
  completed key true, skipped true; the first job not offered, the second offered ("Helped in the
  first job: true"); its end showed MagicLib's notice ("Achievement completed! sfv_second_done").
  Notes: an unset key in text prints its name ("Second job: $global.sfv_second_state"), as vanilla
  does, not empty; and the test profile sets the credits to 100,000, so the skip's 5,000 can't be
  seen with it (the log line counts the rewards).
  **(b) passed** (2026-11-19): Intel › Achievements listed "Test 65: first job done" locked; Help showed
  "Gained 500 experience", "Gained 5,000¢" and MagicLib's notice; the list then had it unlocked with
  the mission icon (the second, without an image, MagicLib's default); log "Achievement completed!
  sfv_first_done" and SF_Achievement's line. Refuse: failed, no notice, the second job not offered.
  The shared "after" text read as if an achievement came after Refuse too; reworded in the test mod.
  **(c) passed** (2026-11-19), with Nexerelin and MagicLib both disabled (Nexerelin needs MagicLib,
  so "only MagicLib off" can't be tested): no Skip story screen; the mod loads with no error ("0
  errors" in SagaLib's content line); both jobs end in success with their rewards and no notice; one
  log line each: "achievement sfv_first_done not unlocked: MagicLib isn't enabled" (and sfv_second_done).
  **(d) passed** (2026-11-19, Saga Forge on the 0.98.5a install): eight_a's loot pool "More alpha cores"
  warns that "ai_cores1" already has "alpha_core" (eight_a_twin); eight_a_twin, whose row is written by
  hand, warns the same way naming eight_a (the hand-written-row check).
  **Task #65 in-game check: done** (2026-11-19).

- **Follow-up: quest icons of the mod's own** (2026-11-19; SagaLib 1.3 now loads a quest's icon
  before the game draws it, `SagaQuest.getIcon` › `Textures.ensure`). Same test mod and install. Two
  quests at Waypoint 65 with icons that are the mod's own files (made with `node
  scripts/make-test-art.mjs <dir> <color>`, `icon_box.png` copied to
  `graphics/icons/missions/sfv_icon_option.png` (red) and `sfv_icon_contact.png` (blue); the build
  writes only text). Run 1 uses the SagaLib jar from before the fix (commit 7744d71), run 2 the fixed
  one; Nexerelin and MagicLib can stay off.

```
Run 1 (SagaLib before the fix) and run 2 (after it): the same steps
  1. Enable LazyLib, SagaLib and sixtyfive_a; dev mode. New game, Ctrl+F9 › 65.
  2. At Waypoint 65: "Test 65 - the icon job (option start)" › Accept. Look at the "Accepted"
     and stage lines in the dialog: a red square, or blank?
  3. Comm directory › Ada Kell › her job "Test 65: icon, contact start" (it may take a
     moment to be offered; leave and come back if not) › Accept. The lines: a blue square, or
     blank?
  4. Intel › Missions (or Accepted): both entries' icons.
  5. starsector.log: any "can't load image" line from SagaLib?
  Expected: run 2 shows both squares and no log line. Run 1 tells whether the game loads the icon
  in person_missions.csv by itself (the blue one) and confirms the option start's red one is blank.
```

  **Run 1 done** (2026-11-19, SagaLib before the fix): the option start's icon is **blank** in the
  dialog's Accepted and stage lines and in the intel list; the contact start's blue icon **shows**, so
  the game loads the icons named in person_missions.csv (and so bar_events.csv, presumably) itself.
  Only quests without such a row (option, trigger, interjection, bar scene, manual, started by another
  quest) needed the fix.
  **Run 2 passed** (2026-11-19, fixed SagaLib): the option start's red icon shows in the dialog lines,
  the contact start's blue one still does; no "can't load image" line. **Follow-up check: done.**

## Workflow checks (task #36)

> **Decision (user, 2026-11-15): the test mod build is cancelled until after the changes.** The
> workflow walk below (W1–W8) and the test mod (`TEST-MOD-CHECKLIST.md`, the Heliopolis guide in
> `Mod Guides/Heliopolis`) wait until the requested changes (the lists further down) are made.
> **All earlier test mods are void**: `mods\SagaForgeFormatTest`, `mods\VanguardCompact` and the
> Heliopolis (cat mod) guide and screenshots. **There are no current users who can be affected**:
> people who received copies of 1.0 were told it was for looking at and feedback, not serious use.
> So the formats and exports may change without keeping 1.0 compatibility (order constraints such
> as RC-F2's "before the test mod" no longer apply), and the example and test mods are rebuilt
> afterwards: Vanguard Compact at the checkpoint after Phase 6, Heliopolis after everything as a real
> mod (see [WORK-ORDER.md](WORK-ORDER.md)).

The whole path a new modder takes, from first launch to a released update, **by hand in the app**
(not `scripts/build-example.ts`), then played in game. Follow PITCH.md's walkthrough and rebuild
the Vanguard Compact example. Use a **new mod with prefix `vgh_`** (e.g. "Vanguard by hand") so its
ids never clash with `mods\VanguardCompact`. Enable only one of the two in game.
`docs/TEST-MOD-CHECKLIST.md` (prefix `sfw_`) is the wider list of every feature. Run it the same
way afterwards, and use the walk below for the main path.

For each step, note every point of confusion, extra step, missing feedback or dead end under
"Findings" below.

- **W1 Install and mod.** First start: pick the Starsector folder, then the mods folder in ⚙.
  **+ New mod** (labels and help on Mod id and Name), then the prefix prompt. Link the new folder
  into `Starsector\mods` yourself.
- **W2 Factions.** + New faction "Vanguard Compact": go through every tab, reading each field's
  help (Behavior: Offers commissions on). + Change a faction… → Hegemony: add two hulls and a tag,
  set a hull frequency, try to remove a vanilla hull.
- **W3 People, items, location.** Reyes (rank, post Station commander: the help says she takes
  over vanilla's station commander and offers commissions), phrases. The black box (Quest item
  preset). Kestrel with Haven Station (market) and the convoy wreck. Add Reyes to Haven's people
  and check People › Placement follows (and the other way round).
- **W4 Quest.** The Lost Convoy with every node type: Dialog (options with show-once, story point,
  Esc, tooltip; displays), Branch, Action, Stage (fill the stage form: title, journal, next-step,
  marker from the picker, kind), Encounter, Wait/Arrive (place from the picker), End with a
  reward, Link (new links default to "back to the menu"), Note. Phrases inline and Reyes's.
  Play ▶ through every branch; make a test profile from Play mode and one on the Saga page.
- **W5 Wreck.** Problems warns that the convoy wreck is unprotected: use **Protect this wreck**
  (from Problems or Locations › the wreck › Protection), and edit the text of the conversation it
  creates.
- **W6 Encounter.** Belt ambush from the Encounter node; Spawn › At offers the quest's marked
  places; a comm-link dialog with a story-point bluff; Defeated and Avoided wired.
- **W7 Check, export, release.** Check mod (errors block Export, warnings explained). Export:
  set **Mod version** 1.0.0, Export, **Mark as released**. Then change stage `search` → `find`
  with Keep the old id as an alias, set Mod version 1.1.0 in the Export dialog (no hand edit of
  `mod_info.json`), Export again.
- **W8 In game.** With SagaLib: walkthrough steps 1–11 above against the hand-built mod, and:
  - the generated wreck protection answers at the wreck between the quests, and Leave closes it;
  - a "back to the menu" Link reached at the wreck (e.g. the Wreck found node's Leave) closes the
    dialog, and at Reyes returns to her options;
  - the launcher shows the version set in the Export dialog.

### Findings

Walked in the editor on 2026-11-14 by reading every form against SagaLib's and the game's code
and with screenshots of each page (Claude). W1–W7 were walked in the app on 2026-11-15 (F17–F31
below); W8 was played by the user the same day (quest end to end, launcher version, commission
title, dev-mode profiles) and accepted. Sorted by how often a modder would hit them.

| # | Found | Status |
|---|---|---|
| F1 | Fields had no label or help, only placeholders that vanish once filled (user request). | **Fixed**: `ui/Field.svelte` on every form; `test/patterns.test.ts` fails if a form field has no label or help. |
| F2 | A Link node defaulted to `FireAll PopulateOptions`, which leaves the old options on screen at a wreck (found in game 2026-11-11). | **Fixed**: "back to the menu" mode (`SF_BackToMenu`), the default; hint or warning with a fix on the old form. |
| F3 | Protecting a quest wreck meant hand-building a dialog-only conversation with `$id == … score:500` and `!SF_QuestDone …` (user request). | **Fixed**: Protect this wreck (Locations and Problems). |
| F4 | An update needed a hand edit of `mod_info.json`'s version (walkthrough step 11). | **Fixed**: Mod version in the Export dialog. |
| F5 | A person's market lived in two places (Placement, the market's people list) that could disagree. | **Fixed**: kept in step; a mismatch is a warning. |
| F6 | Stage map marker and Arrive place were bare text ids. | **Fixed**: pickers. |
| F7 | No guidance on where a quest's ambush should wait (user request). | **Fixed**: spawn suggestions and a warning with a fix. |
| F8 | Fixes could only be applied on the Problems page. | **Fixed**: also in the quest page's Problems tab and on Encounters. |
| F9 | Bar start "Market tags" was really the bar event's tags column. | **Fixed**: "Event tags", with help. |
| F10 | After applying a fix, the Problems page still showed the last **Check mod** results, with the fixed problem in them. | **Fixed**: a fix returns to the live checks and says to run Check mod again. |
| F11 | Linking a new mod into `Starsector\mods` is the modder's own step (the editor never writes there, by design). The New mod dialog says so. | By design. |
| F12 | System view: a station's label overlaps its planet's (Haven Station over Kestrel I). | **Fixed** (2026-11-15, Phase 0): a satellite's name goes on the side away from what it orbits, and a body with satellites labels away from its first one. |
| F13 | A fleet spawned by an Action ("Spawn an encounter", e.g. an escort that isn't fought) was reported as "no quest spawns it" (found preparing the Heliopolis guide, 2026-11-14). | **Fixed**: Action spawns count. |
| F14 | No form for a faction's own name pool (`data/characters/person_names.csv` rows), its ship name list (`data/strings/ship_names.json`), `fleetTypeNames` (Other keys only) or a named flagship on an encounter. Found preparing the Heliopolis guide (`Mod Guides/Heliopolis`). | **Fixed** (2026-11-15, Phase 2): name pools and ship name lists (R3), Fleet type names (R22). Still open: a named flagship on an encounter (R27, Phase 5). |
| F15 | Additions to a vanilla system built in code (Tia) can't be placed against its own bodies: the system view shows none of them, so "put the station in Lagua's Torus" is trial and error in game. | **Fixed** (2026-11-15, Phase 3, with R14): the system view draws Tia's own bodies from TiaTaxet.java (Lagua's Torus at 3600), and additions can orbit them. |
| F16 | A faction's portrait lists show file paths only and take one id at a time: a 64-portrait pool (16 breeds × 4 collar tiers) is slow to fill and impossible to check by eye. Ideas: thumbnails on the chips, "add every portrait in a folder". | **Fixed** (2026-11-15, Phase 1, with R28): the lists' **+ Choose…** picks several portraits at once from a thumbnail grid, and the chips show thumbnails; a whole folder is imported on the Images page (R5). |

**The checkpoint walk, 2026-11-15** (Claude, W1–W7 in the running app through `scripts/walk.mjs`:
real clicks, typing and drags over Chrome DevTools; the native file dialogs answered from a queue).
Built **`mods\vanguard_by_hand`** (prefix `vgh_`): the Vanguard Compact faction, the Hegemony
patch, Reyes with her title phrase, the black box, Kestrel with Haven Station, The Lost Convoy (every
node type), the wreck protection, the Belt ambush with its comm-link bluff, two test profiles;
exported 1.0.0, marked released, stage `search` → `find` with the alias, exported 1.1.0. W8 (in
game) is the user's.

| # | Found | Status |
|---|---|---|
| F17 | **Bug**: "+ faction" / "+ item" on a quest reward added nothing; also the Saga page's profile cargo, Locations › Removed during quests › + Add, Encounters › + variant and Factions › "Remove at game start". `(x.list ??= []).push()` pushed into the plain array, not the state proxy. | **Fixed**: the list is read back after it is created. |
| F18 | **Bug**: editing any field of a stage in the quest outline folded its form shut (and Change id… closed it). | **Fixed**: the open stage is remembered; "+" and a Stage node's **+ New stage…** open the new stage's form. |
| F19 | **Bug**: Problems › Ignore and Play mode's "Copy to a test profile" did nothing (Electron has no `prompt()`). | **Fixed**: a small dialog asks (`app.ask`). |
| F20 | **Silent in-game failure**: an Arrive at a market's id (`vgh_haven`, as stage markers accept) never fires: the rule tests the object's `$id` (`vgh_kestrel_station`). | **Fixed**: an error with a one-click fix ("Use vgh_kestrel_station"). Open: entity ids can't be changed (F27). |
| F21 | First start: **+ New mod** was a dead end ("mods folder not set: choose one in Settings"). | **Fixed**: New mod chooses the folder itself (your own folder or the game's mods folder). |
| F22 | New factions pointed at flag and crest files that don't exist (`independent.png`); ship prefix "ISS". | **Fixed**: vanilla Independent's `neutral_traders` files; the prefix from the name ("VCS"). |
| F23 | The Encounter node only offered existing encounters ("create it on the Encounters page"); the Stage node only existing stages. | **Fixed**: **+ New…** on the Encounter node (placed at the stage's marker) and **+ New stage…** on the Stage node. |
| F24 | New Stage nodes always took the first stage; new Arrive nodes started empty although "usually the current stage's map marker". A Note dragged from a handle took over that handle's link (Start → Note). | **Fixed**: the first unused stage; the upstream stage's marker; notes never link. |
| F25 | New options were all "option", "option_2"…; committing an option's id closed its settings. | **Fixed**: the id follows the text the first time it is typed (while unlinked); the settings stay open. |
| F26 | Dialogs didn't close with Escape; New mod had no Cancel; the override file's header named the source differently in the preview and on disk; the quest toolbar wrapped. | **Fixed**. |
| F27 | A new entity, test profile or faction gets its id from the default name ("Kestrel Planet" → `vgh_kestrel_planet`, profile → `profile`); renaming keeps the id and entities have no Change id… (markets do). | **Fixed** (2026-11-15): an entity's id follows its name until it is in a release, and **Change id…** (Locations) sets one; `renameEntity` moves every reference in the mod (orbits, removals, description, a same-id market and its people, stage markers, Arrive places, pictures, Action steps, rule conditions such as a wreck lock, encounter spawns, profile starts); after a release it warns first. A test profile's id follows its name (dev only). Factions keep Change id… (unchanged). |
| F28 | System view: opens zoomed on the star (bodies at vanilla distances off-screen; no "fit"); adding an entity keeps the Hyperspace map open; a new planet orbits at 1500 (help: 2000–10000); a new station orbits the star, not a planet. | **Fixed**: the system view refits when bodies are added or removed and never starts closer than vanilla's inner planets; adding a body switches to System view; planets start at 2500 + 1200 per planet; stations and moons orbit the selected (or first) planet at 450 / 600. |
| F29 | List inputs ("+ add…") accept anything on Enter (a half-typed "hammer" became a hull id; no warning). | **Fixed** (the error was already there: Problems lists an unknown id in a faction's lists as an error, "the game refuses to start"); the chip itself is now red with that message, for hulls, wings, weapons, hull mods and commodities. |
| F30 | Quest chart: nodes added by dragging can land under the minimap or off-screen; the inspector keeps the previous panel's scroll position; Problems lists warnings before errors. | **Fixed**: a node added by dragging is panned into view (same zoom) when it lands off-screen or under the minimap; the inspector starts at the top for each node; Problems (page and quest dock) list errors first, then to-dos, warnings… |
| F32 | Migration (#48 walk): "Must change: 0 left" above a listed must-change item (the game version, which Export does); Export's closing note named `Starsector\mods` while targeting the 0.98.5a install. | **Fixed**: the count says the game version is done by the export; the note names the targeted install's mods folder. |
| F33 | The header's target pill squeezes the active-mod name ("Vanguard by h…"); Export for a new game version doesn't suggest a new mod version. | **Open, minor**. |
| F31 | Smaller: relations only by slider; a phrase's "Reputation at least…" preset needs the level typed; a Set step on a number variable defaults to "true"; Only-show-if wants the full `$global.<quest>_<var>` key; case and Place placeholders mention `vgc_`; same-name factions in the read-only list have no id; the flag picker lists crests too; importing from a field's Choose… takes four clicks; a captured test profile keeps the editor's internal `…_done` flags; after "back to the menu" Play shows the Test context's person, not the quest's contact; a new illustration shows as its key until saved. | **Partly fixed**: relations have a number box next to the slider; a Set step on a number variable starts at its start value + 1; the Branch case example uses the quest's own variable; same-name factions show their id; the flag picker leaves out crests and the crest picker shows only crests; Import… in a picker opens the file dialog at once. **By design**: a captured profile keeps the `…_done` flags (they record which arrivals already happened). **Open, minor**: the "Reputation at least…" preset wants the level typed; after "back to the menu" Play shows the Test context's person rather than the quest's contact; a just-imported illustration shows as its key until saved; the other "e.g. vgc_…" examples stay as examples. |

## Guide fixes (task: app bugs found while writing the user guide, 2026-11-17)

- **G-1 The Lost Convoy's offer options** (VanguardCompact as rebuilt, SagaLib 1.2, 0.98.5a, new
  game or a save before the quest): Haven Station › Commodore Reyes › "Ask about the missing
  convoy". The four options read *Accept the job*, *What's the catch?*, *Forty crew is worth more
  than that.* (story point, tooltip "Use a story point to double the pay.") and *Not interested.*,
  never `$sft-…`. Pick *What's the catch?*, then Back: it is gone (show-once). Pick the story option:
  the echoed line and the story point log text are words, not tokens. Expected to pass: the app
  showed the keys because Play also ran the mod's own exported copy of those rules; SagaLib fills
  option, tooltip and story texts for every rule (8c-1 re-run).
  **Passed (user, 2026-11-17, 0.98.5a-RC5):** all four options as words; *What's the catch?* gone
  after Back; the story option echoed as words with "Used 1 story point", then hidden (pay is 2). Tooltip "Use a story point to double the pay." shows as words.
- **G-2 Kestrel's new place**: on the sector map Kestrel sits west of Duzahk, clear of Askonia,
  Magec and Algebbar (new game; an old save keeps the system where it was).

## Linux (when there is a Linux build)

Status: **on hold** (2026-11-11): no dedicated Linux tester has been found yet. The checks below
are kept for when one is.

1. `npm run dist:linux` on Linux (or `./run.sh`). The AppImage starts, and settings are kept in a
   `data` folder next to it.
2. Pick the Starsector folder (with `starsector.sh`). The index lists the mods, and the dialog
   preview shows the game's fonts.
3. Create a mod, add a faction and a quest, Save and Export. The files have LF line endings, and
   `rules.csv` keeps the line endings it had.

## Open questions from testing

- **Known ships can't be seen in game** (2026-11-11). A faction's known ships and the hulls a
  patch adds (the Hegemony override's Buffalo and Kite) have no screen in the game that lists
  them. To brainstorm later: a SagaLib dev-mode report (dump a faction's known hulls, weapons,
  fighters and tags to the log or a dev dialog), spawning a test fleet with the console, or
  checking `starsector.log`.
- **Editor fields don't say what they are for** (2026-11-11). Example: a stage's form shows bare
  boxes (title, journal text, next step line, marker, kind, old ids) with only placeholders, which
  disappear once filled. **Done (task #36, 2026-11-14)**: every field has a label and help, from
  the stage form to factions (Behavior), people (post, commissions), items, locations, encounters.
  See "Workflow checks", F1.
- **Point modders to the vanilla-safe patterns the editor only warned about** (task #36): a
  protected quest wreck, ending branches with `SF_BackToMenu`, ambush placement. **Done
  (2026-11-14)**: F2, F3, F7 above. Their in-game check is W8.

### Requests while building Heliopolis (task #36)

Asked for by the user while going through the Heliopolis guide (`Mod Guides/Heliopolis`). Added
as they come up; each is fixed or explicitly deferred with the user's OK. The order they are built in: [WORK-ORDER.md](WORK-ORDER.md).

| # | Request (date) | Details | Status |
|---|---|---|---|
| R1 | **Resize images** (2026-11-14) | Part of R5 (the Images page). Every image picker (faction flag and crest, portraits, item icons, quest icon, illustrations) copies the file as it is: no resizing, no conversion to PNG, no size check. A 1024×1024 JPG picked as a portrait lands as a 1024×1024 JPG named `.png`. Wanted: resize and convert to PNG at the vanilla size for each use (flag 410×256, crest 256×256, portrait 128×128, item icon 80×80, mission icon 64×64, illustration 480×300). Related: Check mod could warn about images at the wrong size; F16 (add a whole folder of portraits). | **Done** (2026-11-15, Phase 1, on the Images page R5): import resizes to the kind's vanilla size and writes PNG; Check mod warns about the mod's images at the wrong size. |
| R2 | **Crop images** (2026-11-14) | Part of R5 (the Images page). An image of a different shape than its use (the 1200×896 probe illustration for a 480×300 slot; non-square portraits) needs a crop preview to choose the part to keep before resizing, rather than squashing. | **Done** (2026-11-15, Phase 1): a crop box at the target's shape (centred by default; move and resize it) on each imported image, with a preview at the final size. |
| R3 | **Name pools tab** (2026-11-14) | A place in the editor to make a faction's own name pools, so the Heliopolis cat names (`NAMES.md`) need no hand-written files. Covers person names (rows in the mod's `data/characters/person_names.csv`: name, gender `m`/`f`/either, first or last name, the pool's category id) and ship names (a list in `data/strings/ship_names.json`, merged with vanilla's). Pools made there then show up in the faction's Names & ranks lists (Person name sets, Ship name sources). Related: F14; the plan's one-name cats (name in the last-name slot) still need an in-game check. | **Done** (2026-11-15, Phase 2; design: DESIGN-PHASE2.md §1): Factions › **Name lists** (+ New list): people's names (first names for men, women, anyone; last names; one per line, pasteable) and ship name lists, with an export preview and "Used by" / "Use in a faction". Export writes an owned block in the mod's `person_names.csv` and merges the lists into its `ship_names.json` by key. The faction's Person name sets and Ship name sources suggest every category and list (vanilla's, mods', the mod's own) with counts. Checks: missing first or last names for a gender (the game borrows a random category), an id shared with vanilla or a mod, an unknown set in a faction, repeats. Still open: one-name cats (the game always gives a first and a last name; to look at in game). |
| R4 | **Fleet breakdown picture on the Doctrine tab** (2026-11-15) — *optional addition* | Now part of R23 (the Fleets tab: its preview). A visual representation of the fleet the doctrine produces, updating as the numbers change: the fleet composition split (warships, carriers, phase ships, and the combat-freighter chance), ship size, and the quality trade-off (officer quality, ship quality, number of ships). Optional: nice to have, not needed to close the task. | **Done** (2026-11-15, Phase 5, in the Fleets page's **Doctrine preview**): the composition split, combat freighters, ships per size per round (vanilla's FleetFactoryV3 tables) and the quality trade-off, for the mod's new and changed factions. Labelled an estimate. |
| R5 | **Images page: import images into the mod** (2026-11-15) | One page for all of the mod's images, of every type: flags, crests, portraits, item icons, mission icons, illustrations. Importing a file (or a whole folder) puts it in the right place in the mod's folder structure for its type (`graphics/factions/`, `graphics/portraits/`, `graphics/icons/cargo/`, `graphics/icons/missions/`, `graphics/illustrations/`) and **adds the mod's prefix** to the file name (e.g. `Mainecoon_Beta.jpg` → `graphics/portraits/sfw_mainecoon_beta.png`). The page is where **R1 (resize)** and **R2 (crop)** happen, during import, and where the size check for images already in the mod lives. The other pages' pickers then choose from the mod's imported images. Related: F16 (a whole folder of portraits at once). | **Done** (2026-11-15, Phase 1; design: DESIGN-PHASE1.md §3): a new **Images** page lists the mod's images by kind with thumbnails, sizes and a wrong-size warning; **Import…** takes files or a folder, crops and resizes each (R1, R2), names it `<prefix>_<name>.png` in the kind's folder (flags and crests get `_flag`/`_crest`), asks before replacing a file, and registers illustrations. Files are written on Save, through the write guard. |
| R6 | **Relations: the slider moves while you drag it** (2026-11-15, issue) | Factions › Relations: the level word next to each slider (Hostile, Welcoming, …) changes length as the value changes, which resized the table's columns, so the Start slider shifted under the cursor while dragging. Wanted: a fixed width for the level column so the other columns keep their size. | **Fixed** (2026-11-15): the table has fixed column widths (the level column fits "Inhospitable", the longest), and the number beside the slider has a fixed width. |
| R7 | **Other keys: templates and recommendations** (2026-11-15) | Factions › Other keys only lets you type a key name and loose JSON, so you have to know every key already. Wanted: an "add a key" list of recommended keys, ordered by how many base-game factions use them, each with a description of what it does and a template value to start from (taken from a vanilla faction). Survey of 0.98a's 21 vanilla factions (keys the form doesn't show): `custom` 18, `variantOverrides` 17, `shipsWhenImporting` 17, `priorityFighters` 17, `fleetTypeNames` 14, `voices` 12, `weaponSellFrequency` 8, `fighterSellFrequency` 7, `hullmodSellFrequency` 7, `shipRoles` 4, `internalComms` 4, `description` 3; rare: `hullMods`, `shipSellFrequency`, `flags`, `fleetCompositions`, `barSound`. Inside `custom`, beyond the Behavior tab: `simulatorData` 15, `allowsTransponderOffTrade` 8, `punitiveExpeditionData` 8, `engageWhenEvenStrength` 7, `postsNoBounties` 7, `fightToTheLast` 7, `AICoreValueMult` 7, `AICoreRepMult` 7, and 15 rarer ones. Keys used by most factions may deserve a real field instead (e.g. `fleetTypeNames`, wanted by Heliopolis; see F14). The descriptions need checking against the game's code before they go in the editor. | **Done** (2026-11-15, Phase 2; design: DESIGN-PHASE2.md §2–4): Other keys has an **Add a key** list, built by the game index from vanilla's factions (most used first, "17/21"), with a description and a vanilla value to start from (a major faction's where it has one), and each existing key shows its description. Descriptions are in `src/shared/factionkeys.ts`, checked against the API sources; keys read only by the obfuscated core say so. A reference section "Factions › Other keys" (ⓘ What the keys do). Real fields instead: **Fleet type names** (Names & ranks) and the RC-R13 keys on Behavior. |
| R8 | **Reference pages for the editor's lists** (2026-11-15) | Many dropdowns and pick lists don't say what their options do (e.g. People › Rank, Post and Voice). Wanted: an HTML reference document, with a section per list and a table describing each option (what it is, where it shows in game, what vanilla uses it for), and a small **info button with an icon next to each such list** that opens the document at that list's section. Lists to cover (first pass): People: rank, post, voice, personality, contact types, importance; Factions: blueprint tags, hull/weapon/fighter/hullmod tags, person name sets, ship name sources, officer and commander skills, music, `displayNameIsOrAre`; Items: presets, item tags; Locations: star types, planet types, custom entity types, market conditions, industries, submarkets, music; Encounters: fleet types, behaviors, flags; Quests: start kinds, minimum reputation levels, visuals, displays, action types, link modes, variable types, condition and script templates. Much of the data is already in the game definitions (`src/shared/defs/0.98a.json`: ranks, posts, voices, fleet types, item tags with summaries, …), so the pages could be generated from them per game version, with hand-written descriptions added where the definitions have none. Related: R7 (descriptions for Other keys could live in the same document). | **First pass done** (2026-11-15, Phase 1): the framework (`src/shared/reference.ts`: sections generated from the game definitions per game version, opened in a window at the section by a field's ⓘ button) and the People lists: rank, post (staff posts marked), voice (with how many vanilla rules check each voice), personality, contact types, importance. The other lists get their sections in the phases that touch them. |
| R9 | **"Set later" for fields that can't be filled yet** (2026-11-15) | Some fields refer to something made in a later step (Heliopolis guide 4b: Pops's market, which step 6 creates). Today the choices are an empty field (an error, or no reminder at all), an id typed ahead (red, and an error that reads as a mistake), or a wrong value (no reminder). Proposed: a **Set later** choice on such fields. It is a mark, not a value, so nothing fake is exported: the field shows "not set yet", and `sagaforge/project.json` remembers the field with an optional note. Problems lists it under its own **To do** level with a "Go to field" button and a count in the header. Export still works (for testing in game); **Mark as released** refuses while to-dos remain. The mark clears itself when the field gets a value. Optional: a **Create…** button next to forward references (a market, an encounter, a contact) to make the missing thing at once. | **Done** (2026-11-15, Phase 1; design: DESIGN-PHASE1.md §1): a "later" button on a field marks it; the mark keeps its note and the value it had, and stays to do until the field changes; Problems' new **To do** level (header count ✎), the matching "missing" checks stay quiet, Save drops finished marks, Export lists them, Mark as released refuses while any remain (not counting inactive content). First fields: a person's portrait, placement market and encounter; a quest's contact, icon, stage map markers, arrival places; an item's icon; an encounter's spawn place and flagship commander. Not done: the optional "Create…" button. |
| R10 | **"Inactive" toggle for planned content** (2026-11-15) — *needs a careful look* | A modder may create many characters they have planned but aren't ready to release (ideas with no story, quests or dialog yet). Wanted: an **Inactive** toggle. **People: yes. Quests and dialog: probably. Factions: no** (too intentional). Agreed so far: problems in inactive content show as **warnings only**, and an inactive item's unfinished fields (R9's to-dos) **don't block** Mark as released. Answers (2026-11-15): **(1) Export: inactive content is not exported** (decided). Export is what puts content in the game (Save writes only the editor's plans; Mark as released writes only a snapshot of ids), so an inactive person is left out of the people file, and an inactive quest gets no rules block, no SagaLib file and no person_missions or bar row. Content exported before and then made inactive is removed on the next Export (needs R11 fixed). **(2) References**, intended: a quest *started by* an inactive person (its contact) is treated as inactive too, with a warning; a quest that *uses* an inactive person during it (speaker, visual, placement) is an error. If that gets too complicated with edge cases, fall back to errors only. **(3) Save safety:** yes, a save warning when making released content inactive, so the user knows it may break saves. **(4) Display:** greyed out, filterable, and "[Inactive]" next to the name in lists where possible. | **Done** (2026-11-15, Phase 1; design: DESIGN-PHASE1.md §2): Inactive on people (People header) and quests and conversations (Quest settings); a contact quest whose contact is inactive is inactive too (a warning). Not exported (an exportable copy of the model; earlier files removed); problems inside inactive content are warnings marked "(inactive)"; using an inactive person in active content (speaker, person visual, a phrase of theirs, a flagship commander) or starting an inactive quest is an error; inactive prerequisites and spawn or comm-dialog quests are warnings; released content made inactive gets a save warning; lists and the Saga board grey it with "[Inactive]" and a filter. |
| R11 | **Bug: Export fails after deleting exported content** (2026-11-15, found while answering R10) | Export removes the SagaLib files of quests, people, systems and encounters that no longer exist (`data/sagaforge/...`), but the file writer only allows removing plan files (`sagaforge/...`) and the mod's faction files, so that Export stops with "Only plan files and the mod's own faction files can be removed". Reproduced 2026-11-15. Fix: let the writer remove the mod's own generated SagaLib files (`data/sagaforge/` and `data/config/sagaforge/`), with a test that exports, deletes a quest and exports again. Matters for R10 too, if inactive content is left out of Export. | **Fixed** (2026-11-15, Phase 0): the writer may also remove the active mod's generated SagaLib files (`removable()` in `src/main/modproject.ts`, still through the write guard); tested: export, delete a quest, export again (file removed and backed up, index updated), and that everything else is still refused. |
| R12 | **AI conversion guide: bring an existing mod into Saga Forge** (2026-11-15) | For converting an existing mod. Saga Forge reads the mod's `.faction` files, keeps its `rules.csv`, CSV and description rows untouched, but can't turn them into plans, and can't read anything made in Java. Wanted: **documentation and instructions for an AI** (e.g. a Claude Code session) that reads the mod's jar and data files and writes the missing content in **Saga Forge's plan format** (`sagaforge/`: quests, people, items, locations, encounters), so the modder can then edit it in Saga Forge. Star systems built in code, quests, people and the like should be things an AI can work out from the code and data. **Custom scripts** (confirmed 2026-11-15): a script whose effect Saga Forge can express (e.g. a system built in code, a person, a quest step) is converted like the rest; a script that does something Saga Forge can't replicate is **not converted**, and the conversion gives the user a **list of everything left unconverted** (the class or file, what it does, and why it can't be expressed), so they know what still lives only in code. Needs: a plan-format reference written for an AI (from `src/shared/model.ts` and SagaLib's FORMAT.md), a step-by-step procedure (decompile or read the jar, map vanilla API calls to plan objects, keep ids, check the result with Check mod), and how to verify that the converted mod behaves like the original in game. Respect licences: only convert a mod the user owns or has permission for. Also covers PLAN §11.6 "adopt hand-written dialog" (task #30): turning an existing `rules.csv` conversation into an editable quest plan. | **Done (Phase 8e, 2026-11-17): [AI-CONVERSION.md](AI-CONVERSION.md).** Not tried on a real mod yet. |
| R13 | **Items › Plugin: a list plus free text** (2026-11-15) | The special item's Plugin field is a bare text box. Wanted: a **list of the game's plugin classes** to pick from, each with a short description (and what its *Plugin params* expect), while still **accepting any class name typed by hand**, so a modder can point it at their own class or at another API class. Vanilla 0.98a's `special_items.csv` uses (package `com.fs.starfarer.api.campaign.impl.items`): `GenericSpecialItemPlugin` (most items; Saga Forge's default), `MultiBlueprintItemPlugin`, `BaseSpecialItemPlugin`, `ShroudedHullmodItemPlugin`, `ShroudedSubstratePlugin`, `ShipBlueprintItemPlugin`, `WeaponBlueprintItemPlugin`, `FighterBlueprintItemPlugin`, `IndustryBlueprintItemPlugin`, `ModSpecItemPlugin`, `WormholeScannerPlugin`, `WormholeAnchorPlugin`, `JanusDevicePlugin`. Ideally the list also includes plugin classes found in the installed mods' jars. A typed class that isn't in the list should get a warning (not an error), since it may be in the mod's own code. Related: R8 (the reference pages could hold the descriptions). | **Done** (2026-11-15, Phase 0): the Plugin field lists the 13 classes with descriptions (`src/shared/itemplugins.ts`), the Plugin params help follows the selected class, a short class name is an error (needs the full name), a class of your own a warning. Not yet: classes found in installed mods' jars. |
| R14 | **Read-only view of the base game's systems** (2026-11-15) | Wanted: data on what each vanilla star system looks like (stars, planets, stations, belts, rings, fields, jump points, markets), shown read-only in the Locations system view, so a modder can see a system before adding to it and place additions sensibly. Source found (2026-11-15): vanilla ships the **Java source of its 23 core systems** in `starsector-core/data/scripts/world/systems/*.java` (Askonia, Arcadia, TiaTaxet, …; about 470 `initStar`/`addPlanet`/`addCustomEntity`/`addAsteroidBelt`/`addRingBand`/`addTerrain` calls). Their arguments are mostly literal (ids, names, types, orbit radius, angle, days), so the game index can read them like data, version by version; markets come from `data/campaign/econ/*.json`. Example: Tia's `addAsteroidBelt(tia_star, 150, 3600, 170, 200, 250, …, "Lagua's Torus")` puts Lagua's Torus at orbit radius 3600, 200 wide. Not covered by that source: systems made elsewhere in code (Corvus wasn't among the files) and the random (procgen) systems, which differ per save; for those, a later option is a SagaLib dev-mode dump of a running game. Fixes F15 (placing additions in Tia). | **Done** (2026-11-15, Phase 3; design: DESIGN-PHASE3.md §2): the game index reads the Java sources of the game's (and mods') systems (`src/shared/javasystems.ts`: literal calls only, 451 bodies of 23 vanilla systems; random or helper-built parts are counted, not guessed). Clicking a system on the hyperspace map shows it read-only with "Add to this system"; additions draw on top of its bodies and can orbit them (Orbits lists them by id; SagaLib finds them with getEntityById); an unknown focus is a warning. Not readable: Corvus (not in a shipped source), Westernesse (random), random sector systems. |
| R15 | **Star types from the game, including mods' own** (2026-11-15) | The Star list is a fixed list of 15 types in Saga Forge's game definitions (`src/shared/defs/0.98a.json` › `starTypes`), not read from the game. The game defines stars in `data/config/planets.json` as entries with `"isStar": true`, and a mod can add its own (an entry with a texture, colours and corona settings, merged with vanilla's). Wanted: read the star types from `planets.json` of the game and every installed mod, the way planet types already are, so mods' custom stars can be picked. | **Done** (2026-11-15, Phase 3): stars are the planets.json entries with isStar from the game, every installed mod and the mod's own types; the Star field picks them by picture. A star type nobody has is an error. |
| R16 | **Systems without a star** (2026-11-15) | The game supports a system with no star: vanilla's Tri-Tachyon black site (`TTBlackSite.java`) uses `initNonStarCenter()` (an empty centre point), sets a light colour for the whole system, and has one planetoid, Alpha Site (`irradiated`), orbiting the empty centre. Saga Forge and SagaLib can't do this yet: SagaLib's SystemBuilder always calls `initStar`. Wanted: a **No star (empty centre)** choice for a new system, with a light colour (and background) setting, and the matching support in SagaLib's system builder (its format and FORMAT.md). | **Done** (2026-11-15, Phase 4; DESIGN-PHASE4.md §1): Locations › **No star** with a light colour; SagaLib 1.1 builds an empty centre (`initNonStarCenter`, `setLightColor`). Needs the in-game check. |
| R17 | **System view: resize handles** (2026-11-15) | The selected entity gets drag handles in the system view where it makes sense: an asteroid belt's or ring band's width (and radius), a planet's or star's size, a nebula's extent. Today only the orbit angle can be dragged; everything else is typed into the inspector. | **Done** (2026-11-15, Phase 3): handles on the selected planet or moon (size), belt or ring (width, both edges) and the star (size and corona, with nothing selected); Shift-drag also changes an entity's orbit radius. Values snap to 10. |
| R18 | **Planet types: filters and recommendations** (2026-11-15) | The planet type list needs filters (by kind: gas giant, rocky, ice, habitable, …). One filter is **dynamic**: it recommends types for the planet's distance from its star and the star's type, e.g. a neutron star likely leaves planets in the habitable zone barren or irradiated; a planet far from a red dwarf is frozen. Only recommendations, nothing forced. The rules could follow vanilla's random sector generation (its planet and condition tables by star type and orbit), to be checked in the game's code. | **Done** (2026-11-15, Phase 3; DESIGN-PHASE3.md §4): the planet type chooser has filters (gas giants, habitable, barren, frozen, lava, toxic, irradiated) and sorts by "fits here", an estimate from vanilla's procgen tables (orbit index ≈ (orbit − star radius − 1000) / 1400, habitable-zone offsets and star-type weights); the inspector says whether the type fits. Recommendations only. |
| R19 | **Preview image of the selected entity** (2026-11-15) | The inspector shows a picture of the selected entity, even if only an example for its type: a planet's or star's texture from `planets.json`, a station's, wreck's or other custom entity's sprite from `custom_entities.json`, a belt or ring band texture. Also useful in the type lists (R18, R20). | **Done** (2026-11-15, Phase 3): the inspector shows the selected planet's texture as a lit sphere or the entity's sprite, and the type choosers show them as thumbnails. Belt and ring textures: not shown. |
| R20 | **Filters and recommendations for stations, wrecks and other entities** (2026-11-15) | Like R18 for custom entities: filter the type list (stations by tech level and size, derelicts and wrecks, caches, objectives such as relays, buoys and arrays, gates, …) and recommend types that fit the place (e.g. low-tech stations for a fringe colony, derelict probes in empty systems). Recommendations only. | **Done** (2026-11-15, Phase 3): entity type chooser with filters (stations, relays/buoys/arrays, salvageable, with a dialog, other); the entity's kind preselects its filter (a station shows stations, a derelict salvageable types); the game's internal types are hidden unless "Other". |
| R21 | **Custom celestial objects** (2026-11-15) | Many mods add their own stations and other objects that show in the normal campaign view. Wanted: a way to add the mod's own **custom entity types** (an entry in the mod's `data/config/custom_entities.json` with its sprite, size, layers and interaction settings) and, related, its own **planet and star types** (entries in `data/config/planets.json` with textures). They then appear in the type lists like vanilla's. Images go through the Images page (R5). Needs a check of what each type needs to work without code (e.g. a plain station sprite vs. one with a custom plugin). | **Done** (2026-11-15, Phase 3; DESIGN-PHASE3.md §6): Locations › **This mod's types**: entity types (sprite 160×160, drawn size, radius, optional map icon and picture, "Behaves like" a vanilla type through baseId) and planet or star types (texture 1024×512 "Based on" a vanilla type whose settings are copied). Export merges them by key into the mod's custom_entities.json and planets.json, keeping hand-written entries. New image kinds on the Images page. Not covered: types that need a plugin class (code). |
| R22 | **Custom fleet types** (2026-11-15) | A fleet type is only an id on the fleet (vanilla has 29, in `FleetTypes`). It picks the fleet's name (the faction's `fleetTypeNames`, or `data/world/factions/default_fleet_type_names.json`, which mods can add to), and some vanilla code checks specific types; what the fleet does comes from the code that spawns it. Mods can add their own. Wanted: the encounter's Fleet type accepts any id, not only vanilla's 29, and the mod can name its own types per faction (`fleetTypeNames`, see R7) or for everyone (its own `default_fleet_type_names.json`). Part of R23. | **Done** (Phase 0 any id; Phase 2 names per faction; 2026-11-15 Phase 5: **Fleets › Fleet type names** for every faction, written to the mod's `default_fleet_type_names.json`, merged by key). |
| R23 | **Fleets tab** (2026-11-15) — *proposal, scope to confirm* | For planning a faction's fleets. Vanilla has no stored "fleet sets": a faction's fleets are built at run time from its **doctrine**, its **known ships** and the **ship roles** (`data/world/factions/default_ship_roles.json`: role → weighted variants, e.g. `combatSmall`, `carrierMedium`, `freighterLarge`, `escortSmall`; mods add to it, e.g. Arma Armatura, UAF; per faction through `shipRoles` and `variantOverrides`). Proposed parts: (1) **Ship roles**: which variants fill which role for the faction, with weights (what actually shapes its patrols and traders in game); (2) **Preview**: doctrine + known ships + roles → an example fleet at N fleet points, labelled an estimate (the game adds randomness, quality and autofit; read its fleet factory to get close); this takes over **R4**; (3) **Fleet templates**: named, reusable fleets that encounters can use instead of listing ships each time; (4) **Fleet types** (R22). Ships and variants still come from Ship Editor; the tab only picks and arranges them. | **Done as scoped by the user** (2026-11-15, Phase 5; DESIGN-PHASE5.md): a **Fleets** page with named fleets (R27), fleet type names (R22) and the doctrine preview (R4). Not built, on purpose: editing a faction's ship roles (later). |
| R24 | **Quest icon picker with previews** (2026-11-15) | Quest settings › Icon is a text box with a Pick… file dialog and a small preview of the current icon. Wanted: a selector showing **previews** of every usable icon: vanilla's mission icons (`graphics/icons/missions/`, 54 in 0.98a), the icons in the mod's own `graphics/icons/missions/`, and other installed mods' (marked by source). Picking one sets the path; importing a new one goes through the Images page (R5, 64×64). | **Done** (2026-11-15, Phase 1): Icon › Choose… opens the image picker with thumbnails of the mod's, vanilla's and installed mods' mission icons (marked by source), plus Import…. |
| R25 | **Entities that appear when a quest gets to them** (2026-11-15) — *needs SagaLib* | Today every entity of a system (planets, stations, derelicts) is built when the system is created (a new game, or an older save with Existing saves on) and exists from then on; only encounter **fleets** can be spawned by a quest stage. So the Heliopolis probe sits in Kythera from the start, and the player can find and salvage it before the quest (Protect this wreck only blocks the salvage). Wanted: an entity can be set to **appear when a quest reaches a stage** (e.g. the probe appears once the player accepts *The Voice in the Probe*), and optionally **disappear when the quest ends** or at a later stage. Needs SagaLib: a per-entity `appears` setting in the system format (quest + stage, or a flag), the entity placed then (and its stage marker working), and new script commands for the editor's Action node (e.g. `SF_PlaceEntity <id>` / `SF_RemoveEntity <id>`). Vanilla's own missions do this (they spawn their targets on accept). To work out: save safety (a placed entity stays in the save; renaming its id after release), what Play mode shows, and the interaction with Protect this wreck (an entity that only exists during the quest may not need protecting). Related: R26 (removing or replacing objects). | **Done** (2026-11-15, Phase 4; §2): an object's **Appears**: from the start, when a quest reaches a stage, or when an Action places it ("Place an object", `SF_PlaceEntity`). It isn't in the game before that; drawn faded in the system view. SagaLib 1.1 places it once (after `SF_Step`, on load, in its tick). Needs the in-game check. |
| R26 | **Remove or replace objects during a quest** (2026-11-15) — *needs SagaLib* | The other side of R25: a quest where a place is "blown up" needs to **remove** the object, or **replace** it with another (a station with a debris field or a wreck, at the same orbit). Wanted: Action-node steps for both, e.g. `SF_RemoveEntity <id>` and `SF_ReplaceEntity <id> <new entity>` (the replacement defined in the system like any entity, but only placed then). To work out: (1) **a market on the object** (its people, comm directory, the faction's colony: vanilla decivilizes or removes markets, which affects the economy); (2) **references** to the old id (stage markers, Arrive nodes, encounters spawned there, other quests) need checks in the editor; (3) **whose objects**: the mod's own objects freely; vanilla's or another mod's objects are a much bigger step (other mods and vanilla quests may depend on them, and the project rule is never to override vanilla's own content), so at most with a strong warning, or not at all. **Decided (2026-11-15): allowed, with warnings and guardrails**: the guardrails are to be designed (e.g. a clear warning naming what depends on the object, an explicit confirmation, a Check mod warning listing every vanilla or other-mod object a quest removes or replaces, and checks that the object exists before acting); (4) save safety: the change is permanent in the save. | **Done** (2026-11-15, Phase 4; §2): **Removed during quests** per system (any object, vanilla's too), an Action step "Remove an object" (`SF_RemoveEntity`), and **Replaces** on an appearing object. Guardrails: SagaLib checks the object exists, and only removes one with a colony when told to **decivilize** (vanilla's DecivTracker; the editor asks to confirm). Problems warns when the object is vanilla's or another mod's, when it has a market, and lists what in the mod still points at it. Needs the in-game check. |
| R27 | **Named fleets: a flagship name, a captain and overrides, reusable** (2026-11-15) — *structure to work out* | Found in the Heliopolis guide: Butters's flagship should be named *CAT Thirty Days*, and there is no field for it. Belongs with the Fleets tab (R23): setting up fleets is the Fleets tab's job. But a fleet used in encounters may also need **a captain (one of the mod's people) and overrides** (ship names, the flagship, officers), and it should be **reusable**: a repeat encounter where the player meets the same fleet with the same captain each time. To work out: how to structure it and which tabs it belongs to (Fleets tab, Encounters page, People page's fleet placement). Despawning: SagaLib's current rules (FORMAT.md, Encounters) were explained on 2026-11-15 and are enough for now; the one gap for a recurring fleet is that each spawn builds a fresh fleet (losses and the captain's state are not carried over). Needs SagaLib for the ship names. | **Done** (2026-11-15, Phase 5; DESIGN-PHASE5.md): **named fleets** on the Fleets page: ships with optional names, a flagship, a captain (one of the mod's people), and "the captain dies when defeated"; encounters reuse them (Ships › a named fleet). Fresh each time (the user's decision), but trackable: defeats are counted (`$global.sagaforge_fleet_<id>_defeats`). A captain survives a defeat unless set to die; the Action step **Remove a person** writes anyone out of the story. Needs SagaLib 1.1 and the in-game check. |
| R28 | **See images before picking them, everywhere** (2026-11-15) | Every selection that picks an image, or something with an image, shows previews before it is chosen, not just a path: portraits (the faction's portrait lists, which today show only paths: finding F16; a person's portrait), flags and crests, item icons, quest icons (R24), illustrations, and entity, planet and star types (R19). Ties in with the Images page (R5): pickers choose from the mod's imported images with thumbnails, plus the game's and installed mods' images marked by source. | **Done for images** (2026-11-15, Phase 1): one image picker (thumbnails, sizes, source, filter, Import…) behind every image field: faction flag, crest and portrait lists (thumbnails on the chips), a person's portrait, item icons, quest icons, illustrations. Entity, planet and star previews come with R19 (Phase 4). |
| R29 | **Writing tools** (from PLAN §11.1, task #30; 2026-11-15) | A **script view**: a whole quest as a screenplay (speaker names, options as headings), exportable as Markdown for a proofreader or co-writer. **Spellcheck** in every text field (Chromium's built-in checker, with a per-mod word list in `sagaforge/project.json` for names like "Ailuros"). **Punctuation checks** (Problems, Style level): a missing closing quote, unbalanced brackets, a paragraph without end punctuation, doubled spaces, a token glued to a word, mixed straight and curly quotes. 1.0 already has the Style level and plain-text storage. | **Done** (2026-11-15, Phase 6; DESIGN-PHASE6.md §1): Quests › **Script** tab shows the quest as a screenplay in the order the player meets it (scenes, speaker, text, choices with where they lead, journal/arrival/ending notes, unreached nodes last), with **Copy as Markdown**. **Spellcheck** in every text field (the system checker); right-click shows suggestions and **Add … to the mod's word list** (`words` in `sagaforge/project.json`). **Punctuation checks** (Style level, Settings › Checks) now cover every text the player sees: dialog, options, arrival texts, offers and bar blurbs, journal and next-step lines, phrases, descriptions, item descriptions. |
| R30 | **Quest templates** (from PLAN §11.3, task #30; 2026-11-15) | **+ New quest from template**: delivery, bounty (kill a fleet), escort, investigate a place, rescue, smuggling, a talk-to-someone chain; each a ready chart with stages, placeholder text, typical rewards and notes, built the way vanilla structures the same mission. Templates are plain plan files in a folder, so modders can save and share their own. Works best with random targets (RC-R1) for repeatable versions. | **Done, two deferred** (2026-11-15, Phase 6; DESIGN-PHASE6.md §2): **New quest › Start from** a template: delivery, bounty, investigate a place, rescue, talk-to-someone chain; each a ready chart with stages, placeholder text, a reward and a note. The blanks (contact, places, fleets) are "Set later" to-dos in Problems. **Save as template…** stores any quest in the app's templates folder (shared between mods; plain plan files). Deferred: **escort** (SagaLib has no fleet that follows the player) and **smuggling** (needs an illegal-cargo step; better with random targets, RC-R1, Phase 7). |
| R31 | **Translation export** (from PLAN §11.5, task #30; 2026-11-15; **done in Phase 8c, 2026-11-16, as a runtime swap**: a translation mod with one CSV that SagaLib applies; DESIGN-PHASE8.md "8c") | Export every player-visible string (dialog, options, phrases, journal text, names, descriptions) with stable keys, one file per language (likely a CSV translators can open in a spreadsheet), and import a translated file as a translated copy, probably shipped as a separate translation mod that overrides the text rows. To decide: the file format and how a translation is shipped. | Open |
| R32 | **Release packaging** (from PLAN §11.6, task #30; 2026-11-15; **done in Phase 8b, 2026-11-16**: Mark as released packs the zip and a forum post draft; Release details write the Version Checker file) | A release zip without `sagaforge/` and `data/sagaforge/dev/`, a Version Checker file, and a forum post draft following `Forum Posts/FORUM_POST_RULES.md`. **User request (2026-11-15):** **Mark as released** also packs the release copy into a zip **named with the game version, the mod name and the release version** (e.g. `[0.98a] Vanguard Compact 1.1.0.zip`, matching the forum title rule), kept in a **`releases` folder of Saga Forge** (where exactly: next to its settings `data` folder, or a folder chosen in Settings; never inside the mod or the game folder). The zip holds one folder named after the mod, ready to unzip into `Starsectormods`. | Open |

### Random content (consolidated from RANDOM-CONTENT-ASSESSMENT.md, task #35)

Task #35's planning ended early (2026-11-15) and handed its proposals to #36 to consolidate. The
research, models and sizes are in [RANDOM-CONTENT-ASSESSMENT.md](RANDOM-CONTENT-ASSESSMENT.md)
(§3 ruins follow-ups F1–F9, §5 random targets, §6 the shared pool model, §9 additions R1–R14, §10
in-game checks, §11 what it didn't look at). Its ids are kept with an **RC-** prefix so they
don't clash with the requests above. Base game only; cross-mod parts stay with #27 and #31. Sizes:
XS–L as in the assessment.

**Order (from the assessment):** RC-R7 (pool model) before RC-F7, RC-R9, RC-R10, RC-R12, RC-R14 ·
RC-R1 (targets) before RC-R2, RC-R3, RC-R4, RC-F5's target part, RC-R10, RC-F8 · RC-F6 before
RC-F7 · ~~RC-F2 before the workflow test mod is built~~ (moot: the test mod waits until after the changes, decision 2026-11-15); still not in parallel with #36's export
edits (it changes the Wait/Arrive export that checklist step Q14 and the Heliopolis guide's
probe arrival use).

| # | Item | Size | Overlaps with our list | Status |
|---|---|---|---|---|
| RC-F1 | **Planet conditions and ruins** on uncolonised planets and moons (`conditions`, `surveyed`, a condition picker, "generate like vanilla", a SagaLib condition-only market, "can't colonise until explored"), plus a `wasCivilized` toggle for a dead colony | S (SagaLib bump) | R18 (planet filters and recommendations) | **Done (SagaLib part and the editor fields)** (2026-11-15, Phase 4; §3): an uncolonised planet's **Conditions** and **Surveyed** (SagaLib 1.1: `Misc.initConditionMarket`). Not done: "generate like vanilla", "can't colonise until explored", the `wasCivilized` toggle. |
| RC-F2 | **Planet scenes without taking over the arrival**: the Arrive export becomes an option on the place's menu (opt-in "take over the arrival" keeps today's behavior), entity flags during quest steps, an "interjection" start before a vanilla option (`salExplore`, …) with probability and once-limit, a "continue vanilla salvage" Link preset, a third result in the takeover check | M | Link `menu` mode (done in #36); Protect this wreck (F3 above) | **Done** (2026-11-15, Phase 4b on the user's decision; DESIGN-PHASE4.md §6): Arrive nodes are an **option in the place's menu** by default (vanilla's menu stays), with **takes over the arrival** as an opt-in, and always at a place a Protect-this-wreck lock guards. **Entity flags** (SagaLib 1.1) mark the place on the map while the quest waits there. New start **an interjection before an existing option** (e.g. salExplore) with a chance, a once-limit and a **Hand back** Link preset. The takeover check's third result: interjections are reported as such, and a path that doesn't hand back is an error. Not done: limits through the shared pool model (later, with random content). Needs the in-game check. |
| RC-F3 | **Test-context presets** (a decivilised world), the ruins dialog chain and fixtures | S | — | **Done (7b)** (2026-11-16): the Test context has a **Place**: colony menu, colony bar, uncolonised planet, planet with vast ruins (unexplored / explored), decivilised world, derelict. Each sets the memory keys vanilla tests there (FORMATS.md, "Places, raids and bar scenes"), plus a **Place id** ($id when no one is spoken to). Tests play vanilla's own surveyOpen, salRuins_vast and surveyOpenDeciv with them. Not done: the rdsm fixtures (G11). |
| RC-F4 | **Raid form** and its Play-mode outcome | S | — | **Done (7b)** (2026-11-16): a **Raid** node (briefing, objective, danger, defenders, experience, icon, tooltip, text during the raid; outputs **Raid done** / **Backed out**), exported as vanilla's story raids (AddRaidObjective + mktRaidNonMarket; no SagaLib). Play mode asks how the raid went. Needs the in-game check (seven_b). |
| RC-F5 | **Spawn when the player is near** (`spawn.when: player-near`, range or "in system"); later at a random target | S | R23, R27 (fleets) | **Done** (2026-11-15, Phase 4; §4): Encounters › When › **when the player comes near**, with Range (0 = anywhere in its system) and an optional quest stage (SagaLib 1.1, checked four times a day). Needs the in-game check. |
| RC-F6 | **Loot fields reserved** on entities and rewards; format checks for the salvage CSVs; in-game check of how `drop_groups.csv` merges | XS | — | **Done** (2026-11-15, Phase 4; §5): `loot` reserved in FORMAT.md (SagaLib ignores it); Check mod verifies the columns of the mod's own `drop_groups.csv` and `salvage_entity_gen_data.csv`. The merge of `drop_groups.csv` is on the in-game list. |
| RC-F7 | **Loot tables, salvage specials and defenders** as the first users of the pool model (`SF_SalvageSpec`, `SF_SetSpecial`, `SF_SetDefenders`, a random-from-group reward) | L | R23 (fleets: defenders) | **Partly done (7e)** (2026-11-16): **loot tables** (Saga › Pools › a loot table: the mod's own drop groups in drop_groups.csv, no SagaLib; the user's decision: own groups only until the merge check), **salvage loot** on entities and scatters (addDropRandom / addDropValue) and **defenders** (DefenderDataOverride), SagaLib 1.2. Not done: salvage **specials** (vanilla's special data objects per kind), additions to vanilla's groups, a random-from-group reward (DESIGN-PHASE7 question 12). Needs the in-game check (seven_e). |
| RC-F8 | Ruins criteria for random targets: folded into RC-R1 | — | — | Merged into RC-R1 |
| RC-F9 | Cross-mod ruins work | — | — | **Decided (#31, 2026-11-17)**: no separate work. VoK's `ruins_*` specs don't touch ours; ruins on another mod's planets are conditional content; in a random sector, random ruins targets are the fallback (PLAN.md §10, table and §10.2–§10.3) |
| RC-R1 | **Random targets**: a quest picks its place when offered, by criteria mapped 1:1 to vanilla's `HubMissionWithSearch` (faction, distance, tags, size, …), with fallbacks, tokens and a "no match" explanation | M | Heliopolis: Kythera at a random location (guide §13); PLAN §11.2 (#30) | **Done (7c)** (2026-11-16): a quest variable of type **random target** picks a planet, entity, system or market with 56 of vanilla's HubMissionWithSearch criteria (Must / Prefer in order, "system first"), run by SagaLib 1.2 in SagaQuest.create(): when a contact or bar offers the quest, or for other starts at its first Stage node. Nothing found: not offered / not started. The pick and its name, system, distance and faction are in `$global` memory (text tokens); stage markers, Arrive places and entity flags can name it (`target:<var>`, condition SF_IsTarget). Checks for criteria that don't fit the pick, empty lists, prefer-only gaps, unknown targets. Not done: commodity and terrain picks, a weighted pool of fixed places, "used for story" and exclusive references (DESIGN-PHASE7 questions). Needs the in-game check (seven_c). |
| RC-R1b | **Play mode for random targets**: designer-picked mock targets; optional dev-mode snapshot of a real sector | S (+M) | R14 (read-only vanilla systems) | **Done (7c), mock only** (2026-11-16): each target has a **mock** (name, system, distance, faction) that Play mode and the preview use, and "Arrive at target:<var>" arrives at it. The dev-mode sector snapshot is left for later (decision 5). |
| RC-R2 | **Spawn at the target**: a mission node, derelict, debris field, cache with loot, graveyard or custom entity, placed at a stage and removed when the quest ends | M | **R25, R26** (objects that appear, are removed or replaced during a quest): the same mechanism for fixed places | **Done (7d)** (2026-11-16): Action › **Spawn at the random target** (SF_SpawnAtTarget): vanilla's mission spawning near the pick (a custom entity type such as supply_cache, or a faction's derelict ship; where = vanilla's EntityLocationType), removed when the quest ends, marked on the map; place `target:<var>.spawned` for markers and Arrive. An encounter's **At** can be a quest's random target. Not done: debris fields, mission nodes and graveyards (vanilla has them; one Action each later). Needs the in-game check (seven_d). |
| RC-R3 | **Target facts and variations** for Branch nodes and phrases (e.g. "the target is decivilised") | S | — | **Done (7d)** (2026-11-16): SagaLib stores details of every pick (decivilised, has ruins / ruins size / unexplored ruins, colonised, gas giant, theme families, black hole / pulsar / nebula, hostile, unexplored system, faction id); Branch cases and phrases test them (offered in the condition menu); the target dialog sets their mock values for Play. Needs the in-game check (seven_d). |
| RC-R4 | **People at the target** (a staff post at the market, or created) | S | — | **Done (7d)** (2026-11-16): **A person there**: posts, rank and faction; vanilla's findOrCreatePerson at the picked colony (an existing post holder, or a new person who leaves when the quest ends); place `target:<var>.person` (talking to them) for markers and Arrive; `_personName` for texts. Needs the in-game check (seven_d). |
| RC-R5 | **Offer timing fields** (bar duration and timeouts, contact timeouts, `priority` / `non_repeatable`) and **tag-pool contact starts** (`tagsAll/Any/NotAny`) | XS | Could go straight into #36 | **Done** (2026-11-15, Phase 0): contact starts: Tags all / any / none of (a tag pool with no named person), Mission tags (priority, not repeatable), Timeout; bar starts: Duration, Timeout, Accepted timeout; defaults are 1.0's fixed values, so existing quests export the same. |
| RC-R6 | **Bar scenes without a mission** (`AddBarEvent`, probability, once-limit, a Play-mode bar) | S | — | **Done (7b)** (2026-11-16): start **a bar scene (no mission)**: option, blurb, conditions, a chance per visit, once per playthrough / per colony / every visit (counted when picked). Link › **back to the bar**; in a bar scene "back to the menu" and loose ends go back to the bar. Play mode shows the bar's blurb and option. Checks: no option, no blurb, a scene in every bar on every visit. Needs the in-game check (seven_b). |
| RC-R7 | **Shared random pool model** (one model and one SagaLib picker for loot, specials, interjections, bar scenes, random encounters, scatter, world events), incl. `SF_RollPool` | M | — | **Done (7a)** (2026-11-16, Phase 7a; DESIGN-PHASE7.md): **Branch › Picks: at random** (weights, the chance per case, limits: once per playthrough / per place or person, cooldown days, at most N; conditions make a case eligible; "otherwise" = the nothing share) and **Saga › Pools** (named pools a Random branch can roll). SagaLib 1.2: `SF_RollPool` and `core/Pools.java`; the same object and pool give the same pick after a reload; Play mode rolls the very same numbers (ported `java.util.Random` + SplitMix64; golden case `pools.json`) and can force the next pick. `rollEach`, loot, encounters and scatter use it in 7b–7e. Needs the in-game check (vanguard_by_hand 1.3.0, "Dock rumours"). |
| RC-R9 | **Random encounters** near the player, from a pool | M | R23 (Fleets tab), R27 | **Done (7e)** (2026-11-16): Saga › Pools › **random encounters**: the mod's encounters by weight, with conditions and limits, at vanilla's encounter points (slipstreams, outside systems) through one SagaLib creator in vanilla's EncounterManager.CREATORS, with a frequency against vanilla's own. Needs the in-game check (seven_e). |
| RC-R10 | **Scatter at new game**: place templates (with loot, specials, defenders) in N systems picked by criteria | M | R21 (custom objects) | **Done (7e)** (2026-11-16): Saga › **Scatter**: N copies of a custom entity placed at new game (or in an existing save) in places picked like a random target, each in a different system, with loot and defenders. Needs the in-game check (seven_e). |
| RC-R11 | **Decivilisation**: a "protect from deciv" toggle, a deciv event trigger, a deciv target criterion | S | — | **Done (7e)** (2026-11-16): a market's **Never decivilises** ($core_noDeciv); SagaLib sets $global.sagaforge_deciv_<market> when any colony decivilises (condition menu: "A colony has decivilised"); decivilised as a target criterion and detail came in 7c/7d. Needs the in-game check (seven_e, partly: deciv takes months). |
| RC-R12 | **World events**: a SagaLib event scheduler and the mod's own progress events (vanilla's `BaseEventIntel` shape) | L | PLAN §11.4 (#30): the same item | Open |
| RC-R13 | **Faction runtime keys** in the faction form (pirate and Pather bases, punitive expeditions, bounties) | S | **R7** (Other keys templates): these are `custom` keys from R7's survey | **Done** (2026-11-15, Phase 2): Behavior tab: Posts no bounties, Makes pirate bases (+ Pirate base stations), Punitive expeditions with Territorial / Vs. competitors / Vs. free ports / Can bombard, all checked in the API sources. Pather base types are left in Other keys (only read for the Luddic Path). |
| RC-R14 | **Roaming fleets** (`spawn.when: roaming`, a SagaLib route source) | M | R23, R27 (fleets) | **Deferred** (2026-11-16, DESIGN-PHASE7 question 13): roaming fleets need vanilla's RouteManager (a route source with save-safe data); random encounters (RC-R9) and the "player near" / periodic spawns cover the common cases for now. |

In-game checks the assessment adds (its §10): the `drop_groups.csv` merge, a condition-only market
showing "Explore the ruins", the salvage spec set by an interjection, Arrive as an option at a
planet, station and wreck, `SF_RollPool` stability after a reload, a random target with no
matches, and the dev-mode sector snapshot. They go into this file's in-game lists when their
items are built.
