# Changelog

## 1.2.0 (2026-11-19)

For Starsector **0.98a and 0.98.5a**. Support for other mods: optional, required and incompatible
mods, versions of content by installed mods, MagicLib bounties and achievements, Nexerelin faction
configs and quest skips, a LunaLib settings page, and markets changing owner. Mods that use any of
it need **SagaLib 1.3** in game (the export sets the dependency); mods that don't still need only
SagaLib 1.2. The other mods stay optional unless the modder makes them required. Every part was
tested in game on 0.98a-RC8 with throwaway test mods (`docs/INGAME-CHECKS.md`, "Task #60" to
"Task #71"), with Nexerelin 0.12.2d, MagicLib 1.5.6 and LunaLib 2.0.5 where they were needed.

### A quest node that waits for a MagicLib bounty to end (task #69)

- **Wait node › when a MagicLib bounty ends** (also **Wait for a MagicLib bounty** in the add-node
  menu): outputs *succeeded*, *failed*, *expired* and *dismissed*. SagaLib 1.3 watches MagicLib's
  memory keys while the quest is at the node, also when the bounty ended before the quest got there.
  Without MagicLib nothing ends the wait. In game: `docs/INGAME-CHECKS.md`, "Task #69" (0.98a-RC8,
  with and without MagicLib, 2026-11-19).
- **Problems** checks the new node; **Play mode** buttons continue a waiting quest (Dismissed
  added); **Quest skip** notes a wait it passes.
- A Wait node is an event: the flow no longer jumps into it, an option leading into it gets its own
  rule (found in game: before, it had none), and a "wait N days" timer now gets the Stage before it.
- **Bounty editor**: MagicLib 1.5.6 enforces bounty deadlines only with "Enable Bounty Deadlines"
  turned on in LunaLib (off by default); noted there and in `docs/FORMATS.md`.

### Nexerelin quest skip, MagicLib achievements, shared drop groups (task #65)

For Starsector **0.98a** with **SagaLib 1.3** (formats: `docs/FORMATS.md`, "Quest skip", "MagicLib
1.5.6 achievements", "Loot, defenders…"; SagaLib's `docs/FORMAT.md`, "Nexerelin quest skip" and
"MagicLib achievements"; in game: `docs/INGAME-CHECKS.md`, "Task #65", passed on 0.98a-RC8 with Nexerelin 0.12.2d and MagicLib 1.5.6, 2026-11-19). Nexerelin and MagicLib
stay optional: their files are read only by them, and without them the mod loads and nothing
happens.

- **Saga › Quest skip** (shown when the mod lists Nexerelin): the mod's quest chains on Nexerelin's
  new-game **skip quests** screen, one row per questline and one button per quest. Per chain: name,
  image (Nexerelin needs one), sort key, tooltip. **+ Add a quest** also adds the quests it needs
  first. Per quest: the name on the button, a tooltip, and **the ending a skip means** (an End node or
  a success/fail Stage node). Saga Forge works out what that ending leaves in memory along the
  shortest path from the Start node: SagaLib's state and step, vanilla's completed key, the quest's
  variables and every Set on the way; each key can be left out, and **More keys** adds others. It
  lists the rewards a skip gives and **what a skip doesn't do** (other quests started, encounters,
  keys only the dialog has). Skipping a quest also skips the quests of the chain it needs, and
  un-skipping it un-skips the ones that need it (from the prerequisites).
- **Rewards (decided in this task): given.** Nexerelin sets a skip's flags only through a plugin
  (found in its code: an entry without one sets nothing), so every chain names SagaLib 1.3's bridge
  plugin. It also gives the ending's rewards at the start, once (switch per quest: **Rewards: give
  them**), and sets `$global.sagaforge_skipped_<quest>`. People to show in their comm directory can be
  listed too.
- **Saga › Achievements** (shown when the mod lists MagicLib): MagicLib achievements with name,
  description (past tense), tooltip, image, shown (visible / listed with details hidden / hidden
  until unlocked) and rarity. Exported as rows of the mod's `data/config/magic_achievements.csv` (an
  owned block; hand-written rows stay) with MagicLib's generic class. A quest unlocks one at an
  **End node** (its new Achievement field) or with the action **Unlock a MagicLib achievement**
  (`SF_Achievement`, SagaLib 1.3's MagicLib bridge); Play mode shows MagicLib's notice.
- **Images** of achievements and chains are listed in the mod's `settings.json` (`graphics` ›
  `<prefix>images`), so the game loads them: neither MagicLib nor Nexerelin loads them itself.
- **Problems**: a chain without an image (it stops Nexerelin's later chains from loading), a quest in
  two chains, an ending that isn't one or can't be reached, a prerequisite the skip's ending
  doesn't meet, a long button name, quests listed before ones they need; an achievement without a
  name or never unlocked, a quest unlocking an achievement that isn't the mod's, an empty action.
  Nexerelin and MagicLib not in the mod's list: Add as optional (suggested). The flags registry now
  knows SagaLib sets vanilla's `$<quest>_missionCompleted` and `$sagaforge_skipped_<quest>`.
- **Shared drop groups**: the warning that another source already has the same item in a vanilla
  drop group (only one row wins, checked in game) now also covers the mod's hand-written
  `drop_groups.csv` rows; tested on the real `eight_a` + `eight_a_twin` files.
- Test mod `mods\sixtyfive_a` (prefix `sfv_`).

### Saga Forge and SagaLib versions

- **Problems** warns when the SagaLib in the game's mods folder is older than the one this Saga
  Forge is made for (always: Play in game runs on it; it says so when the mod itself needs more),
  when it is newer than this Saga Forge knows, when SagaLib isn't installed but the mod needs it, and
  when the mod's mod_info.json asks for a newer SagaLib than this Saga Forge exports. All say what to
  update.
- **A mod made with a newer Saga Forge** (a newer plan format, or `savedWith` in `project.json`): an
  error in Problems, a banner above every page, and Save asks first, since this version could drop
  what the newer one added. Saving records the version (`savedWith`) and never lowers a newer one.
- SagaLib 1.3 loads a quest's own icon (the mod's own file), which showed blank before.

### Nexerelin faction config for the mod's own factions (task #63)

For Starsector **0.98a** with **SagaLib 1.3** (formats: `docs/FORMATS.md`, "Nexerelin 0.12.2d",
Faction config and Starting relations; SagaLib's `docs/FORMAT.md`, "Factions runtime"; in game:
`docs/INGAME-CHECKS.md`, "Task #63", passed on 0.98a-RC8 with Nexerelin 0.12.2d, 2026-11-19; the random sector on hold). Nexerelin stays optional: the files are data
only, and nothing reads them without Nexerelin.

- **Factions › Nexerelin**, a tab on the mod's own factions (not on changes to other factions),
  shown when the mod lists Nexerelin in Saga › Mods (or the faction already has a config).
  **Add a Nexerelin config**, then:
  - **New game**: playable, starting faction, on by default in a random sector, difficulty text,
    new-game tooltip, and how many ready-made fleets it has (edited on Fleets, below).
  - **War and invasions**: pirates, neutral to pirates, hostile to all (Nexerelin's three levels),
    can invade, only retakes, invasion rate and fleet sizes, ground attack and defence bonus,
    special forces (fleets, size, rate).
  - **Diplomacy**: morality, alignments (sliders), traits (Nexerelin 0.12.2d's list with what each
    does), random traits allowed, liked and disliked factions, no diplomacy, **keep relations when
    randomized**, don't sync with the player.
  - **Fleet names** (invasion, strike, response, defence, suppression, mining, rebels, the three
    vengeance levels and fleets), **Economy** (free market, tariffs, hand-made sector).
  - **Other keys**: everything without a field is kept and editable as loose JSON. A preview of the
    file.
- **Fleets › New-game fleets (Nexerelin)**: the ready-made fleets on Nexerelin's new-game fleet
  choice, by type with Nexerelin's own names (Frigate (classic), Combat (small), … Super ship, Grand
  fleet; each a list of fleets of variant ids). For each of the mod's factions with a config (offered
  when the player joins it, next to Nexerelin's Custom fleet), and for **the player faction** (free
  start and own faction): those are exported as the mod's own
  `data/config/exerelinFactionConfig/player.json` with only the fleet lists, which the game merges
  into Nexerelin's, so they are added after Nexerelin's fleets (Nexerelin's can't be removed).
