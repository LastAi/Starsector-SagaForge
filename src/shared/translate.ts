/**
 * Translations (Phase 8c, R31; DESIGN-PHASE8.md "8c"). A translation is a small mod of its own:
 * one CSV of translated texts that SagaLib applies at runtime, next to the original mod, which is
 * never copied or changed. This file has the pure parts: the mod's strings file, which texts of
 * its runtime files a translator gets (only what the player reads), the CSV, and the state and
 * checks of each line.
 */
import type { ModModel } from './serialize'
import type { RuleStrings } from './export/texttokens'
import { descriptionRows } from './export/items'
import { csvLine } from './export/blocks'
import { parseCsvRecords } from './csvedit'
import { fingerprint, textLeaves } from './textkeys'

export const TEXT_FILE = 'data/sagaforge/text.json'
export const TRANSLATION_HEADER = ['key', 'context', 'original', 'translation', 'source']
export const TRANSLATION_DIR = 'data/sagaforge/translations'

/** Dialog is exported as tokens when the mod uses SagaLib, unless the modder switched it off. */
export const translatable = (m: ModModel, usesSagaLib: boolean) => usesSagaLib && m.project.options?.translatable !== false

/** The mod's strings file: the dialog texts the tokens stand for, and the names and descriptions of its CSV and faction files. */
export function textFile(m: ModModel, rules: RuleStrings): Record<string, unknown> {
  const items: Record<string, Record<string, string>> = {}
  for (const it of m.items) {
    const f: Record<string, string> = {}
    if (it.name.trim()) f.name = it.name
    if (it.kind === 'special' && it.description?.trim()) f.desc = it.description
    if (Object.keys(f).length) items[it.id] = f
  }
  const descriptions: Record<string, Record<string, string>> = {}
  for (const d of descriptionRows(m.descriptions, m.items)) {
    const f: Record<string, string> = { text1: d.text1 }
    if (d.text2?.trim()) f.text2 = d.text2
    if (d.text3?.trim()) f.text3 = d.text3
    descriptions[`${d.id}|${d.type}`] = f
  }
  const factions: Record<string, Record<string, string>> = {}
  for (const fa of m.factions) {
    const f: Record<string, string> = {}
    // an addition's own names, or the names an override changes
    const src = fa.kind === 'addition' ? fa.raw : fa.patch.set
    for (const k of ['displayName', 'displayNameWithArticle']) if (typeof src[k] === 'string' && (src[k] as string).trim()) f[k] = src[k] as string
    if (Object.keys(f).length) factions[fa.id] = f
  }
  return { format: 1, rules, ...(Object.keys(items).length ? { items } : {}), ...(Object.keys(descriptions).length ? { descriptions } : {}), ...(Object.keys(factions).length ? { factions } : {}) }
}

// ---------------------------------------------------------------- what a translator gets

/** The texts the player reads, per runtime file type (the path after "<content id>/"). */
const VISIBLE: Record<string, RegExp[]> = {
  quest: [/^title$/, /^stages\[[^\]]+\]\.(title|journal|nextStep)$/, /^start\.(offerText|optionText)$/, /phrases\[[^\]]+\]\.(cases\[\d+\]\.text|otherwise)$/],
  people: [/^people\[[^\]]+\]\.(name\.first|name\.last|description)$/, /phrases\[[^\]]+\]\.(cases\[\d+\]\.text|otherwise)$/],
  system: [/^name$/, /^entities\[[^\]]+\]\.(name|market\.name)$/],
  encounter: [/^fleet\.name$/],
  scatter: [/^entity\.name$/],
  events: [/^entries\[[^\]]+\]\.news\.(title|text)$/],
  progress: [/^name$/, /^stages\[[^\]]+\]\.(title|text)$/, /^factors\[[^\]]+\]\.desc$/],
  strings: [/^rules\./, /^items\./, /^descriptions\./, /^factions\./]
}

export interface TranslationEntry { key: string; context: string; original: string; source: string }

/** A runtime file as read from a mod: its content.csv id and type, and its JSON. */
export interface RuntimeText { id: string; type: string; json: unknown }

