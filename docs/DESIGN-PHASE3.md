# Phase 3 design: locations

Short design for [WORK-ORDER.md](WORK-ORDER.md) Phase 3 (2026-11-15). Requests: R15, R14, R19, R18,
R20, R17, R21 in [INGAME-CHECKS.md](INGAME-CHECKS.md). RC-F1 goes with the SagaLib batch (Phase 4).
Engine facts are checked in the 0.98a files and API sources and recorded in FORMATS.md.

## 1. Types from the game files (R15, and the base for R18–R21)

The game index keeps more of `planets.json` and `custom_entities.json`, for every source:
- **Planet and star types**: name, `isStar`, `texture`, `iconColor`, and the raw entry. Stars are
  the entries with `"isStar": true`, so mods' own stars appear in the Star list. The fixed list in
  the game definitions (`starTypes`) stays only as a fallback for an index without them.
- **Custom entity types**: name, `sprite` (or the `sheet`), `icon`, `tags`, `defaultRadius`, and
  the raw entry. `baseId` is resolved: a type inherits the keys it doesn't set from its base.

## 2. Read-only vanilla systems (R14, F15)

Vanilla ships the Java source of its core systems (`data/scripts/world/systems/*.java`), and some
mods ship theirs the same way. A small parser (`src/shared/javasystems.ts`) reads the calls whose
arguments are literal:
- `createStarSystem` and `initStar`, using the `StarTypes` constants.
- `addPlanet`, and `addCustomEntity` with its `set…Orbit…` line.
- `addAsteroidBelt` and `addRingBand`.
- Jump points (`createJumpPoint` and their orbit).
- `addTerrain` with an orbit.

It understands simple arithmetic (`230 + 60`), local variables (`a1` → `sindria`) and
`system.getEntityById("…")`. Anything else is skipped and counted ("12 calls not understood"), so
the view never guesses. Systems built entirely elsewhere in code (Corvus, the random systems) can't
be read; the view says so.

**Where.**
- *System view*: clicking a vanilla system on the hyperspace map, or opening the additions to one,
  draws its bodies greyed and read-only (orbits, names, sizes), with "Add to this system".
- *Inspector*: an addition's **Orbits** list offers the system's bodies by id. SagaLib finds a focus
  with `getEntityById`, so a station can orbit Sindria directly. Bodies made with a `null` id get a
  random id in game, so they are shown but can't be picked.
- *Checks*: an addition orbiting an id that isn't a known body of that system (when the system
  could be read) is a warning.

## 3. Preview of the selected entity (R19)

The inspector shows the selected entity's picture:
- A planet or star: its texture inside a circle, with the type's icon color as the rim.
- A station or other custom entity: its sprite (from a sheet, the first cell).

The type lists show the same picture as a small thumbnail.

## 4. Filters and recommendations for types (R18, R20)

**Planet types** get filter chips by category: gas giants, habitable, barren, frozen, lava,
toxic, irradiated, other.

**"Fits here"** recommends planet types for the planet's orbit, from vanilla's random generation
(`data/campaign/procgen/planet_gen_data.csv` and `star_gen_data.csv`, read by the index):
- The orbit index is estimated as the generator spaces orbits:
  `(orbit radius − star radius − 1000) / 1400`, rounded down, at least 0. A moon uses its planet's
  orbit.
- A type fits when `habZoneStart + habOffsetMin ≤ index ≤ habZoneStart + habOffsetMax` (average
  star age).
- Its weight is the category's frequency × the category's multiplier for the star type × the
  type's frequency × the type's multiplier for the star type (a blank multiplier is 1, as in
  `CategoryGenDataSpec`).
- The list sorts by weight and marks the top ones "fits here". The rest are "unusual here" (still
  allowed). The label says this is an estimate from vanilla's random generation.

**Custom entity types** get filters by what they are: stations (tag `station`), objectives (comm
relay, nav buoy, sensor array), salvageable (`salvageable`), with a dialog
(`has_interaction_dialog`), and other. The entity's kind preselects the matching filter (a Station
shows stations, a Derelict shows salvageable types), which is the recommendation.

## 5. Resize handles (R17)

In the system view, the selected entity gets handles:
- A planet, moon or the star: a handle on its edge sets its size. The star also has a second handle
  for its corona.
- An asteroid belt or ring band: handles on its inner and outer edge set its width.
- Any orbiting entity: dragging it with **Shift** held also changes its orbit radius. A plain drag
  still only moves it along its orbit.

Values snap to 10 units, and every change goes through undo as usual.

## 6. Custom celestial objects (R21)

The mod's own **entity types**, **planet types** and **star types**, under a "Types" section in
the Locations sidebar.

- **Entity type** (`custom_entities.json` entry):
  - Fields: name, sprite (Images: new kind *entity sprite*, 160×160 like vanilla's stations,
    shown at 80×80 in game), map icon (new kind *map icon*, 64×64), size (`defaultRadius`), and an
    illustration.
  - **Behaves like** a vanilla type: its `baseId`, so it inherits that type's settings, e.g. a
    station's tags and layers. Choices: a station, a derelict (salvageable), an objective, or
    plain scenery.
- **Planet or star type** (`planets.json` entry):
  - Fields: name, texture (Images: new kind *planet texture*, 1024×512 like vanilla's), and
    **Based on** a vanilla type. The base entry's keys (tilt, atmosphere, colors, corona) are
    copied in, and only name and texture change. The base's colors are the starting point.
  - A star type keeps `isStar` and its corona settings.
- **Export** merges each entry into the mod's `data/config/custom_entities.json` or
  `data/config/planets.json` by key (merged JSON), remembering the keys it wrote, as with the ship
  name lists.
- The types then appear in the editor's type lists, marked "this mod".
- **Not covered**: entity types that need their own plugin class (code). Such a type can still be
  written by hand in the mod's `custom_entities.json`; Saga Forge keeps keys it didn't write.
- **Checks**: an id clashing with a vanilla or mod type is a warning (the merge would change that
  type for everyone). A missing sprite or texture is an error.