- **One source for starting relations**: the tab shows the faction's relations (Relations &
  changes); Export writes those without mod conditions as `startRelationships` with
  `useConfigRelationshipsInNonRandomSector: true`. With Nexerelin, SagaLib 1.3 then leaves them to
  Nexerelin (it applies them in the hand-made and the random sector and randomizes them only when
  the player picks random relations); relations with mod conditions stay SagaLib's.
- **Export** writes `data/config/exerelinFactionConfig/<id>.json` per faction (an existing file is
  updated in place, comments kept) and its row in `mod_factions.csv` (an owned block; hand-written
  rows stay). A config Export wrote is removed when the faction loses it. `factions.json` lists the
  factions (`nexerelin`), so the mod needs SagaLib 1.3 when they have relations.
- **Opening a mod** that already ships configs for its own factions reads them in once (their
  relations join the faction's; the designed ones win). Delete and Change id take the config along.
- **Problems**: a starting faction without ready-made fleets (info: players who join it only get
  Custom), an unknown variant in a ready-made fleet (the player faction's too),
  contradicting or unknown traits, a faction both liked and disliked,
  a field of the wrong type, relations that stay SagaLib's, a config kept for a faction that isn't
  the mod's own.
- **Saga › Mods**: the configs make the mod a user of Nexerelin (optional fits); Unlocks names the
  tab.
- Answered from the game's code: mods' ModPlugins run in mod order (`docs/FORMATS.md`).
- Test mod `mods\sixtythree_a` (prefix `sth_`); the installed faction mods' configs (UAF, HMI, RAT,
  Arma Armatura, Industrial.Evolution) read and write back without losing a key (test).

### A LunaLib settings page for the mod (task #62)

For Starsector **0.98a** with **SagaLib 1.3** (formats: `docs/FORMATS.md`, "LunaLib 2.0.5";
SagaLib's `docs/FORMAT.md`, "Mod settings (LunaLib)"; in game: `docs/INGAME-CHECKS.md`, "Task #62",
passed on 0.98a-RC8 with LunaLib 2.0.5, 2026-11-18). LunaLib stays optional: it is never added
to `mod_info.json` unless you list it as Required in Saga › Mods.

- **Saga › Settings**: the mod's own page in LunaLib's settings menu. Rows of the types on/off,
  whole number, number, choice and text value, plus header and text lines for layout, each with an
  id (prefixed; it follows the label until something reads it), a label, a tooltip, a default, a
  range or choices, and a tab. Rows move up and down; a rough preview shows the page. An icon for
  LunaLib's menu (new image kind "Mod icon", 40×40). A note says the values are shared by every
  save, and whether LunaLib is optional or required.
- **Export** writes `data/config/LunaSettings.csv` (an owned block; hand-written rows stay) and,
  with an icon, `data/config/LunaSettingsConfig.json`. With SagaLib, `content.csv` lists the CSV as
  type `settings`: SagaLib sets each value as `$global.<id>` on every load, the player's value
  with LunaLib, the default without it, and applies a change in LunaLib's menu at once.
- **Settings in conditions**: the condition pickers (Branch cases, phrases, option and start
  conditions) list "Setting … is on / is <choice> / at least …"; a quest's Prerequisites offer
  "a setting" as a switch for that quest and the quests after it.
- **Multipliers**: a reward's credits (**Scaled by**) and an encounter's fleet points (**Size
  scaled by**, fleets by the doctrine only). A whole number is a percent, a number is times, an
  on/off or a choice gets a factor per value.
- **Flags registry**: a setting's key is marked "setting" (set by SagaLib on every load), with what
  reads it, scales included.
- **Play mode**: a control per setting in the toolbar (as if changed in LunaLib's menu; the log
  shows scaled credits and fleet points). **Test context**: "Mod settings".
- **Problems**: a setting without an id or with an unusable one, two with the same id, a default
  that isn't readable, a choice list or range that doesn't fit, a condition testing a choice the
  setting doesn't have, and scales naming no setting, a text setting, all factors at 1, or a fleet
  not sized by points.
- A mod that reads its settings needs SagaLib 1.3. Test mod `mods\sixtytwo_a` (prefix `sta_`).
- **Fixes found in game**: a Header's or Text line's words are now also written as `defaultValue`
  (LunaLib draws that column, so they showed empty). New Problems warning: an Arrive (or an option
  start) at a place of the mod without a market that isn't a planet: vanilla's dialog there shows
  only Leave and never the menu's options; take over the arrival instead.
  Two more warnings: an arrival that takes over at a place without a menu and goes straight to
  "back to the menu" (the dialog closes before the text can be read), and a whole-number setting
  shown in dialog text (the game prints it as "100.0").

### A character's presence depends on who controls their market (task #70)

For Starsector **0.98a** with **SagaLib 1.3** (formats: `docs/FORMATS.md`, "Presence by the
market's owner"; SagaLib's `docs/FORMAT.md`, "Presence"; in game: `docs/INGAME-CHECKS.md`,
"Task #70", passed on 0.98a-RC8, 2026-11-18).

- **People › Presence** (for someone placed at a market): "always present", or "only while the
  market's owner gets on with a faction": at least a level (Vengeful … Cooperative, or not
  hostile) with a faction (default: their own), and optionally a market they go to instead. A
  line under it says whether they'd be present at the start (from the mod's starting relations).
  SagaLib checks it once a day and on load, so a new owner, a war breaking out and peace all count.
  While away they're hidden from the comm directory, quests with them as contact aren't offered,
  and `$global.sagaforge_away_<person>` is true for dialog to test.
- **New condition `SF_FactionRep <faction A> <faction B> <level>`** (SagaLib 1.3): between two
  factions, either may be `$faction.id` ("only if the market's owner is friendly with the
  Hegemony"). In the condition picker: "Market owner gets on with a faction", "Market owner not
  hostile to a faction" and "<person> is away". Previews and Play mode use the mod's starting
  relations; for other pairs (vanilla sets them in code) they ask, like other unknown conditions.
- **Play mode**: a "<person> is away" switch above the dialog; a contact quest isn't offered while
  its contact is away, and the "changes owner to …" event re-checks presence when the relation is
  known. **Test context**: "People away" switches.
- **Problems**: an info line for a quest whose contact has a presence rule and no "If a market of
  this quest changes owner" (what happens to an active quest when they leave?); warnings for a
  presence rule on someone not at a market, or "elsewhere" being their own market or no market;
  errors for an unknown level or faction, and for `SF_FactionRep` lines with too few arguments or
  an unknown level.
- A mod with a presence rule or `SF_FactionRep` needs SagaLib 1.3. Flags: SagaLib's away flags
  count as set.
- Test mod `mods\seventy_a` (prefix `sya_`); in-game check in `docs/INGAME-CHECKS.md`, "Task #70".

### Option-start quests stay offered; target tokens before the pick (task #71)

Found in game on 0.98a-RC8 during task #61's check. No SagaLib change. In game: passed on
0.98a-RC8, 2026-11-18 (`docs/INGAME-CHECKS.md`, "Task #71").

- **Fix: a quest that starts from its own rule stops offering itself.** For a quest (kind Quest)
  that starts from an option, a trigger, an interjection or a bar scene, the start rule now also
  tests `SF_QuestState <quest> notStarted` (or `!SF_QuestState <quest> active` when it is
  repeatable). Before, the option stayed while the quest ran and after it ended; picking it walked
  through the offer again, and accepting while it ran set its step back. Contacts and bar events
  are left to vanilla's hub; conversations are unchanged. Play mode follows it ("not offered: the
  quest is running").
- **Problems: random-target and variable tokens before the quest starts.** With any start but a
  contact or a bar event, SagaLib creates the mission when the quest starts (its first Stage node):
  only then does it pick the random targets and set the variables to their initial values. So a
  start option, a bar scene's blurb or an offer that names them (`$global.<quest>_<var>_name`,
  `_system`, `$global.<quest>_<var>`, …) showed the token raw. A warning now points at each such
  text (a variable an Action sets before it is fine).
