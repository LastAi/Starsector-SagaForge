# Saga Forge — project plan

Status: **built — Saga Forge 1.0 and SagaLib 1.0** (2026-11-11). Milestones M0–M8 are done
and the acceptance walkthrough passed in game (`docs/INGAME-CHECKS.md`); the Linux test is on hold
until a Linux tester is found. Where the build differs from this plan, `docs/FORMATS.md` and SagaLib's
`docs/FORMAT.md` are the reference. The plan itself was final on 2026-11-10. All open
questions are decided (§9). Facts marked **(verify)** are not open questions: they are checks
that milestone 0 runs in game, with a fallback written next to each, so none of them blocks
building. Everything else was checked against the 0.98a files in `D:\Starsector` or against how
Ship Editor already works.

How it got here: draft 2 answered Q1–Q4 (copy the shared code; a companion **runtime library
mod** that reads JSON instead of generated Java, §3.1; save safety through stable ids and flags,
§6). Draft 3 added the library's license, optional mod support, how quests start in vanilla and
the two-layer stage design (§3.2), and cross-mod support (§10). The final version adds the
answers to Q5–Q11 and the app license, and the changes that came out of the mock-ups: the Dialog
node now holds its options (no separate Choice node, §4.4), problem levels (§6), the Export
preview, faction runtime data, and the example mod used as the 1.0 acceptance test (§1, §8).
Amended the same day: a **People page** (§4.2) and **phrases** for conditional text (§4.3),
Q18–Q19; then an **Items page** (§4.7), the **Saga overview** (§4.8), **dialog displays** (§4.9),
**test profiles** (§4.10), a random-targets stub, and §11 recording the after-1.0 intent,
Q20–Q26; and **show-once options** (§4.3), Q27.

The pitch and a walkthrough of every main flow are in [PITCH.md](PITCH.md); static screen
mock-ups of the main pages are in [mockups/](mockups/index.html) (rendered to `mockups/img/` by
`scripts/capture-mockups.cjs`).

Contents

1. Scope
2. Tech stack, with reasons
3. Architecture
4. Data model
5. The quest planning page
6. Reading and writing mod files without breaking other mods
7. Milestones
8. Testing
9. Decisions (formerly open questions; none left open)
10. Cross-mod support
11. After 1.0: long-term intent

---

## 1. Scope

Saga Forge is a desktop editor for the **campaign** side of a Starsector mod: who is in the
sector (factions), where they are (locations), what the player can do there (quests, dialog,
encounters). Ship Editor already covers ships; Saga Forge works alongside it and never edits
hulls, variants or weapons. It only lists them, so you can pick them, for example for a
faction's known ships.

### In scope (1.0)

| Area | What you can do |
|---|---|
| **Saga overview** | Every quest and conversation of the mod as a card: how it starts, its prerequisites (other quests' endings, flags), and the flags it sets and reads, drawn as links. A **flags registry** lists every memory key the mod uses, who sets it and who reads it, and catches typos (§4.8). |
| **Factions** | Create new factions (the `.faction` file, the `factions.csv` row, logo and crest, colors, names, ranks, known ships/fighters/weapons, doctrine, starting relations). Add to or change **existing** factions (vanilla or another mod) with a partial override that the game merges, never with a full copy. |
| **People** | The mod's characters on their own page: name, gender, portrait, faction, rank, post, voice, placement (at a market, commanding a fleet, or nowhere until a quest spawns them), contact settings, and **phrases**: text that changes with the situation, such as how they address the player (§4.3). Existing characters (vanilla or another mod) are listed separately and read-only. |
| **Items** | New quest items and other cargo: commodities (`commodities.csv`) and special items (`special_items.csv`, with vanilla's generic item plugin), with icon, price, tags and description. Existing items are read-only but can be used anywhere (§4.7). |
| **Descriptions** | A Description tab on every faction, item, planet, station and custom entity the mod creates, written to `descriptions.csv`. |
| **Dialog** | Branching conversations written as `data/campaign/rules.csv` rows: text, options, conditions, script commands, and **displays**: everything the game's dialog can show (illustrations, several people, planets, fleets, gained items and ships, reputation changes, faction callouts, costs; §4.9). Browse every rule in the game and the installed mods as a graph. |
| **Quests** | Plan branching quests as a flow chart, see how each step looks in game, and play it through. Export to `rules.csv` dialog plus a quest JSON file that the runtime library (§3.1) runs as a vanilla `HubMission`, offered through `person_missions.csv` or `bar_events.csv`. |
| **Locations** | New star systems (star, planets, stations, jump points, asteroid belts, rings, nebulae, markets with industries and conditions). Adding entities to existing systems. Placement on a hyperspace map that shows vanilla systems (`data/campaign/starmap.json`). |
| **Encounters** | Fleets (faction, size, doctrine or exact variants, behavior) spawned by a quest stage or at a location, with their comm-link dialog. Interactions with custom entities (derelicts, beacons, stations) driven by `OpenInteractionDialog` rules. |
| **Checks** | Live problems, plus **Check the active mod**: unknown ids, id collisions with the game and every installed mod, rules that can never fire or that take over vanilla menus, missing images, missing dependencies. |
| **Testing** | **Test profiles**: saved game situations (quest steps, flags, variables, reputation, commission, credits, cargo, start location). The same profile drives Play mode and, through SagaLib in the game's dev mode, a real game: applied at new game or from a dev menu at any time, with the mod's JSON reloaded from disk without restarting (§4.10). |

### Out of scope for 1.0 (possible later)

- Combat missions (`data/missions`), ship and weapon editing (Ship Editor does that).
- Arbitrary Java. Exported mods ship JSON, not code. For logic the JSON can't express, a quest
  can name a hook class from the mod's own jar (§3.1), but the editor doesn't write or edit Java.
- Nexerelin / other mods' config formats (`exerelinFactionConfig`, etc.). These are a good fit
  for **extensions**, using the same model as Ship Editor's extensions (`docs/extensions.md`
  there). Planned as an extension point, not built.
- Changing vanilla quests' Java behavior (forbidden by the project rules anyway; we only *add*
  rules around them).
- Everything in §11 (writing tools, quest templates, world events, translation export, adopting
  hand-written dialog, release packaging, mod compatibility work). §11 records the intent so it
  isn't lost.

### What "done" looks like for 1.0

A modder can create a faction, give it a system with a market and a contact, write a two-stage
quest with a branching conversation and a fleet encounter, press **Export**, launch the game and
play it, all without opening a text editor, with the mod still loading cleanly next to the
installed mods.

Concretely, this is the **Vanguard Compact** example from [PITCH.md](PITCH.md) and the
mock-ups: a new faction plus a Hegemony override, the Kestrel system with Haven Station and the
contact Ilse Reyes, the quest *The Lost Convoy* with a story-point option and the Belt ambush
encounter, exported and played in game, then updated to a second version with a renamed stage
and a save that keeps its progress. The example mod is built in `D:\ModTools\mods` during M8 and
kept as the acceptance test (§8).

---

## 2. Tech stack, with reasons

Same stack as Ship Editor, on purpose:

| Choice | Why |
|---|---|
| **Electron + electron-vite** | Desktop app with direct file access on Windows and Linux. Same build and packaging (`electron-builder`, portable zip / AppImage, `data` folder next to the exe) as Ship Editor, so both tools install and behave the same way. |
| **Svelte 5 + TypeScript** | Same as Ship Editor. Same look, and its components (`Splitter`, `FieldInput`, `FormDialog`, `SettingsDialog`, `CreateModForm`, `styles.css`) and the undo history (`history.svelte.ts`) can be reused instead of re-made. That is the project rule "share a similar style to Ship Editor". |
| **Svelte Flow (`@xyflow/svelte`)** for the flow chart | Mature node-graph library for Svelte: pan/zoom, minimap, custom node components (each node type is a Svelte component), handles per option, selection, keyboard. A home-made canvas graph like Ship Editor's ship view would take months to reach the same point. |
| **elkjs** for auto-layout | Lays out the large layered graphs that imported vanilla dialog produces (hundreds of rules). Dagre is simpler but handles ports (one handle per option) poorly. |
| **Shared parsers from Ship Editor** (`loosejson.ts`, `jsonedit.ts`, `csv.ts`, `csvedit.ts`, `workspace.ts` write guard, `datadir.ts`, `config.ts`) | Already tested against every vanilla and installed-mod file: Starsector's loose JSON (comments, unquoted keys, trailing commas), CSVs with multi-line cells, and in-place patching that keeps comments and formatting. This is the hardest part to get right, and it is already done. |
| **A companion runtime library mod in Java** (§3.1), built with `build.sh` like ReadAloud (JDK 17, against `starfarer.api.jar`) | In vanilla, quests with journal stages and spawned fleets need Java (`BaseHubMission`), and so do locations (`SectorGeneratorPlugin`). One shared library does that work for every mod made with Saga Forge, from JSON files. Exported mods ship no code, modders don't need a JDK, and there are no duplicate classes or ModPlugins to merge. Only we compile, when building the library. The game runs Java 17 (Zulu 17.0.10). |
| **Vitest** | Same as Ship Editor: unit tests plus "every file in the game and installed mods" round-trip tests. |

Rejected:

- **Generating Java per mod** (draft 1). The output would be closer to how vanilla mods look, but
  every mod would need a JDK or Janino-safe source, carry its own copies of the same code, and
  have to merge generated hooks into its own ModPlugin. Replaced by the runtime library (Q2/Q3).
- **Web app / Tauri.** Tauri would mean rewriting the shared Node code in Rust. A web app can't
  safely write into mod folders.

### Code sharing with Ship Editor (decided)

Copy the shared modules into `src/shared/` (and `src/main/` for the write guard) and change the
copies freely when Saga Forge needs to. Each copy starts with a header comment naming the Ship
Editor file it came from. There is no sync test: the copies are allowed to drift. Merging the two
into one editor suite is a decision for later.

---

## 3. Architecture

```
┌──────────────────────────── renderer (Svelte) ────────────────────────────┐
│ Pages: Saga overview │ Factions │ People │ Items │                        │
│        Quests (flow + dialog preview) │ Locations (map) │ Encounters │    │
│        Dialog browser │ Problems │ Test profiles │ Settings              │
│ Stores: open documents, undo history, selection, display prefs            │
└──────────────▲──────────────────────────────────────────────▲────────────┘
               │ typed IPC (preload, same pattern as Ship Editor src/shared/api.ts)
┌──────────────┴──────────── main (Node) ─────────────────────┴────────────┐
│ GameIndex     reads starsector-core + enabled/installed mods, read-only   │
│               (factions, people, markets, systems, rules, commodities,    │
│                industries, conditions, hulls/variants by id, portraits)   │
│ ModProject    the active mod: its files + its Saga Forge plans            │
│ Writers       faction merge files, CSV row patcher, rules block writer,   │
│               runtime JSON writer, mod_info.json dependencies             │
│ WriteGuard    copy of Ship Editor's workspace.ts rules (only inside the   │
│               active mod, resolved through junctions, no overwrites of    │
│               files changed on disk since they were opened)               │
└──────────────────────────────────────────────────────────────────────────┘
          │ exports JSON + rules.csv, read in game by ▼
┌──────────────────── SagaLib (separate mod, Java, §3.1) ───────────────────┐
│ ModPlugin · content index · quest runner (HubMission) · system builder ·  │
│ fleet spawner · rule commands · save reconciliation                       │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── shared (pure TS, tested) ─────────────────────┐
│ model/*  (types below) · serialize/* (model ⇄ files) · checks/* ·         │
│ rules engine (condition evaluator + text substitution for the preview)     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Two kinds of source of truth

- **Declarative game files are the truth** for things the game reads as data: factions,
  `factions.csv`, `custom_entities.json`, CSV rows. The editor reads them, patches them in place
  and keeps everything it doesn't understand, exactly like Ship Editor does with `.ship` files.
- **Plan files are the truth** for quests, locations and encounters. They live in
  `<mod>/sagaforge/` (`quests/<id>.quest.json`, `locations/<id>.system.json`,
  `encounters/<id>.encounter.json`, `project.json` with the id prefix). They hold everything,
  including what the game doesn't need: node positions, notes, intent ("this is the bad
  ending"), test variables. **Export** turns them into the files the game reads: `rules.csv`
  blocks for the dialog and **runtime JSON** for the runtime library (§3.1), without editor-only
  data. The game ignores `sagaforge/`: it only loads known folders (`data`, `graphics`,
  `sounds`, `jars`), and nine of the installed mods ship extra root folders (`src`,
  `src-optional`, `docs`, `dev`, `test`, …) without trouble. Release zips leave it out (Q5).

Exported output is marked (see §6) so the editor knows what it owns. It never rewrites anything
it didn't export.

### 3.1 The runtime library: SagaLib

A separate mod, like LazyLib or MagicLib, that mods made with Saga Forge list as a dependency:
**SagaLib**, mod id `lastai_sagalib`, in `D:\ModTools\mods\SagaLib\`. The `-Lib` ending tells
players it's a library when the launcher asks for it ("made with Saga Forge, needs SagaLib");
no installed mod uses "saga" in its name, so it's unambiguous. It is built and
tested with `bash build.sh` like ReadAloud. MagicLib's JSON bounties show that the community
accepts data-driven quests that need a library.

**License:** **MIT** (changed on 2026-11-11, at the 1.0 release; planned and first published as
CC BY 4.0). Anyone may use, bundle, copy, change and redistribute it, including commercially,
keeping the copyright notice. Mods that only *depend* on SagaLib (list it in `mod_info.json`)
ship none of its files, so they owe nothing. **Saga Forge itself** (the editor app) is **MIT**, with a
`LICENSE` file in `tools/saga-forge`. Mods made with it belong to their authors; the editor
adds nothing to them that carries a license.

**Other mods: optional support only.** The library has no hard dependencies. Support for other
mods (MagicLib bounties first, §10) lives in **bridges**: classes in a separate source folder,
compiled against that mod's jar, and loaded only when `isModEnabled(<id>)` is true. ReadAloud's
`src-optional` LunaLib bridge works the same way. Without the other mod the bridge is never
loaded, and features that need it report "needs <mod>" in the log and the editor.

**What it reads.** Each content mod lists its files in a merged index,
`data/config/sagaforge/content.csv` (`id, type, path, mod`), the way PuppeteerLib uses
`puppeteer_files.json`. The library loads it with the game's merged-spreadsheet call, so every
enabled mod's rows are found and nobody's ModPlugin has to register anything. Files:
`data/sagaforge/quests/*.json`, `systems/*.json`, `encounters/*.json`, `people/*.json`, and one
`data/sagaforge/factions.json` per mod (starting relations of the mod's new factions, and
scripted faction changes, §4.1). Each file has a `"format"` number. The library reads every
format it ever supported.

**What stays vanilla, with no library involved:**

- **Factions**: `.faction` and `factions.csv` are already JSON/CSV, and other mods merge into
  them. Only what those files can't do goes through the library: starting relations, and scripted
  changes such as removing a known ship.
- **Dialog**: stays in `rules.csv`, run by the game's own rules engine. Other mods can hook into
  it, FireBest works, and tools that read dialog (e.g. our ReadAloud) still see it. The library
  only **adds rule commands**, through `ruleCommandPackages` in its `data/config/settings.json`.
  LunaLib, RetroLib and UAF add theirs the same way. Examples: `SF_Step <quest> <step>`,
  `SF_Reward <quest> <id>`, `SF_Spawn <encounter>`, `SF_Despawn <encounter>` (the fleet leaves
  peacefully, outcome *Avoided*), `SF_Start <quest>`, `SF_End <quest> success|fail`, plus
  conditions `SF_AtStep`, `SF_QuestDone`.
- Plain dialog that only uses vanilla commands (a new conversation with an existing person, a
  comm-link greeting) doesn't need the library at all, and the export doesn't add the dependency
  then.

**What the library does:**

| Part | How (vanilla API it builds on) |
|---|---|
| Quests | One generic `SagaQuest extends HubMissionWithBarEvent`, configured from the quest JSON: steps, journal text, map markers, time limits, rewards, fleet triggers. `person_missions.csv` / `bar_events.csv` rows all name the library's class as plugin. The game tells each new object which row it came from (§3.2). |
| People | Creates `PersonAPI`s and places them in markets (or as fleet commanders) on new game; markets in existing systems follow the system's `addToExistingSaves` setting. |
| Phrases | Registers one `RuleTokenReplacementGeneratorPlugin` through `Global.getSector().getRules().addTokenReplacementGenerator(...)` on every game load. When the game fills `$tokens` in dialog text, it asks the library for the mod's phrase tokens, and the library returns the first case whose conditions match (§4.3). |
| Locations | A generic system builder (`SectorGeneratorPlugin`) for new systems. Additions to existing systems check first whether they're already there. |
| Encounters | Fleet creation through `FleetFactoryV3` / the HubMission triggers, with spawn and behavior from JSON. |
| Displays | Rule commands for dialog displays vanilla has no command for: `SF_ShowPlanetInfo`, `SF_ShowFleets`, `SF_ShowShip`, and `SF_Show image\|faction\|ships\|cargo\|heading\|skills` for widgets drawn in the text through `TextPanelAPI` / `TooltipMakerAPI` (§4.9). |
| Dev tools | Only when the game's `devMode` is on: applies **test profiles** at new game or from a dev menu (hotkey), jumps a quest to a step, and **reloads the mods' JSON from disk** without restarting (§4.10). Does nothing in normal play. |
| Hooks | A quest, encounter or system can name a class implementing a small library interface (`SagaHook`). This is the escape hatch for mods that need custom logic, in their own jar. |
| Errors | Bad or missing JSON is reported in `starsector.log` with file and path (same idea as PuppeteerLib). The editor shows the same messages, from a TypeScript copy of the checks. |

**Risks:**

- Two copies of the quest logic: Java in the library, TypeScript in the editor's Play mode. The
  same is true of PuppeteerLib and Ship Editor. Shared golden test cases (same JSON in, same
  steps out) keep them in line.
- The library's own classes live in saves. Their names and saved fields must never change after
  the first release. Saved objects hold ids only and read the definition from JSON at load.
- Everyone depends on one library, so the formats must stay backward compatible, and bugs in it
  affect every mod built with it.

### 3.2 How a quest starts in vanilla, and what it means for the library

Checked in the API source (`starfarer.api.zip`, 0.98a).

**From a csv row to a running quest.** A `person_missions.csv` row has a `mission id` and a
`plugin` class. When a contact's mission list is filled, `BaseMissionHub` makes one
`BaseHubMissionCreator` per row for that person, and when it offers missions it calls
`PersonMissionSpec.createMission()`:

```java
HubMission mission = (HubMission) Global.getSettings().getInstanceOfScript(pluginClass);
mission.setMissionId(missionId);        // the row's "mission id"
```

`bar_events.csv` does the same (`BarEventSpec.createMission()` → `setMissionId(id)`). After that
the hub calls `createAndAbortIfFailed(market, barEvent)`, which calls the mission's
`create(...)`. So:

- **One generic class can serve every quest.** In `create()`, `getMissionId()` is already set,
  so `SagaQuest` looks up the quest JSON by that id. No fallback is needed. The one rule is not
  to use the id in the constructor, because it is set just after.
- **The mission id is also the rule prefix.** Vanilla fires `<id>_blurb` / `<id>_option` (contact)
  and `<id>_blurbBar` / `<id>_optionBar` (bar), and writes `$<id>_stage` and
  `$<id>_missionCompleted`. Saga Forge uses **quest id = mission id = rules prefix**, so it must
  be unique across all mods and must never change after release (§6).

**Limit: vanilla stages must be Java enums.** `BaseHubMission` stores the stage as an `Object`,
but casts it to `Enum` in several places (`updateInteractionData` writes
`((Enum) getCurrentStage()).name()`, and the map-marker code calls
`makeUnimportant(..., (Enum) currentStage)`). An enum's values are fixed when the class is
compiled, so a single library class can't make a new enum value for every JSON quest's stages.

Options:

| Option | Verdict |
|---|---|
| **A. Two layers (recommended).** Vanilla's stage is a small fixed library enum: `ACTIVE`, `COMPLETED`, `FAILED`, `ABANDONED`. It drives what vanilla already does well: accept, time limit, abandon, success/failure, completion counts, intel lifecycle. The designer's stages are **steps**: string ids from the JSON, kept in `$global.<id>_step`. The library manages the journal text and map markers of each step itself (`addDescriptionForNonEndStage`, `getNextStepText`, `Misc.makeImportant` per step). | Works for any number of steps, and matches the Q4 decision: progress is a string flag, so reordering or adding steps never breaks a save. More library code for markers and intel text, but that's written once. |
| B. A fixed enum of numbered slots (`S1`…`S50`), mapped to steps by position | Inserting or reordering a step moves players to the wrong step. Rejected. |
| C. Don't use `BaseHubMission`; write our own intel class | Loses the contact system (missions offered by contacts, importance, timeouts) that players know. Rejected. |
| D. Generate one small enum class per quest | That's generated Java again, which Q2 rules out. Rejected. |

With A, the memory keys are: `$<id>_stage` (vanilla, lifecycle: `ACTIVE` etc.),
`$global.<id>_step` (step id), `$global.<id>_<var>` (quest variables), and vanilla's
`$<id>_missionCompleted`. `rules.csv` conditions use `SF_AtStep <id> <step>` or plain
`$global.<id>_step == <step>`. In the editor, the journal entries a designer plans are still
called **stages**, and they export as steps.

---

## 4. Data model

TypeScript-style sketches. Every id the editor creates gets the mod's **prefix** (set once per
mod in `project.json`, e.g. `sf_`), as the Starsector community expects.

### 4.1 Factions: additions and overrides are different types

```ts
type FactionEntry = FactionAddition | FactionOverride;

/** A faction this mod creates. The mod owns the whole definition. */
interface FactionAddition {
  kind: 'addition';
  id: string;                       // "sf_vanguard"; must not exist in game or any installed mod
  file: string;                     // "data/world/factions/sf_vanguard.faction"
  csvRow: true;                     // listed in this mod's data/world/factions/factions.csv
  spec: FactionSpec;                // every key, edited as a full document
  relations: Record<FactionId, number>;  // starting relations → runtime JSON, set on new game
  raw: LooseJsonDoc;                // the parsed file, so unknown keys and comments survive
}

