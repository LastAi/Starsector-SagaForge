/**
 * #77 (PLAN.md §10.8, "Vaults of Knowledge: research"): AoTD Vaults of Knowledge's research for the
 * mod's own content. Facts: FORMATS.md "AoTD - Vaults of Knowledge 5.0.7". Pure.
 *
 * - Saga › Research: the mod's own techs, rows of data/campaign/aotd_tech_options.csv (VoK merges the
 *   file across mods by `id`; each mod's techs are a tree of their own, named after the mod by `modId`).
 * - Factions › Research: the research stance of the mod's own factions, rows of
 *   data/campaign/aotd_faction_behaviour.csv (merged by `factionId`).
 * Both are owned blocks: hand-written rows stay. A hand-written row taken into the editor ("Edit in
 * Saga Forge") is removed from the hand-written part by the next export, which writes it in the block.
 *
 * "Unlocked by a quest" is VoK's `otherReq` (`$key:Shown text`, a global memory flag VoK checks), so a
 * quest makes a tech researchable with a plain rule line. Granting a tech or asking whether one is
 * researched is Java only: SagaLib's VoK bridge (SF_GrantResearch, SF_HasResearch).
 */
import type { ModModel } from './serialize'
import type { QuestPlan } from './model'
import { parseCsvRecords } from './csvedit'
import { findBlocks, outsideBlocks } from './export/blocks'
import { parseCsv, csvObjects } from './csv'

export const VOK_ID = 'aotd_vok'
export const VOK_NAME = 'AoTD- Vaults of Knowledge'
export const VOK_TECHS_CSV = 'data/campaign/aotd_tech_options.csv'
export const VOK_FACTIONS_CSV = 'data/campaign/aotd_faction_behaviour.csv'
/** VoK's column order (5.0.7). `tags` isn't read by 5.0.7's loader; kept for hand-written values. */
export const VOK_TECH_HEADER = ['id', 'name', 'tier', 'timeToResearch', 'reqToResearchFirst', 'itemReqToResearch', 'iconId', 'rewards', 'columnNumber', 'rowNumber', 'isResearchedFromStart', 'otherReq', 'tags', 'modId']
export const VOK_FACTION_HEADER = ['factionId', 'researchStance', 'forbidden_tech', 'db_cash_mult', 'db_rep_mult', 'initResponse', 'dialogSelectOptionName', 'dialogDismayOptionName', 'responseAfter']
/** The settings.json "graphics" category VoK draws tech icons from (iconId = a key there). */
export const VOK_ICON_CATEGORY = 'ui_icons_tech_tree'
/** The plan file: {format, techs, factions}. */
export const RESEARCH_PLAN = 'sagaforge/research.json'

/** The stances VoK's own factions use (AoTDAIStance; any other name is DEFAULT, which takes no databanks). */
export const VOK_STANCES = ['MERCENARY', 'PRIORITIZE', 'BALANCE', 'RESTRICTIVE', 'CLEANSE'] as const
export const STANCE_HELP: Record<string, string> = {
  MERCENARY: 'Trades for anything (VoK: independents, pirates).',
  PRIORITIZE: 'Puts research first and pays the most for databanks (VoK: Tri-Tachyon).',
  BALANCE: 'Researches alongside everything else (VoK: Hegemony, Sindrian Diktat, Persean League).',
  RESTRICTIVE: 'Wary of old technology (VoK: Luddic Church).',
  CLEANSE: 'Wants old technology gone (VoK: Luddic Path).'
}
/** VoK's tiers (ResearchOptionEra by number); 5 is the experimental tier. */
export const VOK_TIERS: { n: number; label: string }[] = [
  { n: 0, label: '0 · basic (researched at once)' }, { n: 1, label: '1' }, { n: 2, label: '2' }, { n: 3, label: '3' }, { n: 4, label: '4' }, { n: 5, label: '5 · experimental' }
]
/** VoK's reward types (ResearchRewardType); a `modifier` is only text, its effect is coded per tech. */
export const VOK_REWARD_TYPES = ['industry', 'ship', 'weapon', 'hullmod', 'special_ability', 'modifier'] as const
export type ResearchRewardType = (typeof VOK_REWARD_TYPES)[number]
export const REWARD_LABEL: Record<ResearchRewardType, string> = { industry: 'industry', ship: 'ship', weapon: 'weapon', hullmod: 'hullmod', special_ability: 'ability', modifier: 'modifier (text only)' }

