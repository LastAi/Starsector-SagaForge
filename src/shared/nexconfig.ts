/**
 * #63 (PLAN.md §10.3, "Faction config"): Nexerelin's faction config for the mod's OWN factions.
 * Facts: FORMATS.md "Nexerelin 0.12.2d", Faction config and Starting relations. Pure.
 *
 * The config is kept raw (sagaforge/nexerelin.json: faction id → the document), so keys the tab has
 * no field for are kept, as with a .faction file. Starting relations are not edited here: the
 * faction's relations (§4.1) are the one source, and Export writes them as `startRelationships`
 * with `useConfigRelationshipsInNonRandomSector: true`. SagaLib then leaves those relations to
 * Nexerelin whenever it is enabled (factions.json "nexerelin").
 */
import type { ModModel } from './serialize'
import type { ItemConds } from './moduses'
import { isNone } from './modlist'
import { isObj } from './faction'
import { parseLooseObject } from './loosejson'

/** The plan file: {format, factions: {id: document}}. */
export const NEX_PLAN = 'sagaforge/nexerelin.json'
export const NEX_CONFIG_DIR = 'data/config/exerelinFactionConfig'
/** Nexerelin only configures a mod's faction listed here (merged CSV, key column "faction", case sensitive). */
export const NEX_MOD_FACTIONS = `${NEX_CONFIG_DIR}/mod_factions.csv`
export const nexConfigPath = (factionId: string) => `${NEX_CONFIG_DIR}/${factionId}.json`
/** Written by Export (always true): the relations apply in the hand-made sector too, not only in a random one. */
export const NEX_USE_CONFIG_RELATIONS = 'useConfigRelationshipsInNonRandomSector'
export const NEX_START_RELATIONS = 'startRelationships'

export type NexConfig = Record<string, unknown>

/** Nexerelin 0.12.2d's diplomacy traits (data/config/exerelin/factionTraits.json; "rebel" is commented out there). */
export const NEX_TRAITS: { id: string; name: string; desc: string }[] = [
  { id: 'paranoid', name: 'Paranoid', desc: 'Can opportunistically declare war at Suspicious reputation level.' },
  { id: 'predatory', name: 'Predatory', desc: 'Can opportunistically declare war regardless of disposition, at Favorable (Suspicious if player) or lower.' },
  { id: 'pacifist', name: 'Pacifist', desc: 'Will never opportunistically declare war.' },
  { id: 'helps_allies', name: 'Helps Allies', desc: 'Disposition penalties towards enemies of its friends and allies; always votes yes for an alliance action.' },
  { id: 'irredentist', name: 'Irredentist', desc: '+50% disposition penalties from revanchism.' },
  { id: 'stalwart', name: 'Stalwart', desc: '-33% war weariness gains.' },
  { id: 'weak-willed', name: 'Weak-willed', desc: '+50% war weariness gains.' },
  { id: 'foreverwar', name: 'Forever War', desc: 'No war weariness.' },
  { id: 'selfrighteous', name: 'One True Way', desc: 'Doubled disposition effects from alignment.' },
  { id: 'temperamental', name: 'Temperamental', desc: '+25% to all disposition effects.' },
  { id: 'dislikes_ai', name: 'Dislikes AI', desc: 'Disposition penalty for use of AI cores.' },
  { id: 'hates_ai', name: 'Hates AI', desc: 'Heavy disposition penalty for use of AI cores.' },
  { id: 'likes_ai', name: 'Likes AI', desc: 'Disposition bonus for use of AI cores.' },
  { id: 'envious', name: 'Envious', desc: '+50% disposition penalty from dominance.' },
  { id: 'submissive', name: 'Submissive', desc: 'The dominance penalty becomes a bonus.' },
  { id: 'neutralist', name: 'Neutralist', desc: 'No disposition penalty from dominance.' },
  { id: 'monopolist', name: 'Monopolist', desc: 'Disposition penalty from economic competition; looser limits on economic sabotage.' },
  { id: 'law_and_order', name: 'Law & Order', desc: 'Disposition penalty from free ports.' },
  { id: 'anarchist', name: 'Anarchistic', desc: 'Disposition bonus from free ports.' },
  { id: 'lowprofile', name: 'Low Profile', desc: 'Its markets are less likely raid or invasion targets when the attacker has several enemies.' },
  { id: 'devious', name: 'Devious', desc: 'Agent actions are more likely, succeed more and do more.' },
  { id: 'monstrous', name: 'Monstrous', desc: 'Seen as inhuman: disposition penalties from everyone; atrocities against it cost the player less.' },
  { id: 'domain_claimant', name: 'Domain Claimant', desc: 'Claims to be the true heir of the Domain.' },
  { id: 'domain_loyalist', name: 'Domain Loyalist', desc: 'Loyal to the Domain and its successors.' },
  { id: 'domain_rebel', name: 'Domain Rebel', desc: 'Stands against the old Domain.' }
]
/** Pairs Nexerelin won't give one faction when it randomizes traits ("incompatible"); also a check here. */
export const NEX_TRAIT_CLASHES: [string, string][] = [['paranoid', 'pacifist'], ['stalwart', 'weak-willed'], ['stalwart', 'foreverwar'], ['weak-willed', 'foreverwar']]

