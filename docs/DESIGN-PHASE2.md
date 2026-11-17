# Phase 2 design: name lists, fleet type names, faction runtime keys, Other keys

Short design for [WORK-ORDER.md](WORK-ORDER.md) Phase 2 (2026-11-15). Requests: R3, R7 + RC-R13,
R22's names, finding F14, in [INGAME-CHECKS.md](INGAME-CHECKS.md). Engine facts checked in the
0.98a code (`PersonNameStore`, `ShipNameStore`, the API sources) and listed in FORMATS.md.

## 1. Name lists (R3, F14)

**How the game uses them** (code, 0.98a):
- `data/characters/person_names.csv` (`name,gender,usage,category`) is a **merged spreadsheet**:
  every mod's rows are added to vanilla's. `gender` is `m`, `f`, both, or empty (both); `usage`
  holds `f` (first name) and/or `l` (last name); `category` is one or more ids, comma-separated.
- A faction's `names` map (category → weight) picks a category for the first name, then again for
  the last name, per gender. **If the picked category has no first (or last) names for that
  gender, the game takes a random category instead**, so a pool with no female first names gives
  that faction's women first names from any vanilla category.
- `data/strings/ship_names.json` (list id → names) is **merged JSON**: a mod's list with the same
  id is appended to the existing list. A faction's `shipNameSources` map (list id → weight) picks
  from them.

**Model.** One plan file, `sagaforge/names.json`:
`{ people: NamePool[], ships: ShipNameList[] }`, with
`NamePool = { id, male: string[], female: string[], first: string[], last: string[], note? }`
(`first` = first names for anyone) and `ShipNameList = { id, names: string[], note? }`. Ids get
the mod prefix by default (`sfw_cats`, `SFW_CATS`); a vanilla id is allowed (it adds to vanilla's
list) with a warning.

**Where.** The Factions page gets a third list in its sidebar, **Name lists** (people's names and
ship names, + New), since factions are what use them. Selecting one opens a form with one big text
box per kind (one name per line, so a list can be pasted), the counts, and "used by" (the factions
whose name sets or ship name sources weight it).

**Export.** People's names → an owned block `names` in the mod's
`data/characters/person_names.csv` (rows `name,m,f,<id>` / `name,f,f,<id>` / `name,,f,<id>` /
`name,,l,<id>`). Ship names → the mod's `data/strings/ship_names.json`, merged by key like the
illustrations in `settings.json`: Saga Forge remembers which keys it wrote
(`project.exported.shipNames`) and only replaces or removes those.

**Game index.** Reads every source's `person_names.csv` (per category: male first, female first,
last-name counts) and `ship_names.json` (per list: count), so the faction form's **Person name
sets** and **Ship name sources** suggest every category with its counts and source, the mod's own
lists included.

**Checks.** A faction (addition or override) weighting a category or ship list that no source and
no pool of the mod has: warning (the game picks a random one). A pool missing male first names,
female first names or last names, counting every source: warning naming what the game borrows. A
pool id that is also a vanilla or other mod's category: warning ("adds to everyone's list"). A
name listed twice in a ship list: style. A comma in a pool id: error (the game splits on commas).

## 2. Fleet type names (R22's names, part of R7)

A real field on **Names & ranks**: *Fleet type names* (`fleetTypeNames`, fleet type → the name
fleets of that type show, e.g. `patrolSmall` → "Corsair"). Suggested types: vanilla's 29 plus the
fleet types the mod's encounters use. Names for every faction (`default_fleet_type_names.json`)
stay in Phase 5.

## 3. Faction runtime keys (RC-R13)

New fields on the **Behavior** tab (all `custom` keys, checked in the API code):
- *Makes pirate bases* (`makesPirateBases`): the game's pirate base manager picks among the
  factions that have it when it places a hidden base. *Pirate base stations*
  (`pirateBaseStationTypes`, station industry → weight; suggestions `orbitalstation`,
  `orbitalstation_mid`, `orbitalstation_high`).
- *Posts no bounties* (`postsNoBounties`): its markets never post system bounties, and it isn't
  picked to pay for bounties on pirate bases.
- *Punitive expeditions* (`punitiveExpeditionData`, an object: present = the faction can send
  them against the player's colonies) with its four switches: *vs. competitors*
  (`vsCompetitors`: the player's colonies compete with its top exports), *vs. free ports*
  (`vsFreePort`: the player's free ports, and their trade in goods it bans), *territorial*
  (`territorial`: the player's small colonies in a system the faction claims), *can bombard* (`canBombard`).
Not added: `patherBaseTypesSmall/Large` (only read for the Luddic Path, so they only matter in an
override of it; they stay in Other keys with a description) and `canSendWithoutMilitaryBase` (its
use is commented out in 0.98a). On an **override**, the fields work as everywhere (a patch); the
help says it changes vanilla's sector.

## 4. Other keys: recommendations and descriptions (R7)

- The game index counts, over vanilla's factions, every top-level key and every `custom` key that
  the tabs don't show, and keeps one vanilla value of each as an example.
- **Other keys** gets an **Add a key** list ordered by how many vanilla factions use the key, each
  with a description and "starts from <faction>'s value" (the example, which the modder edits).
  Keys already in the faction are left out of the list.
- Each existing key in Other keys shows its description too. Descriptions live in
  `src/shared/factionkeys.ts`, written only from what the game code or files show; a key without a
  checked description says so ("No description yet: see how vanilla factions use it").
- The same descriptions become a reference section ("Factions › Other keys", R8), opened by an ⓘ.