/** One of the mod's techs (a row of aotd_tech_options.csv). */
export interface ResearchTech {
  /** Prefixed; unique across every mod (VoK merges every mod's techs by id). */
  id: string
  name: string
  /** 0–5 (5 = experimental). */
  tier: number
  /** Days to research (timeToResearch). */
  days: number
  /** Techs researched first: VoK's, another mod's or this mod's (reqToResearchFirst; empty = none). */
  requires: string[]
  /** Paid when research starts: commodities or special items (itemReqToResearch). */
  items: { id: string; qty: number }[]
  /** What the tech unlocks (rewards; a modifier is only a text line). */
  rewards: { type: ResearchRewardType; value: string }[]
  /** Position in the mod's tree. */
  column: number
  row: number
  /** An image in the mod (listed under settings.json graphics.ui_icons_tech_tree as the tech's id), or an existing icon id (VoK's "farming1"). */
  icon?: string
  /** Researched from the start (isResearchedFromStart). */
  fromStart?: boolean
  /** Unlocked by a quest: VoK shows `text` until a quest's "Unlock research" sets the tech's flag (otherReq). */
  quest?: { text: string }
  /** Kept as is (5.0.7 doesn't read it). */
  tags?: string
  notes?: string
}

/** A faction's research stance (a row of aotd_faction_behaviour.csv). */
export interface FactionResearch {
  stance: string
  /** Techs the faction won't research (forbidden_tech). */
  forbidden: string[]
  /** Databank price and reputation multipliers (db_cash_mult, db_rep_mult). */
  cashMult: number
  repMult: number
  /** The dialog lines; empty = VoK's default line. */
  initResponse?: string
  selectOption?: string
  dismayOption?: string
  responseAfter?: string
}

export interface ResearchPlan {
  techs: ResearchTech[]
  /** The mod's own factions (additions) by id. */
  factions: Record<string, FactionResearch>
}

export const emptyResearch = (): ResearchPlan => ({ techs: [], factions: {} })
export const newFactionResearch = (): FactionResearch => ({ stance: 'BALANCE', forbidden: [], cashMult: 1, repMult: 1 })
export const hasResearch = (r: ResearchPlan | undefined): boolean => !!r && (r.techs.length > 0 || Object.keys(r.factions).length > 0)

/**
 * The global flag a quest's "Unlock research" sets for a tech unlocked by a quest, as a rules key
 * (`$global.<tech>_unlocked`). VoK checks it as `$<tech>_unlocked` in the sector's memory.
 */
export const unlockFlag = (techId: string): string => `$global.${techId}_unlocked`
/** VoK's form of the flag (otherReq's key: the sector memory key). */
export const unlockMemKey = (techId: string): string => `$${techId}_unlocked`

/** The settings.json key of a tech's icon: an image of the mod is listed under the tech's id; an existing icon id is used as is. */
export const isIconPath = (icon: string | undefined): boolean => !!icon && /[/\\]|\.(png|jpe?g)$/i.test(icon)
export const iconIdOf = (t: ResearchTech): string => (!t.icon ? '' : isIconPath(t.icon) ? t.id : t.icon)

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d }
const int = (v: unknown, d = 0): number => Math.round(num(v, d))
/** A multiplier as VoK's own file writes it: no trailing zeros ("0.2", "1"). */
const mult = (n: number): string => String(Math.round(n * 10000) / 10000)

