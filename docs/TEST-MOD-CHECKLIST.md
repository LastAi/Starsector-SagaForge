# Test mod checklist: every Saga Forge workflow

A plan for one test mod, built by hand in Saga Forge, that uses every major editor workflow at
least once. Work through it top to bottom: later sections use what earlier ones made. Each line is
one thing to create or try. Where the editor can both **make new** content and **add to or change
existing** content, both are listed.

Based on Saga Forge 1.0 (2026-11-11), checked against its pages and menus. A **planned later**
section at the end lists workflows that don't exist yet. The images to make before you start are
listed in [TEST-MOD-ASSETS.md](TEST-MOD-ASSETS.md).

## How to use and extend this list

- Tick a box when the step works in the editor. Tick the **in game** box in section 12 once the
  exported mod has been played.
- Steps have ids (`F3`, `Q12`, …) so notes and bug reports can point at them. **Don't renumber.**
  Add new steps at the end of their section with the next free number.
- When a new workflow arrives (a cross-mod extension, a new page, a planned item below), add a
  section before section 12 or extend an existing one. Then move its row in section 13 from
  *planned* to *built (§n)*.
- Mark steps that need SagaLib in game with **(SagaLib)**. Everything else exports to plain game
  files.

## Suggested setup

- Mod name **Saga Forge Workflow Test**, mod id `lastai_sagaforge_workflowtest`, prefix `sfw_`.
  Treat it as throwaway: test with throwaway saves only.
- Story idea (optional), so the pieces connect: a small faction, the *Wayfarer Cartel*, sets up in
  a new system near the core. Its broker sends the player to recover a cargo pod from an ambush
  in Corvus, and a Hegemony officer reacts to the Cartel.

---

## 0. Project basics (header, ⚙ Settings)

- [ ] **P1** In ⚙ Settings, pick the Starsector folder and the mods folder.
- [ ] **P2** **+ New mod**: create the test mod and make it the active mod.
- [ ] **P3** Set the id prefix (`sfw_`) when asked.
- [ ] **P4** Make a few changes, then **Save** (Ctrl+S), **Undo** (Ctrl+Z) and **Redo** (Ctrl+Y).

## 1. Factions (Factions page)

New faction:
- [ ] **F1** **+ New faction** (the Wayfarer Cartel). Check it is listed in `factions.csv`.
- [ ] **F2** Fill in every tab at least once: Identity, Colors, Ships & weapons, Doctrine,
  Names & ranks, Behavior.
- [ ] **F3** **Relations** tab: set starting relations with at least two factions, one friendly and
  one hostile. **(SagaLib)**
- [ ] **F4** **Description** tab: write the intel description.
- [ ] **F5** **Other keys** tab: add one key that the form doesn't show.
- [ ] **F6** **Change id…** before release. Check that people, markets and relations follow the
  new id.

Change an existing faction:
- [ ] **F7** **+ Change a faction…** on a vanilla faction (e.g. Hegemony). Add something to it,
  e.g. a ship or a name. Check that the patch preview shows only your change.
- [ ] **F8** Turn on **Show other mods' changes** to see the faction with every mod's additions.
- [ ] **F9** Try to remove a list entry from the override and accept **Remove it at game start
  with SagaLib (scripted change)**. **(SagaLib)**

## 2. People (People page)

- [ ] **C1** **+ New person** (the Cartel broker). Set the name, gender, faction (F1), rank, a
  **post** and a game portrait.
- [ ] **C2** A second person who uses **Use my own image…** for the portrait. Also set a voice and
  a personality.
- [ ] **C3** **Placement: at a market** of this mod (after L5), with **in the comm directory** on.
- [ ] **C4** **Placement: at an existing vanilla market**, in a staff post (e.g. a portmaster)
  that replaces the person the game generates.
- [ ] **C5** **Placement: commanding a fleet** (an encounter, after E1). Leave a third person
  **nowhere until a quest needs them**.
- [ ] **C6** Make one person a **contact**: types and importance.
- [ ] **C7** **Phrases**: add a phrase with two cases and an *otherwise* (e.g. a title that changes
  once the player is commissioned). Check the preview on the right.
- [ ] **C8** Write a description. Check **Used by** once quests use the person.
- [ ] **C9** Existing characters: open a vanilla person (read-only). They are used in Q14.

## 3. Items (Items page)

