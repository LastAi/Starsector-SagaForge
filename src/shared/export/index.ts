/**
 * Export (PLAN.md §6 "Writing rules", mock-up export.html): turns the model into the files the game
 * reads. Pure: computes every file's new text and its state; the main process only writes (write
 * guard, changed-on-disk check, backups). Nothing outside owned blocks / owned keys is changed.
 */
import type { GameIndex, Problem } from '../api'
import type { ModModel } from '../serialize'
import type { FileWrite, ProjectState } from '../project'
import type { RuleRow } from '../rules/types'
import { compileQuest, type CompiledQuest } from './questrules'
import { findBlocks, writeBlock, detachBlock, removeBlock, csvLine, blockHash, type BlockState } from './blocks'
import { parseCsvRecords } from '../csvedit'
import { RULES_HEADER } from './csvrows'
import { COMMODITIES_HEADER, SPECIAL_HEADER, DESCRIPTIONS_HEADER, itemRow, descriptionRows, itemKindLookup } from './items'
import { PERSON_NAMES_HEADER, personNameRows, shipNameLists } from './names'
import { ownTypeInfos } from '../celestial'
import { needsSagaLib11, needsSagaLib12, needsSagaLib13, usesBountyCommands } from './runtime'
import { lockedEntityIds } from '../patterns'
import { updateLooseText, serialize } from '../jsonedit'
import { parseLooseObject } from '../loosejson'
import { parseConditions } from '../rules/parse'
import { runtimeFiles, CONTENT_CSV } from './runtime'
import { versionFileName, versionFileText, VERSION_FILES_CSV } from '../releasepack'
import { tokenizeRules, type RuleStrings } from './texttokens'
import { eventRules } from './events'
import { progressRules } from './progress'
import { textFile, TEXT_FILE, translatable as isTranslatable } from '../translate'
import { exportableModel } from '../inactive'
import { bountiesFile, withoutBountyOnly, BOUNTY_FILE } from '../bounties'
import { effectiveConds, lowerModConds, usesModConds, type ItemConds } from '../moduses'
import { MODS_JSON, requiredMods, depVersion } from '../modlist'
import { LUNA_HEADER, LUNA_SETTINGS_CONFIG, LUNA_SETTINGS_CSV, settingRow, settingsConfig, usesSettings } from '../settings'
import type { ModUse, QuestPlan } from '../model'
import { NEX_MOD_FACTIONS, NEX_PLAYER_CONFIG, hasPlayerFleets, nexConfigJson, nexConfigPath, nexConfigured, nexRelationPairs, startFleets } from '../nexconfig'
import { comboKey, mentionedMods } from '../itemversions'
import { MAGIC_ACHIEVEMENTS_CSV, MAGIC_ACHIEVEMENTS_HEADER, achievementRow, preloadCategory, preloadImages } from '../achievements'
import { QUEST_SKIP_FILE, questSkipJson } from '../questskip'
import { addNameTokens, nameVersioned, findVersionable, hasVersions, lowerPlacesModel, resolveModel, versionedRuleRows, type VKind } from '../modelversions'

/** #64: the mod per combination of its optional mods, for items with versions (export and Check mod). */
export interface VersionContext {
  /** The mods an item's versions mention (none: no versions). */
  mods: (kind: VKind, id: string) => string[]
  /** The whole mod in one combination, as exported (versions resolved, places and mod conditions lowered). */
  at: (on: string[]) => ModModel
}

/** The export's model per combination (cached), from the model with its versions. */
export function versionContext(plain: ModModel, modConds: Map<string, ItemConds>): VersionContext {
  const cache = new Map<string, ModModel>()
  return {
    mods: (kind, id) => mentionedMods(findVersionable(plain, kind, id)),
    at: (on) => {
      const k = comboKey(on)
      let v = cache.get(k)
      if (!v) { v = lowerModConds(addNameTokens(lowerPlacesModel(resolveModel(plain, on)), nameVersioned(plain)), modConds); cache.set(k, v) }
      return v
    }
  }
}

export const SAGALIB_ID = 'lastai_sagalib'

export interface ExportOptions {
  /** Only the rules.csv blocks ("Export dialog only"). */
  dialogOnly?: boolean
  /** Owned blocks edited by hand to overwrite anyway ("path|key"). */
  overwrite?: string[]
  /** Owned blocks to detach: they become hand-written and the editor stops exporting them ("path|key"). */
  detach?: string[]
  /** Add SagaLib to mod_info.json dependencies when the output needs it. */
  addDependency?: boolean
  /** The mod's version to write into mod_info.json (unchanged when empty or the same). */
  version?: string
  /** #47 §6: the target install's full version string, written as mod_info.json's gameVersion. */
  gameVersion?: string
  /** #60: add the mod's required mods (Saga › Mods) to mod_info.json dependencies (asked, one click). */
  addRequired?: boolean
}

export interface ExportFile {
  path: string
  state: 'new' | 'changed' | 'same' | 'removed'
  summary: string
  blocks: { key: string; state: BlockState; rows: number }[]
  /** Rows outside the owned blocks, left untouched. */
  handRows: number
}

export interface HandEdited { path: string; key: string; current: string; wanted: string }

export interface ExportPlan {
  files: ExportFile[]
  writes: FileWrite[]
  handEdited: HandEdited[]
  usesSagaLib: boolean
  dependencyMissing: boolean
  /** #60: required mods (Saga › Mods) not yet in mod_info.json dependencies, or with an older minimum version. */
  requiredMissing: ModUse[]
  /** #60: each item's effective mod conditions, as exported. */
  modConds: Map<string, ItemConds>
  /** Problems found while exporting (FireBest takeover etc.); errors block. */
  problems: Problem[]
  compiled: Record<string, CompiledQuest>
}

