# Saga Forge: pitch and walkthrough

Screen mock-ups: open [mockups/index.html](mockups/index.html) in a browser (images in
[mockups/img/](mockups/img/)). The full design is in [PLAN.md](PLAN.md).

## The pitch

**Who it's for.** Starsector modders who want to add *story* to the sector: a faction with a
home, people to talk to, and quests with real choices. That includes writers and designers who
have never opened `rules.csv`, and experienced modders who are tired of debugging it.

**What it does.** Saga Forge is a desktop editor for the campaign side of a mod:

- **Saga overview:** every quest of the mod on one board, with what each needs first and which
  flags tie them together, plus a registry of every flag that catches typos.
- **Factions:** create new ones, or change existing ones (vanilla's or another mod's) with a
  small patch the game merges, never a copy.
- **People:** the mod's characters in one place, with portrait, rank, where they are, and
  **phrases**: wording that changes with the situation, like a commodore who calls you
  "Commander" once you hold her faction's commission and "Captain" before.
- **Items:** quest items and other new cargo, with icons and descriptions.
- **Quests and dialog:** plan branching conversations and quests as a flow chart, see each line
  the way the game's dialog window will show it (illustrations, several people, gained items,
  reputation changes and the rest), and **play the quest through** in the editor.
- **Test profiles:** start a test game, or change a running one, with quests and flags already
  set, and reload changed quests without restarting the game.
- **Locations:** new star systems with planets, stations, markets and the people in them, placed
  on a hyperspace map that shows the real vanilla sector.
- **Encounters:** fleets that a quest spawns (an ambush, an escort, a patrol), with their own
  comm-link dialog and outcomes that lead back into the quest.
- **Checks:** id collisions with the game and every installed mod, rules that would take over
  vanilla dialog, dead ends in a quest, and **warnings before you ship a change that would break
  players' saves**.

It looks and works like **Ship Editor**, and the two are meant to be used side by side: ships
made in Ship Editor are picked in Saga Forge's faction and fleet pages.

**How it differs from writing it by hand.**

| By hand | With Saga Forge |
|---|---|
| A quest is dozens of `rules.csv` rows linked by option ids you have to keep straight in a spreadsheet | A quest is a chart; option ids and rule rows are generated from it, readable, with your prefix |
| You see the dialog only by launching the game and getting to the right place | The dialog preview draws it as the game does (game fonts, colors, highlights, filled-in tokens) as you type |
| A line that should change a few words (a title, a mood) needs a copy of the whole rule per case | One line with a phrase; every variant shown side by side |
| A misspelled flag silently never matches | The flags registry lists every key and flags "read but never set" with a suggestion |
| To test the last stage you play through the first ones again | A test profile starts the game at that stage (dev mode) |
| You test branches by replaying the game | **Play** runs the exported rules with the test values you choose, shows the path and why each rule fired |
| Journal stages, map markers, time limits and spawned fleets need a Java `HubMission` class, a JDK and a build | No Java. The mod ships JSON and `rules.csv`; SagaLib runs them |
| A faction change is easily a full copy of `hegemony.faction` that breaks other mods | The editor can only write a patch, and shows what other installed mods change too |
| One greeting rule with too many conditions silently replaces vanilla's greeting for every fleet | The FireBest check finds it before export |
| Renaming a stage in an update silently breaks quests in progress | Save warnings and stage aliases keep players' progress |

**What SagaLib does.** SagaLib (`lastai_sagalib`, MIT) is a small library mod, like
LazyLib or MagicLib, that mods made with Saga Forge depend on. It reads their JSON and does what
vanilla needs Java for: it runs each quest as a normal vanilla contact or bar mission (journal,
markers, time limit, rewards, abandon), builds new star systems and places people, spawns
encounter fleets, adds a few rule commands (`SF_Step`, `SF_Spawn`, …) for `rules.csv`, and on
load reconciles quests in progress with the mod's current version, so updates don't break saves.
Dialog stays in `rules.csv` and factions stay in `.faction` files, so other mods and tools still
see and extend them. A mod that only adds plain dialog doesn't need SagaLib at all. SagaLib has
no required dependencies.

## Walkthrough

The mock-ups follow one example mod, **Vanguard Compact** (folder `mods\VanguardCompact`, id
prefix `vgc_`). It is also the 1.0 acceptance scenario: everything below must work end to end
in the game (PLAN.md §1, "What done looks like").

### 0. Set up

Open Saga Forge, pick the Starsector folder (same setup screen as Ship Editor), then **New mod**
or pick an existing one as the *active mod*. Saga Forge indexes the game and all installed mods
read-only, and asks for the mod's **id prefix** once (`vgc_`); every id it creates starts with it.

