/**
 * The Factions page's fields (PLAN.md §4.1) and the editing logic for both kinds of entry:
 *  - an addition edits the whole document (raw);
 *  - an override shows the effective value (base layers + other mods + this patch) and only ever
 *    changes this mod's patch: scalars go to `set`, list entries to `add`, map weights to `set`.
 */
import { clone, effectiveFaction, getPath, isObj, prune, setPath, type FactionPatch } from './faction'
import type { FactionAdditionEdit, FactionOverrideEdit } from './serialize'

export type FieldKind = 'text' | 'longtext' | 'bool' | 'number' | 'color' | 'image' | 'select' | 'idlist' | 'weights' | 'names'
/** Where an id list's suggestions come from. */
export type IdSource = 'hulls' | 'wings' | 'weapons' | 'hullmods' | 'commodities' | 'portraits' | 'skills' | 'music' | 'tags' | 'free'

export interface FactionField {
  path: string
  label: string
  kind: FieldKind
  source?: IdSource
  options?: string[]
  help?: string
  min?: number
  max?: number
  step?: number
  /** A bool's value when the key is missing (the game's default). */
  default?: boolean
}

export interface FactionTab { id: string; label: string; fields: FactionField[] }

const list = (path: string, label: string, source: IdSource, help?: string): FactionField => ({ path, label, kind: 'idlist', source, help })
const weights = (path: string, label: string, source: IdSource, help?: string): FactionField => ({ path, label, kind: 'weights', source, help })
const doctrine = (key: string, label: string, min: number, max: number, step = 1, help?: string): FactionField =>
  ({ path: `factionDoctrine.${key}`, label, kind: 'number', min, max, step, help })

export const FACTION_TABS: FactionTab[] = [
  {
    id: 'identity', label: 'Identity', fields: [
      { path: 'displayName', label: 'Display name', kind: 'text' },
      { path: 'displayNameWithArticle', label: 'With article', kind: 'text', help: 'e.g. "the Hegemony"' },
      { path: 'displayNameLong', label: 'Long name', kind: 'text' },
      { path: 'displayNameLongWithArticle', label: 'Long, with article', kind: 'text' },
      { path: 'displayNameIsOrAre', label: 'Is or are', kind: 'select', options: ['is', 'are'] },
      { path: 'entityNamePrefix', label: 'Entity name', kind: 'text', help: 'Used for its stations and fleets ("Hegemony patrol")' },
      { path: 'personNamePrefix', label: 'Person name', kind: 'text', help: '"a Hegemony officer"' },
      { path: 'personNamePrefixAOrAn', label: 'A or an', kind: 'select', options: ['a', 'an'] },
      { path: 'shipNamePrefix', label: 'Ship prefix', kind: 'text', help: 'e.g. HSS' },
      { path: 'showInIntelTab', label: 'In intel tab', kind: 'bool' },
      { path: 'logo', label: 'Logo (flag)', kind: 'image', help: '410×256 in vanilla' },
      { path: 'crest', label: 'Crest', kind: 'image', help: '128×128 in vanilla' }
    ]
  },
  {
    id: 'colors', label: 'Colors', fields: [
      { path: 'color', label: 'Main', kind: 'color' },
      { path: 'baseUIColor', label: 'Base UI', kind: 'color' },
      { path: 'darkUIColor', label: 'Dark UI', kind: 'color' },
      { path: 'gridUIColor', label: 'Grid UI', kind: 'color' },
      { path: 'brightUIColor', label: 'Bright UI', kind: 'color' },
      { path: 'secondaryUIColor', label: 'Secondary', kind: 'color' }
    ]
  },
  {
    id: 'ships', label: 'Ships & weapons', fields: [
      list('knownShips.hulls', 'Known ships · hulls', 'hulls', 'Hulls from the game index, including your Ship Editor hulls (picked here, never edited).'),
      list('knownShips.tags', 'Known ships · blueprint tags', 'tags'),
      list('priorityShips.hulls', 'Priority ships · hulls', 'hulls'),
      list('priorityShips.tags', 'Priority ships · tags', 'tags'),
      weights('hullFrequency.hulls', 'Hull frequency · hulls', 'hulls'),
      weights('hullFrequency.tags', 'Hull frequency · tags', 'tags'),
      list('knownFighters.fighters', 'Known fighters', 'wings'),
      list('knownFighters.tags', 'Known fighters · tags', 'tags'),
      list('knownWeapons.weapons', 'Known weapons', 'weapons'),
      list('knownWeapons.tags', 'Known weapons · tags', 'tags'),
      list('priorityWeapons.weapons', 'Priority weapons', 'weapons'),
      list('knownHullMods.hullMods', 'Known hullmods', 'hullmods'),
      list('knownHullMods.tags', 'Known hullmods · tags', 'tags')
    ]
  },
  {
    id: 'doctrine', label: 'Doctrine', fields: [
      doctrine('warships', 'Warships', 0, 5), doctrine('carriers', 'Carriers', 0, 5), doctrine('phaseShips', 'Phase ships', 0, 5),
      doctrine('officerQuality', 'Officer quality', 1, 5), doctrine('shipQuality', 'Ship quality', 1, 5), doctrine('numShips', 'Number of ships', 1, 5),
      doctrine('shipSize', 'Ship size', 1, 5), doctrine('aggression', 'Aggression', 1, 5),
      doctrine('combatFreighterProbability', 'Combat freighters', 0, 1, 0.05),
      doctrine('autofitRandomizeProbability', 'Autofit randomize', 0, 1, 0.05),
      list('factionDoctrine.officerSkills', 'Officer skills', 'skills'),
      list('factionDoctrine.commanderSkills', 'Commander skills', 'skills'),
      list('illegalCommodities', 'Illegal goods', 'commodities')
    ]
  },
  {
    id: 'names', label: 'Names & ranks', fields: [
      weights('names', 'Person name sets', 'free', 'Name sets from data/characters/names (modern, world, future, myth, ...)'),
      weights('shipNameSources', 'Ship name sources', 'free', 'Ship name lists (GREEK, CELTIC, SPACE, GENERAL, ...)'),
      list('portraits.standard_male', 'Portraits · male', 'portraits'),
      list('portraits.standard_female', 'Portraits · female', 'portraits'),
      { path: 'ranks.ranks', label: 'Rank titles', kind: 'names', help: 'Rank id → title in this faction' },
      { path: 'ranks.posts', label: 'Post titles', kind: 'names', help: 'Post id → title in this faction' },
      { path: 'music.theme', label: 'Music · theme', kind: 'select', options: [] },
      { path: 'music.market_neutral', label: 'Music · market', kind: 'select', options: [] },
      { path: 'music.encounter_hostile', label: 'Music · hostile', kind: 'select', options: [] }
    ]
  },
  {
    // vanilla's "custom" block (read by the game's code, e.g. Commission: custom.offersCommissions)
    id: 'behavior', label: 'Behavior', fields: [
      { path: 'custom.offersCommissions', label: 'Offers commissions', kind: 'bool', default: false, help: 'Its station, base and outpost commanders and administrators offer a commission (at Favorable or better)' },
      { path: 'custom.engagesInHostilities', label: 'Wars and hostilities', kind: 'bool', default: false, help: 'Takes part in hostilities between factions' },
      { path: 'custom.buysAICores', label: 'Buys AI cores', kind: 'bool', default: false },
      { path: 'custom.buysSurveyData', label: 'Buys survey data', kind: 'bool', default: false },
      { path: 'custom.hostilityImpactOnGrowth', label: 'War slows growth', kind: 'bool', default: false, help: 'Hostilities affect its colonies\' growth' },
      { path: 'custom.caresAboutAtrocities', label: 'Cares about atrocities', kind: 'bool', default: false, help: 'Reacts to saturation bombardment' }
    ]
  }
]

