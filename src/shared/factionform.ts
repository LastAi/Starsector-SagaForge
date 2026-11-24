/**
 * The Factions page's fields (PLAN.md §4.1) and the editing logic for both kinds of entry:
 *  - an addition edits the whole document (raw);
 *  - an override shows the effective value (base layers + other mods + this patch) and only ever
 *    changes this mod's patch: scalars go to `set`, list entries to `add`, map weights to `set`.
 */
import { clone, effectiveFaction, getPath, isObj, prune, setPath, type FactionPatch } from './faction'
import type { FactionAdditionEdit, FactionOverrideEdit } from './serialize'
import { gameVersionAtLeast } from './version'

/**
 * 'names' = id → {name} (rank and post titles); 'labels' = id → text (fleet type names);
 * 'presence' = an object switched on by being there (punitive expeditions).
 */
export type FieldKind = 'text' | 'longtext' | 'bool' | 'number' | 'color' | 'image' | 'select' | 'idlist' | 'weights' | 'names' | 'labels' | 'presence'
/** Where an id list's suggestions come from. */
export type IdSource = 'hulls' | 'wings' | 'weapons' | 'hullmods' | 'commodities' | 'portraits' | 'skills' | 'music' | 'tags' | 'nameSets' | 'shipNames' | 'fleetTypes' | 'stations' | 'free'

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
  /** Shown only for this faction id (e.g. 'player'). */
  onlyFaction?: string
  /** Shown only when the game definitions in use are this version or later (e.g. '0.98.5a'). */
  since?: string
  /** Shown only when this path has a value (the switches of a 'presence' object). */
  requires?: string
  /** A template for a 'presence' object when it is switched on. */
  template?: Record<string, unknown>
}

/** #67 U34: the reference section that explains a field's options (the ⓘ next to its label). */
export function factionFieldRef(f: FactionField): string | undefined {
  if (f.source === 'tags') return 'factions-blueprint-tags'
  if (f.source === 'skills') return 'factions-skills'
  if (f.source === 'fleetTypes') return 'factions-fleet-types'
  if (f.source === 'music') return 'general-music'
  if (f.source === 'stations') return 'locations-industries'
  if (f.path === 'ranks.ranks') return 'people-rank'
  if (f.path === 'ranks.posts') return 'people-post'
  return undefined
}

export interface FactionTab { id: string; label: string; fields: FactionField[] }

const list = (path: string, label: string, source: IdSource, help?: string): FactionField => ({ path, label, kind: 'idlist', source, help })
const weights = (path: string, label: string, source: IdSource, help?: string): FactionField => ({ path, label, kind: 'weights', source, help })
const doctrine = (key: string, label: string, min: number, max: number, step = 1, help?: string): FactionField =>
  ({ path: `factionDoctrine.${key}`, label, kind: 'number', min, max, step, help })