/** Every text of a mod a translator gets, in file order. */
export function translationEntries(files: RuntimeText[]): TranslationEntry[] {
  const out: TranslationEntry[] = []
  for (const f of files) {
    const pats = VISIBLE[f.type]
    if (!pats) continue
    const existing = f.type === 'system' && (f.json as { kind?: string })?.kind === 'existing'
    for (const [key, text] of Object.entries(textLeaves(f.id, f.json))) {
      if (!text.trim()) continue
      const path = key.slice(f.id.length + 1)
      if (!pats.some((p) => p.test(path))) continue
      if (existing && path === 'name') continue // a vanilla system's own name
      out.push({ key, context: contextOf(f.type, f.id, path), original: text, source: fingerprint(text) })
    }
  }
  return out
}

const PART: Record<string, string> = { t: 'text', bar_o: 'bar scene option', bar_b: 'bar scene description' }

/** Where a text shows, for the translator. */
export function contextOf(type: string, id: string, path: string): string {
  const seg = (p: string) => p.replace(/\[([^\]]+)\]/g, ' $1').replace(/\./g, ' › ')
  if (type === 'strings') {
    const m = /^rules\.([^.]+)\.(.+)$/.exec(path)
    if (m) {
      const p = m[2]
      const what = PART[p] ?? (/^t\d+$/.test(p) ? `text (variant ${p.slice(1)})` : p.startsWith('o_') ? `option "${p.slice(2)}"` : p.startsWith('tip_') ? `tooltip of option "${p.slice(4)}"`
        : /^a\d+$/.test(p) ? `added text ${p.slice(1)}` : /^h\d+$/.test(p) ? `highlighted words ${p.slice(1)} (must appear in the text)` : /^raid\d+$/.test(p) ? 'raid objective'
        : p.startsWith('g_raidtip') ? 'raid objective tooltip' : p.startsWith('g_story_') ? 'story point log text' : p)
      return `Dialog ${m[1]} › ${what}`
    }
    const n = /^(items|descriptions|factions)\.(.+)\.([^.]+)$/.exec(path)
    if (n) return `${n[1] === 'items' ? 'Item' : n[1] === 'descriptions' ? 'Description' : 'Faction'} ${n[2]} › ${n[3]}`
  }
  const kind: Record<string, string> = { quest: 'Quest', people: 'People', system: 'Location', encounter: 'Encounter', scatter: 'Scatter', events: 'World events', progress: 'Progress event' }
  return `${kind[type] ?? type} ${id} › ${seg(path)}`
}

// ---------------------------------------------------------------- the translation CSV

export interface TranslationLine { key: string; context: string; original: string; translation: string; source: string }

export function parseTranslationCsv(text: string): TranslationLine[] {
  const recs = parseCsvRecords(text)
  if (!recs.length) return []
  const head = recs[0].fields.map((f) => f.trim())
  const at = (r: string[], k: string) => { const i = head.indexOf(k); return i < 0 ? '' : r[i] ?? '' }
  return recs.slice(1).map((r) => ({ key: at(r.fields, 'key').trim(), context: at(r.fields, 'context'), original: at(r.fields, 'original'), translation: at(r.fields, 'translation'), source: at(r.fields, 'source').trim() }))
    .filter((l) => l.key && !l.key.startsWith('#'))
}

export function translationCsv(lines: TranslationLine[]): string {
  return [TRANSLATION_HEADER.join(','), ...lines.map((l) => csvLine([l.key, l.context, l.original, l.translation, l.source]))].join('\n') + '\n'
}

export type LineState = 'done' | 'todo' | 'stale' | 'gone'

export interface MergedLine extends TranslationLine {
  state: LineState
  /** The original the translation was made for, when it changed since (stale). */
  wasOriginal?: string
}

/**
 * The translation's lines against the mod's current texts: every current text once (new ones
 * empty), translated lines whose original changed are stale (kept, for the translator to update),
 * and lines whose text is gone from the mod stay at the end as "gone".
 */
export function mergeTranslation(entries: TranslationEntry[], lines: TranslationLine[]): MergedLine[] {
  const byKey = new Map(lines.map((l) => [l.key, l]))
  const out: MergedLine[] = entries.map((e) => {
    const l = byKey.get(e.key)
    if (!l || !l.translation.trim()) return { ...e, translation: l?.translation ?? '', state: 'todo' }
    if (l.source && l.source !== e.source) return { ...e, translation: l.translation, source: l.source, state: 'stale', wasOriginal: l.original }
    return { ...e, translation: l.translation, state: 'done' }
  })
  const keys = new Set(entries.map((e) => e.key))
  for (const l of lines) if (!keys.has(l.key) && l.translation.trim()) out.push({ ...l, state: 'gone' })
  return out
}

