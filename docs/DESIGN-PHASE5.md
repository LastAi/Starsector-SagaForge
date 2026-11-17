# Phase 5 design: fleets

Short record for [WORK-ORDER.md](WORK-ORDER.md) Phase 5 (2026-11-15). Requests: R23 (+ R4), R22,
R27 in [INGAME-CHECKS.md](INGAME-CHECKS.md).

**Scope, decided by the user (2026-11-15):**
- Built: named fleet templates, the doctrine preview, and fleet type names for every faction.
- Not built: editing a faction's ship roles (later).
- A repeat fleet is **fresh each time** but **trackable**. Losing the fleet doesn't kill its
  captain (as with the player), unless the story says so.

## Fleets page (new top-level page)

- **Named fleets (R27):** name, faction, fleet type, ships (variant, optional ship name), flagship,
  captain (one of the mod's people), "the captain dies when this fleet is defeated". Encounters use
  one through Fleet › Ships › **a named fleet**, so several encounters can reuse the same fleet.
- **Fleet type names (R22):** fleet type → name for every faction. Export merges them by key into
  the mod's `data/world/factions/default_fleet_type_names.json`. A faction's own names stay on its
  Names & ranks tab.
- **Doctrine preview (R4):** for each of the mod's factions (new or changed):
  - the composition split and the combat-freighter chance;
  - ships per size per round, from vanilla's `FleetFactoryV3` tables (`BASE_COUNTS_WITH_4` plus
    the average of `MAX_EXTRA_WITH_4`);
  - the officer / ship / numbers trade-off.

  It is labelled an estimate, since the game adds randomness and autofit.

## Export and SagaLib 1.1

- A named fleet is **expanded into the encounter's runtime JSON** as an explicit fleet, so SagaLib
  has one spawn path. The JSON carries `shipNames` (parallel to `variants`), `flagship` (index),
  `template` (id), `captainDiesOnDefeat`, plus the usual faction, type, name and
  `flagshipCommander`.
- SagaLib 1.1 sets the ship names and flagship, and counts defeats in
  `$global.sagaforge_fleet_<template>_defeats`.
- With `captainDiesOnDefeat`, a defeat retires the captain.
- **Removing a person:** Action step "Remove a person" (`SF_RemovePerson <person>`), and a captain
  who dies with the fleet.
  - SagaLib sets `$global.sagaforge_gone_<person>` and removes the person from their market, comm
    directory and important people.
  - A gone person is never recreated, never placed at a market, and never commands a fleet again
    (the fleet's own officer does).

## Not done

- Editing ship roles per faction (`shipRoles`, `variantOverrides`).
- Carrying losses over between spawns.