export const ALL_FIELDS = FACTION_TABS.flatMap((t) => t.fields)
/** Top-level keys the tabs show; everything else is under "Other keys" ("custom" stays there too: its other keys have no field). */
export const KNOWN_TOP_KEYS = new Set(['id', ...ALL_FIELDS.map((f) => f.path.split('.')[0]).filter((k) => k !== 'custom')])

/** A new faction document with the keys vanilla factions have (based on vanilla's smaller factions). */
export function newFactionDoc(id: string, name: string): Record<string, unknown> {
  return {
    id,
    color: [63, 167, 160, 255],
    baseUIColor: [108, 208, 200, 255],
    darkUIColor: [29, 76, 73, 175],
    gridUIColor: [63, 167, 160, 70],
    displayName: name,
    displayNameWithArticle: `the ${name}`,
    displayNameLong: name,
    displayNameLongWithArticle: `the ${name}`,
    entityNamePrefix: name,
    personNamePrefix: name,
    personNamePrefixAOrAn: /^[aeiou]/i.test(name) ? 'an' : 'a',
    displayNameIsOrAre: 'is',
    showInIntelTab: true,
    logo: 'graphics/factions/independent.png',
    crest: 'graphics/factions/crest_independent.png',
    shipNamePrefix: 'ISS',
    shipNameSources: { GENERAL: 1, SPACE: 1 },
    names: { modern: 1, world: 1 },
    portraits: { standard_male: ['graphics/portraits/portrait_mercenary01.png'], standard_female: ['graphics/portraits/portrait_mercenary02.png'] },
    knownShips: { tags: ['base_bp'], hulls: [] },
    priorityShips: { tags: [], hulls: [] },
    knownFighters: { tags: ['base_bp'], fighters: [] },
    knownWeapons: { tags: ['base_bp'], weapons: [] },
    knownHullMods: { tags: ['base_bp'], hullMods: [] },
    factionDoctrine: { warships: 3, carriers: 2, phaseShips: 2, officerQuality: 2, shipQuality: 3, numShips: 2, shipSize: 3, aggression: 3 },
    illegalCommodities: ['drugs', 'organs'],
    ranks: { ranks: {}, posts: {} },
    // as vanilla's major factions; without offersCommissions nobody can commission the player
    custom: { offersCommissions: true, engagesInHostilities: true, buysAICores: true, AICoreValueMult: 1, AICoreRepMult: 1, buysSurveyData: true, hostilityImpactOnGrowth: true, caresAboutAtrocities: true }
  }
}