/** Alliance alignments (Alliance.Alignment, lower case in the file). */
export const NEX_ALIGNMENTS = ['corporate', 'technocratic', 'militarist', 'diplomatic', 'ideological', 'hierarchical'] as const
/** NexFactionConfig.Morality, lower case in the file; NEUTRAL when missing. */
export const NEX_MORALITY = ['good', 'neutral', 'amoral', 'evil'] as const

/** The new-game fleet types (Nex_NGCStartFleetOptionsV2), labelled as Nexerelin's new-game screen does; each a list of fleets, a fleet a list of variant ids. */
export const NEX_START_FLEETS: { key: string; label: string }[] = [
  { key: 'startShipsSolo', label: 'Frigate (classic)' },
  { key: 'startShipsCombatSmall', label: 'Combat (small)' },
  { key: 'startShipsCombatLarge', label: 'Combat (large)' },
  { key: 'startShipsTradeSmall', label: 'Trade (small)' },
  { key: 'startShipsTradeLarge', label: 'Trade (large)' },
  { key: 'startShipsCarrierSmall', label: 'Carrier (small)' },
  { key: 'startShipsCarrierLarge', label: 'Carrier (large)' },
  { key: 'startShipsExplorerSmall', label: 'Explorer (small)' },
  { key: 'startShipsExplorerLarge', label: 'Explorer (large)' },
  { key: 'startShipsSuper', label: 'Super ship' },
  { key: 'startShipsGrandFleet', label: 'Grand fleet' }
]

export type NexFieldKind = 'bool' | 'text' | 'longtext' | 'number' | 'select' | 'factions' | 'traits' | 'alignments' | 'names3' | 'fleets'

export interface NexField {
  key: string
  label: string
  kind: NexFieldKind
  /** Nexerelin's value when the key is missing (shown, and a bool's checkbox state). */
  default?: unknown
  /** Shown instead of the default when it depends on another key ("= playable"). */
  defaultText?: string
  help: string
  options?: readonly string[]
  /** select: labels for the options (value → label). */
  optionLabels?: Record<string, string>
  min?: number
  max?: number
  step?: number
}

export interface NexGroup { id: string; label: string; help?: string; fields: NexField[] }

