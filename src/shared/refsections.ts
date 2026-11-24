/**
 * #67 U34 (user, 2026-11-22): reference pages for the fields that pick a game thing by name (the U34
 * audit in docs/UX-PASS.md). Each page is built from the game index the active mod sees (vanilla,
 * the mod and the mods it lists) and the game definitions; descriptions are the game's own text or
 * what the game's code does (checked in starfarer.api.zip), never a guess.
 */
import type { GameIndex } from './api'
import { CONDITION_FORMS, CONDITION_SCOPES } from './conditions'
import type { GameDefinitions } from './defs/types'
import { isVisible } from './modlist'
import type { RefSection } from './reference'
import type { RuleOptionInfo } from './ruleoptions'

/** What the index-based pages need from the editor. */
export interface IndexFacts {
  ix: GameIndex
  visible: Set<string>
  /** A file URL for a picture of a source (null when not found). */
  iconUrl?: (sourceId: string, rel: string) => string | undefined
  /** The options the rules of vanilla and the listed mods offer (ruleoptions.ts). */
  options?: RuleOptionInfo[]
}

const srcName = (f: IndexFacts, id: string) => (id === 'starsector-core' ? '' : f.ix.sources.find((s) => s.id === id)?.name ?? id)
const vis = <T extends { definedBy: string }>(f: IndexFacts, list: T[] | undefined) => (list ?? []).filter((x) => isVisible(x.definedBy, f.visible))
const oneLine = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Custom entity tags: what the game's code does with them. */
export const ENTITY_TAG_DOC: Record<string, string> = {
  has_interaction_dialog: 'Clicking it opens a rules dialog (rules.csv, trigger OpenInteractionDialog).',
  station: 'A station: opens a rules dialog, shows on the Neutrino Detector, and dialog text says "at" it ($onOrAt).',
  objective: 'A comm relay, nav buoy or sensor array: opens a rules dialog, can be taken over, patrols guard it, and wars count it.',
  gate: 'A gate: opens a rules dialog.',
  salvageable: 'Can be salvaged; counted by Salvor\'s Tally and used as a target by "analyze" and historian missions.',
  comm_relay: 'Is a comm relay.', nav_buoy: 'Is a nav buoy.', sensor_array: 'Is a sensor array.',
  makeshift: 'A makeshift (built by the player) relay, buoy or array: a smaller bonus than the domain-era one.',
  stable_location: 'A stable location: a relay, buoy or array can be built here; pirate and Pather bases count them.',
  neutrino: 'Shows on the Neutrino Detector.', neutrino_low: 'Shows on the Neutrino Detector only sometimes (a weak signal).',
  neutrino_high: 'A strong source on the Neutrino Detector.',
  not_random_mission_target: 'Missions that pick a random target skip it.',
  salvage_music: 'Plays the salvage music while you interact with it.',
  use_station_visual: 'An orbital station industry built here keeps this entity\'s look.',
  protects_from_corona_in_battle: 'Fleets fighting near it take no corona effects in battle.',
  expires: 'Goes away soon (debris, explosions).',
  mission_location: 'A generic place for missions.', warning_beacon: 'A warning beacon (marks a dangerous area).',
  cryosleeper: 'Is a cryosleeper.', coronal_tap: 'Is a coronal hypershunt.', stellar_mirror: 'Is a stellar mirror.', stellar_shade: 'Is a stellar shade.',
  orbital_junk: 'Orbital debris.', ghost: 'A sensor ghost.'
}
/** Tags that make a click open the rules dialog (CoreCampaignPluginImpl.pickInteractionDialogPlugin). */
const DIALOG_TAGS = ['has_interaction_dialog', 'station', 'objective', 'gate']

/** salvage_entity_gen_data.csv "type". */
const SALVAGE_KIND: Record<string, string> = { DISCOVERABLE: 'discovered by scanning', ALWAYS_VISIBLE: 'always visible' }