// ---------------------------------------------------------------- export

export function techRow(t: ResearchTech, modId: string): Record<string, string> {
  return {
    id: t.id,
    name: t.name,
    tier: String(int(t.tier)),
    timeToResearch: String(Math.max(0, int(t.days))),
    // VoK splits on ","; an empty cell would make "" a prerequisite, so no prerequisite is "none"
    reqToResearchFirst: t.requires.filter(Boolean).join(',') || 'none',
    itemReqToResearch: t.items.filter((i) => i.id && i.qty > 0).map((i) => `${i.id}:${int(i.qty)}`).join(','),
    iconId: iconIdOf(t),
    rewards: rewardsCell(t),
    columnNumber: String(Math.max(0, int(t.column))),
    rowNumber: String(Math.max(0, int(t.row))),
    isResearchedFromStart: t.fromStart ? 'true' : 'false',
    otherReq: t.quest ? `${unlockMemKey(t.id)}:${questText(t.quest.text)}` : '',
    tags: t.tags ?? '',
    modId
  }
}

/**
 * The rewards cell: `value:type` lines. VoK splits each line on ":" and takes the first two parts, so a
 * colon in a modifier's text would change its type; and it can't load a tech with no line at all (its
 * reader fails on the empty line), so a tech without rewards gets its name as a modifier line.
 */
export function rewardsCell(t: Pick<ResearchTech, 'name' | 'id' | 'rewards'>): string {
  const lines = t.rewards.filter((r) => r.value.trim()).map((r) => `${r.type === 'modifier' ? noColon(r.value.trim()) : r.value.trim()}:${r.type}`)
  return (lines.length ? lines : [`${noColon(t.name.trim() || t.id)}:modifier`]).join('\n')
}
/** A text VoK splits on ":" without its colons ("Test 77: x" → "Test 77 - x"). */
export const noColon = (s: string): string => s.replace(/\s*:\s*/g, ' - ')

/** otherReq's text: VoK splits on ":" and needs exactly two parts, so a colon in the text drops the requirement. */
export const questText = (s: string): string => noColon(s.trim() || 'Unlocked by a quest.')

export function factionRow(id: string, f: FactionResearch): Record<string, string> {
  return {
    factionId: id,
    researchStance: f.stance,
    forbidden_tech: f.forbidden.filter(Boolean).join(','),
    db_cash_mult: mult(num(f.cashMult, 1)),
    db_rep_mult: mult(num(f.repMult, 1)),
    initResponse: f.initResponse ?? '',
    dialogSelectOptionName: f.selectOption ?? '',
    dialogDismayOptionName: f.dismayOption ?? '',
    responseAfter: f.responseAfter ?? ''
  }
}

/** The mod's own factions (additions) that have a research row, in the model's order. */
export function researchFactions(m: Pick<ModModel, 'factions' | 'research'>): string[] {
  const r = m.research?.factions ?? {}
  return m.factions.filter((f) => f.kind === 'addition' && !!r[f.id]).map((f) => f.id)
}

/** settings.json graphics.ui_icons_tech_tree entries for the techs' own images (key = tech id). */
export function techIcons(m: Pick<ModModel, 'research'>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of m.research?.techs ?? []) if (t.id && isIconPath(t.icon)) out[t.id] = t.icon!.replace(/\\/g, '/')
  return out
}

// ---------------------------------------------------------------- hand-written rows

export interface HandRow { key: string; row: Record<string, string> }

/** Rows of a CSV outside Saga Forge's blocks (written by hand): key column → the row. Comment rows are skipped. */
export function handRows(text: string | undefined, keyCol: string): HandRow[] {
  if (!text) return []
  let t: ReturnType<typeof parseCsv>
  try { t = parseCsv(outsideBlocks(text)) } catch { return [] }
  return csvObjects(t).map((r) => ({ key: (r[keyCol] ?? '').trim(), row: r })).filter((r) => r.key && !r.key.startsWith('#'))
}