/** A stale line the translator checked: it now belongs to the current original. */
export const confirmLine = (l: MergedLine): MergedLine => ({ ...l, source: fingerprint(l.original), state: l.translation.trim() ? 'done' : 'todo', wasOriginal: undefined })

/** The lines to save: current ones with the fingerprint they were made for ("gone" ones are dropped). */
export function linesToSave(merged: MergedLine[]): TranslationLine[] {
  return merged.filter((l) => l.state !== 'gone').map((l) => ({ key: l.key, context: l.context, original: l.original, translation: l.translation, source: l.state === 'stale' ? l.source : fingerprint(l.original) }))
}

/** Tokens ($playerName, phrase tokens) a text uses. */
const tokensOf = (s: string) => new Set(s.match(/\$[A-Za-z_][\w.]*/g) ?? [])

/** What's wrong with one translated line (warnings; a translation never blocks anything). */
export function lineProblems(l: TranslationLine): string[] {
  const out: string[] = []
  if (!l.translation.trim()) return out
  const missing = [...tokensOf(l.original)].filter((t) => !tokensOf(l.translation).has(t))
  if (missing.length) out.push(`Leaves out ${missing.join(', ')}: the game puts in a name or phrase there.`)
  const extra = [...tokensOf(l.translation)].filter((t) => !tokensOf(l.original).has(t))
  if (extra.length) out.push(`Uses ${extra.join(', ')}, which the original doesn't: check the spelling.`)
  const short = /› (option|tooltip|bar scene option|raid objective)|nextStep|› name$|first$|last$/.test(l.context)
  if (short && l.translation.length > Math.max(l.original.length * 1.6, l.original.length + 12)) out.push('Much longer than the original: it may be cut off in game.')
  if (/^\s|\s$/.test(l.translation) && !/^\s|\s$/.test(l.original)) out.push('Starts or ends with a space.')
  if (l.original.includes('\n\n') && !l.translation.includes('\n\n')) out.push('The original has paragraphs (blank lines); the translation has none.')
  return out
}

/** The translation this mod ships (its content.csv row of type "translation"), or null. */
export function translationOf(contentCsv: string | undefined, modId: string): { target: string; language: string; path: string } | null {
  if (!contentCsv) return null
  const recs = parseCsvRecords(contentCsv)
  const head = recs[0]?.fields.map((f) => f.trim()) ?? []
  const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim()
  for (const r of recs.slice(1)) {
    if (col(r.fields, 'type') !== 'translation' || col(r.fields, 'mod') !== modId) continue
    const id = col(r.fields, 'id')
    const slash = id.indexOf('/')
    if (slash > 0) return { target: id.slice(0, slash), language: id.slice(slash + 1), path: col(r.fields, 'path') }
  }
  return null
}

/**
 * Problems between lines (warnings): a highlight must appear in its rule's text as translated
 * (SetTextHighlights matches exact words; seen in game, test 8c-2). Key → messages.
 */
export function crossProblems(lines: MergedLine[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const shown = (l: MergedLine) => (l.translation.trim() && l.state !== 'stale' ? l.translation : l.original)
  const texts = new Map<string, string[]>()
  for (const l of lines) {
    const m = /^(.*\/rules\.[^.]+)\.(t\d*|a\d+)$/.exec(l.key)
    if (m) texts.set(m[1], [...(texts.get(m[1]) ?? []), shown(l)])
  }
  for (const l of lines) {
    const m = /^(.*\/rules\.[^.]+)\.h\d+$/.exec(l.key)
    if (!m || l.state === 'gone') continue
    const words = shown(l)
    if (!(texts.get(m[1]) ?? []).some((t) => t.includes(words))) out.set(l.key, [`"${words}" isn't in this dialog's text${l.translation.trim() ? ' as translated' : ''}: the game highlights only words that appear there exactly.`])
  }
  return out
}