/** A drop_groups.csv item as a name: commodity, item_<id>, wpn_<id>, ftr_<id>, nothing or a filter. */
function dropItemName(f: IndexFacts, item: string): string {
  if (item === 'nothing') return 'nothing'
  // a filter: item_<kind>:{tags:[a, !b]} picks any item of that kind with (or without) those tags
  const flt = /^item_([a-z_]*):\{tags:\[(.*)\]\}$/.exec(item.replace(/\s+/g, ' ').trim())
  if (flt) {
    const kind = ({ modspec: 'hullmod', ship_bp: 'ship blueprint', weapon_bp: 'weapon blueprint', fighter_bp: 'fighter blueprint', '': 'special item' } as Record<string, string>)[flt[1]] ?? flt[1]
    const tags = flt[2].split(',').map((t) => t.trim()).filter(Boolean)
    const has = tags.filter((t) => !t.startsWith('!')), not = tags.filter((t) => t.startsWith('!')).map((t) => t.slice(1))
    return `any ${kind}${has.length ? ` tagged ${has.join(', ')}` : ''}${not.length ? ` (not ${not.join(', ')})` : ''}`
  }
  const by = <T extends { id: string; name: string }>(l: T[] | undefined, id: string) => l?.find((x) => x.id === id)?.name
  const m = /^(item|wpn|ftr)_(.+)$/.exec(item)
  if (m) return (m[1] === 'item' ? by(f.ix.items, m[2]) : m[1] === 'wpn' ? by(f.ix.weapons, m[2]) : by(f.ix.wings, m[2])) ?? item
  return by(f.ix.items, item) ?? item
}

/**
 * A drop spec made readable (SalvageEntityGenDataSpec): drop_value "basic:5000" is a group rolled up
 * to that credit value; drop_random "ai_cores1:3" is 3 picks, "extended:1x3000" one roll worth 3000.
 */
function dropSpec(s: string, random: boolean): string {
  return s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [g, v = ''] = p.split(':').map((x) => x.trim())
    if (!random) return `${g} worth ${v}`
    const x = /^([\d-]+)x(\d+)$/.exec(v)
    return x ? `${g}: ${x[1]} roll(s) worth ${x[2]}` : `${g}: ${v} pick(s)`
  }).join('; ')
}

export function entityTypeSection(f: IndexFacts): RefSection {
  // map labels and bases with nothing to show (constellation labels, base_* without a picture) are left out
  const types = vis(f, f.ix.customEntityTypes).filter((t) => t.sprite || t.icon || t.tags.length || t.raw.pluginClass).sort((a, b) => a.name.localeCompare(b.name))
  const desc = new Map(vis(f, f.ix.typeDescs).map((d) => [d.id, d.text]))
  const salv = new Map(vis(f, f.ix.salvageGen).map((s) => [s.id, s]))
  return {
    id: 'locations-entity-types', group: 'Locations', title: 'Entity types',
    intro: 'Stations, relays, derelicts and other custom entities (custom_entities.json) of vanilla and the mods this mod lists. "Dialog" is whether clicking it opens a rules dialog; salvage, defenders and XP come from salvage_entity_gen_data.csv; tags are explained below the table. A type of your own that "behaves like" one of these takes its code, tags and dialog. Descriptions are the game\'s own.',
    columns: ['Id', 'Type', 'Dialog', 'Salvage', 'Tags (and own code)', 'Description', 'From'],
    icons: types.map((t) => (f.iconUrl && (t.icon || t.sprite) ? f.iconUrl(t.definedBy, t.icon || t.sprite) : undefined)),
    rows: types.map((t) => {
      const s = salv.get(t.id)
      const salvage = s ? [SALVAGE_KIND[s.type] ?? s.type.toLowerCase(), s.dropValue && dropSpec(s.dropValue, false), s.dropRandom && dropSpec(s.dropRandom, true),
        s.probDefenders > 0 ? `defenders (${s.defFaction || 'derelict'}) ${pct(s.probDefenders)}` : '', s.xpSalvage ? `XP ${s.xpDiscover}/${s.xpSalvage}` : ''].filter(Boolean).join('; ') : ''
      const plugin = String(t.raw.pluginClass ?? '').split('.').pop() ?? ''
      const did = String(t.raw.customDescriptionId ?? t.id)
      return [t.id, t.name, t.tags.some((g) => DIALOG_TAGS.includes(g)) ? 'yes' : '', salvage, [t.tags.join(', '), plugin && `code: ${plugin}`].filter(Boolean).join('; '), oneLine(desc.get(`CUSTOM:${did}`)), srcName(f, t.definedBy)]
    })
  }
}