/** Changes to a faction someone else defines (vanilla or another mod). */
interface FactionOverride {
  kind: 'override';
  targetId: string;                 // "hegemony"
  origin: 'vanilla' | { mod: string };   // where the faction comes from (shown as a badge)
  file: string;                     // same relative path as the original: the game merges it
  patch: {
    set: Partial<FactionSpec>;      // scalars/objects that replace the original value
    add: {                          // array entries appended by the merge
      knownShips?: { tags?: string[]; hulls?: string[] };
      knownFighters?: ...; knownWeapons?: ...; priorityShips?: ...;
      illegalCommodities?: string[]; portraits?: ...; flags?: ...;
    };
  };
  scripted: ScriptedFactionChange[];   // things a merge can't express, e.g. removing a known
                                       // ship → runtime JSON applied by the library on load,
                                       // shown separately with a warning
  raw: LooseJsonDoc;
}
```

Rules that follow from this:

- The Factions page has two clearly separate lists: **This mod's factions** (green "new" badge)
  and **Changes to other factions** (orange "override" badge, with the target faction and where
  it comes from). A third, greyed list, **Everyone else**, shows the remaining factions read-only;
  picking one offers "Change this faction…". Both editors have a **file preview** panel showing
  exactly what will be written (the full file for an addition, only the patch for an override).
- `relations` and `scripted` changes go into the mod's `data/sagaforge/factions.json` (§3.1) and
  carry a "SagaLib" badge in the editor, so it's clear they need the library.
- An override's editor shows the *effective* faction (base value + this mod's patch, with other
  installed mods' patches shown greyed with the mod's name) but only saves the patch. Editing a
  value the base already has creates a `set` entry; **Revert** removes it.
- Things a merge file can't do (remove an array entry) are refused with an explanation, like
  Ship Editor does for skins. Or they can be added as a `scripted` change, which is shown as such.
- `FactionSpec` is typed for the keys vanilla uses (color, names, ranks, `shipNameSources`,
  `knownShips`, `hullFrequency`, `doctrine`, `music`, `portraits`, `fleetTypeNames`,
  `custom`, …). Unknown keys are listed under "Other keys", the same pattern as Ship Editor's
  "Other columns".

### 4.2 People

Quests need someone to talk to. People have their own page (mock-up:
[mockups/people.html](mockups/people.html)). Like factions, the mod's own characters and
existing ones are different types and separate lists:

```ts
type PersonEntry = PersonDef | ExistingPersonRef;

/** A character this mod creates. */
interface PersonDef {
  kind: 'new';
  id: string;                     // "vgc_reyes"
  name: { first: string; last: string }; gender: 'MALE'|'FEMALE'|'ANY';
  faction: FactionRef;
  rank: string; post: string;     // ids from Ranks (spaceCommander, stationCommander, ...)
  portrait: string;               // game path (referenced, never copied) or the mod's own image
  voice?: string;                 // Voices: soldier, spacer, official, business, ...
  personality?: string;           // used when they command a fleet
  placement:
    | { at: 'market'; market: MarketRef; inCommDirectory: boolean }
    | { at: 'fleet'; encounter: EncounterRef }       // named fleet commander
    | { at: 'none' };                                // a quest node spawns / uses them
  contact?: { types: ('military'|'trade'|'underworld'|'science'|'pather')[];
              importance: 'VERY_LOW'|...|'VERY_HIGH' };
  tags: string[];
  phrases: Phrase[];              // §4.3, conditional text owned by this character
}

