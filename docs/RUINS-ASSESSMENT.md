# Planetside ruins: coverage assessment and proposed editor support

Status: assessment (2026-11-11, task #34). Analysis and planning only: nothing here is built and
PLAN.md is not changed yet. Source: `Useful Docs Folder/Starsector_Planetside_Ruins_and_Salvage.md`
(the "ruins doc"). Checked against PLAN.md (final, 2026-11-10), the code as it stands on
`saga-forge-plan` (`src/shared/model.ts`, `src/shared/defs/0.98a.json`,
`mods/SagaLib/.../SystemBuilder.java`), and the 0.98a files plus the installed mods.

Legend: **Covered** = the current plans already do it · **Partly** = the mechanism is planned but
ruins need something extra · **Not covered** = nothing in the plans.

---

## 1. Summary

The ruins doc says that all planetside content runs through one mechanism: the planet menu is
built by `FireAll PopulateOptions`, and the rules that match add their options. Saga Forge already
plans most of that: dialog as `rules.csv` rows, the "add an option, don't take over the menu"
rule (§6 rule 5), the `option` quest start (`PopulateOptions` + `FireAll`, already in
`model.ts`), Link nodes that fire a vanilla trigger, the Dialog browser, and a definitions file
that already lists the salvage rule commands and the `$market.hasRuins` / `ruinsExplored` keys.

The real gaps are in **four places**:

1. **Locations can't make a ruins planet.** In the model and in SagaLib's `SystemBuilder`, an
   uncolonised planet has no market at all, so it can't carry `ruins_*` (or any) conditions,
   can't be surveyed, and never gets the `$market.*` flags that every ruins rule tests.
   *Biggest gap; it blocks everything else for the mod's own planets.*
2. **Loot tables don't exist in the plans.** Salvage loot (`salvage_entity_gen_data.csv` spec
   rows, `drop_groups.csv` groups) is not in the model, the Items page or any task. Derelicts
   (already built by SagaLib, with a salvage seed), custom entities, ruins and random quest
   rewards would all use it.
3. **Salvage specials and defenders** (sleeper pods, ship in a hangar, transmitter trap; guard
   fleets via `$salvageDOv`) need Java objects. Only SagaLib can set them, and it has no such
   field.
4. **Quest patterns specific to planets.** Some are planned: the "arrive" export, which today
   takes over `OpenInteractionDialog`, and story text before "Explore the ruins", which hands back
   to vanilla. Some are not: flags on an entity that last only during some stages, and random
   ruins targets. These are mostly refinements of M3–M5 and §11.2, not new pages.

Nothing in the ruins doc needs Saga Forge to replace vanilla rows. The vanilla-compatible way is
always **new spec ids, new drop groups, new `PopulateOptions` rules, and flags**. That matters,
because one installed mod (AoTD Vaults of Knowledge) **replaces** all four vanilla `ruins_*` rows
in `salvage_entity_gen_data.csv`. Mods that edit vanilla rows already collide.

---

## 2. Coverage by topic