- **Play mode and the node preview leave those tokens unfilled until the quest starts**, as in
  game (they used to show the mock and the initial values from the start). An interjection now
  plays through its own start rule, and "started by another quest" jumps into its first node
  without starting the quest first (the quest starts at its first Stage node).
- Flags: SagaLib's quest state (`$global.<quest>_state`) counts as set for every quest, and
  `SF_Step` as setting it.
- Test mods `mods\sixtyone_a` and `mods\sixty_a` rebuilt; in-game check in
  `docs/INGAME-CHECKS.md`, "Task #71".

### Markets changing owner (task #61)

For Starsector **0.98a** with **SagaLib 1.3**; works with **Nexerelin 0.12.2d**'s invasions, no
bridge and no dependency (PLAN.md §10.3; formats: `docs/FORMATS.md`, "Nexerelin 0.12.2d"; in game:
`docs/INGAME-CHECKS.md`, "Task #61", passed on 0.98a-RC8, 2026-11-18). Nexerelin's random sector is
on hold (its own task).

- **Quest settings › If a market of this quest changes owner**: don't watch (default), keep going,
  fail the quest, or go to a stage (what follows its Stage node runs). SagaLib watches the giver's
  market, stage markers, Arrive places, named places and random market targets once a day; every
  choice sets `$global.<quest>_ownerChanged` and `$global.<quest>_newOwner`.
- **Play mode**: while a quest watches markets, "<market> changes owner to …" above the dialog.
- **People**: with Nexerelin in Saga › Mods, a warning when a quest contact is an administrator,
  portmaster, supply officer or station, base or outpost commander at a market that can be invaded
  (Nexerelin gives the post to the new owner's faction), with a one-click "Protect from invasion"
  for the mod's own markets.
- **Locations › market › Protect from invasion**: Nexerelin never invades it (SagaLib sets
  `$nex_uninvadable`).
- **SagaLib never offers or starts a quest whose contact, markers or Arrive places don't exist**
  (a removed mod, a removed place), and logs why.
- **Fix (found in game)**: an Arrive node's option is offered only while its quest is active. A
  quest that failed at that step (an owner change, its time limit) still offered it, and its End
  would have completed the failed quest.
- Test mod `mods\sixtyone_a` (`npx jiti scripts/build-test-mod.ts sixtyone_a`).

### MagicLib bounties from quests (task #59)

For Starsector **0.98a** with **MagicLib 1.5.6** and **SagaLib 1.3** (its first optional bridge; in
game: `docs/INGAME-CHECKS.md`, "Task #59", passed on 0.98a-RC8, 2026-11-18). `docs/DESIGN-MAGICLIB-BOUNTIES.md` §6.

- **Action › Start a MagicLib bounty** (`SF_StartBounty`): the player takes a bounty from the
  quest, as if accepted on MagicLib's board (MagicLib spawns the fleet and pays). The mod's own
  bounties, hand-written ones in its file, or another mod's id.
- **Conditions "MagicLib bounty … is unavailable / offered / active / succeeded / failed / ended"**
  (`SF_BountyState`) in the Branch, option and start condition menus. Without MagicLib every
  bounty is unavailable, so a quest can say so instead of breaking.
- **Bounty › On the board** (default on): off = only a quest gives it.
- **A bounty's quest prerequisite "quest X ended"** now maps to MagicLib's triggers through
  SagaLib's new true/false keys (`$sagaforge_success_<quest>` / `_fail_`); it was left out before.
- **Play mode**: the bounty states follow the MagicLib switch; buttons above the dialog stand in
  for MagicLib (taken on the board, succeeded, failed, expired).
- **Problems**: a start without a bounty, a word that isn't a state, a start whose state the quest
  never tests while MagicLib is optional, a bounty off the board that no quest starts; quests that
  use bounties count as using MagicLib (Add as optional / required). A Branch whose cases test
  different states of one bounty (or `$x` / `!$x`, or different values) is no longer "ambiguous".
- A Branch case or option condition written as a SagaLib command (`SF_…`) now makes the export
  add SagaLib, as a script line already did.

### MagicLib bounties (task #27)

For Starsector **0.98a** with **MagicLib 1.5.6** (the bounty file needs no SagaLib change; in game:
`docs/INGAME-CHECKS.md`, "Task #27", passed on 0.98a-RC8, 2026-11-18). `docs/DESIGN-MAGICLIB-BOUNTIES.md`; the format is
in `docs/FORMATS.md`, "MagicLib 1.5.6 bounties".

- **MagicLib bounties** (Quests › MagicLib bounties › + From this quest; Encounters › MagicLib
  bounty…): a bounty made from an encounter (the target fleet, its captain, place, behaviour, comm
  reply) and optionally a simple quest (title, offer text, success and failure journal, reward, time
  limit, flag prerequisites, contact). Empty fields come from the sources at every export; the
  editor shows the exported entry and what MagicLib can't do.
- **"Where" is described once**: a fixed place, or the quest's random target translated into
  MagicLib's own search (distance from the sector's centre, system themes, entity tags). The
  target editor shows the translation for targets a bounty uses.