/** A vanilla or other mod's character, by id. Read-only: the mod adds dialog around them. */
interface ExistingPersonRef { kind: 'existing'; id: string; origin: 'vanilla' | { mod: string } }
```

- Exported to `data/sagaforge/people/<mod>_people.json`; SagaLib creates and places them on new
  game. People defined in other mods' Java show as "defined in code" (§6, Reading).
- The page's **Used by** list (quests, encounters, greetings, markets) feeds the save warnings
  when a person's id changes or a person is removed.
- Existing people are never changed: no edits to their name, portrait or placement, because
  vanilla creates them in Java and a change would fight with it and with other mods.

### 4.3 Dialog

The model is close to `rules.csv`, so imported vanilla dialog and our own use the same types.

```ts
interface Rule {                    // one rules.csv row
  id: string; trigger: string;      // DialogOptionSelected, PopulateOptions, OpenCommLink, ...
  conditions: Condition[];          // each a line: "$option == sf_q1_ask", "RepGTE hegemony 0.2"
  script: ScriptLine[];             // "AddCredits 10000", "Call $global.sf_q1_ref accept"
  text: string;                     // with $tokens and highlights
  options: OptionDef[];             // "sf_q1_ask:Ask about the cargo"
  notes: string; source: SourceRef; // file + row, and which mod
}
interface OptionDef {
  id: string; text: string; order?: number;   // "1:id:text" ordering form
  showOnce?: 'conversation' | 'ever';         // hide after it has been picked (below)
}
```

#### Show-once options

An option the player has already picked usually shouldn't come back: in the Lost Convoy offer,
"What's the catch?" → Reyes explains → "Back" returns to the offer, and the question should be
gone. Writers do this by hand with a flag and forget it often. In Saga Forge it is a checkbox on
the option with two settings:

- **Once per conversation**: gone for the rest of this conversation, back on the next visit.
- **Once ever**: never offered again in this playthrough.

Exported the way vanilla does it (Rao's commission option, `$askedCommission`):

- the option is added by its own small rule on the node's options trigger, with the condition
  `!<flag>`, instead of sitting in the node's own options list;
- picking it sets the flag: `$<node>_<option>_asked = true 0` for once per conversation (a memory
  value that expires, as vanilla writes it) or `$global.<quest>_<option>_asked = true` for once
  ever; then `FireAll` rebuilds the options;
- the flags are generated, appear in the flags registry (§4.8) marked "generated", and need no
  SagaLib.

Play mode honors both settings, and a check warns when every option of a node is show-once and
the node can be returned to (the player would be left with no options). (verify in M0: that
`= true 0` lasts exactly until the conversation ends, as vanilla's use suggests.)

Conditions and script lines are stored as text (what the game reads) plus a **parsed form**
when the editor knows the command (`AdjustRep`, `AddRemoveCommodity`, `ShowPersonVisual`,
`SetEnabled`, `SetTooltip`, `SetStoryOption`, `BeginFleetEncounter`, `EndConversation`, …
from the `impl.campaign.rulecmd` classes in `starfarer.api.jar`). The inspector shows a form for known commands and
a text line for the rest.

#### Conditional text: phrases

Often a line should change only a few words with the situation: a character calls the player
"Commander Varga" when commissioned with their faction and just "Captain" otherwise. Making a
separate rule for each case multiplies rules and options; a **phrase** handles it inside one line.

What vanilla already offers, and the editor lists in its token picker: tokens such as
`$PlayerSirOrMadam` (which already uses the player's honorific), `$playerLastName`,
`$faction`, `$marketName`, and **random variants**: a line containing only `OR` splits a rule's
text (or an `AddText` line) into alternatives, one picked at random (214 uses in vanilla's
`rules.csv`). The editor shows these as variants of the text and the preview cycles through them.

```ts
interface Phrase {
  token: string;                  // "$vgc_reyes_title"; prefixed like every id
  owner: PersonRef | 'mod' | NodeRef;   // a character's phrase, mod-wide, or inline in one node
  mode: 'first-match' | 'random';
  cases: { when: Condition[]; text: string }[];   // text may use other tokens
  otherwise?: string;             // no otherwise + no match = empty text
}
```

- **Named phrases** are defined on the People page (a character's voice: their title for you,
  farewells, mood words) or mod-wide, and used in any text as a token. The text field shows them
  as chips.
- **Inline variations**: typing `{` in a text field adds a one-off variation in place
  (`{ if commissioned with Vanguard: … | else: … }`). On export it becomes an unnamed phrase of
  that node (`$vgc_lost_convoy_debrief_v1`).
- Conditions come from a picker (commission, reputation, player gender, story flag, quest
  variable, market, quest state) or any condition line the rules engine understands. The
  library's condition subset and the editor's are the same list, kept in the definitions data
  file (Q11), with shared golden tests.
- **In game**, SagaLib's token generator fills them in (§3.1), so the dialog stays one
  `rules.csv` row and other tools that read the shown text (e.g. ReadAloud) see the final words.
- **Without SagaLib** (a dialog-only mod), the export splits a node that uses phrases into one
  rule per combination of cases, up to 4; above that, Problems says the node needs SagaLib.
- **Phrases are for wording, not flow.** When options or next steps differ, use a Branch node.
- In the dialog preview, the Test context gets a switch for every condition the shown text
  uses, and **Show all variants** draws each combination side by side. Play mode logs which case
  each phrase used.
- Two checks: a phrase with no `otherwise` that can come out empty in the middle of a sentence
  (warning), and a token that no phrase, variable or vanilla generator defines (already listed).

(verify in M0: that the game calls registered token generators for the main text and the option
labels of rules, and that the generator has to be added again on each load. Fallback if option
labels are not covered: phrases are allowed only in text, and Problems flags them in options.)

### 4.4 Quests

```ts
interface Quest {
  id: string;                       // "sf_lost_convoy"; never changes once released (§6)
  title: string; icon: string;
  start: QuestStart;                // how the player gets it (below)
  stages: Stage[];                  // journal stages: id, intel text, map markers, isSuccess/isFail,
                                    // renamedFrom?: string[] (old ids kept for existing saves)
  variables: QuestVar[];            // typed: number/string/bool/entity/person/target, scope quest|global
                                    // 'target' = picked when the quest is offered: STUB in 1.0, see below
  rewards: Reward[];                // credits, rep (faction / person), items, ships, XP, story points
  graph: QuestGraph;                // the flow chart (5)
  encounters: EncounterRef[];
  repeatable: boolean; timeLimitDays?: number;
}

type QuestStart =
  | { kind: 'contact'; person: PersonRef; freq: number; minRep?: RepLevel; requires?: string[] }  // person_missions.csv
  | { kind: 'bar'; freq: number; prob: number; marketTags?: string[] }                           // bar_events.csv
  | { kind: 'trigger'; rule: TriggerSpec }  // e.g. arriving at an entity, talking to a fleet
  | { kind: 'manual' };                     // started from another quest's node
// every kind can also carry prerequisites, shown on the Saga overview (§4.8):
//   requires?: ({ quest: QuestRef; ended?: 'success'|'fail'|'any' } | { flag: string; is?: unknown })[]
```

**Random targets (stub in 1.0).** Vanilla's repeatable contact missions pick their target when
offered ("a pirate-held market within 10 ly"), through `BaseHubMission`'s search calls
(`requireMarketFaction…`, `preferSystemWithinRangeOf…`, `pickMarket()` and the like). 1.0
reserves the design but doesn't build it:

- the variable type `target` exists in the model and the plan file format, with
  `{ kind: 'market'|'system'|'entity'|'person'; criteria: unknown[] }`;
- the editor shows it in the variable list as "coming later" and won't export a quest that uses
  it (an Error explains why);
- the SagaLib format number reserves the field so adding it later doesn't break old files.

Why only a stub: MagicLib's bounties (task #27, §10) also pick targets with criteria, and the two
ideas may be best combined into one picker that can drive either a SagaLib quest or a MagicLib
bounty. The full design is §11.2.

**QuestGraph:** nodes + edges, saved with positions.

| Node | Meaning | Exported as |
|---|---|---|
| **Start** | Entry point for one `QuestStart`, or a dialog trigger | trigger rule / blurb + option rules (`<q>_blurb`, `<q>_option`, as vanilla does) |
| **Dialog** | Speaker, visual panel and in-text displays (§4.9), text, highlights, **and its options**, each with its own output handle, conditions, tooltip, disabled state, story-point cost and shortcut. One node = one `rules.csv` row, which also holds text and options together. | one rule: `DialogOptionSelected`, `$option == <in-edge option id>`; `options` column + `SetEnabled` / `SetTooltip` / `SetStoryOption` lines |
| **Branch** | Picks a path by condition (rep, credits, cargo, variable, random) | several rules with the same trigger, different conditions (FireBest specificity handled, §6) |
| **Action** | Give/take credits, items, rep, set variable, add intel marker, start encounter | vanilla script lines where they exist (`AddCredits`, `AdjustRep`, `AddRemoveCommodity`, `$var = …`), otherwise library commands (`SF_Reward`, `SF_Spawn`) |
| **Stage** | Move the quest to a journal stage | `SF_Step <quest> <step>` → the library sets `$global.<quest>_step` and updates the journal and markers (§3.2) |
| **Encounter** | A fleet / interaction this quest spawns | encounter JSON, spawned by the library on the stage |
| **Wait / Arrive** | Continue when the player reaches a place, or after time | stage trigger in the quest JSON + a rule on `OpenInteractionDialog` at the place |
| **End** | Success / failure / abandon, with rewards | `SF_End <quest> success\|fail` → vanilla stage `COMPLETED` / `FAILED`; rewards from the quest JSON |
| **Link** | Jump to another node, or *into an existing* vanilla/mod dialog by option id | option pointing at the existing id (read-only, shown dashed) |
| **Note** | Designer comment, not exported | — |

Edges go from a Dialog option (or a Branch case, an Encounter outcome, or "next") to a node.
Edge ids become the option ids (`<quest>_<slug>`, e.g. `vgc_lost_convoy_accept`; the quest id
already carries the prefix), so the exported `rules.csv` stays readable.

(Drafts 1–3 had a separate **Choice** node for the options. The mock-up showed that splitting
one rule's text and options over two nodes doubles the node count and makes the chart read less
like the conversation, so options now live on the Dialog node.)

### 4.5 Locations

```ts
interface StarSystemDef {
  id: string; name: string; kind: 'new' | 'existing';   // existing = add things to e.g. "corvus"
  hyperspace?: [x: number, y: number];                  // new only; map shows starmap.json systems
  star?: { type: string; radius: number; corona: number }; // planets.json star types
  entities: SystemEntity[];       // planets, moons, stations (custom_entities.json types),
                                  // jump points, asteroid belts, rings, nebula, comm relays...
}
interface SystemEntity { id; type; name; orbit: { focus: string; radius; angle; days }; market?: MarketDef }
interface MarketDef {
  id; name; faction: FactionRef; size: number; conditions: string[]; industries: string[];
  submarkets: string[]; freePort: boolean; people: PersonRef[];
}
```

Exported as a system JSON file that the library builds on new game. For **existing** systems,
the library only adds entities after checking they don't exist yet, and never touches what is
already there. Per system, `addToExistingSaves: true` (opt-in) also builds it on load in a save
that doesn't have it yet.

### 4.6 Encounters

```ts
interface EncounterDef {
  id: string;
  fleet: { faction: FactionRef; type: string /* fleet type, e.g. "patrolMedium" */;
           size: 'fp' | 'explicit'; points?: number; variants?: string[]; officers?: ...;
           quality?: number; flagshipCommander?: PersonRef };
  spawn: { at: LocationRef; when: 'quest-stage' | 'new-game' | 'periodic'; stage?: StageRef };
  behavior: 'patrol' | 'guard' | 'intercept-player' | 'travel' | 'ambush';
  flags: { hostile?: boolean; noRepImpact?: boolean; important?: boolean; allowDisengage?: boolean };
  commDialog?: DialogGraphRef;      // OpenCommLink greeting + options, same editor as quests
  outcomes: { defeated?: NodeRef; avoided?: NodeRef };
}
```

Exported as encounter JSON. Inside a quest, the library turns it into `HubMissionWithTriggers`
calls (`triggerCreateFleet`, `triggerSet*`), the way vanilla quests spawn their fleets.
Standalone encounters (new game / periodic) are spawned by the library's own fleet manager
script.

### 4.7 Items and descriptions

Mock-up: [mockups/items.html](mockups/items.html). Quests need things to carry (a black box,
a data core, a crew manifest), and every new entity needs description text.

```ts
interface ItemDef {
  kind: 'commodity' | 'special';
  id: string;                     // "vgc_black_box"
  name: string; icon: string;     // icon: the mod's image, or a game icon by path (not copied)
  basePrice: number; stackSize: number; cargoSpace: number;
  tags: string[];                 // vanilla tags: nonecon, no_loss_from_combat, hide_in_codex, ...
  special?: { rarity: number; plugin: string /* default GenericSpecialItemPlugin */; pluginParams?: string };
  description: string;            // commodity: descriptions.csv row, type RESOURCE (as vanilla's food,
                                  // alpha_core); special item: the "desc" column of special_items.csv
  otherColumns: Record<string, string>;   // every CSV column the form doesn't show, kept as-is
}
```

- Commodities are rows in `data/campaign/commodities.csv`, special items rows in
  `data/campaign/special_items.csv`, in the mod's owned block (§6). **No SagaLib needed.**
- **Presets** fill tags and columns: *Quest item* (`nonecon`, `no_loss_from_combat`,
  `hide_in_codex`, price 0, can't be sold), *Trade good* (an economy commodity), *Rare valuable*, *Special trade good* (H7: a special item to buy and sell, not in the economy: price 1500, stacks of 100). Columns the form
  doesn't show get the values vanilla uses for the closest vanilla item, shown under "Other
  columns" (verify in M0 which columns a non-economic commodity needs).
- Special items use vanilla's `GenericSpecialItemPlugin`, so no code. An item with its own
  behavior (a colony item, a blueprint) names a plugin class from the mod's jar.
- **Existing items are read-only.** A CSV row with a vanilla id replaces vanilla's whole row, so
  the editor never writes one (the same rule as factions: additions, not replacements). Existing
  items can be used anywhere: rewards, costs, conditions (`PlayerHasCargo`).
- **Used by** lists the quests that give, take or test the item.
- **Descriptions** for factions, planets, stations, custom entities and items are a tab in each
  editor, written to `data/strings/descriptions.csv` (types `FACTION`, `PLANET`, `CUSTOM`,
  `RESOURCE`, …; rows only for our ids).

### 4.8 Saga overview and the flags registry

Mock-up: [mockups/saga.html](mockups/saga.html). One page for the whole mod's story:

- **Board**: every quest and dialog-only conversation is a card (start, stages, endings, people).
  Solid arrows are **prerequisites** (`requires` on the quest start, §4.4); dashed arrows are
  **flags** one quest sets and another reads. Cards can be arranged freely; positions are saved in
  `sagaforge/project.json`. Double-click opens the quest.
- **Timeline** view (simple): quests in the order a player can reach them, computed from the
  prerequisites; cycles and quests nobody can reach are problems.
- **Flags registry**: every memory key the mod uses, found in the plans and in the mod's
  hand-written `rules.csv` rows, with who sets it and who reads it. Keys set by vanilla or another
  mod are marked as such. Checks: read but never set (with a "did you mean" for close names, the
  classic `rules.csv` typo), set but never read (info), set with different types.
- Prerequisites are exported as conditions on the quest's start (`person_missions.csv` /
  `bar_events.csv` rows and the start rules), so they need nothing new in SagaLib.

### 4.9 Dialog displays

Mock-up: [mockups/displays.html](mockups/displays.html). Checked against the 0.98a API:
`VisualPanelAPI`, `TextPanelAPI`, `TooltipMakerAPI` and the rule commands in
`impl.campaign.rulecmd`.

How the game does it: a dialog has a **visual panel** on the left and a **text panel** with
options on the right. Rule commands in the script column change both. Illustrations are images
registered in `settings.json` under `graphics` → `illustrations` (a key → a path; vanilla has
99, and Arma Armatura, UAF and two AoTD mods add their own the same way), shown with
`ShowImageVisual [category] key`. "Gained …" lines with icons come from the commands that change
cargo, credits or ships themselves (`AddRemoveCommodity`, `AddCredits`, `AddShip`, …), and
reputation lines from `AdjustRep`.

A Dialog node has one **visual** and an ordered list of **displays** placed in its text:

| Display | Where | Exported as |
|---|---|---|
| Person (speaker with rank, post, faction crest) | visual | `ShowPersonVisual` |
| Second / third person in the scene | visual | `ShowSecondPerson` / `ShowThirdPerson` |
| Illustration (vanilla's, other mods', the mod's own) | visual | `ShowImageVisual`; the mod's own are added to its `settings.json` illustrations on export |
| Large planet · planet info | visual | `ShowLargePlanet` · `SF_ShowPlanetInfo` |
| Map marker | visual | `ShowMapMarker` |
| Fleets side by side · one ship | visual | `SF_ShowFleets` · `SF_ShowShip` (`showFleetInfo` / `showFleetMemberInfo`) |
| Save / restore / hide the visual | visual | `SaveCurrentVisual` / `RestoreSavedVisual` / `HideVisual` |
| Gained or lost credits, commodities, items, weapons, fighters, ships, officers, story points, XP | text | `AddCredits`, `SubCredits`, `AddRemoveCommodity`, `AddRemoveAnyItem`, `AddShip`, `RemoveShip`, `AddStoryPoints`, `AddXP` |
| Reputation change (faction or person) | text | `AdjustRep` / `AdjustRepPerson` |
| Extra paragraph: colored, small, random variants | text | `AddText` / `AddTextSmall` |
| Cost panel · remaining capacity | text | `ShowResCost` · `ShowRemainingCapacity` |
| Inline image · **faction callout** (crest, name, relationship bar) · ship list · cargo grid · section heading · skill panel | text | `SF_Show image\|faction\|ships\|cargo\|heading\|skills` (SagaLib, through `TextPanelAPI.addImage` / `beginTooltip` + `TooltipMakerAPI`) |
| Highlights and their colors | text | the node's highlights, `SetTextHighlights`, `SetTextHighlightColors` |
| Option tooltip, story option, option text, shortcut | options | `SetTooltip`, `SetStoryOption`, `SetOptionText`, `SetShortcut` |
| Sound, music | — | `PlaySound`, `PlayCustomMusic`, `PauseMusic`, `ResumeNormalMusic` |

- The command list and parameters live in the definitions data file (Q11).
- The dialog preview draws every display; one it can't draw exactly is a labelled placeholder of
  the right size, so text overflow is still right.
- Mods that only use vanilla displays don't need SagaLib; the `SF_Show…` ones do, and the export
  adds the dependency as usual.
- (verify in M0: the order in which a rule's text and its script lines appear, since displays
  come from script lines. If the script runs after the text, displays placed *between*
  paragraphs are exported as `AddText` lines around them.)

### 4.10 Test profiles and in-game testing

Mock-up: second screen of [mockups/saga.html](mockups/saga.html). A **test profile** is a saved
game situation:

```ts
interface TestProfile {
  id: string; name: string;
  quests: Record<QuestRef, { state: 'not-started'|'active'|'success'|'fail'; step?: string }>;
  flags: Record<string, unknown>;          // any key from the flags registry
  player: { credits?: number; storyPoints?: number; commission?: FactionRef;
            rep?: Record<FactionRef, number>; cargo?: { item: string; qty: number }[];
            startAt?: EntityRef };
}
```

- In the editor, a profile sets up **Play mode** (instead of filling in the Test context by
  hand). **Copy from Play mode** saves the current Play state as a profile.
- In game, through SagaLib, **only when the game's `devMode` is on**:
  - **new game**: after the sector is generated, SagaLib asks which profile to apply (or none);
  - **any time**: a SagaLib dev menu (hotkey) lists the profiles, applies one, jumps a quest to a
    step, or **reloads the mods' quest/people/encounter JSON from disk**, so text and step changes
    show without restarting the game. Applying a profile changes the running save; the menu says
    so and suggests a throwaway save.
- Profiles are kept in `sagaforge/test-profiles.json` and exported to
  `data/sagaforge/dev/test_profiles.json`. SagaLib never reads them outside dev mode, and release
  zips leave them out. Turning on `devMode` is the user's own step; Saga Forge never edits the
  game's files.
- (verify in M0: which JSON can be reloaded safely in a running game, and the hotkey handling in
  the campaign layer. Fallback: reload only text, journal and phrases, and apply profiles only at
  new game.)

---

## 5. The quest planning page

### Layout

```
┌───────────────┬─────────────────────────────────────────────┬──────────────────┐
│ Quests        │  [Plan ▾] [Play ▶] [Auto-layout] [Export]   │ Inspector        │
│ ● Lost Convoy │                                             │  Dialog node     │
│   Rescue Op   │   (Start)──►[Dialog: "So this is an easy"]  │  Speaker  Reyes ▾│
│ + New quest   │                 │  1 Accept                 │  Visual   person │
│───────────────│                 │  2 "But?"  ──►[Dialog]    │  Text  [.......] │
│ Outline       │                 ▼                           │  Highlights $..  │
│  Stage 1 Go   │            [Stage: Go to X]──►[Encounter]   │  Options         │
│  Stage 2 Back │                                             │   1 Accept  ⓘ    │
│ Variables     │                              [minimap]      │   2 But?         │
├───────────────┴─────────────────────────────────────────────┴──────────────────┤
│ Dialog preview (in-game mock-up, follows the selected node)  │ Problems (3)    │
└────────────────────────────────────────────────────────────────────────────────┘
```

Panel sizes are draggable and remembered, like Ship Editor (`Splitter.svelte`, `layout.svelte.ts`).

### The flow chart

- Each node type is its own Svelte Flow component, with a colored header (Dialog, Branch,
  Stage, …) and the text inline, cut to a few lines. A Dialog node has **one output handle per
  option**, with the option's text (story-point options in green), so the chart reads like the
  conversation. Read-only nodes (Link, imported vanilla dialog) have dashed borders.
- Create: drag from an option handle into empty space → menu of node types. Double-click the
  canvas → new node. Ctrl+D duplicates, Delete removes (with its edges), Ctrl+Z / Ctrl+Y undo
  through the shared history.
- **Group frames** per stage (Svelte Flow sub-flows), colored like the stage in the outline.
- **Auto-layout** (elkjs, left-to-right), applied to the selection or the whole graph.
  Positions are saved in the plan file.
- **Find** (Ctrl+F) over node text, option text and ids; **Outline** jumps to stages.
- Problems show as a red corner on the node: dead ends without End, unreachable nodes, options
  that lead nowhere, unknown ids, `$tokens` that are never set, too many options for the
  dialog window.
- **Import existing dialog**: pick a vanilla or mod conversation (e.g. starting at
  `gaData_option`) and it is drawn as a read-only graph you can study, or **Link** to from your
  own nodes. This is the same view as the **Dialog browser** page, which shows any trigger chain
  from the whole `rules.csv` set (41,000 lines in vanilla).

### Dialog mock-up

A panel that draws the selected node the way the game's interaction dialog does:

- Left: the visual (person portrait with name / rank / faction crest, or an image or planet),
  using the game's own portrait and image files where they are, read-only.
- Text area: paragraphs in the game's text color, **highlighted** `$tokens` / `SetTextHighlights`
  in the highlight color, `AddText` lines with their color, the fading "previous text" above.
- Options: numbered `1.`–`9.` like the game, disabled ones greyed, tooltips on hover, story-point
  options in their color with the cost, `ESC` shortcut marked.
- Token substitution from a **Test context** panel: player name, gender, the speaker person,
  faction, market, and the quest's variables with sample values (`$heOrShe`,
  `$personLastName`, `$playerName`, `$faction`, `$market`, …, a table of vanilla tokens).
  Tokens the preview can't resolve are shown in brackets, not hidden.
- The panel is drawn at the game's dialog size, with a ruler, so you can see if the text
  overflows.
- Fonts (Q6): the preview uses **the game's own bitmap fonts from M2 on**, so line breaks and
  overflow match the game. They are AngelCode BMFont text files (`graphics/fonts/*.fnt`, one
  `_0.png` page each); the dialog uses `defaultFont` from `settings.json`
  (`insignia15LTaa.fnt` in 0.98a). The renderer reads the `.fnt` and page image from the game
  folder at runtime, read-only, draws glyphs on a canvas, and never copies them into a mod or the
  app. If the game folder lacks a font, it falls back to a system font and says so in the panel.
- Colors come from `settings.json` too: text `standardTextColor`, highlights `hColor`, options
  `buttonText` / `buttonBg`, shortcut keys `buttonShortcut`, story options `storyOptionColor`.

### Play mode

**Play ▶** (or "Play from here" on a node) runs the quest graph with a small rules engine in
`shared/`: it evaluates conditions against the test context, applies Action nodes to it
(credits, rep, variables), and follows the clicked option. It shows the path taken on the chart,
the current variables, and a log ("Branch took 'rep ≥ friendly'"). The engine evaluates the
**exported rules**, not the graph, so Play tests what the game will actually see, including
FireBest specificity. Library commands (`SF_Step`, `SF_Reward`, …) are simulated by the
TypeScript copy of the library's logic. Things it can't simulate (fleet battles, a mod's own
hook classes, `Call` into other mods' Java) ask you to choose the outcome; outcomes the plan
doesn't handle are listed greyed with "add an outcome". Wait / Arrive nodes advance a simulated
day counter, so time limits can be tested. Controls: **Restart**, **Step back**, **Play from
selected node** (asks for any variables that path needs). Play never changes the plan or the
mod. Unvisited nodes fade and the path taken is drawn green.

The bottom dock has three tabs: **Dialog preview** (with the Test context beside it),
**Problems** for this quest, and **Play log**.

### Rules view

A tab next to the chart lists the `rules.csv` rows the quest exports, read-only, with the node
each row came from. Click a row to select the node. Modders who know `rules.csv` can check the
output before exporting.

---

## 6. Reading and writing mod files without breaking other mods

### Reading

- **Index everything read-only**: `starsector-core/data` plus every mod folder (enabled mods
  first, then the rest marked "not enabled"), in load order (dependencies first, then mod
  order, verify how the game orders mods). The index records **who defines and who changes**
  each id: a faction defined by vanilla and patched by two mods shows all three.
- Parsers are Ship Editor's, made for Starsector's loose JSON and CSV. Unknown keys, comments
  and formatting are kept.
- Never execute or load other mods' code. Java-defined content (e.g. systems built in a mod's
  `SectorGeneratorPlugin`) can't be read, so it shows as "defined in code by <mod>". Where it
  matters, ids are recovered by scanning the mod's `.java` sources if shipped (best effort,
  flagged).

### How the game merges (what we rely on)

| File | Game behavior | What Saga Forge writes |
|---|---|---|
| `*.faction` | Same relative path in a mod is **merged** into the original: objects merged by key, arrays appended (UAF's `player.faction` adds only `flags`) | New factions: full file. Overrides: **only the changed keys / added entries**, at the original path. |
| `factions.csv` | Rows merged across mods | Rows for **our new factions only**. Never a row for an existing faction. |
| `rules.csv` | Rows from all mods combined; FireBest picks the matching rule with the **most conditions** (verify that the same id replaces; either way, Saga Forge treats a shared id as an error, so the plan doesn't depend on the answer) | Only rows with our prefix, never a vanilla id (that would replace vanilla dialog). |
| `person_missions.csv`, `bar_events.csv` | Rows merged by id column, in `data/campaign/` | Our quest rows only, in an owned block (verify that `#` comment rows are allowed in these two files; if not, the editor recognises its rows by the quest ids listed in `project.json` instead of marker rows). |
| `custom_entities.json`, `planets.json`, `settings.json` | JSON merged by key (verify per file; if a file turns out not to merge, the library registers that content at load instead); `ruleCommandPackages` lists are combined across mods (LunaLib, RetroLib, UAF rely on it) | Only our new keys. Content mods never need `ruleCommandPackages`: the library adds its own. |
| `descriptions.csv`, `strings.json` | Merged by id / key | Only our ids. |
| `commodities.csv`, `special_items.csv` | Rows merged by id; a row with an existing id **replaces** that whole row | Rows for **our new items only**, in an owned block (§4.7). |
| `settings.json` → `graphics` → `illustrations` | Merged by key (four installed mods add illustrations this way) | Only our illustration keys (§4.9). |
| `data/config/sagaforge/content.csv` | Our merged index, read by the library with the merged-spreadsheet call | One row per runtime file of this mod. |
| `data/sagaforge/**/*.json` | Read only by the library | Our runtime JSON, one file per quest / system / encounter / people set. |
| Java (`jars/`, `modPlugin`) | One ModPlugin per mod | **Nothing.** Content mods have no generated code. A mod's own hand-written plugin and jar are left alone. |

M0 confirms each row of this table with a small test mod in the game and writes the result into
`docs/FORMATS.md`, so the rules aren't taken on trust.

### Writing rules (enforced in code, not only by convention)

1. **Only the active mod is written**, through a copy of Ship Editor's write guard (real path
   after resolving junctions, never `starsector-core`, never other mods, never
   `enabled_mods.json`, data file types only, refuse if the file changed on disk since it was
   read).
2. **Additions over replacement.** No full copies of vanilla or other mods' files. The writer
   for `.faction` overrides can't produce a full file: it serializes `patch` only.
3. **Prefixed ids everywhere**: factions, people, rules, options, quests, stages, memory keys
   (`$global.sf_lostConvoy_step`). Before export, a check compares every new id with the game
   and every installed mod.
4. **Owned blocks in shared files.** Generated `rules.csv` rows go between marker comment rows:
   ```
   # sagaforge:begin quest=sf_lost_convoy hash=3f9a… (generated by Saga Forge, edits here are overwritten),,,,,,
   ...rows...
   # sagaforge:end quest=sf_lost_convoy,,,,,,
   ```
   Re-export replaces only that block. Rows outside any block (hand-written) are never changed.
   If the block's hash doesn't match (someone edited it by hand), export stops and offers:
   *show diff* / *overwrite* / *detach* (the block becomes hand-written and the editor stops
   owning it). Exported runtime JSON files carry the same header and hash.
5. **Hooking into vanilla dialog without taking it over.** To add an option to a vanilla menu
   (e.g. a bar or a market contact), we add a **`PopulateOptions` rule with `FireAll`**-style
   additions or our own conditions, the way vanilla quests add their options. We never add a
   rule that would win FireBest over a vanilla rule for vanilla's own triggers. A check flags any
   exported rule whose trigger + conditions also match a vanilla/mod rule with fewer conditions
   ("this rule would replace vanilla's greeting for every Hegemony fleet").
6. **Save-game safety** (next section).
7. **Dependencies.** If output uses the runtime library, or another mod's faction, person or
   hull, the mod's `mod_info.json` gets the dependency (asked, one click, like Ship Editor does
   for PuppeteerLib).
8. **Never touch the player's install.** No writes to `Starsector`, `enabled_mods.json` or saves.
   Exporting a mod for testing is linking (the user's own step, as today), not copying.
9. **Show before writing.** The Export dialog lists every file with its state (*new*, *changed*
   with a one-line summary, *same*, or *block* for owned blocks in shared files, with the count
   of hand-written rows left untouched) before anything is written. **Export dialog only**
   writes just the `rules.csv` blocks (useful while testing conversations). The previous version
   of every changed file goes to `sagaforge/backups/<timestamp>/` (last 10 kept).

### Problems and checks

Every problem has a level, an area, a place (clicking it selects the node, faction or entity) and
where possible one-click fixes:

| Level | Meaning | Blocks Export? |
|---|---|---|
| **Error** | The output would be broken: an option or outcome that leads nowhere, an id another mod also uses, an unknown id, invalid file | yes |
| **Warning** | Works, but likely not what you want: a rule that would take over vanilla dialog (FireBest), a scripted faction change, a token nothing sets, too much text for the window | no |
| **Save warning** | A change since the last release that affects players who update mid-campaign (§ below) | no |
| **Style** (Q9) | Writing conventions of vanilla: speech in quotes, second-person narration, highlights for numbers and names. Off by default; switched on in Settings → Checks | no |

A problem can be **ignored with a reason** (e.g. "these two mods are never loaded together");
ignores are stored in `sagaforge/project.json`, so they travel with the mod. Live problems come
from the page being edited; **Check mod** runs the cross-file checks against the game and every
installed mod, enabled or not (Q8).

### Save-game safety across mod updates

Players update mods in the middle of a campaign. The aim: a quest in progress survives an
update as long as its ids and flags stay the same, and the modder is warned before shipping a
change that could break saves.

**How the library keeps state.** Progress lives in **memory keys**, not in classes:
`$global.<quest>_step = "<step id>"`, the quest's own variables (`$global.<quest>_<var>`), and
flags like `$global.<quest>_done`. The step is stored as its **id string**, never as a
position in a list. Vanilla's own stage only holds the lifecycle (`ACTIVE`, `COMPLETED`, …,
from a library enum that never changes; §3.2). `rules.csv` conditions test those same keys, so dialog keeps working after
an update. The library's objects that end up in saves (the active `SagaQuest`, its intel,
spawned fleets' scripts) store only ids and look up the definition in the current JSON on load.
Updated text, rewards and dialog therefore apply at once, and the player keeps their progress.

**On load, the library reconciles** each active quest with the current JSON:

- step id found → continue;
- step id listed in a step's `renamedFrom` → move to the new id;
- step id gone → log a clear warning, keep the quest visible in a "this quest was changed by
  an update" step that lets the player abandon it, and never crash;
- quest gone → end its intel quietly and keep its memory keys (harmless).

**In the editor: release snapshots.** **Mark as released** (with the mod version from
`mod_info.json`) stores a small snapshot of every id that saves can depend on, in
`sagaforge/releases/<version>.json`. From then on, changes are compared with the last
snapshot, and Problems shows a **save warning** with the fix:

| Change since last release | Warning / fix offered |
|---|---|
| Quest id, stage id, variable or flag key renamed or removed | "Players at this stage lose their place." Add `renamedFrom`, or keep the old id. |
| Stage removed that players could be in | as above, or point it at another stage |
| Person, market, system or entity id renamed or removed | "Saves still have the old one; quests that use it break." |
| New system / person placed on new game | "Won't appear in existing saves." Option: `addToExistingSaves`. |
| Faction id renamed | "Existing saves keep the old faction." Strongly discouraged. |
| Variable or stage added | no warning (a missing variable starts at its default) |
| Option ids or text only | no warning (dialog is not stored in saves) |

Renaming anything in the editor changes the display name. Changing an id is a separate action
(**Change id…**) that, if the id is in the last release, opens a dialog before doing it: keep the
old id as an alias (`renamedFrom`, recommended), change it without an alias (players in it lose
their place), or only change the display name. Exported rules always use the new id.

---

## 7. Milestones

Order: infrastructure → the easiest declarative format (factions) → reading dialog → the
planning page (the heart of the tool) → exporting it → the formats that need code (locations,
encounters). Each milestone ends usable and with tests. In-game checks are collected into one
list per milestone (as with the other tools).

| # | Milestone | Contents | Done when |
|---|---|---|---|
| **M0** | Groundwork | App shell copied from Ship Editor (setup screen, settings, active-mod picker, New mod, write guard, data dir, packaging); `GameIndex` for factions, people, markets, rules (all installed mods, enabled or not, Q8), commodities, industries, conditions, portraits; game **definitions** data file for 0.98a (rule commands, tokens, memory keys, Q11); extension point interface (§10, Q7); `LICENSE` (MIT); `docs/FORMATS.md` from an in-game test of the merge table and every **(verify)** item (§6) using a scratch mod in `D:\ModTools\mods` | App opens, lists everything, round-trip tests over all vanilla + installed files pass, merge table verified in game |
| **M1** | Factions | Factions page: two lists (this mod's / changes to others), full editor for additions, effective-value view + patch saving for overrides, known ships picker (hull list from index), colors, names, ranks, logo/crest pick; checks | Create a faction and an override to Hegemony; both load in game; override file contains only the patch |
| **M2** | Dialog browser + mock-up | Read-only graph of any trigger chain in `rules.csv`; rules engine (conditions, token substitution including `OR` random variants); dialog mock-up panel with the game's bitmap fonts (BMFont reader + canvas renderer, Q6) and colors from `settings.json`, drawing the visual panel and every display of §4.9 that vanilla dialog uses; test context | Browse vanilla `gaData` and a mod's greetings; preview matches a screenshot of the game closely, including an illustration, a second person and a "Gained" line |
| **M3** | Quest planner | Quest page: plan files, all node types, inspector forms for known rule commands, option handles on Dialog nodes, show-once options, stages, variables, **phrases** (inline variations and mod-wide phrases, token chips, Show all variants), visual and **displays** forms on Dialog nodes (§4.9), auto-layout, find, undo, problems, Play mode, **test profiles** in Play mode (§4.10); **Saga overview** board, prerequisites and **flags registry** (§4.8) | A two-stage branching quest can be planned and played through in the editor, including a line whose wording changes with commission and reputation; a misspelled flag shows up in the registry |
| **M4** | Dialog + item export (no Java) | Export dialog-only content: conversations on existing people/markets/entities, comm-link greetings, simple bar dialog, show-once options, vanilla displays, the mod's illustrations (`settings.json`); owned `rules.csv` blocks, hash/detach, FireBest conflict check. **Items page** (§4.7) and Description tabs: `commodities.csv`, `special_items.csv`, `descriptions.csv` rows | Exported dialog works in game next to the installed mods, re-export changes only its block; a new quest item appears in cargo with its icon and description |
| **M5** | Runtime library 0.1 + quest export | New mod `mods/SagaLib` (`build.sh`, tests): content index, `SagaQuest`, rule commands, people, phrase token generator, `SF_Show…` displays, **dev tools** (test profiles at new game and from the dev menu, jump to step, JSON reload; §4.10), save reconciliation, log errors. Editor: **People page** (§4.2; placement at existing markets now, at new ones from M6, as fleet commanders from M7), quest runtime JSON, people JSON, `content.csv`, `person_missions.csv` / `bar_events.csv` rows, dependency in `mod_info.json`; shared golden tests for the Java runtime and the editor's Play mode, including phrase cases | A new contact placed at a vanilla market offers a quest in game, it shows in the journal and completes with rewards; her title for the player changes when the player takes a commission; changing a stage's text in an existing save keeps progress; a test profile applied at new game (dev mode) starts the quest at its second step |
| **M6** | Locations | Editor: systems/entities/markets, hyperspace map with vanilla systems, people placement. Library: system builder, additions to existing systems with existence checks, opt-in `addToExistingSaves` | New system with a market and contact appears in a new game; contact gives the M5 quest |
| **M7** | Encounters | Editor: fleets (composition from the index, doctrine), spawn/behavior, comm dialog via the quest editor, custom entity interactions. Library: quest-stage spawning, standalone fleet manager | Quest spawns an ambush fleet with its own comm dialog; win/lose branches continue the quest |
| **M8** | Save safety + polish | Release snapshots and save warnings, Check the active mod (all cross-file checks), optional style checks (off by default), extension API stub, README with screenshots, Linux test, packaged builds; library 1.0 with a frozen save format; the **Vanguard Compact** example mod built with the app (§1) | The whole walkthrough in PITCH.md works in game, including the update with a renamed stage → 1.0 |

M2 is placed before the editor on purpose: drawing existing vanilla dialog proves the
rules-to-graph mapping and the mock-up before we invent our own format, and it is useful by
itself for modders studying how vanilla writes dialog.

---

## 8. Testing

- **Round-trip**: parse → write unchanged for every `.faction`, `rules.csv`, and CSV in vanilla
  and the installed mods must give identical bytes (Ship Editor has these tests already for its
  formats).
- **Model ⇄ file**: golden tests per writer (faction patch, rules block, runtime JSON).
- **Rules engine**: conditions and FireBest selection checked against hand-picked vanilla
  conversations, with the expected outcomes written down from playing the game.
- **Runtime library**: Java unit tests in its `build.sh` (like ReadAloud). The **same golden
  cases** (quest JSON + choices → expected stages, flags, rewards) run in both the library and
  the editor's Play mode, so the two can't drift apart. Save tests: run a quest to a stage,
  change the JSON (renamed stage with `renamedFrom`, removed stage), reload, and check the
  reconciliation.
- **Write guard**: same tests as Ship Editor (junctions, outside paths, changed-on-disk).
- **In game**: one checklist per milestone, collected at the end of it, using a scratch mod in
  `D:\ModTools\mods`.
- **Acceptance**: the Vanguard Compact example mod (§1, PITCH.md) is kept in `D:\ModTools\mods`
  and its plan files are also used as fixtures: export it and compare with checked-in expected
  output, so a change in any writer shows up as a diff.
- **Dialog preview**: BMFont parsing and line wrapping are checked against screenshots of the game
  for a few vanilla conversations (same idea as M2's "done when").

---

## 9. Decisions (formerly open questions; none left open)

Decided (draft 2):

- **Q1** Shared code: **copy** from Ship Editor and change the copies as needed. A single editor
  suite is a later decision.
- **Q2** Java: **runtime library mod** reading JSON (§3.1). No generated Java in content mods.
- **Q3** ModPlugins: no longer an issue. Content mods have no generated classes, and the library's
  one ModPlugin finds all content through the merged index.
- **Q4** Existing saves: state is kept in memory keys / flags by id, the library reconciles on
  load, and the editor warns about changes that can break saves (§6, "Save-game safety").
  New systems in existing saves are opt-in per system.

Decided (draft 3):

- **Q12** License: **CC BY 4.0** (§3.1); changed to **MIT** at the 1.0 release (2026-11-11).
- **Q13** No hard dependencies; **optional support** for other mods through bridges (§3.1).
  None planned yet; MagicLib bounties are the first candidate (§10).
- **Q14** Answered from the API source: the game calls `setMissionId(<row id>)` on each new
  mission object before `create()`, so one generic class works for every quest. Vanilla
  stages must be enums, so the library uses **option A, two layers**: a fixed lifecycle enum
  plus string steps (§3.2). Chosen.
- **Q16** Library name: **SagaLib**, mod id `lastai_sagalib` (§3.1).
- **Q15** Cross-mod export targets: yes, starting with MagicLib bounties (§10, task #27).

Decided (final, 2026-11-10):

- **Q5** Plan files live **inside the mod**, in `<mod>/sagaforge/`, so they travel with the mod's
  git repo. The game ignores unknown root folders (checked: nine installed mods ship `src`,
  `docs`, `dev`, … next to `data`). Release zips leave the folder out.
- **Q6** The dialog preview uses **the game's bitmap fonts from M2 on** (BMFont `.fnt` + page
  image, read from the game folder at runtime, never copied; §5). System font only as a fallback.
- **Q7** Nexerelin faction config, LunaLib settings and other frameworks come **after 1.0**, as
  extensions. The extension point is designed in M0. MagicLib bounties stay first, right after M5
  (task #27).
- **Q8** **Index all** `rules.csv` rows of vanilla and every installed mod, enabled or not (needed
  for id-collision and takeover checks); draw graphs lazily per trigger chain.
- **Q9** **Style checks are optional, off by default** (Problems level "Style", §6). They never
  block Export.
- **Q10** Names stay: app **Saga Forge** in `tools/saga-forge`, library **SagaLib**
  (`lastai_sagalib`).
- **Q11** Target **0.98a**, with game definitions (rule commands, tokens, memory keys, colors) in a
  **data file**, like Ship Editor's definitions, so a new game version is a data update. SagaLib
  checks `gameVersion` and logs a warning on a version it wasn't built for.
- **Q17** Saga Forge's own license: **MIT** (§3.1).
- **Q18** Characters get their own **People page** (§4.2), built in M5. The mod's characters and
  existing ones are separate lists; existing ones are read-only.
- **Q19** Conditional text inside a line is supported through **phrases** (§4.3): named per
  character or mod-wide, or inline in one node, filled in by SagaLib's token generator; split into
  separate rules for mods without SagaLib (up to 4 combinations). Different flow still uses
  Branch nodes.

Decided (second amendment, 2026-11-10, after reviewing possible missing features):

- **Q20** An **Items page** with descriptions, in M4 (§4.7). New items only; existing items
  read-only.
- **Q21** **Random targets** for repeatable quests: **stub only** in 1.0 (§4.4); the full design
  waits for the MagicLib bounties work so both can share one picker (§11.2).
- **Q27** **Show-once options** (once per conversation / once ever), exported with vanilla's own
  flag pattern, in M3/M4 (§4.3).
- **Q22** A **Saga overview** page with prerequisites and a flags registry, in M3 (§4.8).
- **Q23** **Test profiles**: start a game, or change a running one, with flags and quest steps
  already set, through SagaLib in dev mode, plus JSON reload (§4.10). Editor in M3, SagaLib in M5.
- **Q24** **Dialog displays**: support everything the game's dialog can show, vanilla commands
  first, SagaLib commands for the rest (§4.9).
- **Q25** **Nexerelin random-sector awareness is on hold.** All mod compatibility questions are
  discussed together after 1.0 (§11.7). *Decided 2026-11-17 (task #31): built without a bridge,
  §10.3.*
- **Q26** After-1.0 features and their intent are recorded in §11, so they shape 1.0's design
  (data formats, ids, extension points) without being built now.

No questions are open. The 11 **(verify)** items (§3, §4, §6) are M0 checks with fallbacks, not
decisions.

---

## 10. Cross-mod support

Saga Forge can read other mods' content formats and export to them, so a modder can use a
framework players already have instead of (or as well as) SagaLib. Each one is an
**editor extension** (reads/writes the format, adds pages or node types; `docs/extensions.md`)
plus, where in-game behavior is needed, an **optional bridge** in the library (§3.1). Rules for
all of them:

- Only the active mod is written, with prefixed ids, like everything else (§6).
- Every other mod the mod has content for is in its list as **required**, **optional** or
  **incompatible** (§10.1). A required mod is added to `mod_info.json` dependencies (asked, one
  click). An optional one is never added there, and everything that uses it is conditional
  (§10.2) or a version (§10.6). An incompatible one only gets a warning. Not using a mod adds
  nothing.
- The library must run normally when that mod is not installed.
- Their formats are documented from the installed mod (read-only) in `docs/FORMATS.md` before
  any code is written, with the version they were checked against. For this review that is
  FORMATS.md, "Other mods and frameworks" (Nexerelin 0.12.2d, LunaLib 2.0.5, MagicLib 1.5.6 and
  the dependency survey of the 26 installed third-party mods).

### Decisions (task #31, 2026-11-17)

| Candidate | Decision | Why | Work |
|---|---|---|---|
| **The mod's list of other mods (required, optional, incompatible), conditional content** (§10.1, §10.2) | **Build** (first) | The game has no optional dependency, so "works with X" has to be done the way installed mods do it: data only X reads, plus `isModEnabled` checks. The same list filters the editor's lists and shows mod-specific tools. Every integration below relies on it. | **Task #60** |
| **Versions by installed mods**, and the editor reading other mods' content (§10.6) | **Build** | One character, quest or place with versions per combination of optional mods, chosen at new game. The editor must know other mods' places and people to offer them. | **Task #64** |
| **Nexerelin: random sector** (§10.3) | **Build**, no bridge | The most common way quests break with Nexerelin: hand-made vanilla markets, systems and people don't exist. Nexerelin marks the sector in memory (`$nex_randomSector`), and the fallback, random targets, is already built (Phase 7c). | **Task #61** |
| **Nexerelin: markets changing owner mid-quest** (§10.3) | **Build**, no bridge | Invasions are routine with Nexerelin. A quest pointing at a market that changed hands reads wrong or gets stuck. A daily owner check in SagaLib covers every mod that moves markets. Nexerelin's listener would need a bridge and covers only Nexerelin. | **Task #61** |
| **Nexerelin: faction config** (`exerelinFactionConfig`, §10.3) | **Build**, data only | 5 installed faction mods ship one without depending on Nexerelin. Without it, a new faction gets Nexerelin's neutral defaults: it can't be picked at the start, and its starting relations follow Nexerelin's modes. | **Task #63** |
| Nexerelin: quest skip (`questSkip.json`) | **Later** | A convenience, not a breakage: lists the mod's quests in Nexerelin's new-game "skip quests" screen. Data only, since a SagaLib quest's end state is memory, but it needs a small design: which ending a skip means and which flags that ending sets (the editor could compute them from the chosen path). Rewards would need a plugin. **Built (#65)**: Nexerelin applies the flags only through a plugin, so SagaLib's bridge plugin is named by every chain and also gives the rewards. | **Task #65** |
| Nexerelin: custom starts, scenarios, its other configs | **No** | Starts and scenarios need a Java class each. The other configs (agents, mercenaries, ground battles, mining) aren't quest, faction or location content. | — |
| **LunaLib settings page** (§10.4) | **Build** | 10 installed mods ship a LunaLib page, 7 of them without depending on LunaLib, so it's where players expect a mod's options. SagaLib can read the defaults without LunaLib, so players without it lose nothing. | **Task #62** |
| MagicLib bounties | unchanged: **tasks #27 and #59** | Optional by default under §10.1 (the bounty file is only read by MagicLib). | #27, #59 |
| MagicLib achievements (`magic_achievements.csv`) | **Later** | A nice reward for quest endings. The file does nothing without MagicLib, but unlocking needs a bridge (no rule command), so it belongs after #59, which creates the MagicLib bridge. **Built (#65)**: Saga › Achievements, `SF_Achievement`. | **Task #65** |
| Version Checker files | **Done** (Phase 8b) | 22 of 26 mods ship one. Saga Forge already writes it with the release. | — |
| ReadAloud voice hints (our mod) | unchanged: **task #58** | §11.8. | #58 |
| LazyLib, GraphicsLib, Ashlib, Building Menu Overhaul, AoTD Theory of Toolbox, PatchLib, RetroLib, sidebarLib, VideoLib, Variants Lib, Particle Engine, Officer Extension, Crew Replacer, Second-in-Command | **No** | Popular as dependencies (LazyLib 16, Ashlib 5, GraphicsLib and BMO 3), but none has a campaign content format a quest, faction, person or location would use. They are code libraries, combat or UI frameworks, ship tools, or (PatchLib) patch the game's own code, which the project rules rule out. A mod made with Saga Forge can still list any of them as required (§10.1). | — |
| Ruins across mods (RUINS-ASSESSMENT F9, INGAME-CHECKS RC-F9) | Covered, no separate work | AoTD Vaults of Knowledge replacing vanilla's `ruins_*` specs doesn't touch ours (separate specs). Ruins on another mod's planets are a conditional addition (§10.2). In a random sector, random ruins targets (Phase 7c) are the fallback (§10.3). | — |

### 10.1 The mod's list of other mods (Saga › Mods)

The game has no optional dependency and no "incompatible" key (FORMATS.md, "mod_info.json and
dependencies"). A mod in `dependencies` must be enabled, and the launcher knows nothing else.
Mods that support another mod "if present" check `isModEnabled` in code and ship data files only
that mod reads. Saga Forge does the same, driven by **one list per mod**: the other mods it has
content for.

**Where.** Stored in `sagaforge/project.json` → `mods: [{ id, name, use: 'required' | 'optional' |
'incompatible', minVersion?, reason?, neverWith? }]`, next to the prefix and the target game version (#47). A
mod that isn't in the list is not used. The list is edited in a new **Saga › Mods** tab, a table of
the installed mods with these columns:

| Column | What it shows |
|---|---|
| Mod | name, id and version |
| Use | required / optional / incompatible / not used |
| Min version | the lowest version of that mod this one needs |
| Never with | the mods no player runs together with it (#76, §10.8): built-in pairs greyed "known" (AoTD's Theory of Toolbox and the modules that need it, with Industrial.Evolution), more added by hand as `neverWith: [modId…]` on the entry. Their combinations get no versions cell, no combination check and no Play mode combination |
| Used by | what in this mod uses it |
| Unlocks | the tools that appear when it's selected, e.g. "Nexerelin: Sector condition, faction config tab" |
| Reason | incompatible only |

A **pill in the header**, next to the prefix and the target-version pill ("Works with: Nexerelin,
LunaLib"), opens the same tab, so the reason a list is filtered is visible from every page. It's
built there without a mock-up first, and can move if it doesn't fit (§10.7, question 2).
**For the user-experience pass (#67, user, 2026-11-19):** the pill's label lists mod names ("Works
with: AoTD - Dreams …"), which is cut off and reads oddly. Change it to a fixed, generic label such
as **"Cross Mod Support"**, and leave its hover tooltip as it is (the full list of mods).

**What each choice does:**

| Use | `mod_info.json` | Content | Lists, pickers, tools | In game | Release notes |
|---|---|---|---|---|---|
| **Required** | in `dependencies` (with `version` when a minimum is set); the launcher won't enable the mod without it | may use the mod freely | its content and its tools show | — | "Requires" |
| **Optional** | never | conditional (§10.2) or a version (§10.6); the mod must load and play without it | its content and tools show; Play mode gets a switch for it | — | "Works with" |
| **Incompatible** | never: the game can't express it | referring to its content is an Error | hidden | **doesn't stop loading.** When both are enabled, SagaLib logs a warning at startup ("<this mod>: the author marks <other mod> as possibly conflicting: <reason>") and shows it once per save as a notice in game | "Known conflicts", with the reason |
| **Not used** | nothing | referring to its content is a Problem (below) | hidden | — | — |

- **Which mods are offered**: every installed mod, enabled or not (you may have one switched off
  in your own game while you write for it). Not offered: the active mod, SagaLib (still automatic:
  added when the export needs it, §3.1), translation mods (they keep their own link, Phase 8c),
  and the libraries the listed mods depend on, which don't need listing.
- **The incompatible warning** comes from a small file the export writes for SagaLib,
  `data/sagaforge/mods.json`: the mod's optional and incompatible lists with their reasons, which
  SagaLib also uses for its dev menu and for the record of the mods a save started with (§10.2).
  A dialog-only mod has no SagaLib, so it only gets the release notes' "Known conflicts".
- **Filtering the lists.** Read-only lists and pickers (factions, people, systems, markets, images
  and portraits, items, ships, the Dialog browser) show vanilla + this mod + its required and
  optional mods. Each list has a **Show all installed mods** switch. Picking something from a
  mod that isn't in the list offers **Add as optional / Add as required** right there, so the
  filter is never a dead end.
- **Checks are never filtered.** Id clashes and dialog takeovers are still checked against every
  installed mod, as Q8 decided: a clash with an unlisted mod still hits players who use both.
- **Mod-specific tools show only for listed mods.** Examples: the Nexerelin tab on factions and the
  Sector condition (§10.3), the LunaLib Settings list (§10.4), MagicLib bounties (#27), and every
  future purpose-built tab. Settings › Extensions stays app-wide and means "this tool is
  available". The per-mod list decides whether it shows in this mod. The extension contract's
  `requiresMod` drives both (`docs/extensions.md`). Mod conditions (`SF_HasMod`), the "Only with"
  pickers and versions offer only the optional mods. A required mod is always there, so it needs
  no condition or version.
- **What counts as using a mod is found by the editor, not typed.** Every id in the game index
  carries the source that defines it (`Origin.sourceId`). The editor collects references to
  another mod's faction, person, market, system, hull, item, image or rule command, plus the
  framework files the mod writes (LunaSettings, Nexerelin config, MagicLib files). A used mod
  that isn't in the list is a Problem with two fixes, **Add as required** and **Add as optional**.
  The suggestion: a framework used only through its data files (LunaLib, Nexerelin, MagicLib
  bounties and achievements) → optional; another mod's content the story itself needs →
  required.
- **Removing a used mod from the list, or marking it incompatible**, asks first ("12 items use
  UAF"), and the items show in Problems if you go ahead.
- **Load order for changes to another mod's content.** A patch of another mod's `.faction` (or any
  merged JSON) wins for single values only if this mod sorts **after** that mod (FORMATS.md, "Load
  order": for JSON the last mod wins, for CSV rows the first). A check warns when a patched value
  would lose and offers a `sortString`. Without the other mod, the patch does nothing (§10.2).
- **Reading the listed mods' content** (places, people, quests) is §10.6, "What the editor knows
  about other mods".

### 10.2 Conditional content

One setting on every item, the same everywhere: **Only with** these mods / **Only without** these
mods, plus, for Nexerelin, **Only in the hand-made sector** / **Only in a random sector** (§10.3;
on hold since 2026-11-18).
It shows as a chip ("only with Nexerelin") on the item's card and in lists.

**Combining mods.** Both lists take any number of mods, and everything listed must hold: every
"with" mod installed, no "without" mod installed. So mutually exclusive versions of one option or
scene are written like this:

| Version | Only with | Only without | Exported conditions |
|---|---|---|---|
| neither mod | — | A, B | `!SF_HasMod A` + `!SF_HasMod B` |
| A only | A | B | `SF_HasMod A` + `!SF_HasMod B` |
| B only | B | A | `SF_HasMod B` + `!SF_HasMod A` |
| both | A, B | — | `SF_HasMod A B` (all listed) |

- "Either A or B" (any of them) is a switch on the "with" list, exported as `SF_HasAnyMod A B`. A
  rule's conditions are always all-must-hold, so this needs its own command.
- An option with conditions is exported like a show-once option (§4.3): as its own small rule on
  the node's options trigger, carrying the conditions.
- A check plays every combination of the mod's optional mods (2 mods = 4 combinations) and
  reports a node left with no options, or a Branch with no case, in any of them. Play mode's
  switches show each combination. Combinations holding two mods that never run together (§10.8,
  Saga › Mods "Never with") are skipped: turning one on in Play mode turns the other off, and
  "Only with A and B" for such a pair is a warning (no player sees it).
- `SF_HasMod` tests whether a mod is enabled, not its version. A minimum version
  (`SF_HasMod A 1.2`) can be added later if needed.

**Whole questlines.** "Only with" on a quest means SagaLib never offers or starts it. Its dialog
never fires, because those rules test the quest's state, and every later quest that requires it
stays unreachable through its prerequisites (§4.8). The condition **spreads automatically**: to the
quests that need this one, and to the people, places, encounters and events that only this
questline uses. Each shows it greyed, "from: The Lost Convoy", so the designer sets it once on the
first quest. Things also used by unconditional content keep no condition, and the editor says
which ones. The questline's new items and new factions still exist, because the game always loads
them (table below). They stay unused. A faction that should only appear with the mod gets a
scripted change, "hide from the intel tab", with `modsWithout` (SagaLib calls
`FactionAPI.setShowInIntelTab(false)`, in both game versions). The file's own `showInIntelTab`
key can't do it: it would hide the faction with the mod too.

How each kind of output becomes conditional:

| What | How | Without the mod |
|---|---|---|
| Quests, people, systems and additions to systems, encounters, world events, roaming fleets, progress events, pools (SagaLib JSON) | `"modsWith": [...]`, `"modsWithout": [...]` on the item (SagaLib 1.3, additive) | SagaLib skips the item and logs one info line: a quest isn't offered or started, a person isn't created, a system or addition isn't built |
| Dialog: an option, a Branch case, a phrase case, a start rule (`rules.csv`) | condition `SF_HasMod <modId>`, or `!SF_HasMod <modId>` (a new SagaLib rule command; vanilla negates commands with `!`) | the rule doesn't match. The export adds SagaLib as a required dependency (see below) |
| Starting relations and scripted faction changes (`factions.json`) | the same `modsWith` per entry | skipped quietly (today a relation with an unknown faction logs an error) |
| Rewards and costs in another mod's items or ships | a Branch case, or a reward with a fallback | the fallback is given |
| A patch of another mod's faction (`.faction` at its path) | nothing to do: the game loads a `.faction` only through a `factions.csv` row, and this mod has none for it | does nothing (to confirm in game) |
| Framework files (`LunaSettings.csv`, `exerelinFactionConfig/*`, `magic_achievements.csv`, `magicBounty_data.json`, `questSkip.json`, version files) | nothing to do: only that framework reads them | does nothing |
| Game-loaded rows that point at the mod: a new faction's known ships or portraits from it, an item using its plugin class or icon, an industry or market condition from it | **can't be conditional**: the game loads them every time | **Error**: "loaded by the game every time; make <mod> required, or move it into a SagaLib change". Unknown hull ids in a faction count as an error until checked in game |
| Dialog that uses the optional mod's **own rule commands** (e.g. Nexerelin's `Nex_*`, MagicLib's bounty board command) | **can't be conditional**: the game looks up every rule command when it loads `rules.csv` and stops with "Command [X] not found" (seen with SagaLib switched off, INGAME-CHECKS.md 2026-11-15), even inside a rule that `SF_HasMod` guards | **Error**: make the mod required, use its memory keys instead (unset = false, safe), or a SagaLib bridge command that calls it only when it's there |
| Text tokens of the optional mod (`$someModToken`) | safe inside a guarded rule: the text is only shown when the mod is there | an unguarded one shows as raw `$token`: warning |

- **Automatic conditions.** When an item refers to an optional mod's content (a person placed at
  a UAF market, a quest whose contact is that person, an encounter with a UAF fleet), the editor
  adds the condition itself and shows it greyed, "from: uses UAF". The designer adds conditions by
  hand for the opposite case, e.g. a vanilla-only version of a scene with **Only without**.
- **Play mode and the Test context** get a switch per optional mod in the list (default: whether
  it's installed) and the sector switch. Content outside the current setting is greyed and skipped.
- **Check mod** runs a second pass "without the optional mods". The reference checks run with
  those mods' ids removed, so anything that still depends on them unconditionally is reported.
- Test profiles don't switch mods: in game, the real mod list decides. SagaLib's dev menu lists
  what was skipped and why. `SF_HasMod` and the skipping get shared golden cases, like every SagaLib
  rule (§3.1).
- **The mod list a save started with is what counts** (decided 2026-11-17, §10.7). Changing mods
  in a running game isn't encouraged, so SagaLib does what is least likely to break the save:
  - The first time SagaLib sees this mod in a save (at new game, or when the mod itself is added
    to a running game), it records in the save which of the mod's optional and incompatible
    mods are enabled.
  - Every mod condition (`SF_HasMod`, `SF_HasAnyMod`, `modsWith` / `modsWithout`) and every version
    (§10.6) uses that record: a mod counts only if it was enabled when the game started **and** is
    still enabled. A mod added later changes nothing in this mod: no new content appears and
    nothing switches. A mod removed later stops what depends on it, and what already exists
    stays. SagaLib doesn't clean up.
  - **The player is told.** When the enabled mods differ from the record, SagaLib logs it on every
    load and shows a one-time notice per save and per change. Example: "<This mod> was set up for
    the mods this game started with. <Mod1> was added since, so <This mod> plays on without its
    <Mod1> content. Start a new game to get it." For a removed mod: "<Mod1> was removed after this
    game started. The author didn't plan for that, so things may break."
  - The release notes and forum draft (Phase 8b) say it next to "Works with": "Add or remove these
    mods only before starting a new game."
- `SF_HasMod` can't change which mod's JSON value wins (load order, §10.1).
- `SF_HasMod` and `SF_HasAnyMod` are SagaLib rule commands, so a mod that uses them depends on
  SagaLib: the export adds SagaLib as a required dependency, as it does for every `SF_` command
  (§3.1). This only matters for a dialog-only mod, which today ships without SagaLib. Nexerelin's
  sector condition is an exception: it's a plain memory key and works without SagaLib.

### 10.3 Nexerelin (0.12.2d)

**Random sector** (no bridge). **On hold** (decided 2026-11-18, after it was built for #61 and
passed its first in-game check: all random-sector support is descoped for now and kept in its own
on-hold task; the removed code is saved as `docs/parked/random-sector.patch`, see
`docs/parked/README.md`). Only "a quest isn't offered or started when a place it needs doesn't
exist" stayed in #61, as general protection. The design as built:
- Condition **Sector: hand-made / random**, exported as `!$global.nex_randomSector` /
  `$global.nex_randomSector`. That's Nexerelin's own sector-memory flag, unset (= hand-made) when
  Nexerelin isn't installed. It works in `rules.csv` without SagaLib.
- **"Needs the hand-made sector" is found automatically**: content that names a vanilla market,
  system, planet or person that vanilla creates for its hand-made sector (the index knows them,
  §4.5). Problems lists them per item with three choices:
  - **only in the hand-made sector**: skipped in a random sector. This is the default.
  - **use a random target** instead (§11.2, built in Phase 7c): the only kind of place that exists
    in both.
  - **keep**: the designer accepts that it doesn't run there.
- SagaLib already acts like vanilla when a fixed place is missing: the person isn't placed, the
  addition to a missing system isn't built, and the log says so. New: a quest isn't offered or
  started when a fixed market, person or system it needs doesn't exist (`create()` returns false,
  as vanilla's missions do when a search finds nothing), so it can't break halfway.
- The mod's new systems are still built in a random sector, since they don't depend on vanilla's.
  The existing spacing log (`onNewGameAfterProcGen`) reports overlaps with random systems.

**Markets changing owner mid-quest** (no bridge):
- Vanilla has no event for it, and Nexerelin's `InvasionListener` would need a bridge while
  covering only Nexerelin. Instead, when a quest starts, SagaLib remembers the owner of each fixed
  market the quest uses: the giver's market, stage markers, Arrive places, and random targets
  that are markets. It checks them once a day in its runtime script. This covers invasions,
  rebellions, sales and any other mod.
- Per quest, **If a market of this quest changes owner**:
  - **keep going** (the default)
  - **fail the quest**
  - **go to a stage**, where a Branch can test `$global.<quest>_ownerChanged` (the market id) and
    `$global.<quest>_newOwner` (the faction)

  Play mode offers the event in its menu, like an encounter outcome.
- **Contacts.** On capture, Nexerelin changes the faction of a market's administrator, portmaster,
  supply officer and station, base or outpost commander only (FORMATS.md). The People page warns
  when a quest contact has one of those posts at a market that can be invaded.
- **Protect from invasion**: a checkbox on the mod's own markets. SagaLib sets `$nex_uninvadable`
  in the market's memory, and Nexerelin then never invades it. Without Nexerelin it does
  nothing. It's meant for places the story can't lose.

**Faction config** (editor extension, data only):
- A **Nexerelin** tab on the mod's **own** factions (not on overrides):
  - playable and starting faction, difficulty text and new-game tooltip
  - pirate or hostile to all, can invade and invasion strength
  - morality, alignments, diplomacy traits, liked and disliked factions
  - fleet names, free market and tariff, special forces, `corvusCompatible`
  - "keep these relations when Nexerelin randomizes"

  It's exported as `data/config/exerelinFactionConfig/<id>.json` plus a row in
  `data/config/exerelinFactionConfig/mod_factions.csv`. It does nothing without Nexerelin and is
  optional by default.
- **One source for starting relations.** On export, `startRelationships` is filled from the
  faction's relations (§4.1), together with `useConfigRelationshipsInNonRandomSector: true`, so
  Nexerelin applies them in every mode and randomizes them only when the player asks. SagaLib then
  leaves the starting relations of such a faction to Nexerelin whenever Nexerelin is enabled (it
  checks that the mod ships the config file), so the two never overwrite each other. Without
  Nexerelin, SagaLib sets them as today.
- Changing Nexerelin's config for **other** factions (a merged JSON patch would work) is not
  included. Later, if asked. One exception (user, 2026-11-19): **ready-made fleets added to the
  player faction** (free start, own faction), an appended `player.json` with only the fleet lists,
  edited with the factions' ready-made fleets on Fleets › New-game fleets.

### 10.4 LunaLib settings (2.0.5)

- The mod gets a **Settings** list (Saga overview → Settings). Each setting has:
  - an id (prefixed), a label and a tooltip
  - a type: on/off, whole number, number, choice or text, plus header and text lines for layout
  - a default, a minimum and maximum, the choices, and a tab
- Export writes `data/config/LunaSettings.csv`, plus `LunaSettingsConfig.json` when the mod has an
  icon. LunaLib shows the page. Without LunaLib, the file is never read.
- SagaLib reads the defaults from the same file itself (the game's `loadCSV`, no LunaLib needed)
  and sets each value as `$global.<settingId>` on every game load. The LunaLib bridge
  (`src-optional/lunalib`, the same pattern as ReadAloud's) replaces them with the player's values
  and registers a `LunaSettingsListener`, so a change in the menu applies at once.
- Settings work as conditions everywhere: quest `requires`, Branch cases, phrases, and
  on/off switches for whole quest lines ("Enable the pirate questline"). In this first version a
  setting can also scale **encounter fleet size** and **credit rewards** (difficulty). Other numbers
  come later.
- LunaLib's values are shared by every save (FORMATS.md), and the editor says so next to the list.
  Quests read a setting when they decide (when offered, at a Branch), so changing it doesn't break
  a quest that's already running.
- Play mode and the Test context show each setting as a control.
- Optional by default: LunaLib is never added to `mod_info.json` unless the designer makes it
  required.

### 10.5 Order of work

1. The mod's list of other mods, conditional content (§10.1, §10.2): **#60**. Everything below
   uses it. **Built 2026-11-17** (Saga Forge, SagaLib 1.3; in game: INGAME-CHECKS.md, "Task #60").
2. Versions by installed mods, reading other mods' content, the sector snapshot (§10.6): **#64**.
   **Built 2026-11-17** (Saga Forge, SagaLib 1.3; in game: INGAME-CHECKS.md, "Task #64"). As built:
   a version is a set of fields per combination (`versions: [{ mods, set }]` in the plan, SagaLib
   `versions: [{ id, modsWith, set }]` computed from each combination's export); names in dialog use
   generated phrase tokens `$<person>_name` / `_firstName` / `_lastName`; a dialog rule whose
   conditions a version changes (a moved named place) gets copies that exclude each other instead
   of a score; 0.98a has no setter for a faction's long display name.
3. Nexerelin: owner changes (§10.3): **#61**. **Built 2026-11-18** (Saga Forge, SagaLib 1.3; in
   game: INGAME-CHECKS.md, "Task #61", test mod `sixtyone_a`, passed 2026-11-18). As built: the "places a quest needs"
   are read by SagaLib from the quest JSON it already has (contact, `$id ==` start conditions,
   markers, Arrive places), so that part needs no export change; "If a market of this quest changes
   owner" defaults to not watching, and "go to a stage" fires a trigger that runs what follows that
   Stage node. **The random sector was descoped the same day** and is on hold in its own task (its
   code, built and partly checked in game, is in `docs/parked/random-sector.patch`). As it was
   built: the sector was part of every Mods field (`sector`: handmade, random, or any = keep), the
   automatic "only in the hand-made sector" applied only when the mod listed Nexerelin, and "Use a
   random target" replaced the place with a market target in both sectors.
   Follow-up **#70** (a character's presence depends on who controls their market): **built
   2026-11-18** (People › Presence, SagaLib 1.3 `presence` and `SF_FactionRep`; in game:
   INGAME-CHECKS.md, "Task #70", test mod `seventy_a`, passed 2026-11-18). As built: the check runs with
   #61's daily tick and on load and compares the owner's relation level, so wars and peace count
   too; "away" hides the comm-directory entry (`setHidden`), refuses the contact's offers and sets
   `$global.sagaforge_away_<person>`; "elsewhere" only lists them in another comm directory.
4. LunaLib settings (§10.4): **#62**. **Built 2026-11-18** (Saga Forge, SagaLib 1.3 with its
   LunaLib bridge; in game: INGAME-CHECKS.md, "Task #62", test mod `sixtytwo_a`, passed 2026-11-18).
   As built: the list is in `project.json` (`settings`, `settingsIcon`) and Saga › Settings;
   LunaSettings.csv is an owned block, so hand-written rows stay. A whole-number setting scales as
   a percent (100 = as made), a number as times, on/off and choice settings by a factor per value;
   only fleets sized by points scale. A quest-line switch is a quest prerequisite on the setting.
   The editor doesn't translate the page's labels (LunaLib reads the CSV itself).
5. Nexerelin faction config (§10.3): **#63**. **Built 2026-11-18** (Saga Forge, SagaLib 1.3; in game:
   INGAME-CHECKS.md, "Task #63", test mod `sixtythree_a`, passed 2026-11-19; the random sector on hold). As built: the configs are in
   `sagaforge/nexerelin.json` (raw, so unknown keys stay), read in from the mod's own config files
   the first time a mod is opened. **Ready-made fleets** were added (not in the decided list), on Fleets › New-game fleets with the
   player faction's (an appended player.json; user, 2026-11-19): without them, a player joining a
   faction only gets Nexerelin's Custom fleet (FORMATS.md). Only the
   relations without mod conditions go into the config; those with conditions stay SagaLib's.
   SagaLib checks that the mod ships the config before leaving relations to Nexerelin. Answered from
   the code: ModPlugins run in mod order.
6. Deferred cross-mod items: Nexerelin quest skip, MagicLib achievements (after #59), the
   shared-drop-group warning (§10.7, question 5): **#65**. **Built 2026-11-19** (Saga Forge, SagaLib
   1.3 with its third bridge, `src-optional/nexerelin`; in game: INGAME-CHECKS.md, "Task #65", test mod
   `sixtyfive_a`, passed 2026-11-19). As built:
   - **Quest skip** (Saga › Quest skip): chains of the mod's quests; per quest the ending a skip
     means, and Saga Forge computes its flags along the shortest path from the Start node (state, step,
     completed key, ended key, variables, Sets on the way; keys can be left out or added).
     Nexerelin's forced on/off lists come from the prerequisites. **Rewards: given** (the decision this
     task had to make): Nexerelin's code applies a skip's flags only through a plugin, so data only
     was never possible; the plugin SagaLib needs anyway (`SagaQuestSkipPlugin`) gives the path's
     rewards after the time pass, once (`$global.sagaforge_skipped_<quest>`), switchable per quest.
     People to show go through the plugin, not `peopleToUnhide` (Nexerelin's loop throws on a person
     without a comm-directory entry). A skip doesn't unlock achievements.
   - **Achievements** (Saga › Achievements): `magic_achievements.csv` rows (owned block), unlocked at
     an End node or by an action (`SF_Achievement`, through the MagicLib bridge).
   - Images only MagicLib or Nexerelin draw are listed in the mod's `settings.json` graphics
     (`<prefix>images`), since neither loads them.
   - **Shared drop groups**: Phase 8a's warning already covered loot pools; it now covers the mod's
     hand-written rows too.
7. Economy mods review (AoTD, Industrial.Evolution) and commodity targets (§10.7, question 6):
   **#66**. **Reviewed 2026-11-19**: the decisions and designs are §10.8 (formats: FORMATS.md, "Economy
   and colony mods"). Build: commodity targets, mods that never run together, Vaults of Knowledge
   research, Industrial.Evolution faction lists: **#75**, **#76**, **#77**, **#78**. **#76 built
   2026-11-19** (editor only: `neverPairs`, `versionCells` and `switchPlay` in `shared/modlist.ts`;
   tests `test/never76.test.ts`).

MagicLib bounties (#27, #59) follow §10.1 (optional by default) whichever is built first.
**#27 built 2026-11-18** (format and export, no SagaLib change; DESIGN-MAGICLIB-BOUNTIES.md; in
game: INGAME-CHECKS.md, "Task #27", test mod `twentyseven_a`). The bounty file makes MagicLib a used
mod: Problems and the Export dialog offer Add as optional (suggested) or required (one click).
**#59 built 2026-11-18** (SagaLib 1.3's first optional bridge, `src-optional/magiclib`: Action
"Start a MagicLib bounty" = `SF_StartBounty`, conditions "MagicLib bounty … is <state>" =
`SF_BountyState`, read from MagicLib's memory keys; without MagicLib every bounty is unavailable;
true/false quest-ended keys for MagicLib's triggers; DESIGN-MAGICLIB-BOUNTIES.md §6; in game:
INGAME-CHECKS.md, "Task #59", same test mod; passed 2026-11-18 with and without MagicLib).
**#69 built 2026-11-19**: the quest node "Wait for a MagicLib bounty" (outputs succeeded / failed /
expired / dismissed) goes on by itself when the bounty ends; SagaLib watches MagicLib's memory keys
(quest JSON `bountyWaits`; decided over `job_conclusion_script`; DESIGN-MAGICLIB-BOUNTIES.md §7; in
game: INGAME-CHECKS.md, "Task #69", same test mod; passed 2026-11-19 with and without MagicLib). If #27
comes before step 1, it keeps today's one-click dependency question, and step 1 turns that into
the required/optional choice. ReadAloud hints (#58) are independent.

### 10.6 Versions by installed mods

The bigger form of §10.2: instead of an item that exists or not, **one item with versions** per
combination of the mod's optional mods. Example: a character, Reyes, with two optional mods,
Mod1 and Mod2.

| Version | What the designer sets there | What Reyes ends up with |
|---|---|---|
| Base | everything, as today | normal location, name, portrait and dialog |
| + Mod1 | location: a market from Mod1 | Mod1 location; the rest from Base |
| + Mod2 | last name, portrait | Mod2 name and portrait; the rest from Base |
| + Mod1 & Mod2 | the swapped dialog | Mod1 location + Mod2 name and portrait + swapped dialog |

- **One id, not copies.** Four separate characters would mean four ids that every quest, rule,
  flag and save would have to choose between. With versions, the id never changes (save-safe),
  the designer edits one item, and each version stores only what differs.
- **The editor**: a versions strip at the top of each editor that supports versions, built from the
  optional mods (2 mods → Base, Mod1, Mod2, both). Picking a version shows the item as it will be
  in that version. A field changed there becomes that version's value, with **Revert**, like a
  faction override's `set` entries (§4.1). There is no cell for a combination holding two mods
  that never run together (§10.8; e.g. VoK and Industrial.Evolution optional → Base, VoK, IndEvo),
  and the versions checks skip it. A version stored for such a combination is a warning ("never
  applies"). SagaLib is unchanged: if a player enables both anyway, the usual inheritance applies.
- **Inheritance**: the most specific matching version wins, field by field (both → Mod1 or Mod2 →
  Base). So the "both" version above only holds the dialog swap. If Mod1 and Mod2 set the same
  field differently, the editor asks for the value in the "both" cell.
- **Chosen from the mod list the save started with** (§10.2), and kept. SagaLib picks each item's
  version from that record and stores it in the save. Generated rules test the stored choice, so a
  mod added to a running game never changes an established character mid-story. Items the mod adds
  in a later update of its own get their version from the same record the first time a save sees
  them. Versions never switch later (§10.7, question 4).
- **What Saga Forge generates** (the designer never writes the copies):
  - SagaLib content (people, quests, encounters, systems, events, pools, relations, scripted
    faction changes): one entry with `"versions": [{ "modsWith": [...], "modsWithout": [...],
    "set": {...} }]`, which SagaLib resolves.
  - Dialog (`rules.csv`): one extra rule per node that a version changes, carrying the stored
    version as a condition. The more specific rule wins (§6). A version can change a single node
    or replace a whole conversation from its first line.
  - Quest starts: a contact quest starts wherever its contact is, so the person's version is
    enough. A start at a place (Arrive, bar) gets its own version. A place used in several spots
    (start, stage markers, Arrive) can be one **named place**, so it's changed once.
  - Names in dialog use the person's name token, so a version's name shows everywhere. A check
    warns when a text spells out a versioned name literally.
- **Play mode and the Test context** get a version switch (the optional mods' switches).
- **Versions by a setting fixed at new game** (#67 U18, user 2026-11-21; SagaLib 1.4): an on/off or
  choice setting of the mod's own (Saga › Settings) marked "Versions may depend on it" adds cells:
  each value alone and each value with each optional mod. In the plan a version's `mods` holds the
  token `setting:<id>=<value>`; SagaLib's files get `settingsWith: ["<id>=<value>"]`. SagaLib records
  every setting's value when the game starts (`$global.sagaforge_setting_<id>`) and picks the version
  from that, once, like mods; changing the setting later in LunaLib's menu doesn't change the save's
  versions (conditions still read the value now). Not for items and descriptions (they follow the
  installed mods at startup). Play mode uses the Test context's values.

**What can have versions:**

| Kind | How |
|---|---|
| People, quests (start, places, text, rewards, time limits), dialog, encounters and fleets, the mod's own systems and markets, world events, pools, starting relations | fully, chosen at new game |
| A faction at runtime: display name, logo, crest, secondary color, known ships, illegal goods, doctrine, hidden from the intel tab | through SagaLib's scripted faction changes. `FactionAPI` has setters for these (`setDisplayNameOverride`, `setFactionLogoOverride`, `setFactionCrestOverride`, `setSecondaryColorOverride`, `setShowInIntelTab`, …), in both game versions |
| Items: name, description, icon, base price; descriptions of the mod's places and factions | at startup, from the installed mods, the way translations already rename items (SagaLib 1.2, Phase 8c). `CommoditySpecAPI` and `SpecialItemSpecAPI` have `setName`, `setIconName`, `setBasePrice` (and `setDesc` for special items) in both game versions. The one exception to "the mod list the save started with": these are set before any save is loaded, so they follow the installed mods |
| **Can't have versions** | **Why** |
| A faction or item that exists only with a mod | the game loads it at startup, before anything can check |
| A faction's main color, ranks or music; item tags, stack size and cargo space | loaded at startup, with no setter |
| Other mods' own characters and factions | read-only by project rule. Versioned dialog around them is fine |
| Framework files (LunaLib page, Nexerelin config, MagicLib files) | static files, only read by their framework |

**What the editor knows about other mods.** To offer Mod1's market as Reyes's location, the
editor has to know Mod1's places and people. Today it doesn't, for two reasons:

| | A mod made with Saga Forge | A vanilla-style (Java) mod |
|---|---|---|
| Factions, items, rules, portraits | read today | read today |
| Systems, markets, people | **not read today** (they're in its SagaLib files). New: the index reads every installed mod's `data/config/sagaforge/content.csv` and the files it lists, with that mod as their origin | read only when the mod ships `data/scripts/world/*.java` sources. Otherwise the id is typed and marked "not checked", or comes from a **sector snapshot** (below) |
| Its quests | new: their state keys (`$global.<quest>_state`), so "after Mod1's quest X" works as a prerequisite, conditional on Mod1 automatically | only the memory keys its own rules use (the flags scan already reads them) |

- **Sector snapshot**: a SagaLib dev-menu button (dev mode only) writes the id, name, faction and
  system of every system, market, person and place in the running game to the game's common data.
  The editor imports it as a source "seen in game", together with the mod list it was taken with.
  This turns "not checked" into checked for any mod, Java-only ones included. It was deferred
  from Phase 7c (RC-R1b, for random targets); this is the reason to build it.
- In game there's no difference between the two kinds: SagaLib finds markets and people by id
  through the game's API.

### 10.7 Questions decided (2026-11-17, user)

1. **Task split**: versions, reading other mods' content and the sector snapshot (§10.6) are "Saga
   Forge + SagaLib: versions by installed mods, and other mods' content" (#64), right after "Saga
   Forge + SagaLib: optional and required mods, conditional content" (#60). #60 keeps the rest of
   §10.1 and §10.2, and its description was updated to these decisions.
2. **The header pill**: no mock-up. It's built in the header, and moved later if it doesn't fit.
3. **The incompatible warning**: log + a one-time notice in game per save. A dialog-only mod
   (no SagaLib) gets "Known conflicts" in its release notes only.
4. **Mods added or removed mid-save**: not encouraged. SagaLib does what is least likely to break
   the save: everything follows the mod list the save started with, versions never switch, and
   the player is told plainly that the game is in a state the author didn't intend (§10.2).
5. **Mod-related deferred items** leave the deferred list for "Saga Forge: pick the next
   features from the deferred list" (#53) and are grouped in their own task, "Cross-mod support:
   deferred items (Nexerelin quest skip, MagicLib achievements, shared drop groups)" (#65):
   - Nexerelin quest skip and MagicLib achievements (the "Later" items above).
   - Two mods adding the same item to one vanilla drop group: only one row wins (FORMATS.md, "Loot,
     defenders…"; noted for the cross-mod work in DESIGN-PHASE7). A Check warning when another
     installed mod has a row for the same item and group.
   
   Other Saga Forge mods' dialog text (DESIGN-PHASE8, 8c item 13: their rules show with tokens;
   fill them from their `text.json`) goes to the versions task, since it reads other mods'
   content.
6. **Economy mods and commodity targets** (user, 2026-11-17): only after the mod-support baseline
   exists. Commodity targets leave #53's deferred list and go to "Cross-mod support: economy mods
   review (AoTD, Industrial.Evolution) and commodity targets" (#66), a review like #31 that runs
   after #65. Economy mods will probably need their own tabs and tools, shown only when the mod is
   in Saga › Mods (§10.1). Decided in §10.8.

### 10.8 Economy mods and commodity targets (task #66, 2026-11-19)

Reviewed from the installed mods (read only; FORMATS.md, "Economy and colony mods"): AoTD Theory of
Toolbox 1.0.13, Vaults of Knowledge 5.0.7, Seats of Power 3.2.1, Dreams of Past 3.0.6, Building Menu
Overhaul 2.1.0, Industrial.Evolution 4.1.b, and the other installed mods with commodities, industries or
colony content (RAT 3.3.1, UAF 0.8.4c, HMI 0.5.0e, Arma Armatura 3.3.8, Crew Replacer 0.7.8,
Second-in-Command 2.1.1, Nexerelin 0.12.2d). Given by the user: **AoTD and Industrial.Evolution are
never played together** (a mod may support both optionally; narrowed 2026-11-19 to Theory of Toolbox
and the AoTD modules that need it, as Dreams of Past runs with IndEvo), and AoTD's Theory of Toolbox ships its
own `starfarer.api.jar` that players copy over the game's. SagaLib may be split into support modules
if needed.

**What the review found, in short:**
- Only **Theory of Toolbox** changes how the economy works: it replaces the sector's economy
  object, the commodity-on-market objects and the main submarket plugins, and changes how many cargo
  units an economy unit is per commodity. Vanilla's commodity search still runs on it, but **max
  demand is always 0 or 1**, and deficit and surplus are AoTD's own numbers. Its replacement API jar
  changes one method body (`BaseIndustry.getMaxDeficit`, only while ToT is enabled) and no
  signatures, so SagaLib runs unchanged with it.
- **Vaults of Knowledge** adds research. Its techs and the factions' research stance are **merged data
  files** another mod can add rows to. Granting a tech or asking whether one is researched is Java only.
- **Industrial.Evolution** adds content (45 industries, 3 commodities, 42 items) to a vanilla economy.
  It replaces vanilla's `commerce`, and a few merged lists take another mod's factions.
- **Seats of Power, Dreams of Past, BMO** and the other mods add ids or player-only systems, with no
  format a quest, faction or location would write.

| Candidate | Decision | Why | Work |
|---|---|---|---|
| **Commodity targets** (DESIGN-PHASE7 q. 6) | **Build** | Vanilla's own "deliver X where it's short" missions use it, and it's the one random-target kind left that a quest mod commonly wants. The delicate part is ToT: designed below so the same quest reads right with vanilla's economy, ToT's or IndEvo's. No bridge: it uses vanilla's `HubMissionWithSearch`, like the other targets. | **Task #75** |
| **Mods that never run together** | **Build** | With both AoTD and IndEvo optional, the versions strip offers an "AoTD + IndEvo" cell, and the combination checks and Play mode play a combination no player has. Telling the editor removes that work and those false Problems. Editor only. | **Task #76** |
| **AoTD Vaults of Knowledge: research** | **Build**: data + a small bridge | "Finish the quest, unlock a technology" is the most natural economy reward. Techs and faction stances are merged data files, which is optional by nature (§10.1). A quest can make a tech researchable with a plain global flag (`otherReq`), and that needs no bridge. Granting a tech or branching on "has researched" needs VoK's Java API: a bridge in SagaLib. | **Task #77** |
| **Industrial.Evolution: faction lists** | **Build**, small, data only | A faction mod's own faction can be offered an embassy and opted out of custom orders through IndEvo's merged lists. That's two switches on the faction, rows in files only IndEvo reads. Everything else a quest mod wants from IndEvo (its items as rewards, its industries and conditions on the mod's markets, its drop groups in loot) already works through §10.1, §10.2 and §10.6 once IndEvo is listed. | **Task #78** |
| AoTD Theory of Toolbox | **No** tab or tool; covered in commodity targets | Nothing in it is content a quest, faction or location writes. Trade contracts and Grand Wonders are code-only registrations. A mod's own economy commodity without an `aotd_econ_sheet.csv` row gets sensible defaults (multipliers 1), so no row is needed. What ToT changes (demand, deficit, units) is handled where it matters: commodity targets. | — |
| AoTD Seats of Power | **No** | Policies, ambitions, capital and timeline belong to the player faction, and every row needs a Java class. Its capital is a market condition (`aotd_capital`), so "is the player's capital" already works with the vanilla `MarketHasCondition` once SoP is listed. | — |
| AoTD Dreams of Past | **No** | Cryosleeper changes. It replaces vanilla's `cryorevival` industry, so on a mod's own market `cryorevival` is DoP's version while DoP is on. That's noted in FORMATS.md, with no tool. | — |
| Building Menu Overhaul | **No** (unchanged from #31) | It groups every mod's industries in the build menu by itself. Its extension points are Java. | — |
| RAT, UAF, HMI, Arma Armatura, Crew Replacer, Second-in-Command, Nexerelin's market overrides | **No** own tools | They only add ids (or, for Nexerelin, swap plugin scripts). Their items, industries and conditions are offered in pickers once the mod is listed (§10.1), and they're made conditional or versioned like any other mod's content (§10.2, §10.6). | — |
| **SagaLib support modules** | **No split needed now** | The bridge pattern (`src-optional/<mod>`, loaded by class name only when the mod is enabled) already keeps each mod's code apart. The VoK bridge compiles against `Vok.jar` (plus ToT and Ashlib on the class path if javac needs them). The swapped API jar has the same signatures, so one SagaLib jar serves both. A separate jar per module would only be needed if a bridge had to be compiled against a different game API. | — |

#### Commodity targets

**Built and checked in game 2026-11-19 (task #75, SagaLib 1.4.0, unreleased; INGAME-CHECKS "Task #75" passed
in vanilla, with Industrial.Evolution and with AoTD ToT).** As designed below, plus: the yes/no criteria are offered both ways ("produces it" /
"doesn't produce it", `…AtMost(0)`); two more tokens, `_basePrice` and `_value` (base price × amount,
for a text naming the pay); the Action ops **"The target's goods: take / give"** and **"Credits for the
target's goods"** and the condition **"has its goods"** are one SagaLib command,
`SF_TargetCommodity <quest> <var> has|take|give|credits [mult]`; a reward's **"+ for goods"**
(`targetCredits`) adds mult × value to its credits (the setting scale applies only to the plain
credits). Problems warns when a quest takes the goods without testing the cargo first. Play's mock
has a commodity (empty: one of the allowed at random) and a market size; the ToT note is in the
target editor and Play's log. Test mod `mods/seventyfive_a`.

A new kind for the quest variable of type **target** (Phase 7c): **a commodity at a market**. It's
vanilla's `pickCommodity()`: the market search as today (all 56 market criteria), then one
commodity at one of the matching markets.

- **Criteria offered** (each require or prefer, as for markets):
  - **which commodities**: by default the 18 vanilla trade goods (FORMATS.md, "Vanilla's commodity
    search"). With other mods installed, the quest's text and amounts were written for goods the
    designer knows, so "any economy commodity" is a switch, and a list of chosen ones is a third choice.
    A chosen commodity from another mod makes that mod used (§10.1).
  - legal / illegal at that market; not crew or marines (`CommodityIsNotPersonnel`); tags; base price
    range.
  - **the market's situation**, as yes/no only: **produces it**, **is short of it**, **has a surplus**
    (vanilla's `…AtLeast(1)`), and **has at least N in stock** (`Available`, still meaningful with
    ToT).
  - **Not offered**: demand thresholds, and production, deficit or surplus above 1. With ToT, max
    demand is always 0 or 1 and the other numbers mean something else, so a threshold that works in
    vanilla would silently never match there.
- **Amounts**: a quantity is set in **economy units** (default) or in fixed cargo units. SagaLib turns
  economy units into cargo units with the commodity's `econUnit` at the time of the search. So the same
  quest asks for a sensible amount of food or rare metals with vanilla's units, ToT's (food ×0.1, rare
  metals ×10) or another mod's commodity. A "× market size" option is available.
- **Tokens**: the market's tokens as today, plus `<var>_commodity` (name), `<var>_commodityId` and
  `<var>_amount` (cargo units, set when picked).
- **Using it**: the quest's costs, rewards and conditions take the target's commodity and amount
  ("deliver `<var>_amount` of `<var>_commodity` to `<var>_market`"; a credit reward as a multiple of
  its base price × amount). Delivery uses the existing Arrive at the target market plus a cargo check.
- **Play mode** can't know the economy: it picks from the allowed commodities and lets the designer
  choose the outcome, like the other targets.
- **With and without the economy mods**: the same quest works in all of them without a version. With
  vanilla or IndEvo, all criteria act as in vanilla. IndEvo's `IndEvo_parts` is an economy commodity at
  every heavy-industry market, so it can come up when "any economy commodity" is on. With ToT, the yes/no
  criteria ask "is there a shortage / surplus / production" of ToT's own model, and amounts follow its
  units. The quest needs no condition on ToT, and the editor shows a note when ToT is in the mod list.

#### Mods that never run together

- The editor knows a built-in list: AoTD's Theory of Toolbox and the AoTD modules that need it
  (`aotd_theory_of_toolbox`, `aotd_vok`, `aotd_sop`) never run with `IndEvo` (user, 2026-11-19).
  Dreams of Past (`Cryo_but_better`) needs only LazyLib and runs with IndEvo (user, 2026-11-19), so
  it isn't in the list. The designer can mark more pairs in
  Saga › Mods: a **Never with** column, stored as `neverWith: [modId…]` on the mod's entry in
  `project.json` `mods`. Built-in pairs show greyed with "known".
- Effects: the versions strip has no cell for a combination that holds two such mods. Combination checks
  (§10.2) and Play mode's switches skip it. "Only with A and B" on an item is a warning ("never played
  together"). SagaLib changes nothing: if a player does enable both, the usual rules apply (§10.6
  inheritance, most specific wins).

#### Vaults of Knowledge: research

**Built 2026-11-19 (task #77, SagaLib 1.4.0, unreleased); the in-game check (INGAME-CHECKS "Task #77",
test mod `mods/seventyseven_a`) passed on 0.98a-RC8 on 2026-11-20 without and with VoK; VoK 5.0.7 never offers its databank trade (its bug), so the stance had no visible effect; 0.98.5a waits for AoTD.** As designed below, plus:
- The unlock flag is **`$global.<techId>_unlocked`** (VoK's `otherReq` key `$<techId>_unlocked`): the
  tech id already has the prefix. The quest text loses its colons (VoK splits on ":").
- Hand-written rows of both files are listed (Saga › Research "Written by hand", the faction's
  Research tab) with **Edit in Saga Forge**: the row is read into the editor, and the next export
  removes it from the hand-written part and writes it in the block, so an id is never in the file
  twice. Rows nobody takes over stay as they are; Problems checks the ones VoK would read wrongly.
- An End node's **Research** field is a list of techs (`SF_GrantResearch` after the reward lines).
- Found in VoK's code (FORMATS.md): a tech needs a rewards line and an icon VoK can find, or VoK
  fails (Export writes the tech's name as a modifier line when there's none; a missing icon is a
  Problems error); AI factions answer "researched" from one fixed list of 21 VoK techs, so
  `SF_HasResearch <tech> <AI faction>` is only meaningful for those.
- SagaLib's build checks with `jdeps` that only the bridges name other mods' classes, and the
  release export requires the VoK bridge in the jar.

Shown only when `aotd_vok` is in the mod's list (§10.1), for either target version. Today AoTD runs
only on exactly 0.98a-RC8, but ToT for 0.98.5a comes out once 0.98.5a's final RC is out, and it works
the same way (user, from ToT's developer, 2026-11-19). So nothing here is tied to 0.98a. Recheck the
formats against the 0.98.5a release when it's installed.
- **Research tab on the mod's own factions** (not overrides): stance (MERCENARY … CLEANSE), databank
  price and reputation multipliers, the four dialog lines, and forbidden techs. Exported as rows of
  `data/campaign/aotd_faction_behaviour.csv` (an owned block, so hand-written rows stay).
- **Saga › Research**: the mod's own techs. Each has an id (prefixed), name, tier, days, prerequisites (VoK's
  techs, read by the index, and the mod's own), item cost, rewards (industries, ships, weapons, hullmods,
  abilities; a "modifier" line as text only), tree position, icon (listed in `settings.json`
  `graphics.ui_icons_tech_tree`), researched from the start, and **unlocked by a quest**. Exported as
  rows of `data/campaign/aotd_tech_options.csv` (owned block). "Unlocked by a quest" writes
  `otherReq` = a generated global flag (`$<prefix>tech_<id>`), and a quest Action **Unlock research**
  sets it. That's plain data, with no bridge.
- **SagaLib VoK bridge** (`src-optional/vok`): the Action **Grant research** (`SF_GrantResearch <techId>`)
  and the condition **Has researched** (`SF_HasResearch <techId> [faction]`; default the player), also as
  an End-node reward. Without VoK, granting does nothing and logs once, and the condition is false. Like
  every SagaLib command it's safe in an optional mod's rules (§10.2).
- `research_databank` and VoK's items as rewards are ordinary item rewards with a fallback (§10.2).

#### Industrial.Evolution: faction lists

Shown only when `IndEvo` is in the mod's list. An **Industrial.Evolution** section on the mod's own
factions with two switches:
- **Can have an embassy** → a row in `data/config/indEvo/embassy_whitelist.csv`.
- **No custom orders** → a row in `data/config/indEvo/custom_order_blacklist.csv`.

Both files are merged by IndEvo (key `id`) and never read without it. An owned block, so
hand-written rows stay. Systems need nothing: IndEvo's derelict artillery goes only into systems with
a remnant, derelict or ruins theme tag, and skips systems tagged `theme_special` or `theme_hidden`.
A mod's own system has no theme tag unless the designer adds one to its `tags`. When IndEvo is
listed, the system's Tags field says so in its help.

### 10.9 The mod's own Java: plugins (task #79)

**Built 2026-11-20 (task #79, SagaLib 1.4.0, unreleased); in-game check INGAME-CHECKS "Task #79 plugin
node", test mod `mods/seventynine_a`. First real user: the Heliopolis ending (a plugin that shrinks
every market by 1–2 sizes, written separately).** User decision: a mod made with Saga Forge may ship
its own small jar with "plugin" classes, and a quest can fire them.
- **SagaLib**: the stable API `lastai.sagalib.api.SagaPlugin` (`String run(SagaPluginContext ctx,
  Map<String,String> args)`) and `SagaPluginContext` (quest and node ids, rule id, the dialog and the
  rule's memory map, both may be null, and `addText`). The rule command
  `SF_RunPlugin <class> ["quest=<q>" "node=<n>"] ["key=value" …]` makes a new instance each call with
  vanilla's `getInstanceOfScript` and stores the result in `$global.<q>_<n>_result`. A missing class,
  a class that isn't a plugin, or an exception logs one error line and counts as no result; the game
  goes on. SagaLib keeps no plugin state.
- **Quest node "Plugin"**: class (picked from the classes of the jars `mod_info.json` lists, read from
  the jars without Java; free text allowed; Rescan jars), key = value arguments (a `$key` value is read
  from memory when it runs), and declared result ids. Outputs: one per result, plus **otherwise** (no
  result, another result, a failure). Exported as a rule that runs the line and fires
  `<q>_<n>_result`, one rule per connected result (`$global.<q>_<n>_result == <r>`), and a fallback
  without conditions (FORMATS.md "Plugins").
- **Action op "Run a plugin"** for Action nodes, world events and progress stages (no results; a
  quest's keeps its result in the same key for later Branches).
- Each `"key=value"` is quoted in the export: the game refuses an unquoted `=` in a command line at
  load (FORMATS.md, rules.csv); Problems flags hand-written `SF_RunPlugin` lines that forget it.
- **Play mode** can't run Java: at the plugin it shows "(Play) The plugin returns …" buttons for each
  declared result and "No result, or the plugin fails". The Script view and quest skip name the plugin.
- **Problems**: no class (error), not a class name (error), the mod lists no jar or the jar isn't
  built (warning), the class isn't in the jars or isn't a SagaPlugin (warning), `quest` / `node` as an
  argument key (error), bad, duplicate or unconnected results, two rules with one id (a node
  `x_ok` next to node `x` with the result `ok`: error, for every node type). The export raises the
  SagaLib dependency to 1.4.0.
- Arguments aren't translated (the plugin's own texts are its business).

### 10.10 One-name characters (task #79, second part)

**Built 2026-11-20 (SagaLib 1.4.0, unreleased); in-game check INGAME-CHECKS "Task #79 one-name
characters", test mod `mods/seventynine_a`.** User: single-name characters (Heliopolis's cats
Tyger, Butters, Mousey), ours and other mods', must read right. Vanilla's full name trims, so only
the first name breaks (FORMATS.md, "One-name characters").
- **People › One name**: stored as `oneName: true` with the name in the last-name slot; the First name
  field is hidden and the help says why; the preview shows what the name tokens say. New person can
  make one directly. Exported as `"oneName": true`, `name.first` empty.
- **SagaLib**: a generator registered after vanilla's fills `$personFirstName` and `$PersonFirstName`
  with the one name for any one-name active person (first blank, last not; any mod's). A blank
  `$<id>_firstName` phrase of a one-name person falls back to the one name; Saga Forge exports the
  one name there anyway.
- **Problems** (warning): a line with `$personFirstName` / `$PersonFirstName` in a conversation with a
  one-name person (its speaker, the contact or bar person, the person or encounter commander its
  start is scoped to), or a one-name person's `$<id>_firstName`: check the wording. The export needs
  SagaLib 1.4 when such a line exists.
- Play mode, the Test context and the dialog preview fill the tokens as SagaLib does. Lists and
  messages show the trimmed full name.

---

## 11. After 1.0: long-term intent

Not built for 1.0. Written down so the intent survives until the work starts, and so 1.0 doesn't
make choices that block these. Each entry: what it is, why, what 1.0 must already do for it, and
what is still to be decided. Tasks: one for the editor features (§11.1–§11.6) and one for the
mod-related work (§11.2, §11.7, §11.8; plus the existing task #27).

### 11.1 Writing tools: script view, spellcheck, punctuation checks

- **Script view**: a whole quest as a screenplay, one branch after another, plain text, with
  speaker names and option choices as headings. Exportable as Markdown, so a proofreader or
  co-writer who doesn't use Saga Forge can read and comment on it.
- **Spellcheck** in every text field (Electron's built-in Chromium spellchecker, with a per-mod
  word list in `sagaforge/project.json` for names like "Kestrel").
- **Punctuation checks** (Problems, level Style or Warning): a missing closing quote, unbalanced
  brackets, a paragraph that ends without punctuation, doubled spaces, a `$token` glued to a
  word, inconsistent quote style (straight vs curly) within the mod.
- 1.0 already prepares: the Style level in Problems (Q9), text kept as plain strings with tokens
  (not rich text).

### 11.2 Random targets (with MagicLib bounties)

- Full version of the 1.0 stub (§4.4): a `target` variable is chosen when the quest is offered,
  from criteria (faction of the market, distance from the contact, system tags, market size,
  hostile to the player, has an entity type), with fallbacks if nothing matches.
- In game: SagaLib maps criteria to `BaseHubMission`'s search calls, so behavior matches
  vanilla's own contact missions.
- In the editor: text uses the target's tokens (`$vgc_q_target_marketName`, system name,
  distance), and Play mode picks from the real sector data in the game index.
- **Decided** (task #27, 2026-11-18; DESIGN-MAGICLIB-BOUNTIES.md §3): no second picker. "Where" is
  described once, as a fixed place or a 7c random target, and a MagicLib bounty gets a
  translation into MagicLib's coarser search (distance bands from the sector's centre, system
  themes, entity tags); the target editor and Problems say which criteria MagicLib can't use.
- 1.0 already prepares: the `target` type in the model, a reserved field in the quest JSON format.

### 11.3 Quest templates

- **+ New quest from template**: delivery, bounty (kill a fleet), escort, investigate a place,
  rescue, smuggling, talk-to-someone chain. Each is a ready chart with stages, placeholder text,
  typical rewards, and notes explaining the parts, built the way vanilla structures the same kind
  of mission.
- Templates are plain plan files in a folder, so modders can save their own quests as templates
  and share them.
- Works best with random targets (§11.2) for repeatable versions.

### 11.4 World events

- Things that happen without the player starting them: on a day, after a quest ends, or when a
  flag changes, the sector changes: news intel, a relationship change, a fleet appears, a market
  changes owner or condition.
- **Research first**: how vanilla does events (`BaseEventIntel` with progress and stages, as
  used for hostile activity and colony crises in 0.98a; `addEventProgressBar` in the tooltip API)
  and how installed mods do theirs (AoTD mods, Nexerelin's invasions, others), so ours fit how
  players already see events. Result goes into `docs/FORMATS.md` before design.
- Likely shape: an **Event** card on the Saga overview with a trigger, conditions and actions,
  run by a SagaLib script; the same Action nodes as quests.
- 1.0 already prepares: flags registry and prerequisites (§4.8) are the trigger vocabulary.

### 11.5 Translation export

- Export every player-visible string of the mod (dialog text, options, phrases, journal text,
  item and entity names, descriptions) as one file per language with stable keys, and import a
  translated file back as a translated copy of the mod's text files.
- Interesting because few Starsector mods support translation, and there is an active
  translation community (Chinese above all), which today translates by editing files by hand.
- **To decide**: the file format (a CSV translators can open in a spreadsheet is likely), and how
  a translated mod is shipped (a separate translation mod that overrides our text rows, so the
  original stays clean).
- 1.0 already prepares: generated ids are stable and every text belongs to one id; phrases keep
  variable wording out of the rule structure.

### 11.6 To discuss: adopting hand-written dialog, release packaging

- **Adopt hand-written dialog**: turn an existing mod's `rules.csv` conversation into an editable
  quest plan, so modders with existing mods can move to Saga Forge. Open points: what to do with
  rules the chart can't express, and whether adopted rows become an owned block. Discuss after
  1.0.
- **Release packaging**: a release zip without `sagaforge/` and `data/sagaforge/dev/`, a Version
  Checker file, and a forum post draft following `Forum Posts/FORUM_POST_RULES.md`. Discuss when
  there is a working version to release.

### 11.7 Mod compatibility (reviewed 2026-11-17, task #31)

The one review of every compatibility question is done. The decisions, with reasons, are in
§10's table, and the designs are in §10.1–§10.4. The formats checked are in FORMATS.md, "Other
mods and frameworks". In short:

- **Build**: the mod's list of other mods (required, optional, incompatible; Saga › Mods) with
  list filtering, tool visibility and conditional content (§10.1, §10.2; #60); versions by
  installed mods and reading other mods' content (§10.6; #64); Nexerelin
  random-sector awareness and markets changing owner mid-quest, both without a bridge (§10.3;
  #61); a LunaLib settings page with a SagaLib bridge (§10.4; #62); Nexerelin faction config for
  the mod's own factions (§10.3; #63).
- **Already planned**: MagicLib bounties (#27, #59), ReadAloud voice hints (#58, §11.8).
- **Later**, grouped in #65: Nexerelin quest skip, MagicLib achievements, plus the shared-drop-group
  warning from the deferred list. **Built** (2026-11-19, §10.5 step 6).
- **No**: Nexerelin custom starts and scenarios, and the libraries with no campaign content
  format (§10's table).
- Questions raised in the review and the user's answers: §10.7.

### 11.8 ReadAloud voice hints

- ReadAloud (our mod, `lastai_readaloud`) reads dialog aloud and chooses a voice from a
  narrator/male/female pool. Saga Forge already knows each character's gender and vanilla voice
  type, and could add a **ReadAloud voice hint** per character (a specific voice, pitch or pool),
  and mark narration vs speech in dialog text.
- **To decide**, with a full look at ReadAloud first: what hints ReadAloud can use, how they are
  passed (person memory keys or tags SagaLib sets, read by ReadAloud if present), and how speech in
  quotes vs narration is told apart. Both mods must keep working without the other.
- 1.0 already prepares: `voice` and `tags` on `PersonDef`, quotes-for-speech as a style
  convention (Q9).