- [ ] **I1** **+ New** with the **Quest item** preset (special): the cargo pod.
- [ ] **I2** **+ New** with the **Trade good** preset (commodity), with a description.
- [ ] **I3** **+ New** with the **Rare valuable** preset (special). Set the rarity and plugin
  params.
- [ ] **I4** Give one item a custom icon (**Pick…**), and add and remove tags.
- [ ] **I5** Edit a value under **Other columns** and check the row preview.
- [ ] **I6** Existing items: open a vanilla item (read-only). Use it in a reward (Q9) or a cost
  display (D4).

## 4. Locations (Locations page)

New star system:
- [ ] **L1** **+ New… → A new star system**. Drag it on the hyperspace map near a vanilla
  system. Set the star type, radius, corona and music.
- [ ] **L2** Add one of each entity kind: Planet, Moon (orbiting the planet), Station, Jump point,
  Asteroid belt, Ring band, Comm relay, Nav buoy, Sensor array, Derelict / wreck, and Other custom
  entity.
- [ ] **L3** Drag bodies along their orbits in the System view. Edit an orbit radius, angle and
  days by hand.
- [ ] **L4** Write a description for a planet and a custom entity.
- [ ] **L5** **+ Add a market** on the planet. Set the faction (F1), size, a free port, conditions,
  industries and submarkets, and the people at this market (C3).
- [ ] **L6** Add a market on the station, owned by a vanilla faction.
- [ ] **L7** Leave **Existing saves** off for this system. Note that it only appears in new games.

Add to an existing system:
- [ ] **L8** **+ New… → Additions to an existing system** (e.g. Corvus). Add a station with a
  market and a derelict.
- [ ] **L9** Turn **Existing saves** on, so the additions also appear in saves that don't have
  them yet. **(SagaLib)**

## 5. Encounters (Encounters page)

- [ ] **E1** **+ New** encounter (the ambush). Use **from the faction's doctrine** (fleet points),
  a fleet type and a quality. Spawn it at an L8 entity, **when a quest spawns it**, with the
  **ambush** behavior. Flags: hostile and important.
- [ ] **E2** A second encounter with **exact variants**, a **flagship commander** (C5) and a
  custom fleet name. Use **travel** to an entity, and **leaves when the stage ends**.
- [ ] **E3** A third encounter that spawns **once, on a new game**, with **guard** or **patrol**.
- [ ] **E4** A fourth encounter that is **kept alive, respawning**, with **intercept the player**
  and **no reputation loss**.
- [ ] **E5** **+ Create a comm-link dialog** for E1. Write its greeting and options in the quest
  editor. Check that other fleets of that faction keep vanilla's greeting.
- [ ] **E6** Check **Outcomes**: E1's Defeated and Avoided lead somewhere once Q7 is wired.

## 6. Quests: setup (Quests page, quest settings)

- [ ] **Q1** **+ New quest**, kind **Quest (journal stages, SagaLib)**: the main quest.
- [ ] **Q2** **+ New quest**, kind **Conversation only**: a short conversation with no journal.
- [ ] **Q3** Use each **How it starts** option once, across the mod's quests:
  - offered by a contact (C6), with a minimum rep, frequency, blurb and option text;
  - a bar event (frequency, probability, event tags, blurb);
  - an option added to an existing menu (e.g. `PopulateOptions` with a condition);
  - a dialog that opens on a trigger (e.g. `OpenCommLink` with conditions);
  - started by another quest (used by Q11).
- [ ] **Q4** **Stages**: at least three, with titles, journal text, a "next step" line, a map
  marker entity, one that ends in success and one that ends in failure.
- [ ] **Q5** **Variables**: one of each type except *target* (number, string, bool, entity, person).
  Note that *target* is marked "coming later".
- [ ] **Q6** **Prerequisites**: one quest requires another to have succeeded. Another requires a
  flag to be set.
- [ ] **Q7** **Rewards**: one reward with credits, XP, story points, faction rep and an item (I1 or
  I6).
- [ ] **Q8** Make one quest **repeatable**, and give one a **time limit**.
- [ ] **Q9** Give the main quest (Q1) its own **Icon** (**Pick…**, asset A7). Leave another quest
  without one and check that it shows vanilla's `data_retrieval.png` in the intel screen.

## 7. Quests: the flow chart (Quests page, chart and inspector)