- **Export** writes `data/config/modFiles/magicBounty_data.json`, merged by key (hand-written
  bounties stay and are listed read only, as are rows of an older `vayraBounties` CSV). Texts are
  converted (`%` → `%%`, the captain's and target's tokens → MagicLib's); other `$` tokens are a
  warning. "Only as a bounty" (default) keeps the quest and encounter out of the SagaLib export.
- **MagicLib in Saga › Mods**: a mod with bounties uses MagicLib; Problems and the Export dialog
  offer Add as optional (suggested) or Add as required (adds the `mod_info.json` dependency).

### Versions by installed mods, other mods' content (task #64)

For Starsector **0.98a and 0.98.5a**, with **SagaLib 1.3** (unreleased; checked in game on 0.98a,
2026-11-18: `docs/INGAME-CHECKS.md`, "Task #64"). PLAN.md §10.6, §10.7.

- **Versions strip** at the top of the editors of characters, quests and conversations (settings,
  named places, texts, rewards, time limits, every node), encounters, the mod's own star systems
  and their markets, event schedulers, pools, starting relations and scripted faction changes,
  items (name, description, icon, base price) and descriptions. One cell per combination of the
  optional mods (2 mods: Base, Mod1, Mod2, both). A field changed in a cell is stored for that
  version (`versions: [{ mods, set: { "<path>": value } }]` in the plan); everything else is
  inherited field by field (the most specific version wins). The open cell lists its fields with
  **Revert** each, and asks for the value where two versions it combines disagree. A node's place
  on the chart stays the same in every version.
- **Named places** (a quest's **Places**): one place for its start, stage markers, Arrive nodes and
  pictures, picked as "named place …" or written `place:<id>` in a condition; changed once, also in
  a version.
- **Name tokens** `$<person>_name`, `_firstName`, `_lastName` for the mod's characters (exported as
  their phrases, so they follow the character's version); added when a text uses them or the name
  has versions.
- **Scripted faction changes** editor (a faction's **Relations & changes** tab; **Scripted changes**
  for a change to an existing faction): display name, name with "the", logo, crest, secondary
  color, add or remove a known ship, make a commodity illegal or legal, doctrine values, shown in or
  hidden from the intel tab. 0.98a has no setter for the long display name.
- **Export**: SagaLib files get `versions` (computed per combination from the exported JSON, so
  SagaLib's result is the export's); quests and conversations with versions get a SagaLib file;
  each dialog node a version changes gets one extra rule that tests the version SagaLib stored for
  the save (`$global.sfv_<quest>_<mod>`, with score), and a rule whose conditions a version changes
  (a moved named place) gets copies that exclude each other; item and description versions go into
  `data/sagaforge/text.json` (set at startup from the installed mods). Versions' texts are offered
  for translation.
- **Checks**: two versions setting a field differently where they combine (error); a version for a
  mod that isn't optional; a path a version can't follow; what each version refers to (unknown:
  "not checked"; another optional mod's content outside its version: error); a versioned name
  spelled out in a text (warning).
- **Play mode and the Test context**: the optional mods' switches pick every item's version.
- **Other Saga Forge mods' content**: the index reads every installed Saga Forge mod's
  `content.csv` and the files it lists (systems, markets, places, people, quests with their stages,
  encounters, pools), with that mod as their origin. Their quests are offered as prerequisites
  ("after Mod1's quest X", which makes the quest "Only with" that mod by itself); their markets
  and places in the pickers. Their dialog already showed with their texts (1.1.1).
- **Sector snapshot** (Saga › Mods › **Seen in game**): imports SagaLib's dev-menu snapshot (from
  the game's `saves/common`, or a file) per install. What only exists in a mod's code (systems,
  places, markets, people) becomes pickable and checked, tied to its mod by faction or id prefix;
  what can't be tied to a mod (vanilla's random systems) is left out.
- New throwaway test mods (0.98a): `mods/sixtyfour_a` (prefix `sfa_`, the Reyes example) and
  `mods/sixtyfour_b` (prefix `sfb_`, the Saga Forge stand-in), built by
  `npx jiti scripts/build-test-mod.ts <name>`; `mods/sixtyfour_j` (the Java stand-in, `bash build.sh`
  in its folder).

### Optional and required mods, conditional content (task #60)

For Starsector **0.98a and 0.98.5a**. Content that depends on other mods needs **SagaLib 1.3**
(unreleased; not yet tested in game: `docs/INGAME-CHECKS.md`, "Task #60"). PLAN.md §10.1, §10.2.

- **Saga › Mods**: the other mods this mod has content for, as **Required** (added to
  `mod_info.json` dependencies on export, asked, with the minimum version), **Optional** (the mod
  must play without it; what uses it is conditional) or **Incompatible** (a warning in game and in
  the release notes, with a reason). Columns Mod, Use, Min version, Used by, Unlocks, Reason.
  Offered: every installed mod, enabled or not, except this mod, SagaLib, translation mods and the
  libraries the listed mods need. Stored in `sagaforge/project.json` (`mods`).
- **Works with** pill in the header: the listed mods; it opens Saga › Mods.
- **Lists and pickers** (factions, people, systems on the map, items, images and portraits, the
  Dialog browser, and every id picker fed from the game index) show vanilla, this mod and its
  listed mods. Each list has **Show all installed mods**; pickers a **+N** switch. Picking from an
  unlisted mod offers **Add as optional / Add as required**. Checks are never filtered.
- **Only with / Only without** on quests, conversations, people, systems and objects, encounters,
  world events and schedulers, progress events, pools and pool entries, scatter, starting
  relations, scripted faction changes, dialog options, Branch cases and phrase cases; shown as
  chips. **any of** exports `SF_HasAnyMod`. Exported as SagaLib's `modsWith` / `modsWithout` /
  `modsAny` and as `SF_HasMod` rule conditions; an option with conditions is its own small rule.
- **Automatic conditions**, shown greyed with where they come from: an item that refers to an
  optional mod's content; a quest whose prerequisite or contact is conditional; people, places,
  encounters and progress events that only conditional content uses.
- **Uses-scan** (the source of every id in the game index, plus the framework files the mod ships):
  "uses X but X isn't in the list" with **Add as required / Add as optional**; removing a used mod,
  or marking it incompatible, asks first.
- **Checks**: content of an incompatible mod (error); game-loaded rows pointing at an optional mod,
  such as a new faction's known ships (error); a node using an optional mod's content outside a
  guard (warning); every combination of the optional mods (a node with no option left, a Branch
  with no case); a patch of another mod's faction that loads before it, with a **sortString** fix.
  **Check mod** adds an optional mod's own rule commands (error), its text tokens outside a guard
  (warning), and a second pass **without the optional mods**.
- **Export**: `data/sagaforge/mods.json` for SagaLib, the SagaLib 1.3 dependency when needed,
  required mods into the dependencies (asked), the `sortString`; **release notes** next to the
  release zip with Requires / Works with ("Add or remove these mods only before starting a new
  game.") / Known conflicts (the forum draft gets the same).
- **Factions**: a relation and a scripted change can have mod conditions; **Hidden from the intel
  tab** for a faction that only matters with an optional mod (SagaLib `hideFromIntelTab`).
- **Play mode and the Test context**: a switch per optional mod; Play runs the rules as exported.
- Mod-specific tools follow the list: an extension's `requiresMod` must be required or optional in
  the mod (Settings › Extensions stays app-wide).
- New throwaway test mod `mods/sixty_a` (prefix `sxa_`, 0.98a): `npx jiti scripts/build-test-mod.ts sixty_a`.

## 1.1.1 (2026-11-17)

For Starsector **0.98a and 0.98.5a**, with SagaLib 1.2 (unchanged). Fixes for what turned up while
writing the user guide.

- **Play mode** no longer shows raw `[$sft]-…` keys for options exported through a node's
  `_options` rules (show-once, story point, show-if): the mod's own exported rules are left out,
  since Play runs the freshly compiled ones.
- **Dialog browser** (and everything else that reads installed mods' rules) shows the texts of
  mods with translatable dialog, read from their `data/sagaforge/text.json`, as SagaLib does.
- **Check mod** now also runs the FireBest takeover check (it was only in the Export dialog).
- **Quests › Rules** no longer overflows into the right panel.
- **Header**: with two installs the target pill no longer covers **+ New mod**; it shows just the
  version (and *Target* in front on wide windows).
- **Items / People**: the existing (read-only) lists leave out the active mod's own exported ones.
- **Fleets › Fleet type names**: *Game's name* is what the game calls the type without this mod.
- **Branch node** help: when several cases match, the one with the most conditions wins (FireBest).
- **Saga board**: flag arrows have their own handles and labels drawn above the cards, so they no
  longer lie on a prerequisite arrow between the same cards.
- Internal labels ("Phase 7a", "M5", "R29") removed from tooltips and help.
- Screenshot mode: `stages` opens the stage form, `rules` shows the Rules view, `node=` zooms to
  the node, `saga:<item>:<tab>` selects an item in a Saga panel.
- **Vanguard Compact** example 1.0.1: Kestrel moved to (-5800, -7600), at least 3,400 units from every
  vanilla system (it was 2,921 from Duzahk).

## 1.1.0 (2026-11-17)

For Starsector **0.98a and 0.98.5a**. Needs **SagaLib 1.2** in game. The workflow work of task #36
(phases 0–8, `docs/WORK-ORDER.md`), each step tested in game on 0.98.5a (`docs/INGAME-CHECKS.md`).
The forum post draft of Mark as released is switched off for now (post templates come later).

### Starsector 0.98.5a support

- **Every rules file is read.** The game index follows the `settings.json` `"rules"` list of
  0.98.5a (vanilla's Diktat storyline is in `rules/askoniaCrisis2.csv`, 5,510 rules), in every
  installed mod, so id clash checks, Play mode, the Dialog browser and the flags registry see
  them. 0.98a installs still use `rules.csv` only.
- **Game version from the game itself.** The version is read from `starfarer_obf.jar`, so a fresh
  install without a `starsector.log` is recognized. New mods get it as their `gameVersion`.
- **0.98.5a definitions**: the new rule commands (`PersonCMD`, `HasContactFromFaction`,
  `MarketHasIndustry`, `ShowPlayerPerson`, …), the changed ones (`RepIsAtWorst` with one argument
  or a person, `SetPersonHidden`, `MovePersonToMarket`), new ranks, posts, code people, triggers
  and the `$PersonFirstName` / `$PersonLastName` tokens.
- **Player faction**: "New-game portraits" fields (`player_male` / `player_female`) for 0.98.5a.
- **Locations**: an "Asteroid base" entity when the game has the `asteroid_base` type (0.98.5a).
- Play mode: `RepGTE` / `RepLTE` take a reputation level, like the game (they compared a number
  before).
- **Quest icon**: quest settings have an **Icon** field with **Pick…** (64×64 PNG, copied to
  `graphics/icons/missions/<quest id>.png`). Empty still means vanilla's `data_retrieval.png`.
- **Fix**: new special items pointed at `graphics/icons/cargo/special_tech.png`, which doesn't
  exist in the game. They now start with vanilla's `chip1.png`. **Check mod** reports item and
  quest icons whose file isn't in the mod, the game or an installed mod.
- The Faction form's Crest hint says 256×256 (all vanilla crests are), not 128×128. The Vanguard
  Compact example's crest is now 256×256.
- The quest icon, default item icon and new crest are not checked in game yet (INGAME-CHECKS.md,
  "Untested: left for the workflow test mod").

### Workflow updates (task #36)

- **Every form field has a visible label and a short help line** saying what it is and where it
  shows in game: the stage form (id, title, journal text, next-step line, map marker, kind, old
  ids), quest settings, every node type, Dialog nodes (options, displays), factions (every tab,
  including Behavior), people (the post help says whether they take over vanilla's staff post and
  can offer a commission), items, locations, encounters, test profiles, New mod / prefix and
  Export. Placeholders are only examples now.
- **Protect this wreck** (Locations, on a derelict, and as the fix for the Problems warning): adds
  a short conversation at the wreck ("Leave" only) until a chosen quest succeeds, so vanilla's
  salvage and ship recovery can't remove a wreck a quest needs. The quests' own arrival steps
  still win.
- **Back to the menu** is a Link mode and the default for new Link nodes: `SF_BackToMenu` with
  SagaLib (it closes the dialog at a wreck or other place without a menu), `FireAll
  PopulateOptions` without. A Link that fires `PopulateOptions` itself gets a hint with a one-click
  fix, and a warning when the conversation that reaches it was opened somewhere without a menu (an
  arrival at a wreck, after a battle). Plan files using the new mode need this version.
- **Where a quest's fleet waits**: the encounter's Spawn › At field offers the places the spawning
  quest sends the player, and an ambush or guard fleet waiting in another system than all of them
  gets a warning with a "Spawn at …" fix.
- **Mod version in Export**: the Export dialog's **Mod version** field writes `mod_info.json`'s
  version (no hand edit before an update), warns when the version is already marked as released,
  and fills in Mark as released.
- A person's market stays in step in both places: People › Placement and the market's people list
  on Locations (SagaLib reads both and only logged a warning when they disagreed). A mismatch made
  by hand is a warning.
- The stage form's map marker and the Arrive node's place are pickers (the mod's entities and
  markets, the game's markets, people) instead of bare text. Variables have column labels.
- Problem fixes can be applied from the quest page's Problems tab and the Encounters page too.
- The bar start's "Market tags" was the bar event's own tags column: renamed "Event tags".

### Work list, Phase 0 (task #36, 2026-11-15; `docs/WORK-ORDER.md`)

- **Fix**: Export stopped with "Only plan files … can be removed" after you deleted a quest,
  person, system or encounter that had been exported. The writer may now remove the active mod's
  own generated SagaLib files (`data/sagaforge/`, `data/config/sagaforge/`), still through the
  write guard and with a backup.
- **Items › Plugin** lists the game's 13 special-item plugin classes with what each is for, and
  Plugin params says what the chosen class expects. Your own class can still be typed (a
  warning, since the mod must contain it); a short class name is an error.
- **Encounters › Fleet type** accepts any id, not only vanilla's: a fleet type of your own is
  named from its faction's `fleetTypeNames`.
- **Quest starts**: contact missions can be offered by any contact with matching tags (Tags all /
  any / none of, no named person), and can be marked priority or not repeatable. Contact timeouts
  and the bar event's duration and timeouts can be set (they were fixed at vanilla's values,
  which stay the defaults).
- The system view puts a moon's or station's name on the side away from its planet, so the
  names no longer overlap.
- Screenshot mode (`scripts/smoke.mjs`) can open dialogs and panels: a fourth part
  `page:id:arg:modal` (`new`, `change`, `export`, `settings`, `newmod`, `stages`, `nodemenu`,
  `stagerename`, `opt=<id>`, `displays`, …), `entity=<id>` on Locations, a tab on the Saga page,
  a search on the Dialog page.
- Fix: an encounter spawned by an Action ("Spawn an encounter", e.g. an escort that isn't fought)
  was reported as "no quest spawns it".
- The Relations tab keeps its columns still while a slider is dragged.

### Work list, Phase 1 (task #36, 2026-11-15; `docs/DESIGN-PHASE1.md`)

- **Set later**: fields that refer to something made later (a person's market, a quest's
  contact, a stage's map marker, an icon, …) have a "later" button. The mark (with an optional
  note) is kept in the plan files, listed under a new **To do** level in Problems (✎ count in the
  header), and quiets the field's "missing" check. It clears when the field changes. Export
  lists to-dos; **Mark as released** refuses while any remain.
- **Inactive** people, quests and conversations (a checkbox in the People header and Quest
  settings): left out of Export (files exported before are removed), problems inside them are
  only warnings, and they show greyed with "[Inactive]" and a filter. A contact quest whose
  contact is inactive is inactive too. Using an inactive person in active content, or starting an
  inactive quest, is an error. Making released content inactive gives a save warning.
- **Images page**: the mod's images by kind (flags, crests, portraits, item icons, mission icons,
  illustrations) with thumbnails and sizes; images at the wrong size are a Check mod warning.
  **Import…** takes files or a whole folder, lets you crop each one to the right shape, resizes it
  to vanilla's size, saves it as PNG named with the mod's prefix in the right folder, and asks
  before replacing a file. Illustrations are registered at once.
- **Image picker with previews** behind every image field (faction flag, crest and portrait lists,
  a person's portrait, item icons, the new quest icon, illustrations): thumbnails of the mod's,
  vanilla's and other mods' images, marked by source, with a filter and Import…. Portrait lists
  take several portraits at once and show thumbnails on their chips. The old "Pick…" buttons are
  now "Choose…".
- **Reference pages**: an ⓘ next to People's Rank, Post, Voice, Personality, Contact type and
  Importance opens a reference window at that list, generated from the game's definitions (staff
  posts marked, how many vanilla rules check each voice).

### Work list, Phase 2 (task #36, 2026-11-15; `docs/DESIGN-PHASE2.md`)

- **Name lists** (Factions page, new sidebar section): the mod's own people's names (first names
  for men, women or anyone, and last names) and ship name lists, one name per line. Export writes
  them to the mod's `data/characters/person_names.csv` (an owned block) and
  `data/strings/ship_names.json` (merged by key; hand-written lists are kept). Saved in
  `sagaforge/names.json`.
- A faction's **Person name sets** and **Ship name sources** suggest every name category and list
  of the game, the installed mods and the mod itself, with how many names each has. Problems warns
  when a category lacks first or last names for a gender (the game borrows a random category), and
  when a faction uses a set nobody has.
- **Fleet type names** field on Names & ranks (`fleetTypeNames`), suggesting vanilla's types with
  the game's default names, and your encounters' own fleet types.
- **Behavior** tab: Posts no bounties, Makes pirate bases (and their station types), and Punitive
  expeditions with their four reasons.
- **Other keys**: an "Add a key" list of the keys vanilla's factions use, most used first, each
  with what it does and a vanilla value to start from. Existing keys show their description. A new
  reference section lists them all (and the fleet types).

### Work list, Phase 3 (task #36, 2026-11-15; `docs/DESIGN-PHASE3.md`)

- **Vanilla systems on the map**: click a system on the hyperspace map to see it, read from the
  game's own Java source (23 vanilla systems, and mods that ship theirs). It is read-only, with
  "Add to this system". Additions draw on top of the system's bodies and can orbit them.
- **Pictures of types**: the inspector shows a planet's texture or a station's sprite, and types
  are chosen in a picture grid with filters (gas giants, habitable, … / stations, relays,
  salvageable, …). Stars come from the game files and mods instead of a fixed list.
- **"Fits here"**: planet types are sorted by how likely vanilla's random generation is to put
  them at the planet's orbit of its star (an estimate from the procgen tables).
- **Resize handles** in the system view: a planet's size, a belt's or ring's width, the star's
  size and corona. Shift-drag a body to change its distance too.
- **The mod's own types**: stations and other objects with your own sprite (behaving like a
  vanilla type), and planet and star types with your own texture (based on a vanilla type).
  Export merges them into the mod's `custom_entities.json` and `planets.json`. New image kinds on
  the Images page: station sprite (160×160), map icon (64×64), planet texture (1024×512).

### Work list, Phase 4: SagaLib 1.1 (task #36, 2026-11-15; `docs/DESIGN-PHASE4.md`)

These need SagaLib 1.1. When a mod uses any of them, Export writes
`"version": "1.1.0"` on its SagaLib dependency.

- **Systems without a star**: an empty centre with a light colour.
- **Objects that appear during a quest**: when a quest reaches a stage, or when an Action places
  them; optionally in another object's place. They are drawn faded in the system view.
- **Objects removed during a quest**: any object, vanilla's too, at a stage or from an Action.
  Guardrails: SagaLib checks the object exists, and removes one with a colony only when told to
  decivilize (with a confirmation in the editor). Problems names what in the mod still points at
  it.
- **Uncolonised planets** can list their conditions (ruins, resources, hazards) and how surveyed
  they are.
- **Encounters that spawn when the player comes near**: with a range, or anywhere in the system;
  optionally only during a quest stage.
- Check mod verifies the columns of the mod's own salvage tables (`drop_groups.csv`,
  `salvage_entity_gen_data.csv`).
- **Arrivals without taking over** (RC-F2):
  - An Arrive node is now an **option in the place's own menu**, so vanilla's menu (trade,
    salvage, planet info) stays. "Takes over the arrival" is an opt-in for scenes that must
    interrupt; at a place protected by a wreck lock it is always a takeover.
  - The place stands out on the map while the quest waits there.
- **Interjections**: a quest start that cuts in before an existing option (e.g. Explore at a
  derelict), with a chance and a once-limit, and a "Hand back" Link preset. Check mod reports
  interjections as such, and a path that doesn't hand back is an error.

### Work list, Phase 5: fleets (task #36, 2026-11-15; `docs/DESIGN-PHASE5.md`)

- New **Fleets** page:
  - **Named fleets**: ships with their own names, a flagship and a captain from the mod's
    people. Encounters reuse them (Ships › a named fleet), and the fleet is the same every time
    it spawns.
  - **Fleet type names** for every faction.
  - A **doctrine preview** for the mod's factions: their fleet mix, ship sizes (vanilla's
    numbers) and quality trade-off.
- Named fleets are trackable: SagaLib counts their defeats for quest conditions. A captain
  survives a defeat unless the fleet is set to "the captain dies".
- New Action step **Remove a person**: writes one of the mod's people out of the story for good.
- These need SagaLib 1.1, and Export says so in the dependency.

### Work list, Phase 6: writing (task #36, 2026-11-15; `docs/DESIGN-PHASE6.md`)

- Quests › **Script** tab: the whole quest as a screenplay, in the order the player meets it,
  with **Copy as Markdown** for a proofreader or co-writer.
- **Spellcheck** in every text field. Right-click a word for suggestions or to add it to the
  mod's word list (saved in `sagaforge/project.json`).
- The **punctuation checks** (Style level) now cover every text the player sees, not only
  dialog: options, arrival texts, offers, journal lines, phrases and descriptions.
- **New quest › Start from** a template: delivery, bounty, investigate a place, rescue, or a
  talk-to-someone chain. What still needs filling in shows up as to-dos in Problems.
- **Save as template…** (Quest settings) keeps any quest as a template for later quests and other
  mods.
- Fixed: Problems › **Ignore** and Play mode's **Copy to a test profile** did nothing, because
  Electron has no `prompt()`. They now ask in a small dialog.

### Workflow walk fixes (task #36 checkpoint, 2026-11-15; INGAME-CHECKS F17–F26)

- Fixed: adding a reputation or item to a quest reward did nothing; the same for a test profile's
  cargo, "Removed during quests", a fleet's variants and a scripted faction removal.
- Fixed: editing a stage in the quest outline folded its form shut.
- New: an Arrive at a market's id (which never fires in game) is an error, with a fix that names the
  station.
- New mod chooses the mods folder itself on a first start; dialogs close with Escape.
- New factions use vanilla flag and crest files that exist, and a ship prefix made from the name.
- The Encounter node can create its encounter (**+ New…**), and the Stage node a new stage.
- New Stage and Arrive nodes start with sensible values; a Note dragged from a handle no longer
  takes over its link; new options get ids from their text.
- An object's id follows its name until the mod is released, and Locations has **Change id…**:
  everything in the mod that uses the object follows (markers, arrivals, conditions, spawns…).
- The system view fits its bodies and opens when you add one; new planets and stations get
  vanilla-like orbits.
- An unknown id in a faction's ship, weapon or item lists shows in red right where it was typed.
- New quest nodes come into view; the inspector starts at the top; Problems lists errors first.
- Relations can be typed exactly; the flag and crest pickers keep flags and crests apart; Import…
  in a picker goes straight to the file dialog; factions with the same name show their ids.

### Forum post draft greyed out (2026-11-17)

- Mark as released packs the zip only; the forum post fields in Release details are disabled with
  a note. Forum posts come back later as post templates (your own layout, filled in by Saga Forge).

### Work list, Phase 8e: AI conversion guide (R12, task #36, 2026-11-17)

- **docs/AI-CONVERSION.md**: how an AI assistant converts an existing mod into Saga Forge plans:
  licence and copy first, the plan files, keeping save ids, mapping vanilla API calls and data
  files to plans (systems, people, items, quests, fleets, dialog, loot, events), the list of what
  stays in code (sagaforge/UNCONVERTED.md), checking in Saga Forge and in game, the report.

### Work list, Phase 8d-3: progress events (RC-R12 b, task #36, 2026-11-17)

- **Saga › Progress**: the mod's own event bar in the intel screen, like vanilla's colony crises:
  start conditions, a maximum, a red bar for bad events, stages at progress values (title, text,
  icon) that run actions or one random outcome's, monthly factors (points while conditions hold),
  and after the last stage: end, or start over. Needs SagaLib 1.2.
- **Add progress**, a new action in quests, world events and stages: one-time points with a text.
- Checks: stages out of order or past the maximum, a bad "starts over at", outcomes all weight 0,
  a bar that nothing moves, an "Add progress" naming no event. Texts are translatable; the flags
  registry knows $global.<event>_stage and the outcome keys.

### Work list, Phase 8d-2: roaming fleets (RC-R14, task #36, 2026-11-17)

- Encounters › When › **roaming between two places**: the fleet travels from "At" to another place
  on vanilla's routes (a new one every N days on average, at most N on the way, a stay, optionally
  back), a real fleet only near the player, like vanilla's traders. Needs SagaLib 1.2. Checks: no
  destination, no interval, the same place, a start without a market (info).

### Work list, Phase 8d-1: world events (RC-R12 a, task #36, 2026-11-17; `docs/DESIGN-PHASE8.md`)

- **Saga › Events**: event schedulers that keep some events running and start new ones every few
  days without the player starting them (like vanilla's bounties and hostilities). An event has a
  weight, conditions, once / cooldown / at most N times, a duration (`$global.<event>_active` while
  it runs), actions when it starts and ends (flags, reputation, credits, items, spawn and despawn
  an encounter, place or remove an object, start a quest, a script line) and an optional news
  item (title, text, intel tab, place on the map, days shown). Needs SagaLib 1.2.
- Checks: min above max, no interval, a pool with the same id, unknown encounters and quests, a
  spawned fleet never removed. The flags registry knows each event's flag; news items are
  translatable. Research on vanilla's and installed mods' events is in FORMATS.md.
- Test mod **`eight_d`**.

### Work list, Phase 8c: translations (R31, task #36, 2026-11-16; `docs/DESIGN-PHASE8.md`)

- **Anyone can translate a mod made with Saga Forge, without copying it**: "+ Translation" (next
  to "+ New mod") picks an installed mod and a language and creates a small translation mod (one
  CSV, needs the mod and SagaLib 1.2). Its **Translation** page lists every text the player reads
  with where it shows, next to the translation: To do, Done, and "Original changed" (stale lines
  keep their text until checked), with warnings for left-out tokens, overlong labels and lost
  paragraphs. The CSV also opens in a spreadsheet.
- **Translatable texts** (Export, on by default with SagaLib): rules.csv holds tokens
  (`$sft-<rule>-<part>-`) and the texts go into `data/sagaforge/text.json`, with item names,
  descriptions and faction names. Such mods need SagaLib 1.2. Switch it off in the Export dialog for
  plain text.
- Test mods **`eight_c`** and **`eight_c_xx`**.

### Work list, Phase 8b: release packaging (R32, task #36, 2026-11-16)

- **Mark as released** also packs **`[0.98a] Mod name 1.1.0.zip`** (one folder named after the
  mod; without `sagaforge/`, the dev-mode test profiles, hidden and temporary files) and a
  **forum post draft** (BBCode, in the order of the forum post rules, with [WRITE: …] parts) into
  the **releases folder**: Saga Forge's data folder › `releases`, or one chosen in Settings
  (never inside a mod or a Starsector folder). It refuses a version the mod wasn't exported with.
- **Release details** in the Export dialog: Version Checker address, download link, forum
  thread, project page, status, catch line, author note, AI use, license. With a Version
  Checker address, Export writes `<mod id>.version` and lists it in `version_files.csv`.

### Work list, Phase 8a: loot groups (task #36, 2026-11-16; `docs/DESIGN-PHASE8.md`)

- A loot table can **add to an existing drop group** (Saga › Pools › Adds to: vanilla's
  `rare_tech`, `ai_cores2`, `blueprints`, … or another mod's): its items are written as rows of
  that group, vanilla's own items stay (checked in game). Warnings for an item the group already
  has, a "nothing" share (left out: it would change vanilla's odds) and an unknown group.
- Quest rewards can give **random items from a drop group** (rolls, or a value in credits), rolled
  by vanilla's salvage roller in game (SagaLib 1.2).
- Every drop group of the game and the installed mods is now known to the editor, and offered
  wherever loot is chosen (Locations, Scatter, rewards).
- Test mods **`eight_a`** and **`eight_a_twin`**.

### Work list, Phase 7e: loot, random encounters, scatter (task #36, 2026-11-16)

- A pool can be **a loot table**: the mod's own drop group (drop_groups.csv, no SagaLib); entries
  are commodities, special items, weapons or fighter wings, with vanilla's weights.
- Locations › an entity › **Salvage**: loot (drop groups: the mod's or vanilla's) and
  **defenders** (faction, strength, chance). SagaLib 1.2.
- A pool can be **random encounters**: the mod's encounters appear at vanilla's encounter points
  (in slipstreams, outside star systems), through vanilla's own encounter manager, with a
  frequency against vanilla's pirates and scavengers. SagaLib 1.2.
- Saga › **Scatter**: copies of a cache, probe or other object placed at new game (optionally in
  existing saves) in places picked like a random target, each in a different system, with loot
  and defenders. SagaLib 1.2.
- A colony can be marked **Never decivilises**; SagaLib remembers every colony that does
  (`$global.sagaforge_deciv_<market>`, in the condition menu).
- Checks for unknown loot, encounter pools with wrong entries, loot pools in Random branches,
  salvage on a colony, unknown scatter object types, criteria that don't fit.
- A ruins planet can be marked **Ruins stay unexplored** (Locations): vanilla marks ruins in a
  system with a colony explored at new game; SagaLib 1.2 puts them back.
- The target dialog has **+ Avoid dangerous systems** (no theme_unsafe or active Remnant systems).
- New warning (dismissable): a new system outside the sector's normal area (settings.json
  sectorWidth / sectorHeight). Allowed: modders hide secret places in the dark beyond the map.
- Test mod **`grid_test`**: 459 systems over the top-left quarter of the sector, made as the
  editor makes them.
- New warning: a new system closer than 3,000 units to another (the game's, another mod's with a
  known position, or the mod's own) in hyperspace; vanilla keeps its own at least 3,065 apart.
  Found in game: Test Range E sat on Mayasura. The test ranges moved to clear space.
- SagaLib 1.2 now clears hyperspace's storm clouds around the mod's new systems, as vanilla does
  for its own (reported by a modder watching the tests).
- After the first in-game tests (2026-11-16): the bar-scene and interjection chance is explained
  as vanilla's (per place and per month, not per visit) and the bar's limit of 3 scenes per visit;
  a warning for ruins on a planet in a system with a colony (vanilla marks them explored at new
  game); SagaLib 1.2: a quest fleet that is beaten but not destroyed breaks off and leaves instead
  of chasing the player.
- After review (user, 2026-11-16): an Arrive at what was spawned at a target or at an entity pick
  takes over the arrival by default; a warning for a start option or a menu-option Arrive at a
  wreck (a wreck's salvage dialog shows no menu options); a scatter can be **Measured from** a
  place instead of the player.
- Test mod **`seven_e`**. Deferred: salvage specials, adding to vanilla's drop groups, roaming
  fleets (DESIGN-PHASE7 questions 12–13).

### Work list, Phase 7d: at the random target (task #36, 2026-11-16)

- **What the target is like**: SagaLib 1.2 stores details of every pick (decivilised, ruins and
  their size, colonised, gas giant, ruins/derelict/Remnant/misc system, black hole, pulsar, nebula,
  hostile, unexplored, faction id). Branch cases offer them; the target dialog sets their mock
  values for Play.
- **A person there**: a target can come with someone at its colony (a portmaster, a supply
  officer, …, or a new person who leaves when the quest ends). Markers and Arrive nodes can point
  at them (talking to them).
- Action **Spawn at the random target**: a supply cache, probe or other custom entity, or a
  derelict ship, placed near the target with vanilla's mission spawning and removed when the
  quest ends. Markers and Arrive nodes can point at it.
- An encounter can spawn at a quest's random target.
- Checks: a person on a system pick, places at a person or spawn that isn't set up, Spawn actions
  naming unknown targets, and an Arrive at a spawned cache or an entity target that doesn't take
  over the arrival (their salvage dialog shows no menu options).
- Test mod **`seven_d`**.

### Work list, Phase 7c: random targets (task #36, 2026-11-16)

- A quest variable can be a **random target**: SagaLib 1.2 picks a planet, entity, star system or
  market with vanilla's own mission search when the quest is offered (or starts). **Must** and
  **Prefer** (in order, each dropped when nothing would be left) from 56 of vanilla's criteria:
  distance from the giver, unexplored, ruins, conditions, tags, faction, size, military base, …
  Nothing found: the quest isn't offered then.
- The pick's name, system, distance and faction are text tokens (`$global.<quest>_<var>_name`
  …). Stage map markers and Arrive places can be the target (**random target** in their lists).
- Play mode and the preview use each target's **mock** (editable facts).
- The flags registry knows that SagaLib sets a target and its facts.
- Checks: criteria that don't fit the pick (vanilla's market search ignores system criteria),
  empty lists, criteria vanilla can only require, places naming an unknown target, targets in a
  conversation-only quest; Info lines say when the search runs.
- Test mod **`seven_c`**: a planet, a market, a system and an impossible target.

### Work list, Phase 7b: raids, bar scenes, place presets (task #36, 2026-11-16)

No SagaLib change: everything here is vanilla rules.

- **Raid** node: a ground raid on the place in the dialog, the way vanilla's own story raids
  work. A briefing, then vanilla's raid menu with one objective (name, danger, defenders,
  experience, icon, tooltip) and a text shown during the raid. Outputs **Raid done** (after
  vanilla's result screens) and **Backed out**. Play mode asks how the raid went.
- New start **a bar scene (no mission)**: an option and a blurb line in a colony's bar, with
  conditions, a chance (per month, as vanilla's RollProbability) and a once-limit (per playthrough or per colony). Link › **back
  to the bar** ends it; in a bar scene, "back to the menu" and loose ends go back to the bar.
  Play mode shows the bar's line and option. Checks for a missing option or blurb and for a scene
  that would be in every bar on every visit.
- Test context › **Place**: colony menu, colony bar, uncolonised planet, planet with vast ruins
  (unexplored or explored), decivilised world, derelict. Each sets what vanilla's rules test
  there, so the preview and Play show vanilla's own options (e.g. "Explore the ruins") next to
  yours. **Place id** is `$id` when no one is spoken to.
- Test mod **`seven_b`**: a raid, two bar scenes and a ruins planet at "Test Range B".
- Fixed: the chart's Start node said "started by another quest" for an interjection start.

### Work list, Phase 7a: random pools (task #36, 2026-11-16; `docs/DESIGN-PHASE7.md`)

- **Branch › Picks: at random**: one case is picked by weight, like a dice roll. Each case shows
  its chance (also on the chart); limits: once per playthrough or per place / person, cooldown
  days, at most N times; conditions say when a case may be picked; "otherwise" is the nothing
  share. Rolled for the place or person in the dialog (the same result after a reload) or for the
  world.
- **Saga › Pools**: named pools a Random branch can roll (loot and encounters use them later).
- **Play mode** rolls exactly what the game rolls (Java's random numbers, ported), and **Next
  pick** forces a case to try each way. The Script tab shows the chances.
- These need **SagaLib 1.2**; Export writes the pools and the dependency.
- Fixed: an option id used in two dialogs of a quest gave two rules the same id. Option ids are
  now unique across the quest, and an old duplicate is an error.
- A test profile's **Start at** now also works mid-game from SagaLib's Ctrl+F9 dev menu (SagaLib
  1.2), so a profile can take the player to a test area.
- Test mod **`seven_a`** (`npx jiti scripts/build-test-mod.ts seven_a`): the 7a in-game checks at
  "Test Range A", with profiles that go there and force picks. Each Phase 7 step gets one.

### 0.98.5a in game (task #48, 2026-11-15)

- `vanguard_by_hand` migrated to 0.98.5a in the editor and played on a new 0.98.5a game; the
  0.98.5a rule-file facts are confirmed in game (FORMATS.md, "Rule file list").
- New warning: an option, start option or arrival option whose text has a ":". The game cuts the
  label there (it splits options at every colon). The dialog preview now cuts it the same way.
- The migration page says the game version is changed by the export; the export's closing note
  names the targeted install's mods folder; the empty Dialog page's hint reads as one sentence.

### Game versions (task #47, 2026-11-15; `docs/TARGET-VERSION-ASSESSMENT.md`)

- **Migration install** (Settings, optional): a second Starsector install, only for moving a mod
  to another game version. Neither install is ever written to.
- **Target per mod**: a pill in the header (and a choice in Settings) picks which install the
  active mod targets. Its game data, mods and rules are loaded, and Export writes its version as
  `mod_info.json`'s `gameVersion`. The choice is remembered in the mod's `sagaforge/project.json`.
- **Version labels** in every id field: "0.98.5a only", "removed in 0.98.5a" (only with two
  installs).
- **Version errors**: with the older version targeted, anything only the newer one has (ids,
  commands, command forms, tokens, the new player portrait lists) is an error that blocks Export,
  with **Pick a replacement…**, **Remove** and **Target … instead**.
- **Migration**: a mod made for an older version shows a banner. The migration dialog offers a
  snapshot (kept in `sagaforge/backups`, never pruned) and lists what must change (with safe fixes
  in one undo step), behaviour to check (with Reviewed ticks), and what is new. It ends with
  **Export for …** and an in-game test list. With only one install, the built-in definitions of
  both versions are compared.
- Screenshot mode: `--migration <install> [--target migration]`.

## 1.0.0 (2026-11-11)

First release, for Starsector 0.98a. Needs SagaLib 1.0 in game for quests, people, systems and
encounters; factions, dialog-only conversations and items work without it.

**Pages**
- **Saga**: every quest as a card with prerequisite and flag arrows, a timeline, the flags
  registry (who sets and reads every memory key, typo hints), test profiles, mod-wide phrases.
- **Factions**: new factions with a full editor, and changes to existing factions written as
  patches only (vanilla's values, other mods' additions and yours shown side by side).
- **People**: characters with portrait, rank, post, placement, contact settings and phrases.
- **Items**: commodities and special items with presets (quest item), icons and descriptions.
- **Quests**: a node flow chart (Dialog, Branch, Action, Stage, Encounter, Wait/Arrive, End,
  Link, Note), a dialog preview drawn with the game's own fonts, Play mode with test profiles,
  and the exported `rules.csv` rows.
- **Locations**: new star systems on a hyperspace map with the vanilla systems; planets,
  stations, belts, jump points, relays, markets; additions to existing systems.
- **Encounters**: fleets, spawning, behavior, a comm dialog scoped to the fleet, and quest
  outcomes.
- **Dialog**: a browser for every `rules.csv` row of the game and installed mods.
- **Problems** and **Check mod**: live checks, id collisions with every installed mod, FireBest
  takeovers of vanilla dialog.

**Saving and exporting**
- Writes only into the active mod, through a write guard: never the game folder, other mods,
  code, or a file changed on disk since it was read.
- Generated rows go into owned blocks in `rules.csv` and the CSVs; hand-written rows are kept.
  A block edited by hand stops the export (Show diff / Overwrite / Detach). Backups of the last
  10 exports.
- **Mark as released** stores the ids saves depend on; save warnings flag changes that would
  break a player's save, and renamed stages keep an alias so saves move along.

**Example**: Vanguard Compact (`example/VanguardCompact`, MIT), the acceptance test. All 12
steps of its walkthrough passed in game, including an update with a renamed stage that kept a
save's progress.

**Known limits**
- Linux is supported (run from source, or build the AppImage) but not tested yet.
- The Windows zip is not code-signed and uses the default Electron icon.
- Many editor fields have only placeholders, no labels or help yet.