/** The tab's fields, grouped (defaults from NexFactionConfig's constructor and loadFactionConfig, 0.12.2d). */
export const NEX_GROUPS: NexGroup[] = [
  {
    id: 'start', label: 'New game', fields: [
      { key: 'playableFaction', label: 'Playable', kind: 'bool', default: true, help: 'A full Nexerelin faction: it can be joined, and in a random sector it gets markets. Off for helper factions (Nexerelin\'s own default for a faction it has no config for).' },
      { key: 'startingFaction', label: 'Starting faction', kind: 'bool', defaultText: 'same as Playable', help: 'Listed in Nexerelin\'s new-game faction list, so the player can start as a member. Without ready-made fleets below, the player only gets Nexerelin\'s Custom button (a fleet built from the faction\'s known ships).' },
      { key: 'enabledByDefault', label: 'On in a random sector', kind: 'bool', defaultText: 'same as Starting faction', help: 'Switched on by default in a random sector\'s faction list (the player can still change it).' },
      { key: 'difficultyString', label: 'Difficulty', kind: 'text', default: '', help: 'Shown after the name in the new-game list, e.g. "Hard" → "Vanguard Compact (Hard)".' },
      { key: 'ngcTooltip', label: 'New-game tooltip', kind: 'longtext', help: 'The tooltip on the faction in the new-game list.' },
      { key: 'fleets', label: 'Ready-made fleets', kind: 'fleets', help: 'The ready-made fleets offered when the player joins this faction at the start, by type (Frigate (classic), Combat (small), …), edited on Fleets › New-game fleets. Each fleet is a list of variant ids; a type with several fleets gets < > buttons. Types left empty aren\'t offered. Nexerelin\'s Custom button (a fleet built from the faction\'s known ships) is always there too.' }
    ]
  },
  {
    id: 'war', label: 'War and invasions', fields: [
      { key: 'pirateFaction', label: 'Pirates', kind: 'bool', default: false, help: 'Treated as a pirate faction: hostile to most, raids instead of diplomacy, no strategic AI by default.' },
      { key: 'isPirateNeutral', label: 'Neutral to pirates', kind: 'bool', default: false, help: 'Not set hostile to the pirate factions at the start (as Nexerelin does with everyone else).' },
      { key: 'hostileToAll', label: 'Hostile to all', kind: 'select', default: 0, options: ['0', '1', '2', '3'], optionLabels: { 0: 'no', 1: 'yes, the player only Inhospitable', 2: 'yes, the player too', 3: 'yes, Vengeful to everyone' }, help: 'At the start, set hostile to every faction, like the Remnant. Nexerelin\'s values: 1 makes the player only Inhospitable, 2 hostile, 3 Vengeful to all.' },
      { key: 'canInvade', label: 'Can invade', kind: 'bool', default: true, help: 'Sends invasion fleets against other factions\' markets.' },
      { key: 'invasionOnlyRetake', label: 'Only retakes', kind: 'bool', default: false, help: 'Invades only markets it owned before.' },
      { key: 'invasionPointMult', label: 'Invasion rate', kind: 'number', default: 1, min: 0, step: 0.05, help: 'Multiplies the points it gathers towards invasions: higher invades more often (1 = normal).' },
      { key: 'invasionFleetSizeMod', label: 'Invasion fleet size', kind: 'number', default: 0, step: 0.05, help: 'Added to its invasion fleets\' size (0.1 = +10%).' },
      { key: 'responseFleetSizeMod', label: 'Response fleet size', kind: 'number', default: 0, step: 0.05, help: 'Added to its response fleets\' size (the fleets that defend its markets).' },
      { key: 'invasionStrengthBonusAttack', label: 'Ground attack bonus', kind: 'number', default: 0, step: 0.05, help: 'Bonus to its ground forces when it invades.' },
      { key: 'invasionStrengthBonusDefend', label: 'Ground defence bonus', kind: 'number', default: 0, step: 0.05, help: 'Bonus to its ground forces when it is invaded.' },
      { key: 'specialForcesMaxFleets', label: 'Special forces fleets', kind: 'number', default: 2, min: 0, step: 1, help: 'The most special forces task forces it keeps at once.' },
      { key: 'specialForcesSizeMult', label: 'Special forces size', kind: 'number', default: 1, min: 0, step: 0.05, help: 'Multiplies the size of its special forces fleets.' },
      { key: 'specialForcesPointMult', label: 'Special forces rate', kind: 'number', default: 1, min: 0, step: 0.05, help: 'Multiplies the points it gathers towards special forces.' }
    ]
  },
  {
    id: 'diplomacy', label: 'Diplomacy', help: 'Nexerelin\'s random diplomacy events (wars, ceasefires, alliances) are weighted by these.', fields: [
      { key: 'morality', label: 'Morality', kind: 'select', default: 'neutral', options: NEX_MORALITY, help: 'Good, neutral, amoral or evil: factions far apart in morality dislike each other.' },
      { key: 'alignments', label: 'Alignments', kind: 'alignments', help: 'How much it leans to each alliance alignment (-1 to 1). Factions with shared alignments ally more easily.' },
      { key: 'diplomacyTraits', label: 'Traits', kind: 'traits', help: 'Its diplomatic personality.' },
      { key: 'allowRandomDiplomacyTraits', label: 'Random traits allowed', kind: 'bool', default: true, help: 'When the player asks for random diplomacy traits at the start, this faction may get random ones too.' },
      { key: 'factionsLiked', label: 'Likes', kind: 'factions', help: 'Factions it is more friendly with in diplomacy events.' },
      { key: 'factionsDisliked', label: 'Dislikes', kind: 'factions', help: 'Factions it is more hostile to in diplomacy events.' },
      { key: 'disableDiplomacy', label: 'No diplomacy', kind: 'bool', default: false, help: 'Takes no part in random diplomacy events at all.' },
      { key: 'noRandomizeRelations', label: 'Keep relations when randomized', kind: 'bool', default: false, help: 'When the player picks random starting relations, this faction keeps the starting relations designed on Relations & changes instead.' },
      { key: 'noSyncRelations', label: 'Don\'t sync with the player', kind: 'bool', default: false, help: 'When the player is a member, the player\'s relations don\'t follow this faction\'s.' }
    ]
  },
  {
    id: 'names', label: 'Fleet names', help: 'Empty: Nexerelin\'s default name.', fields: [
      { key: 'invasionFleetName', label: 'Invasion fleet', kind: 'text', default: 'Invasion Fleet', help: 'Its invasion fleets.' },
      { key: 'invasionSupportFleetName', label: 'Strike fleet', kind: 'text', default: 'Strike Fleet', help: 'The fleets that support its invasions.' },
      { key: 'responseFleetName', label: 'Response fleet', kind: 'text', default: 'Response Fleet', help: 'The fleets that answer an attack on its markets.' },
      { key: 'defenceFleetName', label: 'Defence fleet', kind: 'text', default: 'Defense Fleet', help: 'Its market defence fleets.' },
      { key: 'suppressionFleetName', label: 'Suppression fleet', kind: 'text', default: 'Suppression Fleet', help: 'Fleets sent to put down rebellions.' },
      { key: 'asteroidMiningFleetName', label: 'Mining fleet', kind: 'text', default: 'Mining Fleet', help: 'Its asteroid mining fleets.' },
      { key: 'gasMiningFleetName', label: 'Gas mining fleet', kind: 'text', default: 'Mining Fleet', help: 'Its gas mining fleets.' },
      { key: 'rebelFleetSuffix', label: 'Rebels', kind: 'text', default: 'Dissenters', help: 'Put after the name of its rebels ("Vanguard Compact Dissenters").' },
      { key: 'vengeanceLevelNames', label: 'Vengeance levels', kind: 'names3', help: 'The three vengeance levels against the player (Nexerelin: Grudge, Vendetta, Revenge).' },
      { key: 'vengeanceFleetNames', label: 'Vengeance fleets', kind: 'names3', help: 'The fleets sent at each level (Hunter Fleet, Executors, Kill-Fleet).' },
      { key: 'vengeanceFleetNamesSingle', label: 'Vengeance, one fleet', kind: 'names3', help: 'The same with an article, used in text ("a Hunter Fleet").' }
    ]
  },
  {
    id: 'economy', label: 'Economy', fields: [
      { key: 'freeMarket', label: 'Free market', kind: 'bool', default: false, help: 'Its markets have no illegal goods for trade, like a free port.' },
      { key: 'tariffMult', label: 'Tariffs', kind: 'number', default: 1, min: 0, step: 0.05, help: 'Multiplies the tariff at its markets (1 = normal).' },
      { key: 'corvusCompatible', label: 'Hand-made sector', kind: 'bool', default: false, help: 'Marks the faction as fitting the hand-made (Corvus) sector. Nexerelin\'s own files set it on every vanilla faction; 0.12.2d reads it but we found no use. Saga Forge sets it for your factions.' }
    ]
  }
]

