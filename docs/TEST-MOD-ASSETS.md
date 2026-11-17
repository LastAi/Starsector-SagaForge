# Test mod asset manifest: files to make outside the editor

The bare minimum of images and other files the test mod in
[TEST-MOD-CHECKLIST.md](TEST-MOD-CHECKLIST.md) needs, made outside Saga Forge. "Bare minimum"
means **as complete as the same kind of content in the base game**. For example, a vanilla
faction has its own flag, crest and portrait pool, so ours does too.

Sizes and formats were measured from Starsector 0.98a's own files (`starsector-core/graphics`).
Everything else the editor makes is text, which it writes itself.

## How to use and extend this list

- Make each file at the size listed. Saga Forge copies it into the mod at the path shown, when you
  pick it in the editor.
- Ids (`A1`, …) match the checklist steps that use them. Add new assets at the end with the next
  free id. When a planned workflow is built (see the end of this file), move its row up into the
  manifest.
- All images: **PNG, RGBA (transparency allowed)**, unless the row says otherwise. Illustrations
  can also be JPG.

## Manifest

| Id | Asset | Count | Size | Goes to (in the mod) | Picked in | Vanilla basis | Checklist |
|---|---|---|---|---|---|---|---|
| **A1** | Faction **flag** (logo) | 1 | **410×256** | the path you pick, copied on Save (e.g. `graphics/factions/sfw_wayfarer_flag.png`) | Factions › Identity › Logo › Pick… | All 28 vanilla flags are 410×256 | F1–F2 |
| **A2** | Faction **crest** | 1 | **256×256** | as A1 (e.g. `graphics/factions/crest_sfw_wayfarer.png`) | Factions › Identity › Crest › Pick… | All 26 vanilla crests are 256×256 | F1–F2 |
| **A3** | Faction **portrait pool** (generated officers, staff and contacts) | **8**: 4 male, 4 female | **128×128** | `graphics/portraits/` (put the files there first) | Factions › Names & ranks › Portraits · male / female | Smallest vanilla pool: Lion's Guard, 4 + 4. Main factions have 16–42. | F2 |
| **A4** | **Named character portraits**, one each, not shared with A3 | **4** (C1, C2, the fleet commander in C5, and the "nowhere" person in C5) | **128×128** | `graphics/portraits/<person id>.png` | People › Portrait › Use my own image… | Vanilla named characters have their own portrait | C1–C5 |
| **A5** | **Item icons**, one per new item | **3** (quest item, trade good, rare valuable) | **80×80** | `graphics/icons/cargo/<item id>.png` | Items › Icon › Pick… | 81 of the 103 vanilla cargo icons are 80×80 | I1–I4 |
| **A6** | **Dialog illustration** | **1** | **480×300** (PNG or JPG) | `graphics/illustrations/sfw_<name>.png` (registered in `settings.json` on Export) | Quests › Dialog node › Visual: Illustration › + Use my own image… | Almost all of vanilla's 99 illustrations are 480×300 | D1 |
| **A7** | **Quest (mission) icon** for the main quest | **1** | **64×64** | `graphics/icons/missions/<quest id>.png` | Quests › quest settings › Icon › Pick… | Vanilla mission icons in `graphics/icons/missions/` are 64×64 | Q9 |

**Total: 19 images** (1 flag, 1 crest, 8 pool portraits, 4 character portraits, 3 item icons, 1
illustration, 1 quest icon).

Notes:
- **A3:** the faction's portrait lists only offer images the editor already knows about. Put the 8
  files in the mod's `graphics/portraits/` before you fill in the lists (restart or reload the
  editor if they don't appear).
- **A4:** a person who uses one of the faction's pool portraits (A3) is allowed, but vanilla doesn't
  do that for named characters. Keep A3 and A4 separate.
- **A6:** this is one illustration for the checklist step. If you want vanilla's level for a
  custom place, give each scene the player visits its own illustration (e.g. the wreck, the
  station bar). In the test mod, the others can reuse vanilla illustrations.
- **A7:** one icon for the main quest. Other quests can leave the Icon field empty: they then
  use vanilla's `graphics/icons/missions/data_retrieval.png`, which Q9 checks.

## Not needed (the editor uses existing game files)

| What | Why there's nothing to make |
|---|---|
| Planets, moons, stars | Types from vanilla `planets.json`; their textures come with the game |
| Stations, relays, buoys, arrays, jump points, wrecks, other entities | Types from `custom_entities.json`, with vanilla sprites |
| Asteroid belts, ring bands | Drawn with vanilla textures |
| System background | SagaLib always uses vanilla's `graphics/backgrounds/background4.jpg`; the editor has no field for it |
| Ships, weapons, fighters in the faction and encounter fleets | Picked from installed hulls and variants. New ships are made in Ship Editor, not here. |
| Sounds and music (dialog displays, system music, faction music) | Picked from tracks already in the game or installed mods; the editor can't add new ones |
| Item pickup and drop sounds | Vanilla's are kept |
| Descriptions, dialog, journal text, names | Text, written in the editor |

## Optional (beyond the bare minimum)

These are things vanilla factions have but that aren't required, and that the editor can't add
for you:

- **Faction music** (theme, market, encounter): 7 tracks for main vanilla factions, but Independent
  and Lion's Guard have none and use the default. Adding new tracks means writing `.ogg` files and
  `data/config/sounds.json` entries by hand. Then they appear in the editor's music lists.
- **A bigger portrait pool** (16 or more, like the main factions), so generated people repeat less.

## Planned later: assets new workflows will need

Move a row into the manifest when its workflow is built (see section 13 of the checklist).

| Workflow | Likely assets | Vanilla basis | Tracked in |
|---|---|---|---|
| MagicLib bounties | Probably none new (bounties use portraits and illustrations), to be confirmed | MagicLib's bounty format | task #27 |
| Ruins follow-ups (salvage specials, loot) | Possibly illustrations for ruins scenes; loot uses existing item icons | vanilla ruins exploration | `RUINS-ASSESSMENT.md`, task #35 |
| Random locations, random event pools | To be decided in the analysis | — | task #35 |
| World events | Possibly an intel icon per event, **40×40** | `graphics/icons/intel/*.png` (all 40×40) | PLAN §11.4, task #30 |
