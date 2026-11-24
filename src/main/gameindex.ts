/**
 * GameIndex: a read-only picture of starsector-core and every installed mod (PLAN.md §3, §6
 * "Reading"). Records who defines and who changes each id. Never writes. No Electron imports.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseCsv, csvObjects } from '../shared/csv'
import { parseRulesCsvRows } from '../shared/export/csvrows'
import { detokenizeRows, type RuleStrings } from '../shared/export/texttokens'
import { defsFor } from '../shared/defs'
import { mergeFactionJson } from '../shared/faction'
import { mergeEntry, type MergeHow } from '../shared/indexview'
import { detectInstall as _detect, errText, isFile, modsRootFor, readLoose, scanSources, walk, type ModsOptions } from './install'
import type {
  FactionInfo, GameIndex, HullInfo, IllustrationInfo, ItemInfo, MarketInfo, NameCategoryInfo, NamedEntry, PersonInfo, PortraitInfo, Problem,
  ShipNameListInfo, SourceInfo, SystemInfo, UiSettings, ValidInstall, DropGroupRow } from '../shared/api'
import { factionKeySurvey } from '../shared/factionkeys'
import { procgenData, typeInfos } from '../shared/celestial'
import { parseSystemsJava } from '../shared/javasystems'
import type { RuleRow } from '../shared/rules/types'
import type { ConditionInfo, VariantInfo, GraphicIconInfo, IndustryInfo, SalvageGenInfo, SkillInfo, TypeDescInfo, Origin, PlaceInfo, ResearchTechInfo, SagaQuestInfo, SectorSnapshot, SnapshotInfo } from '../shared/api'
import { idPrefix, mergeSnapshot } from '../shared/snapshot'

export const detectInstall = _detect

export interface IndexOptions extends ModsOptions {
  activeModDir: string | null
  /** #64: an imported sector snapshot ("seen in game") and where it came from. */
  snapshot?: { data: SectorSnapshot; file: string; imported: string } | null
}

/** One source's version of a faction file. */
export interface FactionLayer { sourceId: string; file: string; raw: Record<string, unknown>; text: string }

/** Everything kept in memory (the renderer gets `index`, and the rest on request). */
export interface IndexCache {
  index: GameIndex
  sources: SourceInfo[]
  rules: RuleRow[]
  /** Faction file path (lowercase, forward slashes) → layers in load order. */
  factionLayers: Map<string, FactionLayer[]>
  /** Faction id → file path key in factionLayers. */
  factionFiles: Map<string, string>
  /** Merged settings.json of the game + enabled mods (only the parts we need). */
  settings: Record<string, unknown>
}

const slash = (p: string) => p.replace(/\\/g, '/')
export const titleCase = (id: string) => id.replace(/[_-]+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim()

/**
 * Merge an entry into the map by id. The first source defines it; later ones are recorded as changing it.
 * Which version wins (docs/FORMATS.md): 'json' = merged JSON, the later source in load order wins;
 * 'csv' = merged spreadsheet, a mod's row beats vanilla's and the highest-priority mod (earliest in
 * the mod order) wins.
 */
function put<T extends { id: string; definedBy: string; changedBy: string[] }>(map: Map<string, T>, entry: T, how: 'json' | 'csv' | boolean): void {
  const prev = map.get(entry.id) as (T & { layers?: unknown[]; layerHow?: MergeHow }) | undefined
  if (!prev) { map.set(entry.id, entry); return }
  const { layers: prevLayers, layerHow: _h, ...prevSelf } = prev
  const merged = mergeEntry(prevSelf as unknown as T & Origin, entry as unknown as T & Origin, how) as unknown as T
  // #67 U33: each source's own version, so the editor can merge only the mods the active mod counts (indexview.ts)
  if (prev.definedBy === entry.definedBy && !prev.changedBy.length) { map.set(entry.id, merged); return }
  map.set(entry.id, { ...merged, layers: [...(prevLayers ?? [prevSelf]), entry], layerHow: how })
}

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x && x !== 'null') : [])
const csvTags = (s: string | undefined) => (s ?? '').split(',').map((t) => t.trim()).filter(Boolean)