export function entityTagSection(f: IndexFacts): RefSection {
  const count = new Map<string, number>()
  for (const t of vis(f, f.ix.customEntityTypes)) for (const g of t.tags) count.set(g, (count.get(g) ?? 0) + 1)
  const tags = [...new Set([...Object.keys(ENTITY_TAG_DOC), ...count.keys()])].sort()
  return {
    id: 'locations-entity-tags', group: 'Locations', title: 'Entity tags',
    intro: 'Tags on entity types and what the game\'s code does with them. A random target can look for entities by tag.',
    columns: ['Tag', 'Types with it', 'What it does'],
    rows: tags.map((g) => [g, String(count.get(g) ?? ''), ENTITY_TAG_DOC[g] ?? ''])
  }
}

export function planetTypeSections(f: IndexFacts): RefSection[] {
  const desc = new Map(vis(f, f.ix.typeDescs).map((d) => [d.id, d.text]))
  const proc = new Map((f.ix.procgen?.types ?? []).map((t) => [t.id, t]))
  const conds = vis(f, f.ix.conditions)
  const rollsOn = (id: string) => conds.filter((c) => c.onPlanets?.includes(id)).map((c) => c.name)
  const types = vis(f, f.ix.planetTypes).sort((a, b) => a.name.localeCompare(b.name))
  const planets = types.filter((t) => !t.isStar), stars = types.filter((t) => t.isStar)
  const hab = (id: string) => f.ix.procgen?.stars[id]?.habZoneStart
  return [{
    id: 'locations-planet-types', group: 'Locations', title: 'Planet types',
    intro: 'Planet types (planets.json) of vanilla and the mods this mod lists. Category is how vanilla\'s sector generation groups them (planet_gen_data.csv); "Conditions it can roll" are the planet conditions generation can give it (see Colony conditions). A planet you place keeps the conditions you give it. Descriptions are the game\'s own.',
    columns: ['Id', 'Planet type', 'Category', 'Conditions it can roll', 'Description', 'From'],
    rows: planets.map((t) => [t.id, t.name, (proc.get(t.id)?.category ?? '').replace(/^cat_/, ''), rollsOn(t.id).join(', '), oneLine(desc.get(`PLANET:${t.id}`)), srcName(f, t.definedBy)])
  }, {
    id: 'locations-star-types', group: 'Locations', title: 'Star types',
    intro: 'Star types (planets.json entries that are stars). The habitable zone (star_gen_data.csv) starts at this distance times the star\'s radius; it decides which planet types fit at an orbit.',
    columns: ['Id', 'Star type', 'Habitable zone from', 'Description', 'From'],
    rows: stars.map((t) => [t.id, t.name, hab(t.id) != null ? `${hab(t.id)}×` : '', oneLine(desc.get(`PLANET:${t.id}`)), srcName(f, t.definedBy)])
  }]
}

