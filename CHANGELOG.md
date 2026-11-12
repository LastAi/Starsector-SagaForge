# Changelog

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
