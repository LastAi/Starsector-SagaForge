# MagicLib bounties (task #27, part 1; task #59, part 2: §6; task #69, waiting for the end: §7)

PLAN.md §10 (cross-mod support), §11.2 (random targets, "To decide"). The format is in
FORMATS.md, "MagicLib 1.5.6 bounties". Part 1 (§1–§5) needs no Java: the bounty is a data file
only MagicLib reads. Part 2 (task #59, §6) is SagaLib's guarded MagicLib bridge: a quest starts a
bounty and tests its state.

## 1. What a bounty is in Saga Forge

A **bounty** is its own small item of the mod (`sagaforge/bounties.json`, `ModModel.bounties`),
made **from** one of the mod's encounters and, optionally, a simple quest:

- **The encounter** is the target: its fleet (faction, ships, quality, name), its captain (one of
  the mod's people), where it spawns, how it behaves, its comm dialog.
- **The quest** (optional) is the job: its title, offer text, journal texts of the success and
  failure stages, the reward of its success ending, its time limit, its prerequisites, its random
  target (the "where") and its contact (where it is offered).
- **The bounty's own fields** are what MagicLib has and Saga Forge doesn't: the job type
  (assassination …), what the board shows, the board weight, a flagship for a fleet sized by
  points, the offer markets and factions when there is no contact. Every text and number the
  sources give can be overridden; an empty field means "from the source".

The bounty is computed from its sources at every export, so a change to the encounter or the quest
reaches the bounty without a second copy (the "describe it once" goal of §11.2).

**Only as a bounty** (default on): the quest and the encounter are not exported for SagaLib
(no rules, no runtime JSON), so the player doesn't meet the same fleet twice. Off: both exist (a
quest that also posts a bounty, for example); part 2 will connect them.

"Make a MagicLib bounty" is a button on the quest's settings and on the encounter page; the
quest page lists the mod's bounties (made here, and hand-written ones found in the mod's own
`magicBounty_data.json` or `vayraBounties` CSV, read only).

## 2. A simple quest or encounter → a bounty

