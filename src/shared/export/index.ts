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
import { updateLooseText, serialize } from '../jsonedit'
import { parseLooseObject } from '../loosejson'
import { parseConditions } from '../rules/parse'
import { runtimeFiles } from './runtime'

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
  return m.quests.some((q) => q.kind === 'quest') || m.people.length > 0 || m.systems.length > 0 || m.encounters.length > 0 ||
    Object.keys(m.factionsRuntime.relations).length > 0 || Object.keys(m.factionsRuntime.scripted).length > 0 ||
    info.dependencies.some((d) => d.id === SAGALIB_ID)
}

export function planExport(m: ModModel, loaded: ProjectState, index: GameIndex, gameRules: RuleRow[] | null, opts: ExportOptions = {}): ExportPlan {
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

  const sagalib = usesSagaLib(m, loaded.modInfo)
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases)]
  const compiled: Record<string, CompiledQuest> = {}
  let needsLib = sagalib
  for (const q of m.quests) {
    compiled[q.id] = compileQuest(q, { sagalib, phrases, sourceId: loaded.sourceId, itemKind: itemKindLookup(m.items, index.items ?? []) })
    if (compiled[q.id].usesSagaLib) needsLib = true
  }

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
    const blocks = m.quests.map((q) => ({ key: `quest=${q.id}`, rows: compiled[q.id].rows.map((r) => csvLine(header.map((h) => cell(r, h)))) }))
    blockFile(path, header, blocks, (k) => k.startsWith('quest='), (n) => `${n} rule${n === 1 ? '' : 's'} in ${blocks.length} owned block${blocks.length === 1 ? '' : 's'}`)
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

    // ---- settings.json: the mod's own illustrations (merged by key into the game's)
    {
      const path = 'data/config/settings.json'
      const want = m.project.illustrations ?? {}
      const before = (project.exported.illustrations ?? '').split(',').filter(Boolean)
      if (Object.keys(want).length || before.length) {
        const old = existing(path)
        let value: Record<string, unknown> = {}
        try { value = old ? parseLooseObject(old).value : {} } catch { problems.push({ level: 'error', area: 'Export', message: `${path} can't be read, so illustrations can't be added. Fix the file by hand.`, file: path }) }
        const graphics = { ...((value.graphics as Record<string, unknown>) ?? {}) }
        const ill = { ...((graphics.illustrations as Record<string, unknown>) ?? {}) }
        for (const k of before) if (!(k in want)) delete ill[k]
        for (const [k, p] of Object.entries(want)) ill[k] = p
        graphics.illustrations = ill
        const next = { ...value, graphics }
        const text = old ? updateLooseText(old, next) : serialize(next, '', { unit: '\t', eol: '\n' }) + '\n'
        project.exported.illustrations = Object.keys(want).sort().join(',')
        if (text !== old) { writes.push({ path, text, expectedHash: hashOf(path) }); files.push({ path, state: old ? 'changed' : 'new', summary: `${Object.keys(want).length} illustration key${Object.keys(want).length === 1 ? '' : 's'} (merged by key into the game's settings)`, blocks: [], handRows: 0 }) }
      }
    }

    // ---- runtime JSON for SagaLib (quests, people, factions, ...) and its index
    if (needsLib) {
      for (const f of runtimeFiles(m, loaded, compiled)) {
        const old = existing(f.path)
        if (old === f.text) { files.push({ path: f.path, state: 'same', summary: 'unchanged', blocks: [], handRows: 0 }); continue }
        writes.push({ path: f.path, text: f.text, expectedHash: hashOf(f.path) })
        files.push({ path: f.path, state: old == null ? 'new' : 'changed', summary: f.summary, blocks: [], handRows: 0 })
      }
    }
    // runtime files of objects that were deleted
    for (const p of Object.keys(loaded.files)) {
      if (!p.startsWith('data/sagaforge/') || writes.some((w) => w.path === p) || files.some((f) => f.path === p)) continue
      if (/^data\/sagaforge\/(quests|people|systems|encounters|dev)\//.test(p) || p === 'data/sagaforge/factions.json') {
        writes.push({ path: p, text: '', expectedHash: hashOf(p), remove: true })
        files.push({ path: p, state: 'removed', summary: 'no longer exported', blocks: [], handRows: 0 })
      }
    }
  }

  // ---- mod_info.json: the SagaLib dependency
  const hasDep = loaded.modInfo.dependencies.some((d) => d.id === SAGALIB_ID)
  const dependencyMissing = needsLib && !hasDep
  if (dependencyMissing && opts.addDependency && !opts.dialogOnly) {
    const path = 'mod_info.json'
    const old = existing(path) ?? '{}'
    try {
      const v = parseLooseObject(old).value
      const deps = Array.isArray(v.dependencies) ? [...v.dependencies] : []
      deps.push({ id: SAGALIB_ID, name: 'SagaLib' })
      const text = updateLooseText(old, { ...v, dependencies: deps })
      writes.push({ path, text, expectedHash: hashOf(path) })
      files.push({ path, state: 'changed', summary: 'adds the SagaLib dependency', blocks: [], handRows: 0 })
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
  return { files, writes, handEdited, usesSagaLib: needsLib, dependencyMissing, problems, compiled }
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

export { blockHash }
void lines