export const FACTION_TABS: FactionTab[] = [
  {
    id: 'identity', label: 'Identity', fields: [
      { path: 'displayName', label: 'Display name', kind: 'text', help: 'The faction\'s name in the intel tab, on colonies and in dialog ("Hegemony").' },
      { path: 'displayNameWithArticle', label: 'With article', kind: 'text', help: 'The name inside a sentence, e.g. "the Hegemony" ($theFaction in dialog).' },
      { path: 'displayNameLong', label: 'Long name', kind: 'text', help: 'The full, formal name, shown where the game names the faction at length (its intel page).' },
      { path: 'displayNameLongWithArticle', label: 'Long, with article', kind: 'text', help: 'The full name inside a sentence ("the Vanguard Compact of Free Stations").' },
      { path: 'displayNameIsOrAre', label: 'Is or are', kind: 'select', options: ['is', 'are'], help: 'The verb vanilla text uses after the name: "the Hegemony is", "the Luddic Path are".' },
      { path: 'entityNamePrefix', label: 'Entity name', kind: 'text', help: 'Put before its stations\' and fleets\' names ("Hegemony patrol").' },
      { path: 'personNamePrefix', label: 'Person name', kind: 'text', help: 'Describes its people in text ("a Hegemony officer").' },
      { path: 'personNamePrefixAOrAn', label: 'A or an', kind: 'select', options: ['a', 'an'], help: 'The article before the person name ("an Independent captain").' },
      { path: 'shipNamePrefix', label: 'Ship prefix', kind: 'text', help: 'Put before its ships\' names, e.g. HSS ("HSS Courage").' },
      { path: 'showInIntelTab', label: 'In intel tab', kind: 'bool', help: 'Listed in the intel tab\'s Factions list. Off for hidden factions (derelicts, neutral helpers).' },
      { path: 'logo', label: 'Logo (flag)', kind: 'image', help: 'The flag on its colonies, fleets and the intel tab: a 410×256 PNG as vanilla\'s. Choose… picks one by its picture, or imports your own.' },
      { path: 'crest', label: 'Crest', kind: 'image', help: 'The emblem in the intel tab and dialog faction panels: a 256×256 PNG as vanilla\'s.' }
    ]
  },
  {
    id: 'colors', label: 'Colors', fields: [
      { path: 'color', label: 'Main', kind: 'color', help: 'The faction\'s color: its name in text, its fleets and colonies on the map.' },
      { path: 'baseUIColor', label: 'Base UI', kind: 'color', help: 'Interface color when docked at its colonies (buttons, frames).' },
      { path: 'darkUIColor', label: 'Dark UI', kind: 'color', help: 'Dark shade of the docked interface (panel backgrounds). The fourth number is opacity.' },
      { path: 'gridUIColor', label: 'Grid UI', kind: 'color', help: 'The grid lines of the docked interface; usually faint (low opacity).' },
      { path: 'brightUIColor', label: 'Bright UI', kind: 'color', help: 'Highlights in the docked interface. Optional: the game brightens Base UI when it is missing.' },
      { path: 'secondaryUIColor', label: 'Secondary', kind: 'color', help: 'Second interface color some screens use. Optional.' }
    ]
  },
  {
    id: 'ships', label: 'Ships', fields: [
      list('knownShips.hulls', 'Known ships · hulls', 'hulls', 'Hulls its fleets and markets can use, from the game index (your Ship Editor hulls too). In an override, added hulls join the faction\'s own.'),
      list('knownShips.tags', 'Known ships · blueprint tags', 'tags', 'Every hull with one of these tags is known, e.g. lowtech_bp. The easy way to give a whole family of ships.'),
      list('priorityShips.hulls', 'Priority ships · hulls', 'hulls', 'Hulls its fleets pick first when they fit the doctrine.'),
      list('priorityShips.tags', 'Priority ships · tags', 'tags', 'Hulls with these tags are picked first.'),
      weights('hullFrequency.hulls', 'Hull frequency · hulls', 'hulls', 'Hull → weight: higher shows up more often in its fleets (1 = normal, 0.25 = rare).'),
      weights('hullFrequency.tags', 'Hull frequency · tags', 'tags', 'Tag → weight for every hull with that tag.'),
      list('knownFighters.fighters', 'Known fighters', 'wings', 'Fighter wings its carriers can field and its markets sell.'),
      list('knownFighters.tags', 'Known fighters · tags', 'tags', 'Every wing with one of these tags is known.'),
      list('knownWeapons.weapons', 'Known weapons', 'weapons', 'Weapons its ships are fitted with and its markets sell.'),
      list('knownWeapons.tags', 'Known weapons · tags', 'tags', 'Every weapon with one of these tags is known.'),
      list('priorityWeapons.weapons', 'Priority weapons', 'weapons', 'Weapons its autofit prefers.'),
      list('knownHullMods.hullMods', 'Known hullmods', 'hullmods', 'Hullmods its ships can be built with.'),
      list('knownHullMods.tags', 'Known hullmods · tags', 'tags', 'Every hullmod with one of these tags is known.')
    ]
  },
  {
    id: 'doctrine', label: 'Doctrine', fields: [
      doctrine('warships', 'Warships', 0, 5, 1, 'Share of plain warships in its fleets. Warships + carriers + phase ships add up to 7 in most vanilla factions.'),
      doctrine('carriers', 'Carriers', 0, 5, 1, 'Share of carriers in its fleets.'),
      doctrine('phaseShips', 'Phase ships', 0, 5, 1, 'Share of phase ships in its fleets.'),
      doctrine('officerQuality', 'Officer quality', 1, 5, 1, 'More and better officers on its ships. Officer quality, ship quality and number of ships add up to 7 in vanilla.'),
      doctrine('shipQuality', 'Ship quality', 1, 5, 1, 'Fewer D-mods and better fits.'),
      doctrine('numShips', 'Number of ships', 1, 5, 1, 'More, cheaper ships for the same fleet points.'),
      doctrine('shipSize', 'Ship size', 1, 5, 1, 'Prefers small (1) or large (5) hulls.'),
      doctrine('aggression', 'Aggression', 1, 5, 1, 'How its officers fight: 1 cautious … 5 reckless.'),
      doctrine('combatFreighterProbability', 'Combat freighters', 0, 1, 0.05, 'Chance its fleets include armed freighters.'),
      doctrine('autofitRandomizeProbability', 'Autofit randomize', 0, 1, 0.05, 'Chance a ship gets a randomized fit instead of its stock variant.'),
      list('factionDoctrine.officerSkills', 'Officer skills', 'skills', 'Skills its officers favour.'),
      list('factionDoctrine.commanderSkills', 'Commander skills', 'skills', 'Skills its fleet commanders favour.'),
      list('illegalCommodities', 'Illegal goods', 'commodities', 'Commodities banned at its markets: customs scans fine the player, and they sell only on the black market.')
    ]
  },
  {
    id: 'names', label: 'Names', fields: [
      weights('names', 'Person name sets', 'nameSets', 'Name categories its generated people (officers, administrators, contacts) are named from, with weights: vanilla\'s (modern, world, future, myth, …), other mods\' and this mod\'s own name lists. A category without first or last names for a gender borrows them from a random category.'),
      weights('shipNameSources', 'Ship name sources', 'shipNames', 'Ship name lists its ships are named from, with weights: vanilla\'s (GREEK, CELTIC, SPACE, GENERAL, …), other mods\' and this mod\'s own name lists.'),
      list('portraits.standard_male', 'Portraits · male', 'portraits', 'Portraits its generated men use (officers, administrators, contacts).'),
      list('portraits.standard_female', 'Portraits · female', 'portraits', 'Portraits its generated women use.'),
      // 0.98.5a: the new-game portrait picker reads player_male / player_female (SpecStore); on the
      // player faction standard_* is now a separate, shorter list (docs/FORMATS.md, "Player portraits")
      {
        ...list('portraits.player_male', 'New-game portraits · male', 'portraits',
          'Starsector 0.98.5a and later: the portraits offered when starting a new game. Add new player portraits here; adding them to "Portraits · male" no longer puts them in the new-game picker.'),
        onlyFaction: 'player', since: '0.98.5a'
      },
      {
        ...list('portraits.player_female', 'New-game portraits · female', 'portraits',
          'Starsector 0.98.5a and later: the portraits offered when starting a new game. Add new player portraits here; adding them to "Portraits · female" no longer puts them in the new-game picker.'),
        onlyFaction: 'player', since: '0.98.5a'
      },
      { path: 'ranks.ranks', label: 'Rank titles', kind: 'names', help: 'Rank id → the title its people show with their name in this faction (e.g. spaceCommander → "Commodore").' },
      { path: 'ranks.posts', label: 'Post titles', kind: 'names', help: 'Post id → the job title shown in its colonies\' comm directories.' },
      { path: 'fleetTypeNames', label: 'Fleet type names', kind: 'labels', source: 'fleetTypes', help: 'Fleet type → the name its fleets of that type get, e.g. vanilla\'s pirates: patrolSmall → "Corsair". Types it doesn\'t name use the game\'s default names. Name your encounters\' own fleet types here.' },
      { path: 'music.theme', label: 'Music · theme', kind: 'select', options: [], help: 'Music when the player is in its territory. Empty: the game\'s default.' },
      { path: 'music.market_neutral', label: 'Music · market', kind: 'select', options: [], help: 'Music while docked at its colonies.' },
      { path: 'music.encounter_hostile', label: 'Music · hostile', kind: 'select', options: [], help: 'Music when a hostile fleet of this faction approaches.' }
    ]
  },
  {
    // vanilla's "custom" block (read by the game's code, e.g. Commission: custom.offersCommissions)
    id: 'behavior', label: 'Behavior', fields: [
      { path: 'custom.offersCommissions', label: 'Offers commissions', kind: 'bool', default: false, help: 'The player can take a commission: its station, base and outpost commanders and administrators offer one at Favorable or better, as vanilla\'s major factions do.' },
      { path: 'custom.engagesInHostilities', label: 'Wars and hostilities', kind: 'bool', default: false, help: 'Takes part in vanilla\'s hostilities between factions (raids, punitive expeditions, wars in the intel tab).' },
      { path: 'custom.buysAICores', label: 'Buys AI cores', kind: 'bool', default: false, help: 'Its colonies\' administrators offer to buy AI cores from the player, for credits and reputation.' },
      { path: 'custom.buysSurveyData', label: 'Buys survey data', kind: 'bool', default: false, help: 'Its colonies buy survey data the player has collected.' },
      { path: 'custom.hostilityImpactOnGrowth', label: 'War slows growth', kind: 'bool', default: false, help: 'Hostilities with other factions slow its colonies\' growth.' },
      { path: 'custom.caresAboutAtrocities', label: 'Cares about atrocities', kind: 'bool', default: false, help: 'Its reputation with the player drops when the player saturation-bombards a colony.' },
      // RC-R13 (DESIGN-PHASE2.md §3): faction runtime keys read by vanilla's code
      { path: 'custom.postsNoBounties', label: 'Posts no bounties', kind: 'bool', default: false, help: 'Its markets never post system bounties, and it is never the faction that pays a bounty on a pirate base. Vanilla: pirates, the Luddic Path and the hostile AI factions.' },
      { path: 'custom.makesPirateBases', label: 'Makes pirate bases', kind: 'bool', default: false, help: 'Vanilla\'s pirate base manager may give it the hidden bases it places in the sector (raids, bounties on the base). Vanilla: only the pirates. On an existing faction this changes vanilla\'s sector.' },
      { ...weights('custom.pirateBaseStationTypes', 'Pirate base stations', 'stations', 'Station industry → weight for its hidden bases (vanilla\'s pirates: orbitalstation 10, orbitalstation_mid 6, orbitalstation_high 2). Empty: the game\'s default (5, 3, 1).'), requires: 'custom.makesPirateBases' },
      { path: 'custom.punitiveExpeditionData', label: 'Punitive expeditions', kind: 'presence', template: { vsCompetitors: false, vsFreePort: false, canBombard: false, territorial: true }, help: 'It can send punitive expeditions against the player\'s colonies, for the reasons switched on below. Every vanilla major faction has it.' },
      { path: 'custom.punitiveExpeditionData.territorial', label: '· Territorial', kind: 'bool', default: false, requires: 'custom.punitiveExpeditionData', help: 'Against the player\'s small colonies (that a bombardment would destroy) in systems it claims. These expeditions always bombard.' },
      { path: 'custom.punitiveExpeditionData.vsCompetitors', label: '· Vs. competitors', kind: 'bool', default: false, requires: 'custom.punitiveExpeditionData', help: 'Against the player\'s colonies that take a large share of a commodity it is a top producer of.' },
      { path: 'custom.punitiveExpeditionData.vsFreePort', label: '· Vs. free ports', kind: 'bool', default: false, requires: 'custom.punitiveExpeditionData', help: 'Against the player\'s free-port colonies, and their trade in goods it bans.' },
      { path: 'custom.punitiveExpeditionData.canBombard', label: '· Can bombard', kind: 'bool', default: false, requires: 'custom.punitiveExpeditionData', help: 'After two successful expeditions, the next ones bombard the colony instead of raiding it.' }
    ]
  }
]

