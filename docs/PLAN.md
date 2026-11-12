# Saga Forge — project plan

Status: **built — Saga Forge 1.0 and SagaLib 1.0** (2026-11-11). Milestones M0–M8 are done
and the acceptance walkthrough passed in game (`docs/INGAME-CHECKS.md`); the Linux test is still
pending. Where the build differs from this plan, `docs/FORMATS.md` and SagaLib's
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

**License:** **Creative Commons Attribution 4.0 (CC BY 4.0)**. Anyone may use, bundle, copy,
change and redistribute it, including commercially, as long as they credit the author and link
the license. Mods that only *depend* on SagaLib (list it in `mod_info.json`) ship none of its
files, so they owe nothing. The repo gets a `LICENSE` file with the CC BY 4.0 legal code and a
short credit line people can copy. **Saga Forge itself** (the editor app) is **MIT**, with a
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
  `hide_in_codex`, price 0, can't be sold), *Trade good*, *Rare valuable*. Columns the form
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

- **Q12** License: **CC BY 4.0** (§3.1).
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
  discussed together after 1.0 (§11.7).
- **Q26** After-1.0 features and their intent are recorded in §11, so they shape 1.0's design
  (data formats, ids, extension points) without being built now.

No questions are open. The 11 **(verify)** items (§3, §4, §6) are M0 checks with fallbacks, not
decisions.

---

## 10. Cross-mod support

Saga Forge can read other mods' content formats and export to them, so a modder can use a
framework players already have instead of (or as well as) SagaLib. Each one is an
**editor extension** (reads/writes the format, adds pages or node types) plus, where in-game
behavior is needed, an **optional bridge** in the library (§3.1). Rules for all of them:

- Only the active mod is written, with prefixed ids, like everything else (§6).
- Using one adds that mod to `mod_info.json` dependencies (asked, one click). Not using it adds
  nothing.
- The library must run normally when that mod is not installed.
- Their formats are documented from the installed mod (read-only) in `docs/FORMATS.md` before
  any code is written, with the version they were checked against.

Candidates, in order:

| # | Mod | What | Status |
|---|---|---|---|
| 1 | **MagicLib: bounties** (`magicBounty_data.json`) | Export a simple quest or encounter as a MagicLib bounty; show existing bounties on the quest page; optional bridge so a Saga Forge quest step can start or check a bounty. Designed together with random targets (§11.2). | **Task #27** (after M5) |
| 2 | LunaLib settings | Settings page for a mod's quests (difficulty, toggles) read by the library | idea, §11.7 |
| 3 | Nexerelin faction config (`exerelinFactionConfig`) and random-sector awareness | Extra faction data for Nexerelin; quests that need the vanilla sector | on hold, §11.7 |
| 4 | **ReadAloud** voice hints (our own mod) | Per-character voice hints for ReadAloud | after 1.0, §11.8 |

Note: bounties are MagicLib's (`magicBounty_data.json`, plus the older `vayraBounties` format it
also reads). LunaLib (2.0.5 installed) has settings and title screens, but no bounty system.

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
- **To decide**, together with task #27: one picker shared by SagaLib quests and MagicLib
  bounties (MagicLib bounties have their own target criteria), so a modder describes "where"
  once and can export it either way.
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

### 11.7 Mod compatibility (all together, after 1.0)

One review of every compatibility question instead of piecemeal decisions:

- **Nexerelin**: random-sector mode (vanilla systems, markets and people don't exist; quests
  that need them should say so and be skipped or use random targets), invasions changing market
  owners mid-quest, its faction config (`exerelinFactionConfig`).
- **LunaLib**: settings pages for a mod's quests (difficulty, toggles), read by SagaLib through a
  bridge.
- **MagicLib**: bounties (task #27, §11.2).
- Other popular frameworks found by looking at what installed mods depend on.
- Each result becomes an extension (editor) and/or a bridge (SagaLib), following §10's rules.

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