### 1. A new faction — [Factions](mockups/factions.html)

1. **+ New faction**, name it "Vanguard Compact". The id `vgc_vanguard` is proposed.
2. Fill in names, colors, logo and crest (picked from the mod or `D:\ModTools\assets`, copied
   into the mod), known ships (hulls from the index, including the mod's own Ship Editor hulls),
   doctrine, ranks.
3. Set **starting relations** (Hegemony hostile, Independent welcoming). These aren't a
   `.faction` key, so they are marked "set by SagaLib on new game".
4. The right panel shows the file as it will be written. Result: `vgc_vanguard.faction` plus a
   `factions.csv` row, both normal vanilla files.

### 2. A change to an existing faction — [Factions, second screen](mockups/factions.html)

1. **+ Change a faction…** → Hegemony. It appears under *Changes to other factions* with an
   orange **override** badge and "vanilla" as its origin, never mixed with the mod's own
   factions.
2. The editor shows the *effective* Hegemony: vanilla's values, Arma Armatura's additions
   (greyed, with the mod's name), and this mod's changes (orange). Add two hulls and a
   blueprint tag; set a hull frequency. **Revert** removes a change.
3. Try to remove `colossus`: the game's merge can't remove list entries, so the editor explains
   that and offers either to cancel or to make it a **scripted change** that SagaLib applies on
   load (shown dashed red, with a warning in Problems).
4. The patch file at `data/world/factions/hegemony.faction` contains only the changes.

### 2b. A character and how she talks — [People](mockups/people.html)

1. **+ New person** "Ilse Reyes" (`vgc_reyes`): gender, faction, rank Commodore, post Station
   commander, voice, a portrait from the game's set (referenced, not copied) or the mod's own.
2. **Placement**: at a market (Haven Station, once it exists in step 3; any vanilla market
   works too), commanding a fleet, or nowhere until a quest needs her. Mark her as a military
   contact with high importance.
3. **Phrases**: `$vgc_reyes_title` says "Commander Varga" if the player is commissioned with the
   Vanguard Compact, "Captain Varga" at Friendly reputation, and "Captain" otherwise. A random
   farewell, and a mood word that depends on how The Lost Convoy ended. The preview shows a test
   line in three situations.
4. Inside any Dialog node, the phrase is a chip in the text. One-off variations are typed inline
   with `{`, and **Show all variants** draws every case side by side. In game, SagaLib fills
   them in when the game fills its own tokens, so the dialog stays one `rules.csv` row.
5. Existing characters (vanilla's Baird, say) are listed separately: the mod can add dialog with
   them but never changes them. **Used by** lists every quest, encounter and greeting that uses a
   person.

### 3. A location with a market and a contact — [Locations](mockups/locations.html)

1. **+ New system** "Kestrel", and drag it on the hyperspace map. Vanilla systems are shown at
   their real positions; the toolbar shows the nearest system.
2. In the system view, add a star, a planet, **Haven Station**, an asteroid belt, a derelict (the
   convoy wreck), a jump point and a comm relay. Drag bodies along their orbits.
3. Give Haven Station a **market**: Vanguard Compact, size 5, conditions, industries,
   submarkets.
4. Add a person, **Ilse Reyes**, as a contact at the market. The panel lists which quests she
   gives once the quest exists.
5. **Existing saves**: off by default, so a warning says Kestrel will only appear in new games;
   tick it to have SagaLib add it to saves that don't have it.

Additions to an existing system (Corvus +1 entity) are listed separately, and SagaLib checks
that they aren't already there before adding them.

### 4. A quest on the flow chart — [Quest planner](mockups/quest.html)

1. **+ New quest** "The Lost Convoy" (`vgc_lost_convoy`). Choose how it starts: contact Ilse
   Reyes, minimum reputation Favorable. That becomes a `person_missions.csv` row, the same way
   vanilla offers contact missions.
2. Write the **Offer** dialog node: speaker, visual, text with tokens. Add four options, each
   its own output handle: accept, ask about the catch, a **story-point option** for double pay
   (only shown while `pay == 1`), decline.
3. Drag from each option's handle to add the next node: a Dialog for the catch (with "Back"), an
   Action (`pay = 2`), a **Stage** node (journal text and map marker for stage `find`), and a
   read-only **Link** back to the contact's vanilla menu for "Not interested".
4. The **dialog preview** under the chart shows the selected node as the game draws it: portrait
   and crest, text with highlights in the game's yellow, `$playerLastName` filled in from the
   **Test context**, options numbered, the story option in green with its cost, Esc marked. A
   ruler shows when text is too long for the window.
5. Problems appear on the nodes as you work (an option that leads nowhere, an unknown id, a token
   nothing sets). The **Rules** tab shows the `rules.csv` rows the chart will export.

### 4b. A quest item and what the dialog shows — [Items](mockups/items.html), [Dialog displays](mockups/displays.html)

1. On **Items**, **+ New → Commodity** "Convoy black box" with the *Quest item* preset (not
   traded, not lost in combat, hidden in the Codex), an icon and a description.
2. In the quest, the Dialog node "Wreck found" shows an **illustration** of the wreck's interior
   (the mod's own image; registered in its `settings.json` on export), and lists its
   **displays** in order: gain the black box, gain a damaged Buffalo, Vanguard reputation +5, a
   small grey line, a sound. The preview draws them as the game does: "Gained 1 Convoy black box"
   with its icon, the reputation line in the faction's color.
3. Other scenes can show a second or third person, a planet, both fleets before a fight, a map
   marker, or a faction callout (crest, name, relationship bar).

### 5. Play mode — [Quest planner, second screen](mockups/quest.html)

1. Press **Play ▶**. Click options in the preview; the chart lights up the path taken, unvisited
   nodes fade.
2. The log explains each step ("Rule `vgc_lost_convoy_offer` (FireBest: 2 conditions, beat 1
   other)"), and the variables panel shows `$global.vgc_lost_convoy_step`, `pay`, credits and
   story points changing.
3. What the editor can't simulate, like the ambush battle, asks for the outcome. **Step back**,
   **Restart** and **Play from selected node** make it quick to test each branch. Play never
   changes the plan or the mod.

### 6. An encounter — [Encounters](mockups/encounters.html)

1. The quest's Encounter node opens the **Belt ambush** encounter: Pirates, fleet type
   `patrolMedium`, 80 fleet points from the faction's doctrine (or exact variants), a pirate
   flagship.
2. **Spawn** when stage `find` starts, in the Kestrel belt; **despawn** when the stage ends or the
   fleet is beaten. **Behavior**: ambush.
3. A **comm-link greeting** with options (including a story-point bluff that makes the fleet
   leave), edited in the same chart editor. It only applies to this fleet, so other pirate fleets
   keep vanilla's greetings.
4. **Outcomes** lead back into the quest: Defeated → the wreck; Avoided → (not yet set, which is
   an error).

### 6b. The whole saga, and testing it in game — [Saga overview](mockups/saga.html)

1. **Saga** shows every quest as a card. *Salvage Rights* needs *The Lost Convoy* to succeed;
   *Ghost Signal* starts only once the convoy quest sets `$global.vgc_signalHeard`; *The
   Compact's Offer* needs both. Arrows show it.
2. The **flags registry** shows that *Salvage Rights* reads `$global.vgc_convoySaved`, which
   nothing sets, and suggests `$global.vgc_convoy_saved`. One click fixes it.
3. **Test profiles**: "After the convoy, commissioned" sets The Lost Convoy to success, Salvage
   Rights to step `survey`, two flags, a Vanguard commission, credits and the black box. Use it in
   Play mode, or, with the game's dev mode on, pick it when a new game starts. SagaLib's dev menu
   also applies profiles mid-game and reloads changed quest files without restarting.

### 7. Problems — [Problems](mockups/problems.html)

**Check mod** compares the whole mod with the game and every installed mod. Errors block
Export (a dead end in the quest, a rule id another mod also uses); warnings don't (a greeting
that would replace vanilla's for every pirate fleet, a scripted faction change, a token nothing
sets). Each row has fixes. **Save warnings** compare with the last release. **Style** checks
(quotes around speech and the like) are off unless switched on.

### 8. Export — [Export](mockups/export.html)

1. **Export…** lists every file it will write and whether it is new, changed, unchanged, or an
   **owned block** in a shared file (`rules.csv`, `person_missions.csv`). Hand-written rows
   outside the blocks are never touched.
2. If a block was edited by hand since the last export: **show diff**, **overwrite**, or
   **detach** (the block becomes hand-written).
3. `mod_info.json` gets the SagaLib dependency (asked once). Only the active mod is written;
   backups go into `sagaforge/backups/`.
4. Launch the game (the mod is already linked into `Starsector\mods` by you, as today), start a
   new game, find Reyes on Haven Station, play the quest.

### 9. Releasing and save warnings — [Export, second screen](mockups/export.html)

1. **Mark as released** (version from `mod_info.json`, here 1.0.0) stores a snapshot of every id
   saves can depend on.
2. Working on 1.1.0, you change stage `search` to `find`. The editor stops and explains what
   happens to players in that stage, and offers to **keep the old id as an alias** (SagaLib moves
   them on load), to drop it, or to change only the display name.
3. Problems lists the other save-relevant changes since 1.0.0: Kestrel is new-game only, a new
   variable is fine, text changes need no warning.
