/**
 * GameIndex: a read-only picture of starsector-core and every installed mod (PLAN.md §3, §6
 * "Reading"). Records who defines and who changes each id. Never writes. No Electron imports.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseCsv, csvObjects } from '../shared/csv'
import { parseRulesCsvRows } from '../shared/export/csvrows'
import { defsFor } from '../shared/defs'
import { mergeFactionJson } from '../shared/faction'
import { detectInstall as _detect, errText, isFile, modsRootFor, readLoose, scanSources, walk, type ModsOptions } from './install'
import type {
  FactionInfo, GameIndex, HullInfo, IllustrationInfo, ItemInfo, MarketInfo, NamedEntry, PersonInfo, PortraitInfo, Problem,
  SourceInfo, SystemInfo, UiSettings, ValidInstall
} from '../shared/api'
import type { RuleRow } from '../shared/rules/types'

export const detectInstall = _detect

export interface IndexOptions extends ModsOptions {
  activeModDir: string | null
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
  const prev = map.get(entry.id)
  if (!prev) { map.set(entry.id, entry); return }
  if (prev.definedBy === entry.definedBy && !prev.changedBy.length) { map.set(entry.id, { ...entry, changedBy: prev.changedBy }); return }
  const changedBy = [...prev.changedBy, entry.definedBy]
  const replace = how === 'csv' ? prev.definedBy === 'starsector-core' && !prev.changedBy.length : how !== false
  map.set(entry.id, replace ? { ...entry, definedBy: prev.definedBy, changedBy } : { ...prev, changedBy })
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
  const industries = new Map<string, NamedEntry>()
  const conditions = new Map<string, NamedEntry>()
  const submarkets = new Map<string, NamedEntry>()
  const hulls = new Map<string, HullInfo>()
  const wings = new Map<string, NamedEntry>()
  const weapons = new Map<string, NamedEntry>()
  const hullmods = new Map<string, NamedEntry>()
  const illustrations = new Map<string, IllustrationInfo>()
  const portraits: PortraitInfo[] = []
  const variants = new Map<string, NamedEntry>()
  const customEntityTypes = new Map<string, NamedEntry>()
  const planetTypes = new Map<string, NamedEntry>()
  const sounds = new Set<string>()
  const music = new Set<string>()
  const rules: RuleRow[] = []
  const ruleCounts: Record<string, number> = {}
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
      if (!id || id.startsWith('#')) continue
      put(items, { id, name: r.name ?? id, kind: 'commodity', icon: r.icon ?? '', tags: csvTags(r.tags), basePrice: num(r['base price']), desc: r.desc ?? '', ...own }, 'csv')
    }
    for (const r of await csvRows(src, 'data/campaign/special_items.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      put(items, { id, name: r.name ?? id, kind: 'special', icon: r.icon ?? '', tags: csvTags(r.tags), basePrice: num(r['base price']), desc: r.desc ?? '', ...own }, 'csv')
    }
    const named = async (rel: string, into: Map<string, NamedEntry>, nameCol = 'name') => {
      for (const r of await csvRows(src, rel)) {
        const id = (r.id ?? '').trim()
        if (id && !id.startsWith('#')) put(into, { id, name: (r[nameCol] ?? '').trim() || id, ...own }, 'csv')
      }
    }
    await named('data/campaign/industries.csv', industries)
    await named('data/campaign/market_conditions.csv', conditions)
    await named('data/campaign/submarkets.csv', submarkets)
    await named('data/hulls/wing_data.csv', wings, 'id')
    await named('data/weapons/weapon_data.csv', weapons)
    await named('data/hullmods/hull_mods.csv', hullmods)

    // ---- hulls: ship_data.csv rows plus .ship/.skin ids and sizes (light regex scan, no full parse)
    for (const r of await csvRows(src, 'data/hulls/ship_data.csv')) {
      const id = (r.id ?? '').trim()
      if (!id || id.startsWith('#')) continue
      const prev = hulls.get(id)
      put(hulls, {
        id, name: (r.name ?? '').trim() || id, hullSize: prev?.hullSize ?? '', designation: r.designation ?? '',
        tech: r['tech/manufacturer'] ?? '', hints: r.hints ?? '', isSkin: false, ...own
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
      const graphics = (st.graphics ?? {}) as Record<string, unknown>
      for (const [category, entries] of Object.entries(graphics)) {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
        for (const [key, p] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof p !== 'string' || !/\.(png|jpe?g|webp)$/i.test(p)) continue
          if (category !== 'illustrations' && !/illustration|intel|events|backgrounds/i.test(category)) continue
          const id = `${category}/${key}`
          put(illustrations, { id, category, key, path: slash(p), ...own }, true)
        }
      }
    }
    const ce = await json(src, 'data/config/custom_entities.json')
    for (const [id, v] of Object.entries(ce ?? {})) put(customEntityTypes, { id, name: String((v as Record<string, unknown>)?.defaultName ?? titleCase(id)), ...own }, true)
    const pl = await json(src, 'data/config/planets.json')
    for (const [id, v] of Object.entries(pl ?? {})) put(planetTypes, { id, name: String((v as Record<string, unknown>)?.name ?? titleCase(id)), ...own }, true)
    const snd = await json(src, 'data/config/sounds.json')
    if (snd) {
      for (const [k, v] of Object.entries(snd)) {
        if (k === 'music' && v && typeof v === 'object') for (const m of Object.keys(v)) music.add(m)
        else sounds.add(k)
      }
    }

    // ---- variant ids (file names; the game uses variantId, which matches the file name in practice)
    for (const file of await walk(path.join(src.dir, 'data', 'variants'), ['.variant'])) {
      const id = path.basename(file, '.variant')
      put(variants, { id, name: id, ...own }, true)
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

    // ---- rules.csv
    const rulesText = await readText(path.join(src.dir, 'data', 'campaign', 'rules.csv'))
    if (rulesText != null) {
      const n = parseRulesCsv(rulesText, S, 'data/campaign/rules.csv', rules, problems)
      ruleCounts[S] = n
    }
  }

  // Factions: the first layer defines, later layers are patches. Only listed files are loaded by the game.
  for (const [key, layers] of factionLayers) {
    let eff: Record<string, unknown> = {}
    for (const l of layers) eff = mergeFactionJson(eff, l.raw) as Record<string, unknown>
    const id = String(eff.id ?? path.basename(key, '.faction'))
    const color = Array.isArray(eff.color) ? (eff.color as unknown[]).map((x) => num(x)) : null
    const custom = (eff.custom ?? {}) as Record<string, unknown>
    factions.set(id, {
      id, name: String(eff.displayName ?? titleCase(id)), color, file: layers[0].file, logo: String(eff.logo ?? ''), crest: String(eff.crest ?? ''),
      listed: listedFactionFiles.has(key), showInIntelTab: eff.showInIntelTab !== false && custom.hideInIntelTab !== true,
      definedBy: layers[0].sourceId, changedBy: layers.slice(1).map((l) => l.sourceId)
    })
    factionFiles.set(id, key)
  }

  const ui: UiSettings = { colors: {}, fonts: {} }
  for (const [k, v] of Object.entries(settings)) {
    if (Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((x) => typeof x === 'number')) ui.colors[k] = v as number[]
    else if (typeof v === 'string' && /\.fnt$/i.test(v)) ui.fonts[k] = v
  }

  const modsRoot = modsRootFor(install, opts)
  const active = opts.activeModDir ? sources.find((s) => s.writable && s.writeDir === opts.activeModDir) : undefined
  const sortByName = <T extends { name: string }>(m: Map<string, T>) => [...m.values()].sort((a, b) => a.name.localeCompare(b.name))

  const index: GameIndex = {
    install, modsMode: opts.mode, workspaceDir: opts.workspaceDir, modsRoot, activeSourceId: active?.id ?? null, sources,
    factions: sortByName(factions), people: sortByName(people), markets: sortByName(markets), systems: sortByName(systems),
    items: sortByName(items), industries: sortByName(industries), conditions: sortByName(conditions), submarkets: sortByName(submarkets),
    hulls: sortByName(hulls), variants: sortByName(variants), wings: sortByName(wings), weapons: sortByName(weapons), hullmods: sortByName(hullmods),
    illustrations: [...illustrations.values()], portraits, customEntityTypes: sortByName(customEntityTypes), planetTypes: sortByName(planetTypes),
    sounds: [...sounds].sort(), music: [...music].sort(), ruleCounts, ui, problems,
    stats: { filesRead, ms: Date.now() - t0 }, extensions: [], ext: {}
  }
  return { index, sources, rules, factionLayers, factionFiles, settings }
}

/** Parse a rules.csv into rows (comment rows are skipped). Returns the number of rules. */
export function parseRulesCsv(text: string, sourceId: string, file: string, into: RuleRow[], problems?: Problem[]): number {
  const rows = parseRulesCsvRows(text, sourceId, file)
  if (!rows.length && /\S/.test(text) && !/^\s*﻿?id\s*,/i.test(text)) problems?.push({ level: 'warning', area: 'Rules', sourceId, file, message: 'rules.csv has no id/trigger columns' })
  for (const r of rows) into.push(r)
  return rows.length
}