| Bounty field | From | Notes |
|---|---|---|
| id (key) | the bounty's id, prefixed (`vgc_b_raiders`) | memory key `$<id>`, so other content tests `$global.<id>_succeeded` (also `_failed`, `_expired`) |
| `required_mods_id` | the bounty's, the quest's and the encounter's "Only with" (#60) | "Only without" and "any of" can't be said: a warning |
| `job_name` | bounty › quest title › encounter name | |
| `job_description` | bounty › the quest's offer text (contact `offerText`, bar `blurb`), else its first dialog text | |
| `job_intel_success` / `_failure` | bounty › journal of the quest's first success / failure stage | |
| `job_intel_expired` | bounty only | |
| `job_comm_reply` | bounty › the first text of the encounter's comm dialog | none: no answer (`null`) |
| `job_forFaction` | bounty › the first faction of the success reward's reputation › the contact's faction › the encounter's faction is never used (it is the target) | needed for reputation |
| `job_credit_reward`, `job_reputation_reward`, `job_item_reward` | bounty › the reward of the quest's success ending (credits; reputation × 100; items) | items go into the battle's loot (MagicLib); ships, XP, story points, person reputation and loot tables can't: warning |
| `job_deadline` | bounty › quest `timeLimitDays` | none: -1 |
| `job_type`, `job_show_*`, `job_difficultyDescription`, `trigger_weight_mult` | bounty only (defaults: assassination, show type and captain, `flagshipText`, `vanilla` distance, `auto`) | |
| `trigger_market_id` | bounty markets › the contact's market (contact or bar start with a person) | each market's id **and** its entity id (MagicLib's quirk, FORMATS.md) |
| `trigger_marketFaction_any`, `_alliedWith`, `trigger_market_minSize` | bounty only (default: the paying faction, friendly markets too) | used only when no market is listed |
| `trigger_player_minLevel`, `trigger_min_days_elapsed`, `trigger_min_fleet_size` | bounty only | |
| `trigger_memKeys_all` / `_none` | the quest's flag prerequisites on `$global.` keys (`$global.x` → all {"$x": true}, `!$global.x` → none {"$x": true}, `== true/false`) | a quest prerequisite ("ended with success / failure / either way") → SagaLib 1.3's true/false keys `$sagaforge_success_<quest>` / `_fail_` (all; "either way" → `trigger_memKeys_any`, one only) (#59, §6); other memory: can't |
| `trigger_playerRelationship_*` | contact start `minRep` / `maxRep` (vanilla rep levels → MagicLib's numbers) | |
| `target_*` | the encounter's flagship commander (a person of the mod): first, last name, portrait, gender, rank, post, personality, level | none: MagicLib makes a captain of the fleet faction |
| `fleet_faction`, `fleet_composition_faction`, `fleet_composition_quality`, `fleet_name` | the encounter's fleet | |
| `fleet_flagship_variant`, `fleet_preset_ships` | explicit variants: the first (or template flagship) is the flagship, the rest counted; template: its ships and names; points: the bounty's flagship variant (required) + `fleet_min_FP` = points | the flagship name comes from the template |
| `fleet_behavior` | guard, ambush → `AGGRESSIVE`; patrol, travel → `ROAMING`; intercept-player → (MagicLib's default, aggressive orbit) | |
| `fleet_attitude`, `fleet_no_retreat` | `flags.hostile` → `HOSTILE`; `allowDisengage` false → no retreat | the transponder stays MagicLib's default (off) |
| `location_*` | the "where" (§3) | |

What can't map is listed in the bounty editor ("MagicLib can't: …") and as a warning in Problems;
the bounty is still exported without it. A quest with more than offer → one encounter → ending
(several encounters, raids, branches that change the outcome) is a **source of texts only**: the
editor says the other nodes don't become part of the bounty.

## 3. "Where": one description, two exports (§11.2 "To decide", decided)

**Decision:** the "where" is described **once**, with Saga Forge's own random target (Phase 7c:
pick + requires + prefers, vanilla's `HubMissionWithSearch` criteria) or a fixed place, and Saga
Forge **translates** it into MagicLib's location fields when it writes a bounty. There is no
second picker for MagicLib: its criteria are fewer and coarser, so they are a subset to translate
into, and the target editor says, for a target a bounty uses, how each criterion comes out
("as a MagicLib bounty: …"). SagaLib quests keep vanilla's search exactly.

The bounty's place is, in order: the bounty's own choice (a random target of its quest or an
entity), else the encounter's spawn place (a fixed entity, a named place, or a quest's random
target `$global.<quest>_<var>`), else the quest's only random target.

**A fixed place** (an entity id, or a named place's entity) → `location_entitiesID: [id]`.
MagicLib falls back to the other location fields if it doesn't exist (a random sector), and with
none set the bounty isn't created.

**A random target** (7c). MagicLib's search: entities by id; else a market of these factions;
else systems by themes (any one tag) minus blacklisted themes, in distance bands from the
sector's centre (a preference), unexplored first if asked, then an entity by tag.

| 7c (require / prefer) | MagicLib | How close |
|---|---|---|
| pick `market` + "Faction is" | `location_marketFactions` | exact for the faction; every other market criterion: can't |
| pick `market` without a faction | — | error: MagicLib can only pick a market by its faction |
| pick `planet` | `location_entities: ["planet"]` | |
| pick `system` | (MagicLib's default: stable location, planet, jump point) | the fleet waits at a point in the system |
| pick `entity` + "Entity tags" (any) | `location_entities: tags` | "Entity type" can't (MagicLib looks at tags): warning |
| "System tags" any (require) | `location_themes`, `location_defaultToAnyEntity: false` | as a require |
| "System tags" any (prefer) | `location_themes`, `location_defaultToAnyEntity: true` | as a prefer |
| "System tags" all (more than one tag) | `location_themes` | MagicLib matches any one: warning |
| "System tags" not any | `location_themes_blacklist` | exact (always a require) |
| "Unexplored" | `location_prioritizeUnexplored` | a prefer; as a require: approximate, warning |
| "Inner sector" | `location_distance: CORE` | approximate (a third of the sector's width from the centre), and only a preference |
| "Fringe" | `location_distance: FAR` | approximate, a preference |
| "No black hole", "No pulsar", "Safe stars" | `location_themes_blacklist: no_pulsar_blackhole` | removes both kinds; "safe stars" is close |
| "Not used by another story" | — | can't; MagicLib's blacklist always adds `theme_hidden` |
| "Within / farther than N light-years" | — | **can't**: MagicLib measures from the sector's centre, not from the giver; warning, suggest Inner / Fringe |
| everything else (planet conditions, ruins, survey, market facts, colony of a faction, jump points …) | — | can't: warning |

Always written: `location_themes_blacklist` gets `theme_already_occupied` when the target is
not a market and nothing asks for a colonised system (MagicLib's template default; it keeps
fights out of colonised systems); `location_defaultToAnyEntity` true unless a system-tags require
says otherwise.

**What MagicLib has that 7c lacks**, so the bounty form has it: none needed. `procgen_no_theme`
and `theme_already_occupied` are written by the translation; the distance bands come from Inner /
Fringe. Nothing is added to the 7c catalog for MagicLib.

## 4. The file, ids and the dependency

- `data/config/modFiles/magicBounty_data.json` of the active mod only, merged by key: Saga Forge
  replaces or removes only the keys it wrote last time (`project.exported.bounties`), so
  hand-written bounties in the same file stay (shown read only on the quest page). The ids must
  start with the mod's prefix (error otherwise).
- Texts are converted: `%` → `%%`; Saga Forge's own tokens for what MagicLib knows become
  MagicLib's (`$<quest>_<target>_system` → `$system`, `_name` → `$location`, the captain's name
  tokens → `$name`, `$firstName`, `$lastName`); any other `$` is a warning, because MagicLib turns
  it into `==error==`.
- **MagicLib in Saga › Mods:** the bounty file only works with MagicLib and does nothing without
  it, so PLAN.md §10's rule applies: a mod with bounties uses MagicLib; when it isn't listed,
  Problems and the Export dialog offer **Add as optional** (suggested) or **Add as required** (one
  click; required puts it into `mod_info.json` dependencies with the existing #60 export step).
  A mod without bounties adds nothing.
- The vayraBounties CSV is never written (FORMATS.md: MagicLib skips it while Vayra's Sector runs
  them, and the JSON does everything it does); the editor only lists a mod's existing rows.

## 5. Tests

- Golden files `test/expected/bounties/*.json`: the exported bounty objects for an encounter with
  a fixed place, a quest with a random target and rewards, a points-sized fleet, texts with tokens
  and the unmappable criteria (with their notes). `test/bounties.test.ts` compares them and checks
  the merge with hand-written keys, the dependency choice, and "only as a bounty".
- In game: `mods/twentyseven_a` (prefix `tsa_`, 0.98a, MagicLib 1.5.6, SagaLib 1.3),
  INGAME-CHECKS.md "Task #27".

## 6. Part 2: bounties from quests (task #59, SagaLib 1.3)

PLAN.md §10's rules: SagaLib must load and run normally without MagicLib, and a mod depends on
MagicLib only when it uses it. So SagaLib's first **optional bridge**: `src-optional/magiclib`
(one class, compiled against MagicLib 1.5.6's jar into `SagaLib.jar`), loaded by class name only
when MagicLib is enabled. Nothing SagaLib always loads names a MagicLib class (checked with
`jdeps`). The facts it relies on are in FORMATS.md ("Taking a bounty from code").

**What a quest can do**

| Editor | Exported | Without MagicLib |
|---|---|---|
| Action › **Start a MagicLib bounty** | `SF_StartBounty <id>`: MagicLib creates it (place, fleet) if its board hasn't, and accepts it for the player, with MagicLib's "Accepted job: …" line | does nothing; the log says why |
| Condition **MagicLib bounty <id>: <state>** (Branch cases, option and start conditions, phrases) | `SF_BountyState <id> <state> [more…]` | `unavailable` |

States: `unavailable` (no MagicLib, MagicLib not enabled when the game started, or MagicLib doesn't
have the bounty), `offered` (not taken), `active`, `succeeded`, `failed` (flagship salvaged),
`expired` (time ran out, or someone else got it), `dismissed`, and `ended` = any end. They come
from **MagicLib's own memory keys** (`$global.<id>`, false on accept, true at the end, with
`_succeeded` / `_failed` / `_expired`), which outlast MagicLib's own lists; only "does MagicLib
have it" and accepting need the bridge. Play mode does the same (`play.ts`), and the shared golden
case `test/golden/bounties.json` keeps the two in line.

**Decisions**

- **Starting is accepting**, not posting: the quest's dialog is where the player agrees. A bounty
  can still be on the board as well; **On the board** off (bounty editor) keeps it off with a
  trigger nobody sets (`$sagaforge_bounty_quest_only`), since MagicLib doesn't check triggers when
  a bounty is created from code. Posting a bounty on the board after a quest step needs no
  command: a flag the quest sets, as a prerequisite of the bounty's quest (part 1).
- **Once**: starting a bounty that is already taken or ended does nothing (like the board).
- **The quest asks, the quest says it**: the done-when case "the quest says the bounty isn't
  available" is a Branch on `unavailable` before the start. Problems warns when a quest starts a
  bounty without testing its state while MagicLib is optional.
- **Reacting to the end** is a later dialog that tests the state (the test mod: an Arrive option
  at the giver; "still running" re-arms it). A node that waits for the bounty's end on its own
  came later: §7 (task #69).
- **Quest-ended keys**: MagicLib's triggers read only true/false keys, so SagaLib now sets
  `$global.sagaforge_success_<quest>` / `_fail_<quest>` when a quest ends (and on load for quests
  that ended before 1.3). A bounty's quest prerequisite "quest X ended" maps to them
  (`trigger_memKeys_all`, or `_any` for "either way"; only one "either way" fits). A quest that is
  itself only a bounty never ends in SagaLib: a warning says to test its bounty's key instead.
- **MagicLib counts** like every optional mod (#60): enabled at the start of the game and now.
  A mod that uses these commands lists MagicLib (optional suggested; Problems and Export offer it),
  and needs SagaLib 1.3.

**Tests**: `test/bounties59.test.ts` (the export line, the mapping, Problems, a Play run with and
without MagicLib), SagaLib's `BountyTests` and the golden case. In game: `mods/twentyseven_a`
(Test 59 content), INGAME-CHECKS.md "Task #59".

## 7. Waiting for the end (task #69, SagaLib 1.3)

A quest node **Wait for a MagicLib bounty** (a Wait node, mode `bounty`; in the add-node menu)
continues by itself when the bounty ends. Outputs: **Succeeded**, **Failed** (flagship salvaged),
**Expired** (time ran out, or ended without the player) and **Dismissed** (only from MagicLib's old
bar board, switched off in 1.5.6).

**Decision (user, 2026-11-19): SagaLib watches MagicLib's memory keys**, not MagicLib's
`job_conclusion_script`. The keys are read the same way as `SF_BountyState`, so no bridge is
needed, and it covers the mod's own, hand-written and other mods' bounties. The script was ruled
out because it is one trigger per bounty (two quests can't wait on one), it only works for the
mod's own bounties, it fires inside whatever dialog is open, and it is missed when the quest
isn't at the node yet.

| Editor | Exported | SagaLib |
|---|---|---|
| Wait node, mode bounty, a bounty id | quest JSON `bountyWaits: [{node, bounty, stage, succeeded, failed, expired, dismissed}]`; `stage` = the Stage before the node; a trigger `<quest>_<node>_<outcome>` per connected output, `""` otherwise | `core.BountyWaits`, four times a day in the campaign script: at the step and the bounty ended → the trigger, once, through the pending queue (its own dialog, like an encounter outcome) |
| each connected output | a rule on `<quest>_<node>_<outcome>` that jumps to the next node | `TriggerDialog` |

- **Ended before the quest got there**: the keys stay, so the quest goes on as soon as it reaches
  the step. That's what lets a quest wait for a bounty taken on the board.
- **A Wait is an event**: the flow doesn't jump into it (`FireBest`); the dialog before it goes
  back to the menu. That also fixed "wait N days", whose rule ran at once and again when the
  timer fired, and its timer now gets the Stage before it (it started at the quest's first step).
- **Problems**: no bounty (error), in a conversation (error), no Stage before it (warning: it would
  watch from the quest's start), Succeeded / Failed / Expired not connected (warning: the quest
  would wait for good), and, with MagicLib optional, a wait on a bounty whose state the quest
  never tests (warning: without MagicLib it waits for good).
- **Play mode**: the bounty buttons (now with Dismissed) continue a waiting quest at once; leaving
  a dialog continues one whose bounty already ended. **Quest skip** notes that the bounty isn't
  taken or ended.

**Tests**: `test/bountywait69.test.ts`, SagaLib's `BountyTests` and the shared golden case
`test/golden/bountywait.json` (its `watch` step runs the check in both runners). In game:
`mods/twentyseven_a` 1.2.0 (Test 69 content), INGAME-CHECKS.md "Task #69".
