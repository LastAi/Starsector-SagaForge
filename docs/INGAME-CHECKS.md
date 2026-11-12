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
  disappear once filled. To do in the editor and workflow pass, after the library and the JSON
  formats are confirmed: labels and short help on every field, starting with the stage form.