export const NEX_FIELDS = NEX_GROUPS.flatMap((g) => g.fields)
/** Keys the tab shows; the rest are "Other keys" (kept). startRelationships and its switch are written by Export. */
export const NEX_KNOWN_KEYS = new Set([...NEX_FIELDS.filter((f) => f.kind !== 'fleets').map((f) => f.key), ...NEX_START_FLEETS.map((f) => f.key), NEX_START_RELATIONS, NEX_USE_CONFIG_RELATIONS])

/** A new config: playable, not yet a starting faction (until it has ready-made fleets), hand-made sector. */
export function newNexConfig(): NexConfig {
  return { playableFaction: true, startingFaction: false, corvusCompatible: true }
}

/** The faction's own keys the tab has no field for. */
export const nexOtherKeys = (c: NexConfig): string[] => Object.keys(c).filter((k) => !NEX_KNOWN_KEYS.has(k))

/** A bool's value as Nexerelin reads it (its default when missing; startingFaction / enabledByDefault follow the one before). */
export function nexBool(c: NexConfig, key: string): boolean {
  const v = c[key]
  if (typeof v === 'boolean') return v
  if (key === 'startingFaction') return nexBool(c, 'playableFaction')
  if (key === 'enabledByDefault') return nexBool(c, 'startingFaction')
  const f = NEX_FIELDS.find((x) => x.key === key)
  return f?.default === true
}

