/**
 * Faction keys the form has no field for (R7; DESIGN-PHASE2.md §4): what each is for, and which of
 * them vanilla's factions use. Descriptions are written only from what the game's code (API
 * sources, 0.98a) or its files show; a key without one says so.
 */
import { ALL_FIELDS, KNOWN_TOP_KEYS } from './factionform'
import type { FactionKeyUsage } from './api'

/** "custom" keys that have a field on the Behavior tab (first segment after "custom."). */
export const KNOWN_CUSTOM_KEYS = new Set(ALL_FIELDS.filter((f) => f.path.startsWith('custom.')).map((f) => f.path.split('.')[1]))

/** Key → what it does. Top-level keys by name, `custom` keys as "custom.<key>". */
export const FACTION_KEY_DOCS: Record<string, string> = {
  custom: 'Settings read by the game\'s code (and by rules as $faction.c:<key>). Its keys with a field are on the Behavior tab; the rest are listed here as custom.<key>.',
  variantOverrides: 'Variant id → weight. A hull with a variant listed here only uses the listed variants in its fleets, with these weights (vanilla\'s comment). Empty in most vanilla factions; Lion\'s Guard: {"executor_Elite": 10}.',
  shipsWhenImporting: 'Hulls (by id or tag) used for its ships "when importing" (the game definitions\' wording; vanilla\'s derelicts and Dwellers list their own tags here). Same shape as Known ships ({"tags": [...], "hulls": [...]}).',
  priorityFighters: 'Fighter wings its carriers pick first, like Priority ships for hulls ({"fighters": [...], "tags": [...]}).',
  fleetTypeNames: 'Fleet type → the name its fleets of that type show. Has a field on Names & ranks.',
  voices: 'Importance level (LOW, MEDIUM, HIGH, …) → voice weights: the voice its generated people get, by how important they are (Hegemony: mostly soldier, officials higher up). Some vanilla dialog picks its wording by voice; see People › Voice.',
  weaponSellFrequency: 'Weapon id → weight: how often its markets stock that weapon (1 = normal).',
  fighterSellFrequency: 'Wing id → weight: how often its markets stock that fighter wing (1 = normal).',
  hullmodSellFrequency: 'Hullmod id → weight: how often its markets sell that hullmod (1 = normal).',
  shipSellFrequency: 'Hull id → weight: how often its markets sell that hull (1 = normal).',
  shipRoles: 'Role → variant weights used only by this faction (e.g. derelict\'s "derelictMothership"), in the shape of data/world/factions/default_ship_roles.json.',
  internalComms: 'The id of the faction\'s internal comms channel (Hegemony: "hegemony_internal"). Rare.',
  description: 'A short description string. Vanilla only has "No description yet." here; the intel tab text comes from descriptions.csv (the Description tab).',
  hullMods: 'Rare top-level list; the usual place for hullmods is Known hullmods (knownHullMods.hullMods) on Ships & weapons.',
  flags: 'Only in the player faction: the flag and crest choices offered for a player faction. Rare.',
  fleetCompositions: 'Only in the player faction: the starting fleets of a new game. Rare.',
  barSound: 'An ambient bar sound (a sound id from sounds.json). Only the player faction sets it in vanilla ("bar_ambience").',
  'custom.simulatorData': 'Combat simulator: {"showInSimulator": true} lists its ships in the simulator\'s opponents.',
  'custom.allowsTransponderOffTrade': 'Its markets don\'t mind the player flying with the transponder off (the jump point warning ignores them), and vanilla\'s smuggling and spy-satellite missions skip its markets.',
  'custom.engageWhenEvenStrength': 'Read by the game\'s core code, not the API, so its exact effect isn\'t documented; vanilla sets it on aggressive factions (pirates, Luddic Path). The name suggests fleets that engage at even strength.',
  'custom.fightToTheLast': 'Its fleets fight with a full assault instead of retreating, in most cases (vanilla\'s comment).',
  'custom.postsNoBounties': 'Has a field on the Behavior tab.',
  'custom.punitiveExpeditionData': 'Has fields on the Behavior tab.',
  'custom.makesPirateBases': 'Has a field on the Behavior tab.',
  'custom.pirateBaseStationTypes': 'Has a field on the Behavior tab.',
  'custom.AICoreValueMult': 'Multiplies the credits its administrators pay for AI cores (Luddic Path: 0.1). Needs Buys AI cores.',
  'custom.AICoreRepMult': 'Multiplies the reputation gained by selling it AI cores. Needs Buys AI cores.',
  'custom.decentralized': 'A loose faction (pirates, independents; vanilla\'s comment). Vanilla\'s security-codes mission and some bounty kinds skip its markets, and some text may be phrased differently.',
  'custom.no_contacts': 'Its people can\'t become the player\'s contacts.',
  'custom.exemptFromFoodShortages': 'Meant to exempt its markets from food-shortage events; the check is commented out in 0.98a.',
  'custom.ignoreTradeWithEnemiesForReputation': 'Trading with its enemies doesn\'t cost the player reputation with it.',
  'custom.offerMissionsWhenHostile': 'Read by the game\'s core code, not the API; vanilla sets it on pirates. The name suggests its people offer missions even when hostile to the player.',
  'custom.patrolsHaveNoPatrolMemoryKey': 'Its patrol fleets aren\'t marked as patrols or customs inspectors (so no customs checks); with pirateBehavior they are marked as pirates instead.',
  'custom.pirateBehavior': 'Its fleets are treated like pirates\': patrols marked as pirates (with patrolsHaveNoPatrolMemoryKey), raids and expeditions in pirate style, and far-away objectives taken in the war simulation.',
  'custom.noWarSim': 'Left out of the objective war simulation (vanilla\'s WarSimScript).',
  'custom.spawnsAsIndependent': 'Its fleets are created the way independents\' and scavengers\' are, from any market instead of only its own.',
  'custom.noAICoresFromAutomatedDefenses': 'Its automated defenses (derelict guardians) drop no AI cores.',
  'custom.officersOnAutomatedDefenses': 'Its automated defenses get AI officers.',
  'custom.patherBaseTypesSmall': 'Station industry → weight for small hidden bases. Only read for the Luddic Path (its base manager is hard-coded to it).',
  'custom.patherBaseTypesLarge': 'Station industry → weight for large hidden bases. Only read for the Luddic Path.',
  'custom.gaVIPMission': 'Read by the game\'s core code, not the API; only the Luddic Path sets it (to false). Rare.'
}

