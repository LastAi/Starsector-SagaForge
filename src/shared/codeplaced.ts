/**
 * #67 (user, 2026-11-21): places vanilla makes in its compiled code (starfarer.api, not starmap.json
 * or data/scripts), so the game index can't read them. Read from the API source of 0.98a and
 * 0.98.5a (com.fs.starfarer.api.impl.campaign.world); the same in both.
 */

/** Systems at a fixed place: [x, y] in hyperspace (the game's y grows upwards). */
export function codePlacedSystems(sectorWidth: number, sectorHeight: number): { name: string; x: number; y: number; note: string }[] {
  return [
    // Limbo.java: system.getLocation().set(-w/2f + 2300f, -h/2f + 2100f)
    { name: 'Limbo', x: -sectorWidth / 2 + 2300, y: -sectorHeight / 2 + 2100, note: 'Hidden system made in vanilla code (Limbo.java), outside the normal hyperspace area.' },
    // TTBlackSite.java: createStarSystem("Unknown Location"); system.getLocation().set(4000, 2500)
    { name: 'Unknown Location', x: 4000, y: 2500, note: 'Tri-Tachyon black site, made in vanilla code (TTBlackSite.java); hidden until a quest leads there.' }
  ]
}

/** Places vanilla puts somewhere new every game: they can't be shown on the map. */
export const RANDOMLY_PLACED = [
  'the red planet of the "Red Planet" mission (a habitable planet far from the core, picked when the sector is made)',
  'the gate hauler\'s "Deep Space" system (GateHaulerLocation.java: a random direction)',
  'Nameless Rock\'s "Deep Space" system (NamelessRock.java: a random spot)'
]