/** A hand-written tech row read into the editor. */
export function techFromRow(r: Record<string, string>): ResearchTech {
  const list = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'none')
  const other = (r.otherReq ?? '').trim()
  const t: ResearchTech = {
    id: (r.id ?? '').trim(),
    name: (r.name ?? '').trim(),
    tier: int(r.tier),
    days: int(r.timeToResearch, 30),
    requires: list(r.reqToResearchFirst),
    // as VoK: an entry without exactly one ":" is skipped (VoK 5.0.7's own file has "research_databank10")
    items: list(r.itemReqToResearch).map((x) => x.split(':')).filter((p) => p.length === 2 && p[0].trim()).map(([id, q]) => ({ id: id.trim(), qty: int(q, 1) })),
    rewards: (r.rewards ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.lastIndexOf(':')
      const type = (i >= 0 ? l.slice(i + 1).trim().toLowerCase() : 'modifier') as ResearchRewardType
      return { type: VOK_REWARD_TYPES.includes(type) ? type : 'modifier', value: i >= 0 ? l.slice(0, i).trim() : l }
    }),
    column: int(r.columnNumber),
    row: int(r.rowNumber),
    ...(r.iconId?.trim() ? { icon: r.iconId.trim() } : {}),
    ...((r.isResearchedFromStart ?? '').trim().toLowerCase() === 'true' ? { fromStart: true } : {}),
    ...(r.tags?.trim() ? { tags: r.tags.trim() } : {})
  }
  // a quest unlock in the editor's own form becomes "unlocked by a quest"; another key is kept as a note
  const m = /^\$([^:]+):(.*)$/.exec(other)
  if (m && `$${m[1]}` === unlockMemKey(t.id)) t.quest = { text: m[2].trim() }
  else if (other) t.notes = `Hand-written otherReq "${other}": not kept (VoK only knows the editor's "unlocked by a quest" form here).`
  return t
}