const lines = (text: string | undefined) => text ?? ''
const eolOf = (t: string | undefined) => (t?.includes('\r\n') ? '\r\n' : '\n')

/** The header of a CSV text, or null if empty. */
function headerOf(text: string): string[] | null {
  const recs = parseCsvRecords(text)
  const h = recs.find((r) => r.fields.some((f) => f.trim()))
  return h ? h.fields.map((x) => x.trim()) : null
}

export function usesSagaLib(m: ModModel, info: ProjectState['modInfo']): boolean {
  return m.quests.some((q) => q.kind === 'quest') || m.people.length > 0 || m.systems.length > 0 || m.encounters.length > 0 || !!m.events?.length || !!m.progress?.length ||
    Object.keys(m.factionsRuntime.relations).length > 0 || Object.keys(m.factionsRuntime.scripted).length > 0 ||
    info.dependencies.some((d) => d.id === SAGALIB_ID)
}

export function planExport(model: ModModel, loaded: ProjectState, index: GameIndex, gameRules: RuleRow[] | null, opts: ExportOptions = {}): ExportPlan {
  // inactive people and quests are not exported (R10); files exported before are removed below.
  // #27: quests and encounters exported only as MagicLib bounties don't go to SagaLib either
  const plain = exportableModel(withoutBountyOnly(model))
  // #60: every "Only with / Only without" (own, automatic, inherited) folded into rule conditions
  const modConds = effectiveConds(plain, index, loaded.sourceId)
  // #64: versions resolved per combination of optional mods; the base is the mod without them
  const vctx = versionContext(plain, modConds)
  const m = vctx.at([])
  const files: ExportFile[] = []
  const writes: FileWrite[] = []
  const handEdited: HandEdited[] = []
  const problems: Problem[] = []
  const existing = (p: string) => loaded.files[p]?.text
  const hashOf = (p: string) => (loaded.files[p] ? loaded.files[p].hash : null)
  const overwrite = new Set(opts.overwrite ?? [])
  const detach = new Set(opts.detach ?? [])
  const project = JSON.parse(JSON.stringify(m.project)) as ModModel['project']
  const detached = new Set(Object.keys(project.exported).filter((k) => k.startsWith('detached:')).map((k) => k.slice(9)))
  for (const d of detach) { detached.add(d); project.exported[`detached:${d}`] = '1' }

  // #60: SF_HasMod / SF_HasAnyMod and modsWith are SagaLib 1.3's: a mod that uses them needs SagaLib
  // #62: settings read in conditions or scaling credits and fleets: only SagaLib sets their $global keys
  const sagalib = usesSagaLib(m, loaded.modInfo) || usesModConds(modConds, plain) || hasVersions(plain) || usesSettings(plain)
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  const compiled: Record<string, CompiledQuest> = {}

  let needsLib = sagalib
  // RC-F2: objects guarded by a "Protect this wreck" lock keep their Arrive as a takeover
  const lockedEntities = lockedEntityIds(m.quests)
  const copts = { sagalib, phrases, sourceId: loaded.sourceId, itemKind: itemKindLookup(m.items, index.items ?? []), lockedEntities, pools: m.pools ?? [] }
  for (const q of m.quests) {
    compiled[q.id] = compileQuest(q, copts)
    if (compiled[q.id].usesSagaLib) needsLib = true
    // #64: a node a version changes gets an extra rule that tests the stored version
    const vm = vctx.mods('quest', q.id)
    if (vm.length) {
      const qFor = (on: string[]) => vctx.at(on).quests.find((x) => x.id === q.id) as QuestPlan
      compiled[q.id] = { ...compiled[q.id], rows: versionedRuleRows(q.id, vm, qFor, (x) => compileQuest(x, copts).rows).rows }
      needsLib = true
    }
  }

  const translatable = isTranslatable(m, needsLib)
  const ruleStrings: RuleStrings = {}

  /** Apply owned blocks to a CSV file. */
  const blockFile = (path: string, header: string[], blocks: { key: string; rows: string[] }[], dropKeys: (key: string) => boolean, summaryOf: (n: number) => string) => {
    const old = existing(path)
    const eol = eolOf(old)
    let text = old ?? header.join(',') + eol
    const cols = headerOf(text)?.length ?? header.length
    const states: ExportFile['blocks'] = []
    // detach first, then remove blocks we no longer own
    for (const b of findBlocks(text)) {
      if (detach.has(`${path}|${b.key}`)) text = detachBlock(text, b.key)
      else if (dropKeys(b.key) && !blocks.some((x) => x.key === b.key)) { text = removeBlock(text, b.key); states.push({ key: b.key, state: 'changed', rows: 0 }) }
    }
    for (const b of blocks) {
      if (detached.has(`${path}|${b.key}`)) continue
      const r = writeBlock(text, b.key, b.rows, cols, { force: overwrite.has(`${path}|${b.key}`), eol })
      if (r.state === 'edited-by-hand') {
        const cur = findBlocks(text).find((x) => x.key === b.key)
        handEdited.push({ path, key: b.key, current: cur?.body ?? '', wanted: b.rows.join(eol) + eol })
      }
      text = r.text
      states.push({ key: b.key, state: r.state, rows: b.rows.length })
    }
    const handRows = countHandRows(text)
    if (old === text) { files.push({ path, state: 'same', summary: 'unchanged', blocks: states, handRows }); return }
    writes.push({ path, text, expectedHash: hashOf(path) })
    files.push({ path, state: old == null ? 'new' : 'changed', summary: summaryOf(blocks.reduce((a, b) => a + b.rows.length, 0)), blocks: states, handRows })
  }

  // ---- rules.csv: one block per quest / conversation
  {
    const path = 'data/campaign/rules.csv'
    const old = existing(path)
    const header = (old && headerOf(old)) || RULES_HEADER
    const cell = (r: RuleRow, h: string) => (h in r ? String((r as unknown as Record<string, unknown>)[h] ?? '') : '')
    // R31: with translatable dialog the texts become tokens and go into the strings file
    const blocks = m.quests.map((q) => {
      let rows = compiled[q.id].rows
      if (translatable) { const t = tokenizeRules(rows); rows = t.rows; Object.assign(ruleStrings, t.strings) }
      return { key: `quest=${q.id}`, rows: rows.map((r) => csvLine(header.map((h) => cell(r, h)))) }
    })
    // Phase 8d: world events' start and end actions
    const evRows = eventRules(m.events ?? [], loaded.sourceId, itemKindLookup(m.items, index.items ?? []))
    if (evRows.length) blocks.push({ key: 'events', rows: evRows.map((r) => csvLine(header.map((h) => cell(r, h)))) })
    // Phase 8d-3: progress events' stage actions
    const peRows = progressRules(m.progress ?? [], loaded.sourceId, itemKindLookup(m.items, index.items ?? []))
    if (peRows.length) blocks.push({ key: 'progress', rows: peRows.map((r) => csvLine(header.map((h) => cell(r, h)))) })
    blockFile(path, header, blocks, (k) => k.startsWith('quest=') || k === 'events' || k === 'progress', (n) => `${n} rule${n === 1 ? '' : 's'} in ${blocks.length} owned block${blocks.length === 1 ? '' : 's'}`)
  }

  if (!opts.dialogOnly) {
    // ---- items
    const commodities = m.items.filter((i) => i.kind === 'commodity')
    const specials = m.items.filter((i) => i.kind === 'special')
    const itemBlock = (path: string, defHeader: string[], list: typeof m.items) => {
      if (!list.length && !existing(path)) return
      const old = existing(path)
      const header = (old && headerOf(old)) || defHeader
      const rows = list.map((it) => { const r = itemRow(it); return csvLine(header.map((h) => r[h] ?? '')) })
      blockFile(path, header, list.length ? [{ key: 'items', rows }] : [], (k) => k === 'items', (n) => `${n} item${n === 1 ? '' : 's'} in an owned block`)
    }
    itemBlock('data/campaign/commodities.csv', COMMODITIES_HEADER, commodities)
    itemBlock('data/campaign/special_items.csv', SPECIAL_HEADER, specials)

    // ---- descriptions.csv
    {
      const path = 'data/strings/descriptions.csv'
      const rowsObj = descriptionRows(m.descriptions, m.items)
      if (rowsObj.length || existing(path)) {
        const old = existing(path)
        const header = (old && headerOf(old)) || DESCRIPTIONS_HEADER
        const rows = rowsObj.map((r) => csvLine(header.map((h) => r[h] ?? '')))
        blockFile(path, header, rowsObj.length ? [{ key: 'descriptions', rows }] : [], (k) => k === 'descriptions', (n) => `${n} description${n === 1 ? '' : 's'}`)
      }
    }

    // ---- Phase 7e (RC-F7): the mod's own drop groups (loot pools), drop_groups.csv rows in an owned
    // block; the user decided: own groups only until how vanilla merges this file is checked in game
    {
      const path = 'data/campaign/procgen/drop_groups.csv'
      const loot = (m.pools ?? []).filter((p) => p.use === 'loot')
      const rowsObj = loot.flatMap((p) => [
        // F7-a: a pool that adds to an existing group writes its rows into that group (no "nothing": it would change the group's own odds)
        ...p.entries.map((e) => ({ commodity: e.id, group: p.addsTo || p.id, freq: String(e.weight) })),
        ...(p.nothing && !p.addsTo ? [{ commodity: 'nothing', group: p.id, freq: String(p.nothing) }] : [])
      ])
      if (rowsObj.length || existing(path)) {
        const old = existing(path)
        const header = (old && headerOf(old)) || ['commodity', 'group', 'freq']
        const rows = rowsObj.map((r) => csvLine(header.map((h) => (r as Record<string, string>)[h] ?? '')))
        blockFile(path, header, rowsObj.length ? [{ key: 'loot', rows }] : [], (k) => k === 'loot', (n) => `${n} drop group row${n === 1 ? '' : 's'}: ${loot.filter((p) => !p.addsTo).length} group(s) of the mod's own, ${loot.filter((p) => p.addsTo).length} added to existing groups`)
      }
    }

    // ---- name lists (R3): person_names.csv rows in an owned block, ship_names.json lists merged by key
    {
      const path = 'data/characters/person_names.csv'
      const rowsObj = personNameRows(m.names.people)
      if (rowsObj.length || existing(path)) {
        const old = existing(path)
        const header = (old && headerOf(old)) || PERSON_NAMES_HEADER
        const rows = rowsObj.map((r) => csvLine(header.map((h) => r[h] ?? '')))
        blockFile(path, header, rowsObj.length ? [{ key: 'names', rows }] : [], (k) => k === 'names', (n) => `${n} name${n === 1 ? '' : 's'} in an owned block (added to the game's names)`)
      }
    }
    /**
     * Merged JSON files the mod shares with its own hand-written entries: replace or remove only
     * the keys Saga Forge wrote last time (remembered in project.exported[exportedKey]).
     */
    const mergeKeys = (path: string, want: Record<string, unknown>, exportedKey: string, what: string, summary: (n: number) => string) => {
      const before = (project.exported[exportedKey] ?? '').split(',').filter(Boolean)
      if (!Object.keys(want).length && !before.length) return
      const old = existing(path)
      let value: Record<string, unknown> = {}
      try { value = old ? parseLooseObject(old).value : {} } catch { problems.push({ level: 'error', area: 'Export', message: `${path} can't be read, so ${what} can't be written. Fix the file by hand.`, file: path }); return }
      const next: Record<string, unknown> = { ...value }
      for (const k of before) if (!(k in want)) delete next[k]
      for (const [k, v] of Object.entries(want)) next[k] = v
      project.exported[exportedKey] = Object.keys(want).sort().join(',')
      // nothing left: an empty object (the file stays; the game reads it as nothing to add)
      const text = !Object.keys(next).length ? '{}\n' : old ? updateLooseText(old, next) : serialize(next, '', { unit: '\t', eol: '\n' }) + '\n'
      if (text !== old) { writes.push({ path, text, expectedHash: hashOf(path) }); files.push({ path, state: old ? 'changed' : 'new', summary: summary(Object.keys(want).length), blocks: [], handRows: 0 }) }
    }
    mergeKeys('data/strings/ship_names.json', shipNameLists(m.names.ships), 'shipNames', 'the ship name lists', (n) => `${n} ship name list${n === 1 ? '' : 's'} (appended to lists with the same id)`)
    // R22: names of fleet types for every faction (merged JSON, like vanilla's own default_fleet_type_names.json)
    mergeKeys('data/world/factions/default_fleet_type_names.json', Object.fromEntries(Object.entries(m.fleets?.typeNames ?? {}).filter(([k, v]) => k && v)), 'fleetTypeNames', 'the fleet type names', (n) => `${n} fleet type name${n === 1 ? '' : 's'} for every faction (merged by key)`)

    // ---- #27: MagicLib bounties, merged by key into the mod's magicBounty_data.json (hand-written bounties stay)
    {
      const { want, outs } = bountiesFile(model, index)
      for (const o of outs) for (const n of o.notes) if (n.level === 'error') problems.push({ level: 'error', area: 'Bounty', message: `MagicLib bounty ${o.id} (${n.field}): ${n.message}`, ref: o.quest ? { page: 'quests', id: o.quest.id } : { page: 'encounters', id: o.encounter?.id ?? '' } })
      mergeKeys(BOUNTY_FILE, want, 'bounties', 'the MagicLib bounties', (n) => `${n} MagicLib bount${n === 1 ? 'y' : 'ies'} (merged by key; only MagicLib reads this file)`)
    }

    // ---- #62: the mod's LunaLib settings page (its own LunaSettings.csv, an owned block; hand-written rows stay)
    {
      const defs = m.project.settings ?? []
      if (defs.length || existing(LUNA_SETTINGS_CSV)?.includes('sagaforge:begin settings')) {
        blockFile(LUNA_SETTINGS_CSV, LUNA_HEADER, [{ key: 'settings', rows: defs.map((s) => { const r = settingRow(s); return csvLine(LUNA_HEADER.map((h) => r[h] ?? '')) }) }], (k) => k === 'settings',
          (n) => `${n} setting row${n === 1 ? '' : 's'}: LunaLib shows them as the mod's page; SagaLib sets the values as $global keys`)
      }
      // the mod's icon in LunaLib's menu (merged into LunaLib's own file by mod id)
      mergeKeys(LUNA_SETTINGS_CONFIG, settingsConfig(loaded.modInfo.id, m.project.settingsIcon), 'lunaIcon', "the mod's LunaLib icon", () => "the mod's icon in LunaLib's settings menu (only LunaLib reads this file)")
    }

    // ---- #63: Nexerelin faction configs of the mod's own factions (one file each, plus a row in its
    // mod_factions.csv, an owned block); only Nexerelin reads them. Relations from the faction's own.
    {
      const ids = nexConfigured({ factions: m.factions, nexerelin: model.nexerelin })
      const before = (project.exported.nexerelin ?? '').split(',').filter(Boolean)
      for (const id of ids) {
        const path = nexConfigPath(id)
        const { inConfig } = nexRelationPairs(m, id, modConds)
        const value = nexConfigJson(model.nexerelin![id], inConfig)
        const old = existing(path)
        let text: string
        try { text = old != null ? updateLooseText(old, value) : serialize(value, '', { unit: '\t', eol: '\n' }) + '\n' } catch (e) {
          problems.push({ level: 'error', area: 'Export', message: `${path} can't be read, so ${id}'s Nexerelin config can't be written: ${(e as Error).message}. Fix the file by hand.`, file: path })
          continue
        }
        const n = Object.keys(inConfig).length
        if (old === text) { files.push({ path, state: 'same', summary: 'unchanged', blocks: [], handRows: 0 }); continue }
        writes.push({ path, text, expectedHash: hashOf(path) })
        files.push({ path, state: old == null ? 'new' : 'changed', summary: `Nexerelin faction config of ${id}${n ? ` (${n} starting relation${n === 1 ? '' : 's'})` : ''}; only Nexerelin reads it`, blocks: [], handRows: 0 })
      }
      // configs written before for factions that no longer have one
      for (const id of before) {
        const path = nexConfigPath(id)
        if (ids.includes(id) || existing(path) == null) continue
        writes.push({ path, text: '', remove: true, expectedHash: hashOf(path) })
        files.push({ path, state: 'removed', summary: 'no longer exported (the faction has no Nexerelin config)', blocks: [], handRows: 0 })
      }
      project.exported.nexerelin = ids.join(',')
      if (!project.exported.nexerelin) delete project.exported.nexerelin
      // ready-made fleets added to the player faction (free start, own faction): the mod's player.json,
      // merged into Nexerelin's (lists appended); built in, so no mod_factions.csv row
      {
        const path = NEX_PLAYER_CONFIG
        const old = existing(path)
        if (hasPlayerFleets(model)) {
          let text: string | null = null
          try { text = old != null ? updateLooseText(old, model.nexerelinPlayer) : serialize(model.nexerelinPlayer, '', { unit: '\t', eol: '\n' }) + '\n' } catch (e) {
            problems.push({ level: 'error', area: 'Export', message: `${path} can't be read, so the player faction's ready-made fleets can't be written: ${(e as Error).message}. Fix the file by hand.`, file: path })
          }
          if (text != null) {
            const n = Object.values(startFleets(model.nexerelinPlayer!)).reduce((a, l) => a + l.length, 0)
            if (old === text) files.push({ path, state: 'same', summary: 'unchanged', blocks: [], handRows: 0 })
            else { writes.push({ path, text, expectedHash: hashOf(path) }); files.push({ path, state: old == null ? 'new' : 'changed', summary: `${n} ready-made fleet${n === 1 ? '' : 's'} added to Nexerelin's player faction (free start, own faction); only Nexerelin reads it`, blocks: [], handRows: 0 }) }
            project.exported.nexerelinPlayer = '1'
          }
        } else if (project.exported.nexerelinPlayer) {
          if (old != null) { writes.push({ path, text: '', remove: true, expectedHash: hashOf(path) }); files.push({ path, state: 'removed', summary: 'no longer exported (no ready-made fleets for the player faction)', blocks: [], handRows: 0 }) }
          delete project.exported.nexerelinPlayer
        }
      }
      if (ids.length || existing(NEX_MOD_FACTIONS)?.includes('sagaforge:begin nexerelin')) {
        const old = existing(NEX_MOD_FACTIONS)
        const header = (old && headerOf(old)) || ['faction']
        blockFile(NEX_MOD_FACTIONS, header, ids.length ? [{ key: 'nexerelin', rows: ids.map((id) => csvLine(header.map((h, i) => (i === 0 ? id : '')))) }] : [], (k) => k === 'nexerelin',
          (n) => `${n} faction${n === 1 ? '' : 's'} Nexerelin configures (only Nexerelin reads this file)`)
      }
    }

    // ---- #65: MagicLib achievements (the mod's own magic_achievements.csv, an owned block; hand-written rows stay)
    {
      const defs = m.project.achievements ?? []
      if (defs.length || existing(MAGIC_ACHIEVEMENTS_CSV)?.includes('sagaforge:begin achievements')) {
        const old = existing(MAGIC_ACHIEVEMENTS_CSV)
        const header = (old && headerOf(old)) || MAGIC_ACHIEVEMENTS_HEADER
        blockFile(MAGIC_ACHIEVEMENTS_CSV, header, defs.length ? [{ key: 'achievements', rows: defs.map((a) => { const r = achievementRow(a); return csvLine(header.map((h) => r[h] ?? '')) }) }] : [], (k) => k === 'achievements',
          (n) => `${n} MagicLib achievement${n === 1 ? '' : 's'} (only MagicLib reads this file; quests unlock them through SagaLib)`)
      }
    }

    // ---- #65: Nexerelin's quest skip: the mod's chains and quests, merged by key into its questSkip.json
    // (both sections; hand-written entries stay). Each chain names SagaLib's bridge plugin.
    {
      const want = questSkipJson(m)
      const sections = [['questChains', 'questSkipChains'], ['quests', 'questSkipQuests']] as const
      const before = Object.fromEntries(sections.map(([, k]) => [k, (project.exported[k] ?? '').split(',').filter(Boolean)]))
      const any = sections.some(([s, k]) => Object.keys(want[s]).length || before[k].length)
      if (any) {
        const old = existing(QUEST_SKIP_FILE)
        let value: Record<string, unknown> | null = {}
        try { value = old ? parseLooseObject(old).value : {} } catch (e) {
          value = null
          problems.push({ level: 'error', area: 'Export', message: `${QUEST_SKIP_FILE} can't be read, so the quest skip entries can't be written: ${(e as Error).message}. Fix the file by hand.`, file: QUEST_SKIP_FILE })
        }
        if (value) {
          const next: Record<string, unknown> = { ...value }
          for (const [s, k] of sections) {
            const cur = next[s] && typeof next[s] === 'object' && !Array.isArray(next[s]) ? { ...(next[s] as Record<string, unknown>) } : {}
            for (const id of before[k]) if (!(id in want[s])) delete cur[id]
            Object.assign(cur, want[s])
            next[s] = cur
            project.exported[k] = Object.keys(want[s]).sort().join(',')
            if (!project.exported[k]) delete project.exported[k]
          }
          const text = old ? updateLooseText(old, next) : serialize(next, '', { unit: '\t', eol: '\n' }) + '\n'
          const n = Object.keys(want.questChains).length, nq = Object.keys(want.quests).length
          if (text !== old) { writes.push({ path: QUEST_SKIP_FILE, text, expectedHash: hashOf(QUEST_SKIP_FILE) }); files.push({ path: QUEST_SKIP_FILE, state: old ? 'changed' : 'new', summary: `${n} quest chain${n === 1 ? '' : 's'} (${nq} quest${nq === 1 ? '' : 's'}) on Nexerelin's new-game "skip quests" screen (merged by key; only Nexerelin reads this file)`, blocks: [], handRows: 0 }) }
        }
      }
    }

    // ---- the mod's own celestial types (R21): merged by key into its config files
    {
      const own = ownTypeInfos(m.types, index.planetTypes ?? [], index.customEntityTypes ?? [])
      const ents = Object.fromEntries(own.entities.map((t) => [t.id, t.raw]))
      const plans = Object.fromEntries(own.planets.map((t) => [t.id, t.raw]))
      mergeKeys('data/config/custom_entities.json', ents, 'entityTypes', 'the entity types', (n) => `${n} entity type${n === 1 ? '' : 's'} (merged by key)`)
      mergeKeys('data/config/planets.json', plans, 'planetTypes', 'the planet and star types', (n) => `${n} planet/star type${n === 1 ? '' : 's'} (merged by key)`)
    }

    // ---- settings.json: the mod's own illustrations (merged by key into the game's)
    {
      const path = 'data/config/settings.json'
      const want = m.project.illustrations ?? {}
      const before = (project.exported.illustrations ?? '').split(',').filter(Boolean)
      // #65: images only other mods draw (MagicLib's achievement list, Nexerelin's skip screen) and
      // neither loads: the game loads every image listed under settings.json "graphics" at startup
      const pre = preloadImages(m)
      const preCat = preloadCategory(m.project.prefix)
      const preBefore = (project.exported.preloadImages ?? '').split(',').filter(Boolean)
      if (Object.keys(want).length || before.length || Object.keys(pre).length || preBefore.length) {
        const old = existing(path)
        let value: Record<string, unknown> = {}
        try { value = old ? parseLooseObject(old).value : {} } catch { problems.push({ level: 'error', area: 'Export', message: `${path} can't be read, so illustrations can't be added. Fix the file by hand.`, file: path }) }
        const graphics = { ...((value.graphics as Record<string, unknown>) ?? {}) }
        const ill = { ...((graphics.illustrations as Record<string, unknown>) ?? {}) }
        for (const k of before) if (!(k in want)) delete ill[k]
        for (const [k, p] of Object.entries(want)) ill[k] = p
        if (Object.keys(ill).length || graphics.illustrations) graphics.illustrations = ill
        if (Object.keys(pre).length || preBefore.length) {
          const cat = { ...((graphics[preCat] as Record<string, unknown>) ?? {}) }
          for (const k of preBefore) if (!(k in pre)) delete cat[k]
          Object.assign(cat, pre)
          if (Object.keys(cat).length) graphics[preCat] = cat
          else delete graphics[preCat]
          project.exported.preloadImages = Object.keys(pre).sort().join(',')
          if (!project.exported.preloadImages) delete project.exported.preloadImages
        }
        const next = { ...value, graphics }
        const text = old ? updateLooseText(old, next) : serialize(next, '', { unit: '\t', eol: '\n' }) + '\n'
        project.exported.illustrations = Object.keys(want).sort().join(',')
        const np = Object.keys(pre).length
        if (text !== old) { writes.push({ path, text, expectedHash: hashOf(path) }); files.push({ path, state: old ? 'changed' : 'new', summary: `${Object.keys(want).length} illustration key${Object.keys(want).length === 1 ? '' : 's'}${np ? `, ${np} image${np === 1 ? '' : 's'} for MagicLib or Nexerelin loaded at startup` : ''} (merged by key into the game's settings)`, blocks: [], handRows: 0 }) }
      }
    }

    // ---- runtime JSON for SagaLib (quests, people, factions, ...) and its index
    if (needsLib) {
      for (const f of runtimeFiles(m, loaded, compiled, translatable || hasItemVersions(plain) ? textFile(m, ruleStrings) : null, modConds, { ...vctx, compile: (q) => compileQuest(q, copts), ruleStrings, movablePeople: new Set(plain.people.filter((p) => p.versions?.some((v) => Object.keys(v.set).some((k) => k.startsWith('placement')))).map((p) => p.id)) }, index)) {
        const old = existing(f.path)
        if (old === f.text) { files.push({ path: f.path, state: 'same', summary: 'unchanged', blocks: [], handRows: 0 }); continue }
        writes.push({ path: f.path, text: f.text, expectedHash: hashOf(f.path) })
        files.push({ path: f.path, state: old == null ? 'new' : 'changed', summary: f.summary, blocks: [], handRows: 0 })
      }
    }
    // runtime files of objects that were deleted
    for (const p of Object.keys(loaded.files)) {
      if (!p.startsWith('data/sagaforge/') || writes.some((w) => w.path === p) || files.some((f) => f.path === p)) continue
      if (/^data\/sagaforge\/(quests|people|systems|encounters|events|progress|dev)\//.test(p) || p === 'data/sagaforge/factions.json' || p === 'data/sagaforge/text.json' || p === MODS_JSON) {
        writes.push({ path: p, text: '', expectedHash: hashOf(p), remove: true })
        files.push({ path: p, state: 'removed', summary: 'no longer exported', blocks: [], handRows: 0 })
      }
    }
  }

  // ---- R31: "Export dialog only" still writes the dialog's texts (rules.csv now holds tokens)
  if (opts.dialogOnly && translatable) {
    const want = runtimeFiles(m, loaded, compiled, textFile(m, ruleStrings)).find((f) => f.path === TEXT_FILE)!
    const old = existing(TEXT_FILE)
    if (old !== want.text) { writes.push({ path: TEXT_FILE, text: want.text, expectedHash: hashOf(TEXT_FILE) }); files.push({ path: TEXT_FILE, state: old == null ? 'new' : 'changed', summary: want.summary, blocks: [], handRows: 0 }) }
    const idx = existing(CONTENT_CSV) ?? ''
    if (!idx.includes(`,strings,${TEXT_FILE},`)) {
      const eol = eolOf(idx)
      const text = (idx.trim() ? idx.replace(/\s*$/, eol) : `id,type,path,mod${eol}`) + `${want.id},strings,${TEXT_FILE},${loaded.modInfo.id}${eol}`
      writes.push({ path: CONTENT_CSV, text, expectedHash: hashOf(CONTENT_CSV) })
      files.push({ path: CONTENT_CSV, state: idx ? 'changed' : 'new', summary: 'lists the dialog texts for SagaLib', blocks: [], handRows: 0 })
    }
  }

  // ---- R32: Version Checker (a .version file in the mod's root, listed in version_files.csv), only
  // with a master version file address in Release details
  if (!opts.dialogOnly) {
    const vfile = versionFileName(loaded.modInfo.id)
    const text = versionFileText(loaded.modInfo, opts.version?.trim() || loaded.modInfo.version, m.project.release)
    if (text) {
      const old = existing(vfile)
      if (old !== text) { writes.push({ path: vfile, text, expectedHash: hashOf(vfile) }); files.push({ path: vfile, state: old == null ? 'new' : 'changed', summary: 'Version Checker file (upload it to the master address too)', blocks: [], handRows: 0 }) }
      else files.push({ path: vfile, state: 'same', summary: 'unchanged', blocks: [], handRows: 0 })
    }
    if (text || existing(VERSION_FILES_CSV)?.includes('sagaforge:begin')) {
      const old = existing(VERSION_FILES_CSV)
      const header = (old && headerOf(old)) || ['version file']
      blockFile(VERSION_FILES_CSV, header, text ? [{ key: 'version', rows: [csvLine([vfile])] }] : [], (k) => k === 'version', () => 'lists the .version file for Version Checker')
    }
  }

  // ---- mod_info.json: the SagaLib dependency, the required mods (#60), the mod's version, sortString
  const hasDep = loaded.modInfo.dependencies.some((d) => d.id === SAGALIB_ID)
  const dependencyMissing = needsLib && !hasDep
  const addDep = dependencyMissing && !!opts.addDependency && !opts.dialogOnly
  const newVersion = opts.version?.trim()
  const setVersion = !!newVersion && newVersion !== loaded.modInfo.version && !opts.dialogOnly
  const newGame = opts.gameVersion?.trim()
  const setGame = !!newGame && newGame !== loaded.modInfo.gameVersion && !opts.dialogOnly
  // SagaLib 1.1 features need SagaLib 1.1 (DESIGN-PHASE4.md): the dependency names the version
  const libVersion = needsLib && (needsSagaLib13(plain, modConds) || usesBountyCommands(exportableModel(model)) || hasVersions(plain)) ? '1.3.0' : needsLib && needsSagaLib12(m) ? '1.2.0' : needsLib && needsSagaLib11(m) ? '1.1.0' : null
  const depsNow = (() => { try { return (parseLooseObject(existing('mod_info.json') ?? '{}').value.dependencies as Record<string, unknown>[] | undefined) ?? [] } catch { return [] } })()
  const depNow = depsNow.find((d) => d?.id === SAGALIB_ID)
  const setLibVersion = !!libVersion && !opts.dialogOnly && (addDep || (!!depNow && String(depNow.version ?? '') !== libVersion && !(String(depNow.version ?? '') > libVersion)))
  // #60 (PLAN.md §10.1): required mods go into dependencies (asked, one click), with the minimum version when one is set
  const requiredMissing = requiredMods(m.project).filter((r) => {
    const d = depsNow.find((x) => x?.id === r.id)
    return !d || (!!depVersion(r.minVersion) && String(d.version ?? '') !== depVersion(r.minVersion))
  })
  const addRequired = requiredMissing.length > 0 && !!opts.addRequired && !opts.dialogOnly
  const wantSort = m.project.sortString?.trim()
  const setSort = !!wantSort && !opts.dialogOnly && (() => { try { return String(parseLooseObject(existing('mod_info.json') ?? '{}').value.sortString ?? '') !== wantSort } catch { return false } })()
  if (addDep || setVersion || setGame || setLibVersion || addRequired || setSort) {
    const path = 'mod_info.json'
    const old = existing(path) ?? '{}'
    try {
      const v = parseLooseObject(old).value
      const next: Record<string, unknown> = { ...v }
      const what: string[] = []
      let deps = Array.isArray(v.dependencies) ? [...(v.dependencies as Record<string, unknown>[])] : []
      if (addDep) {
        deps.push(libVersion ? { id: SAGALIB_ID, name: 'SagaLib', version: libVersion } : { id: SAGALIB_ID, name: 'SagaLib' })
        what.push(`adds the SagaLib dependency${libVersion ? ` (${libVersion})` : ''}`)
      } else if (setLibVersion) {
        deps = deps.map((d) => (d?.id === SAGALIB_ID ? { ...d, version: libVersion } : d))
        what.push(`needs SagaLib ${libVersion} (uses its new features)`)
      }
      if (addRequired) {
        for (const r of requiredMissing) {
          const ver = depVersion(r.minVersion)
          const entry = { id: r.id, name: r.name, ...(ver ? { version: ver } : {}) }
          const i = deps.findIndex((d) => d?.id === r.id)
          if (i >= 0) deps[i] = { ...deps[i], ...entry }
          else deps.push(entry)
        }
        what.push(`requires ${requiredMissing.map((r) => r.name + (depVersion(r.minVersion) ? ` ${depVersion(r.minVersion)}` : '')).join(', ')} (Saga › Mods)`)
      }
      if (addDep || setLibVersion || addRequired) next.dependencies = deps
      if (setVersion) { next.version = newVersion; what.push(`version ${loaded.modInfo.version || '(none)'} → ${newVersion}`) }
      if (setGame) { next.gameVersion = newGame; what.push(`gameVersion ${loaded.modInfo.gameVersion || '(none)'} → ${newGame} (the target)`) }
      if (setSort) { next.sortString = wantSort; what.push(`sortString "${wantSort}" (loads after the mods it changes)`) }
      writes.push({ path, text: updateLooseText(old, next), expectedHash: hashOf(path) })
      files.push({ path, state: 'changed', summary: what.join(' · '), blocks: [], handRows: 0 })
    } catch (e) {
      problems.push({ level: 'error', area: 'Export', message: `mod_info.json can't be read: ${(e as Error).message}`, file: path })
    }
  }

  // ---- project.json: what was exported (owned illustration keys, detached blocks)
  if (JSON.stringify(project.exported) !== JSON.stringify(m.project.exported)) {
    const path = 'sagaforge/project.json'
    writes.push({ path, text: JSON.stringify({ ...project, format: 1 }, null, 2) + '\n', expectedHash: hashOf(path) })
  }

  if (gameRules) problems.push(...takeoverProblems(Object.values(compiled).flatMap((c) => c.rows), gameRules, m.project.prefix, loaded.sourceId))
  return { files, writes, handEdited, usesSagaLib: needsLib, dependencyMissing, requiredMissing, modConds, problems, compiled }
}