export async function buildIndex(install: ValidInstall, opts: IndexOptions): Promise<IndexCache> {
  const t0 = Date.now()
  const problems: Problem[] = []
  const sources = await scanSources(install, opts, problems)
  const defs = defsFor(install.gameVersion)
  let filesRead = 0

  const factions = new Map<string, FactionInfo>()
  const factionLayers = new Map<string, FactionLayer[]>()
  const factionFiles = new Map<string, string>()
  const listedFactionFiles = new Set<string>()
  const people = new Map<string, PersonInfo>()
  const markets = new Map<string, MarketInfo>()
  const systems = new Map<string, SystemInfo>()
  const items = new Map<string, ItemInfo>()
  const dropGroups: DropGroupRow[] = []
  const industries = new Map<string, IndustryInfo>()
  /** #67 U34: salvage data per entity type, skills, planet/entity type descriptions. */
  const salvageGen = new Map<string, SalvageGenInfo>()
  const skills = new Map<string, SkillInfo>()
  const typeDescs = new Map<string, TypeDescInfo>()
  const graphicsIcons = new Map<string, GraphicIconInfo>()
  const conditions = new Map<string, ConditionInfo>()
  /** #67: planet type → its category (planet_gen_data.csv), and how planets roll each condition (condition_gen_data.csv). */
  const planetCategory = new Map<string, string>()
  const conditionGen = new Map<string, { group: string; hazard?: number; on: string[] }>()
  const submarkets = new Map<string, NamedEntry>()
  const hulls = new Map<string, HullInfo>()
  const wings = new Map<string, NamedEntry>()
  const weapons = new Map<string, NamedEntry>()
  const hullmods = new Map<string, NamedEntry>()
  const illustrations = new Map<string, IllustrationInfo>()
  // #67 U49: illustrations a Saga Forge mod has in its project but hasn't exported (registered) yet
  const unexported: { key: string; mod: string; modName: string }[] = []
  const portraits: PortraitInfo[] = []
  const variants = new Map<string, VariantInfo>()
  const shipRoles: { role: string; variant: string; weight: number; definedBy: string }[] = []
  const customEntityTypes = new Map<string, NamedEntry>()
  const planetTypes = new Map<string, NamedEntry>()
  const entityRaw = new Map<string, Record<string, unknown>>()
  const planetRaw = new Map<string, Record<string, unknown>>()
  /** #67 U33: each source's own planets.json / custom_entities.json entry ("p:" / "e:" + id), for indexview.ts. */
  const typeLayers = new Map<string, { sourceId: string; raw: Record<string, unknown> }[]>()
  /** #67 U33: each source's settings.json (enabled or not), for the colour and font layers. */
  const settingsLayers: { sourceId: string; settings: Record<string, unknown> }[] = []
  const procStars: Record<string, { habZoneStart: number }> = {}
  const procRows = new Map<string, Record<string, string>>()
  const codeFiles: { text: string; file: string; sourceId: string }[] = []
  const sounds = new Set<string>()
  const music = new Set<string>()
  const nameCats = new Map<string, NameCategoryInfo>()
  const shipLists = new Map<string, ShipNameListInfo>()
  const fleetTypeNames: Record<string, string> = {}
  const fleetTypeNamesBase: Record<string, string> = {}
  const rules: RuleRow[] = []
  const ruleCounts: Record<string, number> = {}
  const ruleFiles: string[] = []
  const ownRuleFiles = new Map<string, string[]>()
  // #64: other Saga Forge mods' content (their content.csv)
  const places = new Map<string, PlaceInfo>()
  const sagaQuests = new Map<string, SagaQuestInfo>()
  const sagaEncounters = new Map<string, NamedEntry>()
  const sagaPools = new Map<string, NamedEntry>()
  // #77: AoTD Vaults of Knowledge techs and faction stances (merged spreadsheets, key id / factionId)
  const researchTechs = new Map<string, ResearchTechInfo>()
  const researchFactions = new Map<string, NamedEntry & { stance: string }>()
  const researchIcons = new Set<string>()
  let settings: Record<string, unknown> = {}

  const readText = async (f: string): Promise<string | null> => {
    if (!isFile(f)) return null
    filesRead++
    try { return await fsp.readFile(f, 'utf8') } catch { return null }
  }
  const csvRows = async (src: SourceInfo, rel: string): Promise<Record<string, string>[]> => {
    const text = await readText(path.join(src.dir, rel))
    if (text == null) return []
    try { return csvObjects(parseCsv(text)) } catch (e) {
      problems.push({ level: 'warning', area: 'Index', sourceId: src.id, file: rel, message: errText(e) })
      return []
    }
  }
  const json = async (src: SourceInfo, rel: string): Promise<Record<string, unknown> | null> => {
    const f = path.join(src.dir, rel)
    if (!isFile(f)) return null
    filesRead++
    try { return (await readLoose(f)).value } catch (e) {
      problems.push({ level: 'warning', area: 'Index', sourceId: src.id, file: slash(rel), message: errText(e) })
      return null
    }
  }

  // People created in vanilla Java (ids.People), "defined in code".
  for (const p of defs.codePeople ?? []) {
    people.set(p.id, { id: p.id, name: p.name || titleCase(p.id), faction: p.faction, market: p.market ?? '', portrait: '', kind: 'code', definedBy: 'code:starsector-core', changedBy: [] })
  }

  for (const src of sources) {
    const S = src.id
    const own = { definedBy: S, changedBy: [] as string[] }

    // ---- factions: factions.csv lists the files; same path in a later source = merged patch
    for (const row of await csvRows(src, 'data/world/factions/factions.csv')) {
      const f = (row.faction ?? '').trim()
      if (f && !f.startsWith('#')) listedFactionFiles.add(slash(f).toLowerCase())
    }
    for (const file of await walk(path.join(src.dir, 'data', 'world', 'factions'), ['.faction'])) {
      const rel = slash(path.relative(src.dir, file))
      filesRead++
      let text = ''
      let raw: Record<string, unknown>
      try { text = await fsp.readFile(file, 'utf8'); raw = (await readLoose(file)).value } catch (e) {
        problems.push({ level: 'warning', area: 'Faction', sourceId: S, file: rel, message: errText(e) })
        continue
      }
      const key = rel.toLowerCase()
      const layers = factionLayers.get(key) ?? []
      layers.push({ sourceId: S, file: rel, raw, text })
      factionLayers.set(key, layers)
    }

    // ---- markets and systems (data/campaign/econ/*.json, starmap.json)
    const econ = await json(src, 'data/campaign/econ/economy.json')
    const systemFiles = strList(econ?.starSystems)
    for (const sf of systemFiles) {
      const sys = await json(src, `data/campaign/econ/${sf}`)
      if (!sys) continue
      const systemId = String(sys.starSystem ?? path.basename(sf, '.json'))
      for (const m of Array.isArray(sys.markets) ? sys.markets : []) {
        const mo = m as Record<string, unknown>
        const ents = strList(mo.entities)
        if (!ents.length) continue
        put(markets, {
          id: ents[0], name: titleCase(ents[0]), entities: ents, faction: String(mo.faction ?? ''), size: num(mo.size),
          system: systemId, conditions: strList(mo.startingConditions), industries: strList(mo.industries).map((i) => i.split(',')[0]),
          submarkets: strList(mo.submarkets), ...own
        }, true)
      }
    }
    const starmap = await json(src, 'data/campaign/starmap.json')
    const locs = (starmap?.starSystemLocations ?? {}) as Record<string, unknown>
    for (const [id, xy] of Object.entries(locs)) {
      const a = Array.isArray(xy) ? xy : []
      put(systems, { id, name: titleCase(id), x: num(a[0], 0), y: num(a[1], 0), ...own }, true)
    }

    // ---- items and economy ids
    for (const r of await csvRows(src, 'data/campaign/commodities.csv')) {
      const id = (r.id ?? '').trim()
      // #75: a row starting with # is a comment the game skips (Nexerelin ships "#Transplutonics,rare_metals,…")
      if (!id || id.startsWith('#') || (r.name ?? '').trimStart().startsWith('#')) continue
      put(items, { id, name: r.name ?? id, kind: 'commodity', icon: r.icon ?? '', tags: csvTags(r.tags), basePrice: num(r['base price']), desc: r.desc ?? '', econUnit: num(r.econUnit), ...own }, 'csv')
    }
    // Phase 8a: drop groups (every source's rows add to the group; checked in game 2026-11-16)
    for (const r of await csvRows(src, 'data/campaign/procgen/drop_groups.csv')) {
      const item = (r.commodity ?? '').trim()
      const group = (r.group ?? '').trim()
      if (!item || !group || item.startsWith('#')) continue
      dropGroups.push({ group, item, freq: num(r.freq), definedBy: S })
    }
    for (const r of await csvRows(src, 'data/campaign/special_items.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#') || (r.name ?? '').trimStart().startsWith('#')) continue
      put(items, { id, name: r.name ?? id, kind: 'special', icon: r.icon ?? '', tags: csvTags(r.tags), basePrice: num(r['base price']), desc: r.desc ?? '', ...own }, 'csv')
    }
    /** #67 U34: with the row's description and tags when the file has them (for the reference pages). */
    const named = async (rel: string, into: Map<string, NamedEntry>, nameCol = 'name') => {
      for (const r of await csvRows(src, rel)) {
        const id = (r.id ?? '').trim()
        if (!id || id.startsWith('#')) continue
        const desc = (r.desc ?? '').trim(), tags = csvTags(r.tags)
        put(into, { id, name: (r[nameCol] ?? '').trim() || id, ...(desc ? { desc } : {}), ...(tags.length ? { tags } : {}), ...own }, 'csv')
      }
    }
    // #77: VoK's techs (every mod may add rows; its own tree per modId) and research stances
    for (const r of await csvRows(src, 'data/campaign/aotd_tech_options.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      const req = (r.reqToResearchFirst ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'none')
      put(researchTechs, { id, name: (r.name ?? '').trim() || id, tier: num(r.tier), modId: (r.modId ?? '').trim(), fromStart: (r.isResearchedFromStart ?? '').trim().toLowerCase() === 'true', requires: req, otherReq: (r.otherReq ?? '').trim(), ...own }, 'csv')
    }
    for (const r of await csvRows(src, 'data/campaign/aotd_faction_behaviour.csv')) {
      const id = (r.factionId ?? '').trim()
      if (!id || id.startsWith('#')) continue
      put(researchFactions, { id, name: id, stance: (r.researchStance ?? '').trim(), ...own }, 'csv')
    }
    for (const r of await csvRows(src, 'data/campaign/industries.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      const n = (k: string) => ((r[k] ?? '').trim() ? num(r[k]) : undefined)
      put(industries, { id, name: (r.name ?? '').trim() || id, desc: (r.desc ?? '').trim(), tags: csvTags(r.tags), upkeep: n('upkeep'), income: n('income'), icon: (r.image ?? '').trim(), upgrade: (r.upgrade ?? '').trim(), downgrade: (r.downgrade ?? '').trim(), ...own }, 'csv')
    }
    // #67 U34: what an entity type gives when salvaged, its defenders and XP
    for (const r of await csvRows(src, 'data/campaign/procgen/salvage_entity_gen_data.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      const one = (k: string) => (r[k] ?? '').replace(/\s+/g, ' ').trim()
      put(salvageGen, { id, type: one('type'), dropValue: one('drop_value'), dropRandom: one('drop_random'), defFaction: one('defFaction'), probDefenders: num(r.probDefenders), xpDiscover: num(r.xpDiscover), xpSalvage: num(r.xpSalvage), ...own }, 'csv')
    }
    for (const r of await csvRows(src, 'data/characters/skills/skill_data.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      const yes = (k: string) => (r[k] ?? '').trim().toUpperCase() === 'TRUE'
      put(skills, { id, name: (r.name ?? '').trim() || id, tier: num(r.tier), officer: yes('combat officer'), admiral: yes('admiral'), admin: yes('admin'), desc: (r.description ?? '').trim(), author: (r.author ?? '').trim(), tags: csvTags(r.tags), icon: (r.icon ?? '').trim(), ...own }, 'csv')
    }
    // #67 U34: the game's own text for planet types and custom entities (descriptions.csv)
    for (const r of await csvRows(src, 'data/strings/descriptions.csv')) {
      const id = (r.id ?? '').trim(), type = (r.type ?? '').trim()
      if (!id || id.startsWith('#') || (type !== 'PLANET' && type !== 'CUSTOM')) continue
      const text = (r.text1 ?? '').trim()
      if (text) put(typeDescs, { id: `${type}:${id}`, text, ...own }, 'csv')
    }
    // #67 (user, 2026-11-22): conditions with what the Conditions reference shows (description, icon,
    // planet condition or colony one), plus how planets roll them (condition_gen_data.csv)
    for (const r of await csvRows(src, 'data/campaign/market_conditions.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      put(conditions, { id, name: (r.name ?? '').trim() || id, desc: (r.desc ?? '').trim(), icon: (r.icon ?? '').trim(), planetary: (r.planetary ?? '').trim().toLowerCase() === 'true', ...own }, 'csv')
    }
    for (const r of await csvRows(src, 'data/campaign/procgen/planet_gen_data.csv')) {
      const id = (r.id ?? '').trim(), cat = (r.category ?? '').trim()
      if (id && !id.startsWith('#') && cat && !planetCategory.has(id)) planetCategory.set(id, cat)
    }
    {
      const rows = await csvRows(src, 'data/campaign/procgen/condition_gen_data.csv')
      for (const r of rows) {
        const id = (r.id ?? '').trim()
        if (!id || id.startsWith('#') || conditionGen.has(id)) continue
        // the planet columns sit between requiresNotAny and "multipliers >>>"
        const keys = Object.keys(r)
        const from = keys.indexOf('requiresNotAny') + 1, to = keys.findIndex((k) => k.startsWith('multipliers'))
        const on = keys.slice(from, to < 0 ? keys.length : to).filter((k) => k && Number((r[k] ?? '').trim()) > 0)
        conditionGen.set(id, { group: (r.group ?? '').trim(), hazard: (r.hazard ?? '').trim() ? num(r.hazard) : undefined, on })
      }
    }
    await named('data/campaign/submarkets.csv', submarkets)
    await named('data/hulls/wing_data.csv', wings, 'id')
    await named('data/weapons/weapon_data.csv', weapons)
    await named('data/hullmods/hull_mods.csv', hullmods)

    // ---- hulls: ship_data.csv rows plus .ship/.skin ids and sizes (light regex scan, no full parse)
    for (const r of await csvRows(src, 'data/hulls/ship_data.csv')) {
      const id = (r.id ?? '').trim()
      // the name is the first column: "#Doom" comments the whole row out
      if (!id || id.startsWith('#') || (r.name ?? '').trimStart().startsWith('#')) continue
      const prev = hulls.get(id)
      put(hulls, {
        id, name: (r.name ?? '').trim() || id, hullSize: prev?.hullSize ?? '', designation: r.designation ?? '',
        tech: r['tech/manufacturer'] ?? '', hints: r.hints ?? '', isSkin: false, tags: csvTags(r.tags), ...own
      }, true)
    }
    for (const file of await walk(path.join(src.dir, 'data', 'hulls'), ['.ship', '.skin'])) {
      filesRead++
      let t = ''
      try { t = await fsp.readFile(file, 'utf8') } catch { continue }
      const get = (k: string) => new RegExp(`["']?${k}["']?\\s*:\\s*["']?([^"',}\\s]+)`).exec(t)?.[1] ?? ''
      if (file.toLowerCase().endsWith('.skin')) {
        const id = get('skinHullId')
        if (!id) continue
        const base = hulls.get(get('baseHullId'))
        const nm = /["']?hullName["']?\s*:\s*"([^"]*)"/.exec(t)?.[1]
        put(hulls, { id, name: nm || base?.name || id, hullSize: base?.hullSize ?? '', designation: base?.designation ?? '', tech: base?.tech ?? '', hints: base?.hints ?? '', isSkin: true, ...own }, true)
      } else {
        const id = get('hullId')
        if (!id) continue
        const h = hulls.get(id)
        const size = get('hullSize')
        if (h) h.hullSize = size
        else put(hulls, { id, name: /["']?hullName["']?\s*:\s*"([^"]*)"/.exec(t)?.[1] || id, hullSize: size, designation: '', tech: '', hints: '', isSkin: false, ...own }, true)
      }
    }

    // ---- config JSON: illustrations, entity types, planet types, sounds
    const st = await json(src, 'data/config/settings.json')
    if (st) {
      if (src.isCore || src.enabled) settings = mergeFactionJson(settings, st) as Record<string, unknown>
      settingsLayers.push({ sourceId: S, settings: st as Record<string, unknown> })
      const graphics = (st.graphics ?? {}) as Record<string, unknown>
      // #77: VoK's tech icons (and any other mod's) by key
      const ti = graphics.ui_icons_tech_tree
      if (ti && typeof ti === 'object' && !Array.isArray(ti)) for (const k of Object.keys(ti)) researchIcons.add(k)
      for (const [category, entries] of Object.entries(graphics)) {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
        for (const [key, p] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof p !== 'string' || !/\.(png|jpe?g|webp)$/i.test(p)) continue
          // #67 U34: raid objective icons and VoK's tech icons, offered by key with a preview
          if (category === 'raidObjectives' || category === 'ui_icons_tech_tree') put(graphicsIcons, { id: `${category}/${key}`, category, key, path: slash(p), ...own }, true)
          if (category !== 'illustrations' && !/illustration|intel|events|backgrounds/i.test(category)) continue
          const id = `${category}/${key}`
          put(illustrations, { id, category, key, path: slash(p), ...own }, true)
        }
      }
    }
    // #67 U49: a Saga Forge mod's illustrations that its export hasn't registered yet (no settings.json entry)
    if (!src.isCore) {
      const sp = await json(src, 'sagaforge/project.json')
      const ill = (sp?.illustrations ?? {}) as Record<string, unknown>
      for (const key of Object.keys(ill)) unexported.push({ key, mod: S, modName: src.name ?? S })
    }
    // types: merged JSON, so later sources change entries key by key (R15, R19)
    const ce = await json(src, 'data/config/custom_entities.json')
    for (const [id, v] of Object.entries(ce ?? {})) {
      if (!v || typeof v !== 'object') continue
      entityRaw.set(id, mergeFactionJson(entityRaw.get(id) ?? {}, v) as Record<string, unknown>)
      typeLayers.set(`e:${id}`, [...(typeLayers.get(`e:${id}`) ?? []), { sourceId: S, raw: v as Record<string, unknown> }])
      put(customEntityTypes, { id, name: id, ...own }, true)
    }
    const pl = await json(src, 'data/config/planets.json')
    for (const [id, v] of Object.entries(pl ?? {})) {
      if (!v || typeof v !== 'object') continue
      planetRaw.set(id, mergeFactionJson(planetRaw.get(id) ?? {}, v) as Record<string, unknown>)
      typeLayers.set(`p:${id}`, [...(typeLayers.get(`p:${id}`) ?? []), { sourceId: S, raw: v as Record<string, unknown> }])
      put(planetTypes, { id, name: id, ...own }, true)
    }
    // vanilla's random generation tables (R18); a mod's rows are merged by id
    for (const r of await csvRows(src, 'data/campaign/procgen/star_gen_data.csv')) {
      const id = (r.id ?? '').trim()
      if (id && !id.startsWith('#')) procStars[id] = { habZoneStart: num(r.habZoneStart, 0) }
    }
    for (const r of await csvRows(src, 'data/campaign/procgen/planet_gen_data.csv')) procRows.set((r.id ?? '').trim() || `CATEGORY:${(r.category ?? '').trim()}`, r)
    // star systems in Java source (R14): vanilla's data/scripts/world, and mods that ship theirs
    for (const file of await walk(path.join(src.dir, 'data', 'scripts', 'world'), ['.java'])) {
      let t = ''
      try { t = await fsp.readFile(file, 'utf8') } catch { continue }
      filesRead++
      if (!t.includes('createStarSystem') && !t.includes('getStarSystem(')) continue
      codeFiles.push({ text: t, file: slash(path.relative(src.dir, file)), sourceId: S })
    }
    const snd = await json(src, 'data/config/sounds.json')
    if (snd) {
      for (const [k, v] of Object.entries(snd)) {
        if (k === 'music' && v && typeof v === 'object') for (const m of Object.keys(v)) music.add(m)
        else sounds.add(k)
      }
    }

    // ---- name lists (R3): person_names.csv is a merged spreadsheet, ship_names.json merged JSON
    for (const r of await csvRows(src, 'data/characters/person_names.csv')) {
      const name = (r.name ?? '').trim()
      if (!name || name.startsWith('#')) continue
      const g = (r.gender ?? '').trim(), u = (r.usage ?? '').trim()
      const male = !g || g.includes('m'), female = !g || g.includes('f')
      for (const c of csvTags(r.category)) {
        const e = nameCats.get(c) ?? { id: c, counts: {} }
        const n = (e.counts[S] ??= { male: 0, female: 0, last: 0 })
        if (u.includes('f')) { if (male) n.male++; if (female) n.female++ }
        if (u.includes('l')) n.last++
        nameCats.set(c, e)
      }
    }
    const ftn = await json(src, 'data/world/factions/default_fleet_type_names.json')
    const isActive = !!opts.activeModDir && src.writable && src.writeDir === opts.activeModDir
    for (const [k, v] of Object.entries(ftn ?? {})) if (typeof v === 'string') { fleetTypeNames[k] = v; if (!isActive) fleetTypeNamesBase[k] = v }
    const sn = await json(src, 'data/strings/ship_names.json')
    for (const [id, v] of Object.entries(sn ?? {})) {
      if (!Array.isArray(v)) continue
      const e = shipLists.get(id) ?? { id, counts: {} }
      e.counts[S] = (e.counts[S] ?? 0) + v.filter((x) => typeof x === 'string' && x !== 'core_clearArray').length
      shipLists.set(id, e)
    }

    // ---- variant ids (file names; the game uses variantId, which matches the file name in practice)
    for (const file of await walk(path.join(src.dir, 'data', 'variants'), ['.variant'])) {
      const id = path.basename(file, '.variant')
      // #67 U39: its hull and display name (a light regex read, like the .ship scan)
      filesRead++
      let t = ''
      try { t = await fsp.readFile(file, 'utf8') } catch { /* unreadable: id only */ }
      const hull = /["']?hullId["']?\s*:\s*["']([^"']+)["']/.exec(t)?.[1]
      const dn = /["']?displayName["']?\s*:\s*["']([^"']*)["']/.exec(t)?.[1]
      put(variants, { id, name: id, ...(hull ? { hull } : {}), ...(dn ? { displayName: dn } : {}), ...own }, true)
    }
    // #67 U39: vanilla's ship roles (which variants a faction's fleets use for each role); a mod's file adds to them
    const roles = await json(src, 'data/world/factions/default_ship_roles.json')
    for (const [role, vs] of Object.entries(roles ?? {})) {
      if (!vs || typeof vs !== 'object' || Array.isArray(vs)) continue
      for (const [variant, w] of Object.entries(vs as Record<string, unknown>)) if (typeof w === 'number' || typeof w === 'string') shipRoles.push({ role, variant, weight: num(w), definedBy: S })
    }

    // ---- portraits (any image under graphics/portraits)
    for (const file of await walk(path.join(src.dir, 'graphics', 'portraits'), ['.png', '.jpg'])) {
      portraits.push({ path: slash(path.relative(src.dir, file)), sourceId: S })
    }

    // ---- other Saga Forge mods' people (SagaLib JSON)
    for (const file of await walk(path.join(src.dir, 'data', 'sagaforge', 'people'), ['.json'])) {
      try {
        const v = (await readLoose(file)).value
        for (const p of Array.isArray(v.people) ? v.people : []) {
          const o = p as Record<string, unknown>
          const id = String(o.id ?? '')
          if (!id) continue
          const nm = (o.name ?? {}) as Record<string, unknown>
          put(people, {
            id, name: `${nm.first ?? ''} ${nm.last ?? ''}`.trim() || id, faction: String(o.faction ?? ''),
            market: String((o.placement as Record<string, unknown>)?.market ?? ''), portrait: String(o.portrait ?? ''), kind: 'sagalib', ...own
          }, true)
        }
      } catch (e) { problems.push({ level: 'warning', area: 'Index', sourceId: S, file: slash(path.relative(src.dir, file)), message: errText(e) }) }
    }

    // ---- #64: other Saga Forge mods' systems, markets, places, quests, encounters and pools (the files their content.csv lists)
    const isActiveSrc = !!opts.activeModDir && src.writable && src.writeDir === opts.activeModDir
    if (!src.isCore && !isActiveSrc) {
      for (const row of await csvRows(src, 'data/config/sagaforge/content.csv')) {
        const type = (row.type ?? '').trim(), rel = (row.path ?? '').trim()
        if (!rel || !['system', 'quest', 'encounter', 'pool'].includes(type)) continue
        const v = await json(src, rel)
        if (!v) continue
        const id = String(v.id ?? row.id ?? '')
        if (!id) continue
        if (type === 'quest') {
          const stages = Array.isArray(v.stages) ? v.stages.map((x) => String((x as Record<string, unknown>).id ?? '')).filter(Boolean) : []
          put(sagaQuests, { id, title: String(v.title ?? id), kind: String(v.kind ?? 'quest'), stages, ...own }, true)
        } else if (type === 'encounter') put(sagaEncounters, { id, name: String(v.name ?? id), ...own }, true)
        else if (type === 'pool') put(sagaPools, { id, name: String(v.name ?? id), ...own }, true)
        else {
          const hs = Array.isArray(v.hyperspace) ? v.hyperspace : null
          if (v.kind !== 'existing') put(systems, { id, name: String(v.name ?? titleCase(id)), x: hs ? num(hs[0]) : null, y: hs ? num(hs[1]) : null, ...own }, true)
          for (const e of Array.isArray(v.entities) ? v.entities : []) {
            const eo = e as Record<string, unknown>
            const eid = String(eo.id ?? '')
            if (!eid) continue
            const mk = eo.market as Record<string, unknown> | undefined
            put(places, { id: eid, name: String(eo.name ?? titleCase(eid)), system: id, kind: String(eo.kind ?? 'custom'), ...(mk ? { faction: String(mk.faction ?? ''), market: String(mk.id ?? eid) } : {}), ...own }, true)
            if (mk) {
              put(markets, {
                id: eid, name: String(mk.name ?? eo.name ?? titleCase(eid)), entities: String(mk.id ?? eid) === eid ? [eid] : [eid, String(mk.id)], faction: String(mk.faction ?? ''), size: num(mk.size), system: id,
                conditions: strList(mk.conditions), industries: strList(mk.industries), submarkets: strList(mk.submarkets), ...own
              }, true)
            }
          }
        }
      }
    }

    if (st) ownRuleFiles.set(S, ruleFileList(st))
  }

  // ---- rules: every file in the merged settings.json "rules" list (0.98.5a), in every source.
  // Each listed path is a merged CSV like rules.csv (docs/FORMATS.md, "Rule file list").
  const listed = ruleFileList(settings)
  const gameRuleFiles = listed.length ? listed : [DEFAULT_RULES_FILE]
  for (const src of sources) {
    const files = [...gameRuleFiles]
    // a mod that isn't enabled isn't in the merged settings; still read the files it lists itself
    for (const f of ownRuleFiles.get(src.id) ?? []) if (!files.some((x) => x.toLowerCase() === f.toLowerCase())) files.push(f)
    const first = rules.length
    for (const rel of files) {
      const text = await readText(path.join(src.dir, ...rel.split('/')))
      if (text == null) continue
      ruleCounts[src.id] = (ruleCounts[src.id] ?? 0) + parseRulesCsv(text, src.id, rel, rules, problems)
    }
    // R31: a Saga Forge mod with translatable dialog has $sft-… tokens in its rules; show its texts
    if (rules.length > first && !src.isCore) {
      const strings = (await json(src, 'data/sagaforge/text.json'))?.rules
      if (strings && typeof strings === 'object') rules.splice(first, rules.length - first, ...detokenizeRows(rules.slice(first), strings as RuleStrings))
    }
  }
  ruleFiles.push(...gameRuleFiles)

  // Factions: the first layer defines, later layers are patches. Only listed files are loaded by the game.
  for (const [key, layers] of factionLayers) {
    let eff: Record<string, unknown> = {}
    for (const l of layers) eff = mergeFactionJson(eff, l.raw) as Record<string, unknown>
    const id = String(eff.id ?? path.basename(key, '.faction'))
    const color = Array.isArray(eff.color) ? (eff.color as unknown[]).map((x) => num(x)) : null
    // #67 (user, 2026-11-21): each layer's own colour, so the editor shows the colour of the sources
    // that count for the active mod (vanilla, it, its listed mods), not of every installed mod
    const colors = layers.flatMap((l) => (Array.isArray(l.raw.color) ? [{ sourceId: l.sourceId, color: (l.raw.color as unknown[]).map((x) => num(x)) }] : []))
    const custom = (eff.custom ?? {}) as Record<string, unknown>
    factions.set(id, {
      id, name: String(eff.displayName ?? titleCase(id)), color, colors, layerValues: layers.length > 1 ? layers.map((l) => ({ sourceId: l.sourceId, ...(typeof l.raw.displayName === 'string' ? { name: l.raw.displayName } : {}), ...(typeof l.raw.logo === 'string' ? { logo: l.raw.logo } : {}), ...(typeof l.raw.crest === 'string' ? { crest: l.raw.crest } : {}) })) : undefined, file: layers[0].file, logo: String(eff.logo ?? ''), crest: String(eff.crest ?? ''),
      knownShips: layers.map((l) => { const k = (l.raw.knownShips ?? {}) as Record<string, unknown>; return { sourceId: l.sourceId, hulls: strList(k.hulls), tags: strList(k.tags) } }).filter((k) => k.hulls.length || k.tags.length),
      listed: listedFactionFiles.has(key), showInIntelTab: eff.showInIntelTab !== false && custom.hideInIntelTab !== true,
      definedBy: layers[0].sourceId, changedBy: layers.slice(1).map((l) => l.sourceId)
    })
    factionFiles.set(id, key)
  }

  const ui: UiSettings = { colors: {}, fonts: {} }
  const uiOf = (o: Record<string, unknown>) => {
    const out: { colors: Record<string, number[]>; fonts: Record<string, string> } = { colors: {}, fonts: {} }
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((x) => typeof x === 'number')) out.colors[k] = v as number[]
      else if (typeof v === 'string' && /\.fnt$/i.test(v)) out.fonts[k] = v
    }
    return out
  }
  Object.assign(ui, uiOf(settings))
  // #67 U33: each source's own colours and fonts (in load order), so the dialog preview uses the mod's game's (indexview.ts)
  ui.layers = settingsLayers.map((l) => ({ sourceId: l.sourceId, ...uiOf(l.settings) })).filter((l) => Object.keys(l.colors).length || Object.keys(l.fonts).length)

  const types0 = typeInfos(planetTypes, planetRaw, customEntityTypes, entityRaw)
  // #67 U33: a type several sources set keeps each one's JSON (indexview.ts merges the visible ones)
  const withLayers = <T extends { id: string }>(l: T[], k: string): T[] => l.map((t) => { const ls = typeLayers.get(`${k}:${t.id}`); return ls && ls.length > 1 ? { ...t, rawLayers: ls } : t })
  const types = { planets: withLayers(types0.planets, 'p'), entities: withLayers(types0.entities, 'e') }
  const codeSystems = codeFiles.flatMap((f) => parseSystemsJava(f.text, f.file, f.sourceId, (id) => systems.has(id)))

  // ---- #64: the imported sector snapshot: what the files and Java sources don't show, tied to its mod
  let snapshot: SnapshotInfo | null = null
  if (opts.snapshot) {
    const prefixes = new Map<string, string[]>()
    for (const f of factions.values()) {
      const pf = idPrefix(f.id)
      if (!pf || f.definedBy === 'starsector-core') continue
      const l = prefixes.get(f.definedBy) ?? []
      if (!l.includes(pf)) l.push(pf)
      prefixes.set(f.definedBy, l)
    }
    // a mod's whole id as a prefix ("sixtyfour_j_"): its first part alone can be shared (sixtyfour_a, sixtyfour_j)
    for (const src of sources) { if (src.isCore) continue; const pf = `${src.id}_`; const l = prefixes.get(src.id) ?? []; if (!l.includes(pf)) l.push(pf); prefixes.set(src.id, l) }
    const knownPlaces = new Set([...places.keys(), ...codeSystems.flatMap((c) => [...(c.star?.id ? [c.star.id] : []), ...c.bodies.map((x) => x.id).filter(Boolean)])])
    const mg = mergeSnapshot(opts.snapshot.data, {
      systems: new Set([...systems.keys(), ...codeSystems.map((c) => c.id)]), places: knownPlaces, markets: new Set([...markets.values()].flatMap((x) => [x.id, ...x.entities])), people: new Set(people.keys()),
      factionSource: (id) => factions.get(id)?.definedBy, modPrefixes: prefixes,
      exclude: sources.find((s) => !!opts.activeModDir && s.writable && s.writeDir === opts.activeModDir)?.id ?? null
    })
    for (const x of mg.systems) systems.set(x.id, x)
    for (const x of mg.places) places.set(x.id, x)
    for (const x of mg.markets) markets.set(x.id, x)
    for (const x of mg.people) people.set(x.id, x)
    const d = opts.snapshot.data
    snapshot = { file: opts.snapshot.file, imported: opts.snapshot.imported, gameVersion: d.gameVersion ?? '', day: d.day ?? '', mods: (d.mods ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id, version: m.version ?? '' })), added: mg.added, skipped: mg.skipped }
  }


  const modsRoot = modsRootFor(install, opts)
  const active = opts.activeModDir ? sources.find((s) => s.writable && s.writeDir === opts.activeModDir) : undefined
  const sortByName = <T extends { name: string }>(m: Map<string, T>) => [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  const sortByName2 = (l: SagaQuestInfo[]) => l.sort((a, b) => a.title.localeCompare(b.title))
  /** #67: each condition with how planets roll it; a category column (cat_hab3) stands for its planet types. */
  const conditionsWithGen = (): Map<string, ConditionInfo> => {
    const byCat = new Map<string, string[]>()
    for (const [type, cat] of planetCategory) byCat.set(cat, [...(byCat.get(cat) ?? []), type])
    const out = new Map<string, ConditionInfo>()
    for (const [id, c] of conditions) {
      const g = conditionGen.get(id)
      out.set(id, g ? { ...c, group: g.group, hazard: g.hazard, onPlanets: [...new Set(g.on.flatMap((h) => (h.startsWith('cat_') ? byCat.get(h) ?? [] : [h])))] } : c)
    }
    return out
  }

  const index: GameIndex = {
    install, modsMode: opts.mode, workspaceDir: opts.workspaceDir, modsRoot, activeSourceId: active?.id ?? null, sources,
    factions: sortByName(factions), people: sortByName(people), markets: sortByName(markets), systems: sortByName(systems),
    items: sortByName(items), industries: sortByName(industries), conditions: sortByName(conditionsWithGen()), submarkets: sortByName(submarkets),
    hulls: sortByName(hulls), variants: sortByName(variants), wings: sortByName(wings), weapons: sortByName(weapons), hullmods: sortByName(hullmods),
    illustrations: [...illustrations.values()], unexportedIllustrations: unexported.filter((u) => ![...illustrations.values()].some((i) => i.key === u.key)), portraits, customEntityTypes: types.entities, planetTypes: types.planets,
    procgen: procgenData(procStars, [...procRows.values()]), codeSystems,
    sectorSize: [Number(settings.sectorWidth) || 164000, Number(settings.sectorHeight) || 104000],
    dropGroups, shipRoles, salvageGen: [...salvageGen.values()], skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)), typeDescs: [...typeDescs.values()], graphicsIcons: [...graphicsIcons.values()].sort((a, b) => a.id.localeCompare(b.id)),
    places: [...places.values()].sort((a, b) => a.name.localeCompare(b.name)), sagaQuests: sortByName2([...sagaQuests.values()]), sagaEncounters: sortByName(sagaEncounters), sagaPools: sortByName(sagaPools), snapshot,
    researchTechs: [...researchTechs.values()].sort((a, b) => a.modId.localeCompare(b.modId) || a.tier - b.tier || a.name.localeCompare(b.name)), researchFactions: sortByName(researchFactions), researchIcons: [...researchIcons].sort(),
    sounds: [...sounds].sort(), music: [...music].sort(), ruleCounts, ruleFiles, ui, problems,
    nameCategories: [...nameCats.values()].sort((a, b) => a.id.localeCompare(b.id)),
    shipNameLists: [...shipLists.values()].sort((a, b) => a.id.localeCompare(b.id)),
    fleetTypeNames, fleetTypeNamesBase,
    factionKeyUsage: factionKeySurvey([...factionLayers.values()].map((l) => l[0]).filter((l) => l.sourceId === 'starsector-core').map((l) => ({ faction: String(l.raw.id ?? path.basename(l.file, '.faction')), raw: l.raw }))),
    stats: { filesRead, ms: Date.now() - t0 }, extensions: [], ext: {}
  }
  return { index, sources, rules, factionLayers, factionFiles, settings }
}

/** The rules file before 0.98.5a, and the fallback when settings.json has no "rules" list. */
export const DEFAULT_RULES_FILE = 'data/campaign/rules.csv'

/**
 * The "rules" list of a (merged) settings.json: paths relative to a source's folder, forward
 * slashes, duplicates removed (case-insensitive, as on Windows). Empty if the key is missing.
 */
export function ruleFileList(settings: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = []
  for (const v of strList(settings?.rules)) {
    const p = slash(v.trim()).replace(/^\.?\/+/, '')
    if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p)
  }
  return out
}

/** Parse a rules.csv into rows (comment rows are skipped). Returns the number of rules. */
export function parseRulesCsv(text: string, sourceId: string, file: string, into: RuleRow[], problems?: Problem[]): number {
  const rows = parseRulesCsvRows(text, sourceId, file)
  if (!rows.length && /\S/.test(text) && !/^\s*﻿?id\s*,/i.test(text)) problems?.push({ level: 'warning', area: 'Rules', sourceId, file, message: `${file} has no id/trigger columns` })
  for (const r of rows) into.push(r)
  return rows.length
}