export function marketSections(f: IndexFacts): RefSection[] {
  const ind = vis(f, f.ix.industries)
  const name = (id?: string) => (id ? ind.find((i) => i.id === id)?.name ?? id : '')
  const subs = vis(f, f.ix.submarkets)
  return [{
    id: 'locations-industries', group: 'Locations', title: 'Industries',
    intro: 'Industries and structures a market can have (industries.csv) of vanilla and the mods this mod lists. Upkeep and income are the CSV\'s base values; the game multiplies them by the colony\'s size, stability and hazard; "industry" tagged ones count against the colony\'s industry limit. Descriptions are the game\'s own.',
    columns: ['Id', 'Industry', 'Upkeep / income', 'Upgrades to', 'Tags', 'Description', 'From'],
    icons: ind.map((i) => (f.iconUrl && i.icon ? f.iconUrl(i.definedBy, i.icon) : undefined)),
    rows: ind.map((i) => [i.id, i.name, [i.upkeep, i.income].map((x) => (x != null ? String(x) : '–')).join(' / '), name(i.upgrade), (i.tags ?? []).join(', '), oneLine(i.desc), srcName(f, i.definedBy)])
  }, {
    id: 'locations-submarkets', group: 'Locations', title: 'Submarkets',
    intro: 'The markets inside a market (submarkets.csv): open market, black market, military market, storage and the mods\' own. Descriptions are the game\'s own.',
    columns: ['Id', 'Submarket', 'Description', 'From'],
    rows: subs.map((s) => [s.id, s.name, oneLine(s.desc), srcName(f, s.definedBy)])
  }]
}

export function dropGroupSection(f: IndexFacts): RefSection {
  const rows = vis(f, f.ix.dropGroups)
  const groups = [...new Set(rows.map((r) => r.group))].sort()
  return {
    id: 'loot-drop-groups', group: 'Loot', title: 'Drop groups',
    intro: 'Loot groups (drop_groups.csv) of vanilla and the mods this mod lists. Salvage rolls a group either up to a credit value or for a number of picks (Entity types shows which); the chance shown is each entry\'s share of the group\'s weight. A mod\'s rows join the group (they don\'t replace it).',
    columns: ['Group', 'Can give (chance)', 'From'],
    rows: groups.map((g) => {
      const es = rows.filter((r) => r.group === g && r.freq > 0)
      const total = es.reduce((a, r) => a + r.freq, 0) || 1
      const items = es.sort((a, b) => b.freq - a.freq).map((r) => `${dropItemName(f, r.item)} ${Math.round((r.freq / total) * 1000) / 10}%`)
      return [g, items.join(', '), [...new Set(es.map((r) => srcName(f, r.definedBy)).filter(Boolean))].join(', ')]
    })
  }
}

/** Blueprint tags (tags ending in _bp) on hulls, wings, weapons and hullmods: what a faction knows when it lists one. */
export function blueprintTagSection(f: IndexFacts): RefSection {
  const lists: [string, { id: string; name: string; tags?: string[]; definedBy: string }[]][] = [
    ['hulls', vis(f, f.ix.hulls)], ['fighters', vis(f, f.ix.wings)], ['weapons', vis(f, f.ix.weapons)], ['hullmods', vis(f, f.ix.hullmods)]
  ]
  const tags = new Map<string, Record<string, string[]>>()
  for (const [kind, l] of lists) for (const x of l) for (const t of x.tags ?? []) if (t.endsWith('_bp')) ((tags.get(t) ?? tags.set(t, {}).get(t)!)[kind] ??= []).push(x.name)
  return {
    id: 'factions-blueprint-tags', group: 'Factions', title: 'Blueprint tags',
    intro: 'Tags that hulls, fighters, weapons and hullmods carry in their CSV (tags column) to say which blueprint set they belong to. A faction that lists a tag in Ships (known ships, fighters, weapons, hullmods · tags) knows everything with it; blueprint packages give the player the same sets. Counts are from vanilla and the mods this mod lists.',
    columns: ['Tag', 'Hulls', 'Fighters', 'Weapons', 'Hullmods', 'Examples'],
    rows: [...tags.keys()].sort().map((t) => {
      const e = tags.get(t)!
      const n = (k: string) => String(e[k]?.length ?? '')
      return [t, n('hulls'), n('fighters'), n('weapons'), n('hullmods'), Object.values(e).flat().slice(0, 6).join(', ')]
    })
  }
}