function countHandRows(text: string): number {
  let n = 0
  let inBlock = false
  const recs = parseCsvRecords(text)
  for (const r of recs.slice(1)) {
    const f = r.raw[0] ?? ''
    if (/^#\s*sagaforge:begin/.test(f)) { inBlock = true; continue }
    if (/^#\s*sagaforge:end/.test(f)) { inBlock = false; continue }
    if (!inBlock && f.trim() && !f.startsWith('#')) n++
  }
  return n
}

/**
 * The FireBest takeover check on its own, for Check mod: the quests compiled as Export compiles
 * them, against every rule of the game and the other mods.
 */
export function modTakeoverProblems(model: ModModel, loaded: ProjectState, index: GameIndex, gameRules: RuleRow[]): Problem[] {
  const plain = exportableModel(withoutBountyOnly(model))
  const eff = effectiveConds(plain, index, loaded.sourceId)
  const m = versionContext(plain, eff).at([])
  const sagalib = usesSagaLib(m, loaded.modInfo) || usesModConds(eff, plain)
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  const lockedEntities = lockedEntityIds(m.quests)
  const itemKind = itemKindLookup(m.items, index.items ?? [])
  const rows = m.quests.flatMap((q) => compileQuest(q, { sagalib, phrases, sourceId: loaded.sourceId, itemKind, lockedEntities, pools: m.pools ?? [] }).rows)
  return takeoverProblems(rows, gameRules, m.project.prefix, loaded.sourceId)
}

/** Triggers the game fires with FireBest where a too-general rule replaces vanilla's dialog. */
const FIREBEST_TRIGGERS = new Set(['OpenCommLink', 'PickGreeting', 'OpenInteractionDialog', 'BeginFleetEncounter', 'DialogOptionSelected', 'TradePanelFlavorText', 'BarPrintDesc'])

/**
 * PLAN.md §6 rule 5: flag any exported rule whose trigger + conditions also match vanilla/mod
 * rules with a lower score, unless one of its conditions is about the mod's own content (prefix).
 */
export function takeoverProblems(rows: RuleRow[], gameRules: RuleRow[], prefix: string, ownSource: string): Problem[] {
  const out: Problem[] = []
  const byTrigger = new Map<string, RuleRow[]>()
  for (const r of gameRules) if (r.sourceId !== ownSource) byTrigger.set(r.trigger, [...(byTrigger.get(r.trigger) ?? []), r])
  for (const r of rows) {
    if (!FIREBEST_TRIGGERS.has(r.trigger)) continue
    const conds = parseConditions(r.conditions)
    // RC-F2, the third result: an interjection cuts into an existing answer on purpose, within its
    // limits; that its paths hand back is checked with the quest (checks/quests.ts)
    if (conds.some((c) => /^!\$\w+_interjected$/.test(c.raw.trim()))) {
      const opt = conds.find((c) => /^\$option == /.test(c.raw.trim()))?.raw.replace(/^\$option == /, '').trim()
      const limited = conds.some((c) => /RollProbability|_seen$/.test(c.raw))
      out.push({ level: limited ? 'info' : 'warning', area: 'FireBest', key: `interject:${r.id}`, message: `Rule ${r.id} is an interjection: it answers "${opt ?? '?'}" before its own rule${limited ? ', within its chance and once-limit' : ' every time it is picked (no chance or once-limit)'}, and hands back to it.`, ref: { page: 'quests', id: r.id.replace(/_start_go$/, '') } })
      continue
    }
    const scoped = conds.some((c) => c.raw.includes(prefix) || (c.kind === 'command' && c.name.startsWith('SF_')))
    if (scoped) continue
    const score = conds.reduce((a, c) => a + (c.kind === 'score' ? c.score : 1 + (c.score ?? 0)), 0)
    const beaten = (byTrigger.get(r.trigger) ?? []).filter((o) => {
      const oc = parseConditions(o.conditions)
      const os = oc.reduce((a, c) => a + (c.kind === 'score' ? c.score : 1 + (c.score ?? 0)), 0)
      // o's conditions are all also in r (so wherever r matches, o may match too), and r scores higher
      return os < score && oc.every((c) => c.kind === 'score' || conds.some((x) => x.raw === c.raw))
    })
    if (beaten.length) {
      out.push({
        level: 'warning', area: 'FireBest', key: `takeover:${r.id}`,
        message: `Rule ${r.id} (${r.trigger}) would replace ${beaten.length} other rule${beaten.length === 1 ? '' : 's'} everywhere they apply (e.g. ${beaten.slice(0, 3).map((b) => `${b.id} from ${b.sourceId === 'starsector-core' ? 'vanilla' : b.sourceId}`).join(', ')}). Add a condition about your own content (a person, entity or flag with your prefix).`,
        ref: { page: 'quests', id: r.id.split('_').slice(0, 3).join('_') }
      })
    }
  }
  return out
}

/** #64: items or descriptions with versions (their texts go into text.json, set at startup from the installed mods). */
export const hasItemVersions = (m: ModModel): boolean => m.items.some((i) => !!i.versions?.length) || Object.values(m.descriptions).some((d) => !!d.versions?.length)

export { blockHash }
void lines