/** Starting fleets: type key → fleets (variant ids). Malformed entries are skipped. */
export function startFleets(c: NexConfig): Record<string, string[][]> {
  const out: Record<string, string[][]> = {}
  for (const t of NEX_START_FLEETS) {
    const v = c[t.key]
    if (!Array.isArray(v)) continue
    out[t.key] = v.filter(Array.isArray).map((f) => (f as unknown[]).map((x) => String(x)))
  }
  return out
}
export const hasStartFleet = (c: NexConfig): boolean => Object.values(startFleets(c)).some((l) => l.some((f) => f.length > 0))

// ---------------------------------------------------------------- import and export

/**
 * An existing config file read into the editor: its startRelationships pairs become the faction's
 * relations (only those it doesn't have yet: the relations already designed win), the rest of the
 * document is kept as is. A "default" entry (the value for every faction not listed) stays in the
 * document; the switch is dropped (Export always writes it, true).
 */
export function importNexConfig(raw: NexConfig, have: Record<string, number> = {}): { config: NexConfig; relations: Record<string, number> } {
  const config: NexConfig = { ...raw }
  // Export always writes it (true), at its place in the file
  delete config[NEX_USE_CONFIG_RELATIONS]
  const relations: Record<string, number> = {}
  const sr = raw[NEX_START_RELATIONS]
  if (isObj(sr)) {
    const keep: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(sr)) {
      if (k === 'default' || typeof v !== 'number') keep[k] = v
      else if (!(k in have)) relations[k] = v
    }
    if (Object.keys(keep).length) config[NEX_START_RELATIONS] = keep
    else delete config[NEX_START_RELATIONS]
  }
  return { config, relations }
}