export function skillSection(f: IndexFacts): RefSection {
  const skills = vis(f, f.ix.skills).filter((s) => s.officer || s.admiral || s.admin)
  const who = (s: { officer: boolean; admiral: boolean; admin: boolean }) => [s.officer && 'officer', s.admiral && 'commander (fleet)', s.admin && 'administrator'].filter(Boolean).join(', ')
  return {
    id: 'factions-skills', group: 'Factions', title: 'Skills',
    intro: 'Skills (skill_data.csv) of vanilla and the mods this mod lists. Doctrine › Officer skills picks from the officer ones, Commander skills from the commander (fleet) ones. The text is the skill\'s in-game quote; what each does is shown in game\'s skill screen.',
    columns: ['Id', 'Skill', 'Tier', 'For', 'Quote', 'From'],
    icons: skills.map((s) => (f.iconUrl && s.icon ? f.iconUrl(s.definedBy, s.icon) : undefined)),
    rows: skills.map((s) => [s.id, s.name, s.tier ? String(s.tier) : '', who(s), oneLine(s.desc), srcName(f, s.definedBy)])
  }
}

/** settings.json icons picked by key: raid objectives and VoK's tech icons. */
export function iconSections(f: IndexFacts): RefSection[] {
  const page = (category: string, id: string, group: string, title: string, intro: string): RefSection => {
    const icons = vis(f, f.ix.graphicsIcons).filter((i) => i.category === category)
    return {
      id, group, title, intro, columns: ['Key', 'Picture', 'File', 'From'],
      icons: icons.map((i) => (f.iconUrl ? f.iconUrl(i.definedBy, i.path) : undefined)),
      rows: icons.map((i) => [i.key, '', i.path, srcName(f, i.definedBy)])
    }
  }
  return [
    page('raidObjectives', 'quests-raid-icons', 'Quests', 'Raid objective icons', 'The icons a Raid node\'s objective can show (settings.json graphics › raidObjectives, shown at 26×26). Vanilla\'s story raids use genericIcon.'),
    page('ui_icons_tech_tree', 'saga-research-icons', 'Saga', 'Research icons', 'Tech icons in Vaults of Knowledge\'s tree (settings.json graphics › ui_icons_tech_tree), by key. A tech of the mod uses one of these, or its own picture (Choose image…).')
  ]
}

/** The options rules offer, for interjections and Link targets. */
export function optionSection(f: IndexFacts): RefSection {
  const list = (f.options ?? []).filter((o) => isVisible(o.sourceId, f.visible))
  return {
    id: 'rules-options', group: 'Rules', title: 'Dialog options',
    intro: 'Options the rules of vanilla and the mods this mod lists offer (an options cell, or AddOption), with the first rule that offers each and how many rules answer it (DialogOptionSelected with $option == id). An interjection (Quest settings › Start) cuts into one of these by id; a Link can pick one.',
    columns: ['Option id', 'Text', 'Offered in', 'Rules answering', 'From'],
    rows: list.map((o) => [o.id, o.text, o.offeredIn, String(o.answers), srcName(f, o.sourceId)])
  }
}