/** One source's contribution to a list field (for the override view: vanilla, other mods, this mod). */
export interface ListLayer { sourceId: string; values: unknown[]; mine: boolean }

/** Editing operations over one faction entry; the page calls them inside project.change(). */
export interface FactionEditor {
  readonly kind: 'addition' | 'override'
  /** The effective document (for an addition: the document itself). */
  effective(): Record<string, unknown>
  value(path: string): unknown
  /** Override: the patch sets this path (shown orange, with Revert). */
  isSet(path: string): boolean
  set(path: string, v: unknown): void
  revert(path: string): void
  /** List fields: entries by layer. */
  listLayers(path: string): ListLayer[]
  addToList(path: string, v: string): void
  /** Remove one of this mod's entries. Returns false if the entry belongs to a base layer (merge can't remove it). */
  removeFromList(path: string, v: string): boolean
  setWeight(path: string, key: string, w: number | undefined): void
}

export function additionEditor(f: FactionAdditionEdit): FactionEditor {
  return {
    kind: 'addition',
    effective: () => f.raw,
    value: (p) => getPath(f.raw, p),
    isSet: () => false,
    set: (p, v) => { setPath(f.raw, p, clone(v)) },
    revert: (p) => { setPath(f.raw, p, undefined); prune(f.raw) },
    listLayers: (p) => [{ sourceId: 'mine', values: asList(getPath(f.raw, p)), mine: true }],
    addToList: (p, v) => {
      const cur = asList(getPath(f.raw, p))
      if (!cur.includes(v)) setPath(f.raw, p, [...cur, v])
    },
    removeFromList: (p, v) => { setPath(f.raw, p, asList(getPath(f.raw, p)).filter((x) => x !== v)); return true },
    setWeight: (p, k, w) => {
      const cur = isObj(getPath(f.raw, p)) ? { ...(getPath(f.raw, p) as Record<string, unknown>) } : {}
      if (w === undefined) delete cur[k]
      else cur[k] = w
      setPath(f.raw, p, cur)
    }
  }
}

/**
 * Override editor. `layers` = the faction's files from other sources in load order (the first
 * defines it), excluding this mod's own patch.
 */
export function overrideEditor(f: FactionOverrideEdit, layers: { sourceId: string; raw: Record<string, unknown> }[]): FactionEditor {
  const patch: FactionPatch = f.patch
  return {
    kind: 'override',
    effective: () => effectiveFaction(layers.map((l) => l.raw), patch),
    value: (p) => getPath(effectiveFaction(layers.map((l) => l.raw), patch), p),
    isSet: (p) => getPath(patch.set, p) !== undefined,
    set: (p, v) => { setPath(patch.set, p, clone(v)) },
    revert: (p) => { setPath(patch.set, p, undefined); prune(patch.set); delete patch.add[p] },
    listLayers: (p) => [
      ...layers.map((l) => ({ sourceId: l.sourceId, values: asList(getPath(l.raw, p)), mine: false })),
      { sourceId: 'mine', values: patch.add[p] ?? [], mine: true }
    ],
    addToList: (p, v) => {
      const cur = patch.add[p] ?? []
      if (!cur.includes(v)) patch.add[p] = [...cur, v]
    },
    removeFromList: (p, v) => {
      const cur = patch.add[p] ?? []
      if (!cur.includes(v)) return false
      patch.add[p] = cur.filter((x) => x !== v)
      if (!patch.add[p].length) delete patch.add[p]
      return true
    },
    setWeight: (p, k, w) => {
      // map entries merge by key, so a weight is a `set` of that one key
      setPath(patch.set, `${p}.${k}`, w)
      prune(patch.set)
    }
  }
}

export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** [r,g,b,a] ⇄ "#rrggbb" + alpha. */
export function colorToHex(c: unknown): string {
  const a = Array.isArray(c) ? c.map(Number) : [255, 255, 255]
  return '#' + a.slice(0, 3).map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('')
}
export function hexToColor(hex: string, alpha: number): number[] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha]
}

/** The reputation level name of a value (-1..1), as the game names it. */
export function repLevelName(v: number, levels: { id: string; name: string; min: number }[]): string {
  let best = levels[0]
  for (const l of levels) if (v >= l.min) best = l
  return best?.name ?? ''
}