/**
 * Reads the mod's own config files into the model (only when it has no plan file yet): one per own
 * faction (addition) that has data/config/exerelinFactionConfig/<id>.json. Unreadable files are
 * left alone (Export won't touch a file it can't read either).
 */
export function importNexFiles(m: ModModel, files: Record<string, { text: string }>): string[] {
  const done: string[] = []
  for (const f of m.factions) {
    if (f.kind !== 'addition') continue
    const t = files[nexConfigPath(f.id)]?.text
    if (t == null) continue
    let raw: NexConfig
    try { raw = parseLooseObject(t).value } catch { continue }
    const have = m.factionsRuntime.relations[f.id] ?? {}
    const { config, relations } = importNexConfig(raw, have)
    ;(m.nexerelin ??= {})[f.id] = config
    if (Object.keys(relations).length) m.factionsRuntime.relations[f.id] = { ...have, ...relations }
    done.push(f.id)
  }
  // the player faction's added ready-made fleets (free start, own faction)
  const pt = files[NEX_PLAYER_CONFIG]?.text
  if (pt != null) {
    try { m.nexerelinPlayer = parseLooseObject(pt).value; done.push(NEX_PLAYER) } catch { /* left alone */ }
  }
  return done
}

/** The player faction (free start and own faction use its config, Nexerelin's player.json). */
export const NEX_PLAYER = 'player'
export const NEX_PLAYER_CONFIG = nexConfigPath(NEX_PLAYER)
/**
 * Whether the mod adds ready-made fleets to the player faction. Its player.json holds only them (and
 * any keys a hand-made one had): Nexerelin's own player.json is merged first, so the lists are
 * appended to Nexerelin's (the game's JSON merge), never replacing them.
 */
export const hasPlayerFleets = (m: Pick<ModModel, 'nexerelinPlayer'>): boolean => !!m.nexerelinPlayer && hasStartFleet(m.nexerelinPlayer)

/** The relations that go into the config: those that don't depend on mods (the others stay SagaLib's). */
export function nexRelationPairs(m: Pick<ModModel, 'factionsRuntime'>, factionId: string, eff: Map<string, ItemConds>): { inConfig: Record<string, number>; stayWithSagaLib: string[] } {
  const inConfig: Record<string, number> = {}
  const stay: string[] = []
  for (const [b, v] of Object.entries(m.factionsRuntime.relations[factionId] ?? {})) {
    const e = eff.get(`relation:${factionId}/${b}`)?.eff
    if (e && !isNone(e)) stay.push(b)
    else inConfig[b] = v
  }
  return { inConfig, stayWithSagaLib: stay }
}

/**
 * The file's document: the config with startRelationships (the kept "default" plus the relations)
 * in its place, and the switch that makes Nexerelin apply them in the hand-made sector too.
 */
export function nexConfigJson(config: NexConfig, relations: Record<string, number>): NexConfig {
  const out: NexConfig = {}
  const kept = isObj(config[NEX_START_RELATIONS]) ? (config[NEX_START_RELATIONS] as Record<string, unknown>) : {}
  const sr = { ...relations, ...('default' in kept ? { default: kept.default } : {}), ...Object.fromEntries(Object.entries(kept).filter(([k]) => k !== 'default' && !(k in relations))) }
  let placed = false
  for (const [k, v] of Object.entries(config)) {
    if (k === NEX_START_RELATIONS) { if (Object.keys(sr).length) out[k] = sr; placed = true; continue }
    if (k === NEX_USE_CONFIG_RELATIONS) continue
    out[k] = v
  }
  if (!placed && Object.keys(sr).length) out[NEX_START_RELATIONS] = sr
  out[NEX_USE_CONFIG_RELATIONS] = true
  return out
}

/** The mod's own factions (additions) that have a config, in the model's order. */
export function nexConfigured(m: Pick<ModModel, 'factions' | 'nexerelin'>): string[] {
  const cfg = m.nexerelin ?? {}
  return m.factions.filter((f) => f.kind === 'addition' && isObj(cfg[f.id])).map((f) => f.id)
}