| # | Ruins doc topic | Coverage | Where in our plans | What's missing |
|---|---|---|---|---|
| 1a | The four `ruins_*` market conditions | **Partly** | GameIndex indexes conditions (M0); `MarketDef.conditions` | Only colonised markets have conditions. An uncolonised planet can't be given ruins (gap G1). |
| 1b | Procgen placement (`condition_gen_data.csv`, `RuinsThemeGenerator`, scavengers, decivilisation) | **Not covered, on purpose** | — | Changing procgen weights is global and changes every other mod's sector, so it's out of scope (§3, "Not proposed"). Only read-only knowledge is useful: the theme tags as search criteria (G9), and deciv ruins in the Test context. |
| 1c | `Misc.hasRuins` / `getRuinsType` helpers | **Not needed** (Java) | — | SagaLib would use them internally (G1, G9). |
| 1d | `$market.hasRuins`, `hasUnexploredRuins`, `ruinsExplored` | **Covered** (definitions) | `defs/0.98a.json` memory keys | The Test context has no "planet" preset that sets them (G5). |
| 2a | Planet dialog entry: `surveyOpen`, `FireAll PopulateOptions`; "Establish a colony" hidden while ruins are unexplored | **Partly** | M2 Dialog browser can draw the chain; §6 rule 5 | The preview and Play mode can't show the *combined* planet menu (vanilla options + ours), and there's no info note that our ruins planet blocks colonising until it's explored (G5). |
| 2b | The eight `salRuins_*` option rules, `$salvageSpecId`, `DisableRuinsExploreIfNeeded` | **Partly** | Dialog browser (M2), Link node `trigger` mode | Reading them is covered. Using our own spec on a planet isn't, because vanilla's rule overwrites `$salvageSpecId` (G3). |
| 2c | Shared salvage pipeline (`salExplore` → `CheckSalvageSpecial` → `BeginSalvage` → `PostSalvagePerform`) | **Partly** | Link node can `FireBest` a vanilla trigger; definitions list every command and trigger | No "hand back to the vanilla pipeline" pattern or check (G4). |
| 2d | `SalvageGenFromSeed`, `SalvageEntity`, `SalvageSpecialInteraction` | **Covered** (as vanilla commands in definitions) | defs | Nothing in the editor sets their inputs (G2, G3, G6). |
| 2e | Loot table: spec rows + `drop_value` / `drop_random` groups | **Not covered** | — | Loot tables (G2). |
| 2f | Planet specials (`SalvageSpecialAssigner`, `Misc.setSalvageSpecial`) | **Not covered** | — | SagaLib field + editor form (G6). |
| 2g | Story narratives before salvage (`salSMOL`-style, `$didSpecialExploreStory`) | **Partly** | `option`/`trigger` quest starts, show-once flags | The FireBest takeover check (§6 rule 5) would flag a `salExplore score:10` rule as a takeover. It needs an "interjection" kind that is allowed when it hands back (G4). |
| 3a | Ruins missions in Java: search (`requirePlanetWithRuins`, `preferPlanetUnexploredRuins`, theme tags), `makeImportant`, `connectWithGlobalFlag`, pirate trigger near the target | **Partly** | Fixed targets: stage markers (§4.4), Encounter spawn on stage (M7). Random targets: stub only (§4.4, §11.2, #27) | The ruins criteria aren't in the §11.2 criteria list (G9). The pirate "spawn when the player is in range" trigger isn't a spawn option (G8). |
| 3b | Rules side: `OpenInteractionDialog score:1000` takeover + `Call … updateData`, back to the menu with `FireAll PopulateOptions` | **Partly**, and it conflicts | PLAN §4.4 exports Wait/Arrive as "a rule on `OpenInteractionDialog` at the place" | That's a takeover by default. It should prefer the lighter section-4 pattern and always hand back (G7). |
| 3b | Ground raid UI (`AddRaidObjective`, `$raidDifficulty`, `mktRaidNonMarket`), story-point bypass | **Partly** | `AddRaidObjective` is in defs; `SetStoryOption` has a form | No form or Play-mode outcome for raids (G10). |
| 3c | Vanilla RDSM text bugs (`$rdsm_variant` vs `variation`, `$rdsm_marketName` never set) | **Covered** (by planned checks) | Flags registry "did you mean", "token nothing sets" | Worth adding as test fixtures (G11). |
| 4 | Story option via a flag that exists only during some stages (`setFlag(planet, …, stages)`, Ziggurat) | **Partly** | `option` start kind, Stage nodes | Quest JSON can't set a flag on an entity for a range of steps (G7). |
| 5a | Recipe: option on every ruins planet or a subset | **Partly** | `option` start kind | Needs the planet-menu hook preset and condition picker (G5). |
| 5b | Recipe: narrative before "Explore the ruins" | **Partly** | as 2g | G4. |
| 5c | Recipe: mission that targets a ruins planet | **Partly** | as 3a/3b | G7, G9. |
| 5d | Changing loot, defenders, specials from Java; re-enabling exploration | **Not covered**, except `$market.ruinsExplored = false` (any Action node can set it) | — | G2, G3, G6. |

---

## 3. Gaps and proposed additions

Each has a suggested home. "M*n*" = an addition to task #32 (1.0). "#30" / "#31" = the queued
after-1.0 tasks. "New" = a new follow-up task.

### G1. Uncolonised planets with conditions (ruins planets) — **M6, needed for 1.0 quality**

**What:** a planet in a Locations system can have **planet conditions without a colony**, the
way vanilla procgen planets do: a market that only holds conditions
(`isPlanetConditionMarketOnly`), not surveyed by default.

- Model: `SystemEntity.conditions?: string[]` (planet/moon only), plus
  `surveyed?: 'none' | 'full'` (default none, as vanilla). The planet still has no `MarketDef`.
  Picker from the indexed `market_conditions.csv` (vanilla + mods), with the four ruins sizes on
  top and the tech-mining modifier shown.
- Optional **"generate like vanilla"**: SagaLib fills the conditions from the planet type with
  vanilla's generator, and the designer's list is added on top. Many modders want "a normal
  planet, plus vast ruins".
- SagaLib: create the condition-only market the vanilla way (verify the call in M6: vanilla's
  `PlanetConditionGenerator` / `Misc` helpers for planet condition markets), with
  `setPlanetConditionMarketOnly(true)` and the survey level. Then vanilla's
  `CoreCampaignPluginImpl` sets `$market.hasRuins` etc. by itself, and "Explore the ruins" works
  with no Saga Forge rules at all.
- Additions to **existing** systems: adding ruins to someone else's planet would change their
  content, so it's a scripted change with a warning, like scripted faction changes (§4.1). That
  belongs in the compatibility review (#31), not in M6.
- Info check: "Players can't colonise this planet until the ruins are explored" (that's vanilla
  behavior, but designers often don't know it).

**Why M6:** without it, everything else in this document only works on procgen planets, never on
the mod's own. It's small: one field, one picker, ~30 lines in `SystemBuilder`. It also helps any
uncolonised planet with conditions (resources, hazards), not only ruins.

### G2. Loot tables (shared feature) — **new task after 1.0, field reserved in M6/M7**

**What:** a **Loot** section, next to Items, that writes the two files vanilla uses for all
salvage:

- **Salvage specs**: rows in `data/campaign/procgen/salvage_entity_gen_data.csv`, our ids only
  (`vgc_ruins_lab`), with `xpSalvage`, tags (the ruins preset: `not_a_custom_entity, no_debris,
  no_remove`), `drop_value`, `drop_random`, and the defender columns. "Start from vanilla's
  `ruins_vast`" copies the *values* into a new id; it never writes a vanilla id.
- **Drop groups**: rows in `data/campaign/procgen/drop_groups.csv` (`commodity, group, freq`),
  for new groups only, the way UAF adds `uaf_keycard_drop`. Entries can be commodities, our
  special items (§4.7), or vanilla's item group syntax (verify the accepted forms in the
  vanilla rows before designing the form).
- **Read-only view** of vanilla's and other mods' specs and groups, showing who changed a row
  (e.g. "replaced by AoTD Vaults of Knowledge"), and a rough **expected loot** preview
  (value × chance) so designers can balance against vanilla ruins.
- Owned blocks in both CSVs (§6 rule 4). Add both files to the merge table and to M0's format
  checks (verify: whether `drop_groups.csv`, which has no id column, merges by appending rows; UAF
  relies on it).

**Who uses it** (that's why it should be one feature, not part of ruins):

| User | How it picks a loot spec |
|---|---|
| Ruins planets (G3) | `$salvageSpecId` → our spec |
| Derelicts and custom entities (Locations M6, Encounters M7) | entity memory `MemFlags.SALVAGE_SPEC_ID_OVERRIDE`; SagaLib already sets a salvage seed on derelicts |
| Quest rewards | a "random from drop group" reward (§4.4 `rewards`), through SagaLib |
| Items page | **Used by** lists the loot groups that drop an item |

**1.0 should already do:** reserve `loot?: LootRef` on `SystemEntity` and on `Reward` in the
model and the SagaLib format (like the `target` stub), so nothing has to change format later.

### G3. Custom loot on a ruins planet — **with G2 (after 1.0)**

Vanilla's `salRuins_*` rules set `$salvageSpecId = ruins_<size>` when the menu is built, so a
value set earlier is overwritten (ruins doc 5d). Proposed: an entity field `loot: <spec id>` in
the system JSON. SagaLib applies it at the right moment with a new rule command,
`SF_SalvageSpec <spec>`, run from a small generated interjection rule on `salExplore` (G4) before
`CheckSalvageSpecial`. The loot itself is rolled later in `BeginSalvage` → `SalvageEntity`, so
setting it then is enough. (Verify in game. Fallback: a generated `PopulateOptions` rule with one
more condition, `$id == <planet>`, that runs after vanilla's and sets the spec again. That
depends on `FireAll` order, so it needs checking too.)

### G4. "Interjection" rules: story before a vanilla action, then hand back — **M3 (model) + M4 (export/check)**

This is the pattern for "Explore the ruins" stories (ruins doc 5b). It is also how quests add a
scene before vanilla's salvage of a derelict, a station or a cache, so it isn't only for ruins.

- New quest start kind, or a mode of `trigger`: **Before a vanilla option**, with the option id
  (`salExplore`), extra conditions, a probability (`RollProbability`), and
  **once per playthrough / once per entity** (generated flags, like show-once options).
- The Link node at the end gets a preset **"Continue vanilla: salvage"** (`FireBest
  CheckSalvageSpecial`). Others can follow the same shape.
- The §6 rule 5 takeover check gets a third result: *interjection*. That's allowed when every path
  ends in a hand-back Link and the rule is limited by a once-flag or a probability. It's an
  **error** when some path doesn't hand back (the player would lose the salvage).
- Play mode: after the hand-back, it shows "vanilla salvage continues" as an outcome.

### G5. Planet menu as a first-class hook target — **M2 (preview) + M3 (presets)**

- Preset hooks in the start picker: **Planet menu: this planet** (`$id == …`), **every
  uncolonised planet with ruins** (any size / a size / gas giants or not, using the vanilla
  `$tag:gas_giant` split), **planets with condition X**. They fill the
  `PopulateOptions` conditions the doc lists, and an option order number with a warning when it
  sorts before vanilla's "Explore the ruins" (`5:`).
- Action preset **Back to planet menu** (`FireAll PopulateOptions`, plus `$leaveGoesToMenu` where
  vanilla uses it).
- Test context presets: *uncolonised planet with vast ruins, unexplored / explored*,
  *decivilised world*. They set the `$market.*` keys, so the preview and Play mode show the planet
  menu as vanilla builds it: vanilla's matching options plus ours, in order.
- Add the ruins chain (`surveyOpen` → `salRuins_*` → `salExplore` → `PostSalvagePerform`) to M2's
  browser fixtures: it's a good test of `FireAll` and of options added by many rules.

### G6. Salvage specials and defenders — **after 1.0, same task as G2**

- System JSON entity fields: `special` (one of the planet-safe vanilla specials: ship recovery,
  sleeper pods by type, cargo manifest, transmitter trap, topographic data), and `defenders`
  (faction, strength range, quality → `DefenderDataOverride`). SagaLib applies them at build
  through `Misc.setSalvageSpecial` and `MemFlags.SALVAGE_DEFENDER_OVERRIDE`. Survey data and
  breadcrumb specials aren't offered for planets, as in vanilla (their text doesn't support
  planets).
- A defender fleet should reuse the **Encounters** fleet form (faction, strength) rather than a
  second fleet editor. The Defeated outcome can lead into a quest, like other encounters.
- Rule command `SF_SetSpecial` / `SF_SetDefenders` so a quest stage can add them later ("the
  pirates you tipped off have moved in").

### G7. Planet scenes in quests without taking over the dialog — **M3 (design) + M5 (SagaLib)**

PLAN §4.4 exports Wait/Arrive as "a rule on `OpenInteractionDialog` at the place". On a planet that
is the `score:1000` takeover (ruins doc 3b): survey, "Explore the ruins" and other mods' options
disappear unless every path calls `FireAll PopulateOptions`. Proposed:

- **Default to the lighter pattern** (ruins doc §4, Ziggurat): SagaLib sets a flag on the entity
  while the quest is at certain steps, and the quest adds a `PopulateOptions` option on that
  entity. Quest JSON: `entityFlags: [{ entity, flag, fromStep, toStep }]`. SagaLib sets and
  clears them on step changes, like vanilla's `setFlag(entity, flag, false, stages…)`.
- **Takeover only when chosen** ("Take over the planet dialog"), with a check that every path ends
  in a hand-back (`FireAll PopulateOptions`) or leaves the dialog. It's the same check as G4.
- This also covers stations and derelicts. Worth telling the build session (#32) before M3/M5
  fix the Wait/Arrive export.

### G8. Spawn a fleet when the player comes near the target — **M7**

Vanilla's ruins missions spawn their pirates with `beginWithinHyperspaceRangeTrigger(planet, 1f,
…)` and order them to patrol the planet. Add `when: 'player-near'` (range in ly or "in system")
to `EncounterDef.spawn`, and `behavior: 'patrol'` around a target entity. SagaLib already plans to
use HubMission triggers, so this is one more trigger kind.

### G9. Ruins criteria for random targets — **#27 / #30 (§11.2)**

Add to the §11.2 criteria list: *planet with ruins* (any / a size), *uncolonised*, *ruins not
yet explored* (prefer), *system theme* (`theme_ruins`, `theme_derelict`, `theme_remnant_*`,
`theme_misc`, as the vanilla missions use), *has condition X* (e.g. `decivilized`), *pulsar in
system*. Also **variations** chosen from the target ("if the target is decivilised, use the raid
branch"). These are Branch conditions on target tokens, so the tokens must be available to the
quest (`$<quest>_target_isDeciv`, …). In Nexerelin's random sector (#31), random ruins targets are
the only kind that works, because there are no fixed vanilla planets. That's a reason to include
them in the first version of §11.2.

### G10. Ground raid as a quest step — **M3 (inspector form) + Play outcome**

`AddRaidObjective` and `$raidDifficulty` / `$raidGoBackTrigger` / `$raidRestrictToTrigger` are
vanilla, and so is the `mktRaidNonMarket` option, so it needs no SagaLib. Give it an inspector
form (objective text, difficulty, value, finish trigger), and let Play mode ask
"raid succeeded / failed". A **Raid** preset on a Dialog option would write the three lines, the
option and the story-point bypass the way vanilla's ruins missions do. Low cost, because the
definitions file already has the command.

### G11. Test fixtures from the vanilla ruins missions — **M3 (checks)**

Use `rdsm`'s two bugs as regression cases for the flags registry ("`$rdsm_variant` is read but
never set, did you mean `$rdsm_variation`?") and the "token nothing sets" check
(`$rdsm_marketName`). Use `gaData` (already in M2's done-when) for the takeover and hand-back
check (G7).

### Not proposed

- **Editing procgen weights** (`condition_gen_data.csv`, ruins themes): global and hard to undo,
  and it changes every sector, including other mods' content. It goes against "never fully
  override how a vanilla feature works". If ever needed, it belongs in the #31 review as a
  scripted, clearly marked change.
- **Changing vanilla `ruins_*` spec rows or vanilla `salRuins_*` rules**: same reason. A row with a
  vanilla id replaces the whole row, as AoTD Vaults of Knowledge already does with all four.
  Saga Forge offers "copy the values into a new spec" instead.

---

## 4. Overlap with loot tables and quests: share, don't duplicate

| Ruins need | Share with | Rule |
|---|---|---|
| Loot for ruins | **Loot tables (G2)**, also used by derelicts, custom entities, quest rewards | One loot model and one CSV writer. Ruins only choose a spec. |
| Items in loot | **Items page** (§4.7) | Loot entries pick from the same item index; Items **Used by** lists loot groups. No item form in the Loot section. |
| Defenders | **Encounters** (§4.6, M7) | Defenders are an encounter-like fleet def with a "salvage defenders" spawn; one fleet form. |
| Ruins stories, planet options | **Quests/dialog** (`option` / `trigger` starts, Link node, show-once flags) | No separate "ruins dialog" editor. Ruins are hook presets (G5) and an interjection mode (G4) on the normal quest page. |
| Flags (`$market.ruinsExplored`, once-per-playthrough) | **Flags registry** (§4.8), definitions file | Vanilla keys are shown as "vanilla"; generated once-flags are shown as "generated", like show-once options. |
| Mission to a ruins planet | **Stages + markers** (§4.4), **random targets** (§11.2 / #27), **Encounters** (G8) | Ruins criteria are entries in the shared target picker, not a ruins-only picker. MagicLib bounties (#27) can use the same criteria for a bounty's location. |
| Takeover and hand-back checks | **§6 rule 5** (FireBest takeover check) | Extend that one check (G4, G7) instead of adding a ruins check. |
| Ruins planet itself | **Locations** (M6) | A field on the planet entity (G1), not a new entity kind. |

---

## 5. Proposed follow-up tasks

Ready to file. They're grouped by where they'd land, and none needs Java in content mods.

| # | Follow-up | Lands in | Size | Depends on |
|---|---|---|---|---|
| F1 | **Uncolonised planets with conditions** (G1): `conditions` + `surveyed` on planet entities, condition picker, "generate like vanilla", SagaLib condition-only market, colonise-blocked info. In-game check: "Explore the ruins" appears on a SagaLib-built ruins planet. | #32, M6 | S | — |
| F2 | **Planet-scene design** (G7 + G4 model): entity flags during steps, interjection start mode, hand-back Link presets, extended takeover check; Wait/Arrive export prefers `PopulateOptions`. | #32, M3 (model/check), M4 (export), M5 (SagaLib `entityFlags`) | M | — |
| F3 | **Planet menu presets and Test context** (G5) + ruins chain in M2 fixtures, RDSM/gaData fixtures (G11). | #32, M2/M3 | S | — |
| F4 | **Raid form and Play outcome** (G10). | #32, M3 | S | — |
| F5 | **Near-target fleet spawn** (G8). | #32, M7 | S | — |
| F6 | **Reserve loot fields** (`loot?` on entity and reward) in the model and SagaLib format; add `salvage_entity_gen_data.csv` and `drop_groups.csv` to the M0 merge table checks. | #32, M0/M6 | XS | — |
| F7 | **Loot tables, salvage specials and defenders** (G2, G3, G6): Loot section, CSV owned blocks, expected-loot preview, `SF_SalvageSpec` / `SF_SetSpecial` / `SF_SetDefenders`, entity fields, random-from-group reward. | **New task** after 1.0 (main queue after #30), or a section of #30 | L | F1, F6, Encounters (M7) |
| F8 | **Ruins target criteria and target-based variations** (G9) in the shared target picker. | #27 / #30 (§11.2) | M | §11.2 picker |
| F9 | **Compatibility notes for ruins** in the #31 review: AoTD Vaults of Knowledge replaces vanilla's `ruins_*` specs (our specs are separate, so no conflict, but vanilla-size expectations change); adding ruins to other mods' planets as a scripted change; Nexerelin random sector + random ruins targets. | #31 | S | — |

Open verifies these would add to INGAME-CHECKS (each has a fallback written above):
`drop_groups.csv` merge behavior (F6); the SagaLib call for a condition-only market (F1); setting
`$salvageSpecId` from an interjection before `CheckSalvageSpecial` (F7/G3); the `FireAll` order of
`PopulateOptions` rules (G3 fallback only).