export function factionFromRow(r: Record<string, string>): FactionResearch {
  const s = (k: string) => { const v = (r[k] ?? '').trim(); return v || undefined }
  return {
    stance: (r.researchStance ?? '').trim().toUpperCase() || 'BALANCE',
    forbidden: (r.forbidden_tech ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    cashMult: num(r.db_cash_mult, 1),
    repMult: num(r.db_rep_mult, 1),
    ...(s('initResponse') ? { initResponse: s('initResponse') } : {}),
    ...(s('dialogSelectOptionName') ? { selectOption: s('dialogSelectOptionName') } : {}),
    ...(s('dialogDismayOptionName') ? { dismayOption: s('dialogDismayOptionName') } : {}),
    ...(s('responseAfter') ? { responseAfter: s('responseAfter') } : {})
  }
}

/**
 * The text with hand-written rows whose key is in `keys` removed (rows outside blocks only): an
 * export that writes them in its block takes them over, so the file never has the same key twice.
 */
export function withoutHandRows(text: string, keyCol: string, keys: Set<string>): { text: string; removed: string[] } {
  if (!keys.size) return { text, removed: [] }
  const recs = parseCsvRecords(text)
  const head = recs.findIndex((r) => r.fields.some((f) => f.trim()))
  if (head < 0) return { text, removed: [] }
  const col = recs[head].fields.map((f) => f.trim().replace(/^﻿/, '')).indexOf(keyCol)
  if (col < 0) return { text, removed: [] }
  const blocks = findBlocks(text)
  const inBlock = (pos: number) => blocks.some((b) => pos >= b.start && pos < b.end)
  const cut: { start: number; end: number }[] = []
  const removed: string[] = []
  for (const r of recs.slice(head + 1)) {
    const k = (r.fields[col] ?? '').trim()
    if (!k || !keys.has(k) || inBlock(r.start)) continue
    let end = r.end
    if (text.startsWith('\r\n', end)) end += 2
    else if (text[end] === '\n') end += 1
    cut.push({ start: r.start, end })
    removed.push(k)
  }
  let out = text
  for (const c of cut.reverse()) out = out.slice(0, c.start) + out.slice(c.end)
  return { text: out, removed: removed.reverse() }
}

/**
 * Techs to pick from (prerequisites, grants, forbidden techs): the mod's own (Saga › Research), then
 * every installed mod's (VoK's first), without the mod's own ids twice. `where` = the tree (mod id).
 */
export function techChoices(m: Pick<ModModel, 'research'>, index: { researchTechs?: { id: string; name: string; modId: string; definedBy: string; tier: number }[] } | null | undefined): { id: string; name: string; where: string; definedBy?: string }[] {
  const own = m.research?.techs ?? []
  const ids = new Set(own.map((t) => t.id))
  // #60: the installed mods' techs keep their definedBy for the pickers' filter (the mod's own have none)
  const out: { id: string; name: string; where: string; definedBy?: string }[] = own.map((t) => ({ id: t.id, name: `${t.name || t.id} (this mod, tier ${t.tier})`, where: 'this mod' }))
  const others = (index?.researchTechs ?? []).filter((t) => !ids.has(t.id))
  others.sort((a, b) => (a.definedBy === VOK_ID ? 0 : 1) - (b.definedBy === VOK_ID ? 0 : 1))
  for (const t of others) out.push({ id: t.id, name: `${t.name} (${t.definedBy === VOK_ID ? 'VoK' : t.definedBy}, tier ${t.tier})`, where: t.definedBy, definedBy: t.definedBy })
  return out
}

// ---------------------------------------------------------------- quests

/** The research a quest unlocks (Unlock research), grants (Grant research, End nodes) or tests (SF_HasResearch). */
export function researchOf(q: QuestPlan): { unlocks: string[]; grants: string[]; tests: string[] } {
  const unlocks: string[] = [], grants: string[] = [], tests: string[] = []
  const line = (l: string) => {
    const g = /^\s*SF_GrantResearch\s+(\S+)/.exec(l)
    if (g) grants.push(g[1])
    const h = /^\s*!?SF_HasResearch\s+(\S+)/.exec(l)
    if (h) tests.push(h[1])
  }
  for (const n of q.nodes) {
    if (n.type === 'action') for (const o of n.ops) {
      if (o.op === 'unlockResearch' && o.tech) unlocks.push(o.tech)
      else if (o.op === 'grantResearch' && o.tech) grants.push(o.tech)
      else if (o.op === 'line') line(o.line)
    }
    if (n.type === 'end') for (const t of n.research ?? []) if (t) grants.push(t)
    if (n.type === 'dialog') { for (const l of [...n.script, ...n.conditions]) line(l); for (const o of n.options) for (const l of [...(o.showIf ?? []), ...(o.disabledIf ?? [])]) line(l) }
    if (n.type === 'branch') for (const c of n.cases) for (const l of c.conditions) line(l)
  }
  for (const r of q.requires) if (!('quest' in r)) line(r.flag)
  return { unlocks: [...new Set(unlocks)], grants: [...new Set(grants)], tests: [...new Set(tests)] }
}

/** The mod uses SagaLib's VoK bridge (SagaLib 1.4: SF_GrantResearch / SF_HasResearch). */
export function usesResearchCommands(m: Pick<ModModel, 'quests'>): boolean {
  return m.quests.some((q) => !q.inactive && (() => { const r = researchOf(q); return r.grants.length > 0 || r.tests.length > 0 })())
}

/** The mod has VoK content: techs, faction stances, or quests that unlock, grant or test research. */
export function usesVok(m: Pick<ModModel, 'quests' | 'research'>): boolean {
  return hasResearch(m.research) || m.quests.some((q) => { const r = researchOf(q); return r.unlocks.length + r.grants.length + r.tests.length > 0 })
}