/** Pages from the game definitions alone (no index). */
export function defsSections(defs: GameDefinitions): RefSection[] {
  const levels = defs.repLevels
  // as the game shows it (RepLevel.getLevelFor: the relation ×100, rounded; a level's min is not inclusive)
  const r = (x: number) => Math.round(x * 100)
  const range = (i: number) => {
    const l = levels[i], next = levels[i + 1]
    if (l.id === 'NEUTRAL') return `${r(l.min)} to ${r(next.min)}`
    if (l.min < 0) return `${r(l.min)} to ${next ? r(next.min) - 1 : 0}`
    return `${r(l.min) + 1} to ${next ? r(next.min) : 100}`
  }
  const form = (ps: { name: string; optional?: boolean; rest?: boolean }[]) => ps.map((p) => `${p.optional ? '[' : ''}${p.name}${p.rest ? '…' : ''}${p.optional ? ']' : ''}`).join(' ')
  const use = { script: 'script', condition: 'condition', both: 'both' } as const
  return [{
    id: 'general-rep-levels', group: 'General', title: 'Reputation levels',
    intro: 'Reputation with a faction or person, as the game shows it (−100 to 100; the files use −1 to 1). "At least Welcoming" means 25 or more (vanilla\'s RepLevel).',
    columns: ['Id', 'Shown as', 'Range'],
    rows: levels.map((l, i) => [l.id, l.name, range(i)])
  }, {
    id: 'rules-commands', group: 'Rules', title: 'Rule commands',
    intro: 'Commands usable in a rule\'s conditions or script (the "Extra conditions", "Extra script lines", option and branch conditions). "Use" says where: a condition returns true/false. SagaLib commands need SagaLib (added to the mod on export). Optional parameters are in [ ].',
    columns: ['Command', 'Use', 'Parameters', 'What it does', 'From'],
    rows: [...defs.ruleCommands].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, use[c.use], c.forms.map(form).filter(Boolean).join(' | '), c.summary, c.provider === 'sagalib' ? 'SagaLib' : ''])
  }, {
    // #67 U45 (user, 2026-11-24): what a condition is, its forms, and where each kind of key exists
    id: 'rules-conditions', group: 'Rules', title: 'Conditions',
    intro: 'A condition is a yes/no test. Each line is one condition, and all of them must be true (an empty list is always true). Most read a memory key: $scope.key names whose memory it is in (see Condition scopes). A key nobody has set yet counts as false. In the editor each line is also shown in plain words, with whether it holds for the Test context. Outside a dialog (a progress event\'s Starts when and monthly factors, a world event) only $global and $player exist: a condition on $person, $market or $entity there is never true.',
    columns: ['Form', 'Example', 'What it means', 'Works'],
    rows: CONDITION_FORMS
  }, {
    id: 'rules-condition-scopes', group: 'Rules', title: 'Condition scopes',
    intro: 'Whose memory a key is in (the part after $), and where that memory exists. Your own flags go in $global, with your mod\'s prefix ($global.toc_warrant_on); an Action\'s Set writes them, and Saga › Flags lists where each is set and read.',
    columns: ['Scope', 'Holds', 'Exists'],
    rows: CONDITION_SCOPES
  }, {
    id: 'rules-triggers', group: 'Rules', title: 'Triggers',
    intro: 'Rule triggers: the event a rule answers (a dialog opening, an option picked, a list of options being filled). A Link node\'s target, a quest\'s menu trigger and a "Trigger" start use these.',
    columns: ['Trigger', 'When it fires'],
    rows: [...defs.triggers].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.name, t.summary])
  }, {
    id: 'rules-memory-keys', group: 'Rules', title: 'Memory keys',
    intro: 'Memory keys the game sets or reads. The part after $ says whose memory: $global (the whole game), $player, $faction, $market, $entity, $person, or none (the dialog\'s local memory, gone when it closes). Flags you set are your own keys; use your mod\'s prefix.',
    columns: ['Key', 'Type', 'What it holds'],
    rows: [...defs.memoryKeys].sort((a, b) => a.key.localeCompare(b.key)).map((k) => [k.key, k.type, k.summary])
  }, {
    id: 'rules-tokens', group: 'Rules', title: 'Text tokens',
    intro: 'Tokens in dialog text, replaced in game. "$ Tokens" next to a text opens the token window (grouped, searchable, with this conversation\'s values); typing $ in a text suggests them. The example is what the preview shows.',
    columns: ['Token', 'About', 'Becomes', 'Example'],
    rows: [...defs.tokens].sort((a, b) => a.group.localeCompare(b.group) || a.token.localeCompare(b.token)).map((t) => [t.token, t.group, t.summary, t.sample])
  }]
}

/** Every index-based page (empty when the index isn't read yet: the sections still exist for links). */
export function indexSections(f: IndexFacts | null): RefSection[] {
  const empty: IndexFacts = { ix: { sources: [], customEntityTypes: [], planetTypes: [], conditions: [], industries: [], submarkets: [], hulls: [], wings: [], weapons: [], hullmods: [], items: [] } as unknown as GameIndex, visible: new Set() }
  const x = f ?? empty
  return [entityTypeSection(x), entityTagSection(x), ...planetTypeSections(x), ...marketSections(x), dropGroupSection(x), blueprintTagSection(x), skillSection(x), ...iconSections(x), optionSection(x)]
}