Use each node type at least once:
- [ ] **Q9** **Start** → **Dialog** → **End** (success, with the Q7 reward).
- [ ] **Q10** **Branch** with two cases and an *else* (e.g. reputation, credits or a variable).
- [ ] **Q11** **Action**: use every action at least once across the mod. Set a variable or flag,
  give or take credits, change reputation (faction and person), give or take an item, give a
  reward, story points, experience, spawn an encounter, the encounter leaves, start another
  quest, clear a flag, and a script line.
- [ ] **Q12** **Stage** nodes that move the quest through the Q4 stages.
- [ ] **Q13** **Encounter** node (E1), with both the **defeated** and **avoided** outputs wired.
- [ ] **Q14** **Wait/Arrive**: one *when the player arrives at…* (with arrive text) and one
  *after a number of days*.
- [ ] **Q15** **End** nodes with **failure** and **abandoned** outcomes.
- [ ] **Q16** **Link**: one *back to the menu* (the default) reached at a market and one reached at
  a derelict (it closes the dialog there), one *fire a trigger*, one *into an existing option id*
  (vanilla dialog with an existing character, C9), one *to another node of this quest*.
- [ ] **Q17** **Note** node with planning text.
- [ ] **Q18** Chart tools: drag from an option into empty space to add a node, double-click the
  canvas, **Auto-layout**, **Find** (Ctrl+F), duplicate (Ctrl+D), delete.

## 8. Dialog nodes (Quests page, Dialog inspector and preview)

- [ ] **D1** **Speaker** and each **Visual** at least once: keep, person (with a 2nd and 3rd
  person), illustration (a game one and **+ Use my own image…**), large planet and planet info,
  map marker, both fleets, one ship, save, restore, hide.
- [ ] **D2** **Text** with paragraphs, an `OR` line (random variant), a **+ token…**, a
  **+ variation** (an inline phrase), and **highlights**.
- [ ] **D3** Use a person's phrase (C7) and a **mod-wide phrase** (S5) in the text. Turn on
  **Show all variants** in the preview.
- [ ] **D4** **Displays**: use every kind at least once, placed after different paragraphs.
  The kinds are credits, commodity, special item, weapon, fighter LPC, ship gained/lost, story
  points, experience, reputation, extra paragraph (small), cost panel, remaining capacity, inline
  image, faction callout, ship list, cargo grid, section heading, skill panel, sound and music.
- [ ] **D5** **Options**: several options. Set a tooltip, a **story point** cost, the **Esc**
  shortcut, **show once** (per conversation and ever), **only show if** and **disabled if**.
  Reorder them and change an option id.