/** The description of a key ("custom.<key>" for custom keys), or a note that there is none yet. */
export function factionKeyDoc(key: string): string {
  return FACTION_KEY_DOCS[key] ?? 'No description yet: see how vanilla\'s factions use it.'
}

const EXAMPLE_ORDER = ['hegemony', 'tritachyon', 'persean', 'luddic_church', 'sindrian_diktat', 'independent', 'pirates', 'luddic_path']

const isEmptyValue =(v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)

/**
 * Keys vanilla's factions set that the form has no field for: top-level keys, and "custom.<key>"
 * for custom keys. Most used first; the example is the first non-empty value found.
 */
export function factionKeySurvey(docs: { faction: string; raw: Record<string, unknown> }[]): FactionKeyUsage[] {
  const out = new Map<string, FactionKeyUsage>()
  // examples come from a major faction first (a familiar starting point), then the rest by id
  const rank = (f: string) => { const i = EXAMPLE_ORDER.indexOf(f); return i < 0 ? EXAMPLE_ORDER.length : i }
  const sorted = [...docs].sort((a, b) => rank(a.faction) - rank(b.faction) || a.faction.localeCompare(b.faction))
  const note = (key: string, faction: string, value: unknown) => {
    const e = out.get(key) ?? { key, count: 0, example: { faction, value } }
    e.count++
    if (isEmptyValue(e.example.value) && !isEmptyValue(value)) e.example = { faction, value }
    out.set(key, e)
  }
  for (const d of sorted) {
    for (const [k, v] of Object.entries(d.raw)) {
      if (k === 'custom' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) if (!KNOWN_CUSTOM_KEYS.has(ck)) note(`custom.${ck}`, d.faction, cv)
      } else if (!KNOWN_TOP_KEYS.has(k) && k !== 'custom') note(k, d.faction, v)
    }
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
