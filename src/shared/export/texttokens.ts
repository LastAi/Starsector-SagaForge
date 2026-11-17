/**
 * Translatable dialog (Phase 8c, R31; DESIGN-PHASE8.md "8c"). The game can't change a rule's text
 * after loading, so a translation can only reach dialog through tokens: Export writes
 * `$sft-<rule>-<part>-` in place of each text the player reads, and keeps the texts in the mod's
 * strings file (`data/sagaforge/text.json`), where SagaLib's TextTokens fills them in, from the mod
 * or from an enabled translation. Parts: t (text; t1, t2… for OR variants), o_<option>,
 * tip_<option>, a<n> (AddText lines and headings), h<n> (highlights), bar_o / bar_b (bar scene),
 * raid<n> (raid objective). Texts the game reads under another rule id get a "g_" part (made for
 * every rule): raid objective tooltips (g_raidtip<n>) and story option log texts (g_story_<option>).
 * ShowMapMarker titles stay as they are (the game doesn't fill tokens there).
 */
import type { RuleRow } from '../rules/types'
import { textVariants } from '../rules/parse'
import { textToken } from '../textkeys'

export type RuleStrings = Record<string, Record<string, string>>

const QUOTED = /"([^"]*)"/g

/** The rows with their texts replaced by tokens, and the texts by rule id and part. */
export function tokenizeRules(rows: RuleRow[]): { rows: RuleRow[]; strings: RuleStrings } {
  const strings: RuleStrings = {}
  const out = rows.map((r) => {
    const parts: Record<string, string> = {}
    const tok = (part: string, text: string) => { parts[part] = text; return textToken(r.id, part) }
    let a = 0, h = 0, raid = 0
    // text, with its random variants
    let text = r.text
    if (text.trim()) {
      const vs = textVariants(text)
      text = vs.length === 1 ? tok('t', vs[0]) : vs.map((v, i) => tok(`t${i + 1}`, v)).join('\nOR\n')
    }
    // options: [order:]id:label
    const options = r.options.split(/\r?\n/).map((line) => {
      const p = line.split(':')
      const numbered = p.length >= 3 && /^-?\d+(\.\d+)?$/.test(p[0].trim())
      const idAt = numbered ? 1 : 0
      if (p.length < idAt + 2) return line
      const label = p.slice(idAt + 1).join(':')
      if (!label.trim()) return line
      return [...p.slice(0, idAt + 1), tok(`o_${p[idAt].trim()}`, label.replace(/^"|"$/g, ''))].join(':')
    }).join('\n')
    // script lines that show text
    const script = r.script.split(/\r?\n/).map((line) => {
      const t = line.trim()
      const cmd = t.split(/\s+/)[0]
      const quoted = (fn: (i: number, s: string) => string) => { let i = 0; return line.replace(QUOTED, (_m, s: string) => `"${fn(i++, s)}"`) }
      switch (cmd) {
        case 'AddText': case 'AddTextSmall':
          return quoted((i, s) => (i === 0 && s.trim() ? tok(`a${++a}`, s) : s))
        case 'SF_Show':
          return t.split(/\s+/)[1] === 'heading' ? quoted((i, s) => (i === 0 && s.trim() ? tok(`a${++a}`, s) : s)) : line
        case 'SetTextHighlights':
          return quoted((_i, s) => (s.trim() ? tok(`h${++h}`, s) : s))
        case 'SetTooltip': {
          const oid = t.split(/\s+/)[1]
          return quoted((i, s) => (i === 0 && s.trim() ? tok(`tip_${oid}`, s) : s))
        }
        case 'AddBarEvent':
          return quoted((i, s) => (s.trim() ? tok(i === 0 ? 'bar_o' : 'bar_b', s) : s))
        case 'AddRaidObjective': {
          const n = ++raid
          return quoted((i, s) => (!s.trim() ? s : i === 0 ? tok(`raid${n}`, s) : tok(`g_raidtip${n}`, s)))
        }
        case 'SetStoryOption': {
          const oid = t.split(/\s+/)[1]
          return quoted((i, s) => (i === 0 && s.trim() ? tok(`g_story_${oid}`, s) : s))
        }
        default:
          return line
      }
    }).join('\n')
    if (Object.keys(parts).length) strings[r.id] = parts
    return { ...r, text, options, script }
  })
  return { rows: out, strings }
}