- [ ] **D6** **Extra conditions** on a dialog node.
- [ ] **D7** Check every node in the **Dialog preview** (drawn with the game's fonts).

## 9. Saga overview, testing and existing dialog

- [ ] **S1** **Saga → Board**: check the prerequisite (solid) and flag (dashed) arrows between
  quests. Drag cards, and double-click a card to open its quest.
- [ ] **S2** **Timeline**: check the order of the quests.
- [ ] **S3** **Flags registry**: leave a deliberate typo in a flag (read but never set). Fix it
  with the one-click **Use …** fix.
- [ ] **S4** **Test profiles**: **+ New**, and set quest states and steps, flags, credits, story
  points, a commission, rep and cargo.
- [ ] **S5** **Mod-wide phrases**: add one (used in D3).
- [ ] **S6** **Play ▶** each quest: Restart, Step back, Play from selected, the Defeated/Avoided
  and Arrive/Wait buttons, a test profile, and **Copy to a test profile**. Read the **Play log**.
- [ ] **S7** **Rules** view: check the `rules.csv` rows a quest exports.
- [ ] **S8** **Dialog** page: search vanilla dialog (e.g. `OpenCommLink`), open a conversation
  chart, and play it with the Test context. Use what you find as the target of Q3 (option start)
  and Q16 (Link).

## 10. Problems and checks (Problems page)

- [ ] **K1** Check the live problems on each level (Error, Warning, Save warning, Style, Info).
  Apply a suggested fix.
- [ ] **K2** **Ignore with a reason** on one problem.
- [ ] **K3** **Check mod**: the cross-mod checks for id collisions and FireBest takeovers of
  vanilla dialog.

## 11. Export and release (Export… dialog)

- [ ] **X1** **Export…**: read the list of files (new, changed, unchanged, owned block). Accept
  adding SagaLib to `mod_info.json`.
- [ ] **X2** Edit an exported owned block by hand, then export again. Try **Show diff**, then
  **Overwrite** or **Detach**.
- [ ] **X3** Add a hand-written row outside the owned blocks in `rules.csv`. Check that export
  leaves it alone.
- [ ] **X4** **Mark as released** (version 1.0.0, set in the dialog's **Mod version** field before
  Export).
- [ ] **X5** After the release: rename a stage with **Change id…** and keep the old id as an
  alias. Check that a save warning appears for a change that would break saves. Export again with
  **Mod version** 1.1.0 and check `mod_info.json`.
- [ ] **X6** A derelict a quest sends the player to: **Protect this wreck** (Locations or the
  Problems fix). An ambush placed in another system than the quest's markers: the warning and its
  **Spawn at …** fix.

## 12. In game

Link the mod into `Starsector\mods`, next to SagaLib, and use a throwaway save.

- [ ] **G1** New game: the faction, relations, new system, markets, people, comm directory and
  E3 fleet are there.
- [ ] **G2** Load an older save: the L8/L9 additions appear (and L1 does not, see L7).
- [ ] **G3** Play every quest through each start type, to success, failure and abandon.
- [ ] **G4** The E1 ambush: its comm-link dialog, then defeated and avoided.
- [ ] **G5** The faction override (F7) and the scripted removal (F9) are visible in game.
- [ ] **G6** X5: a save made before the stage rename keeps its progress.
- [ ] **G7** X6: the protected wreck shows its conversation with only Leave until the quest
  succeeds, then vanilla's salvage; the Q16 back-to-the-menu link closes the dialog at the derelict.

## 12b. Game versions (task #47; run with Vanguard Compact at the checkpoint, task #48)

- [x] **V1** Settings › **Migration install**: choose the other Starsector folder. The header shows
  the target pill; Settings shows both versions.
- [x] **V2** Switch the target to the other version (pill or Settings). The game data reloads; the
  choice is remembered for this mod (`sagaforge/project.json` `target`) and comes back after
  switching mods.
- [x] **V3** In a picker, an id only the newer version has carries the label "0.98.5a only".
- [ ] **V4** Target the older version while the mod uses a newer-only id: a **Version** error in
  Problems blocks Export. Try **Pick a replacement…**, **Remove** and **Target … instead**.
- [x] **V5** Target the newer version with a mod made for the older one: the banner, **Open
  migration**, **Save a … snapshot** (in `sagaforge/backups`, never pruned), **Apply all safe
  fixes** (one undo), **Reviewed** ticks, **Export for …** (writes the new `gameVersion`).
- [x] **V6** Play the exported mod in the newer game, following the migration's test list.
- [x] **V7** **Finish migration…**: the newer install becomes the main one.

---

## 13. Workflows: built and planned later

Each row is a section of this list, or a placeholder for one. When a planned workflow is built,
add its steps as a new section above section 12 and change its status here.

Status 2026-11-17 (task #56). The workflow test mod this list describes was never built: in task
#36 the user cancelled it until the requested changes were made, and the Vanguard Compact rebuild
by hand (`mods\vanguard_by_hand`, INGAME-CHECKS "Workflow checks" W1–W8) took its place. Each
Phase 7–8 feature was tested with its own throwaway mod instead (seven_a…e, eight_a/c/d). Rows
marked "built, no steps here" have no section in this list yet. Task #50 lists what is still
untested in game; task #52 builds a compact test mod for it.

| Workflow | Status | Where it's tracked |
|---|---|---|
| Project basics, Factions, People, Items, Locations, Encounters, Quests, Dialog, Saga, Problems, Export | **built** (§0–§11); section 12 (G1–G7) never played with this list's mod | Saga Forge 1.0 |
| Editor workflow and field-help pass (may change the steps above) | **built** (task #36, Phases 0–6), no steps here; walked with vanguard_by_hand (W1–W8) | WORK-ORDER.md |
| Game versions: migration install, target switch, version labels, migration report | **built** (task #47), §12b; V1–V3 and V5–V7 passed (#48), V4 not run | TARGET-VERSION-ASSESSMENT.md |
| **MagicLib bounties**: export a quest or encounter as a bounty, and start or check one from a quest | **export built** (task #27, 2026-11-18): Quests › MagicLib bounties, Encounters › MagicLib bounty…, `magicBounty_data.json` merged by key, the random target translated; no steps here; in game: INGAME-CHECKS.md "Task #27" (`twentyseven_a`), passed 2026-11-18 (0.98a-RC8). **From a quest built** (task #59, 2026-11-18): Action "Start a MagicLib bounty", conditions "MagicLib bounty … is <state>", Play mode buttons, SagaLib 1.3's MagicLib bridge; in game: INGAME-CHECKS.md "Task #59" (same test mod), passed 2026-11-18 (0.98a-RC8, with and without MagicLib). **Waiting for the end built** (task #69, 2026-11-19): the node "Wait for a MagicLib bounty" (SagaLib watches MagicLib's keys), Play mode buttons continue it; in game: INGAME-CHECKS.md "Task #69" (same test mod, 1.2.0), passed 2026-11-19 (0.98a-RC8, with and without MagicLib) | task #27 (format + export), task #59 (SagaLib bridge), task #69 (waiting for the end): DESIGN-MAGICLIB-BOUNTIES.md; PLAN §10 |
| **Random targets** for repeatable quests (the *target* variable type, Q5) | **built** (Phase 7c), no steps here; passed in game (seven_c). Commodity/terrain picks and the rest are deferred | WORK-ORDER.md RC-R1, RC-R1b; deferred list: task #53 |
| **Ruins follow-ups**: uncolonised planets with conditions, planet scenes, raid outcome, near-target spawns, loot tables, salvage specials and defenders | **mostly built** (Phases 4, 4b, 7b, 7e), no steps here; 7b and 7e passed in game (seven_b, seven_e). Not done: salvage specials, "generate like vanilla", "can't colonise until explored", `wasCivilized`, the rdsm fixtures | INGAME-CHECKS.md › "Random content" (RC-F1…); deferred list: task #53 |
| **Randomized and runtime-generated content**: random targets and locations, random pools, spawn at target, scatter, world events | **built** (Phases 7a–7e, 8d), no steps here; passed in game (seven_a…e, eight_d), except 7e-5 (deciv guard, skipped) | INGAME-CHECKS.md › "Random content" (RC-R1…); deferred list: task #53 |
| Loot groups that add to vanilla drop groups; release zips with a Version Checker file | **built** (Phases 8a, 8b), no steps here; passed in game (eight_a, eight_a_twin, drop_merge_test) | DESIGN-PHASE8.md |
| Quest templates (delivery, bounty, escort, …) | **built** (Phase 6), no steps here: five templates and saved templates. Escort and smuggling are deferred | WORK-ORDER.md R30; deferred list: task #53 |
| World events (things that happen without the player) | **built** (Phase 8d: event schedulers, roaming fleets, progress events), no steps here; passed in game (eight_d) | WORK-ORDER.md RC-R12, RC-R14 |
| Writing tools: script view, spellcheck, punctuation checks | **built** (Phase 6), no steps here (editor only, nothing to test in game) | WORK-ORDER.md R29 |
| Translation export | **built** (Phase 8c), no steps here; passed in game (eight_c, eight_c_xx) | WORK-ORDER.md R31 |
| Adopt hand-written dialog into a quest plan | **written as a guide** (Phase 8e, docs/AI-CONVERSION.md: an AI assistant converts a copy of the mod); untested until a modder tries it on their mod | WORK-ORDER.md R12; deferred list: task #53 |
| LunaLib settings, Nexerelin faction config and random sector | **decided** (review #31, 2026-11-17): build, after optional/required mods and conditional content (#60). **Owner changes built** (task #61, 2026-11-18): "If a market of this quest changes owner", contact-post warning, Protect from invasion, quests refused when a place they need is missing, SagaLib 1.3 (no bridge); in game: INGAME-CHECKS.md "Task #61" (`sixtyone_a`), passed 2026-11-18 (0.98a-RC8). **Random sector: on hold** (descoped 2026-11-18 after it was built and its first check passed; code in `docs/parked/random-sector.patch`). LunaLib settings (#62) and Nexerelin faction config (#63) not built yet | tasks #61, #62, #63; PLAN §10 (table, §10.1–§10.5) |
| ReadAloud voice hints per character | planned | task #58, PLAN §11.8 |