export const ALL_FIELDS = FACTION_TABS.flatMap((t) => t.fields)

/** The fields of a tab that apply to this faction and game version (see onlyFaction / since). */
export function visibleFields(tab: FactionTab, factionId: string, gameVersion: string | null | undefined, value?: (path: string) => unknown): FactionField[] {
  return tab.fields.filter((f) => (!f.onlyFaction || f.onlyFaction === factionId) && (!f.since || gameVersionAtLeast(gameVersion, f.since))
    && (!f.requires || !value || (value(f.requires) != null && value(f.requires) !== false)))
}
/** Top-level keys the tabs show; everything else is under "Other keys" ("custom" stays there too: its other keys have no field). */
export const KNOWN_TOP_KEYS = new Set(['id', ...ALL_FIELDS.map((f) => f.path.split('.')[0]).filter((k) => k !== 'custom')])

/** A ship name prefix from the name's initials and "S" ("Vanguard Compact" → "VCS"), as vanilla's HSS, TTS. */
export function shipPrefixFor(name: string): string {
  const initials = name.split(/[^A-Za-z]+/).filter((w) => w && !/^(the|of|and)$/i.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 3)
  return initials ? `${initials}S` : 'ISS'
}

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
    // vanilla's Independent flag and crest (files that exist) until the modder picks their own
    logo: 'graphics/factions/neutral_traders.png',
    crest: 'graphics/factions/crest_neutral_traders.png',
    shipNamePrefix: shipPrefixFor(name),
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
