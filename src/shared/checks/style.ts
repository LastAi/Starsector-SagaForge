/**
 * Style checks (PLAN.md §6, Q9): vanilla's writing conventions. Level "style", off by default
 * (Settings → Checks); they never block Export.
 *  - speech in "double quotes"; narration in the second person ("you")
 *  - numbers and credit amounts highlighted
 *  - balanced quotes and brackets, no doubled spaces, a $token glued to a word
 */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { paragraphs, TOKEN_RE } from '../rules/parse'

export function styleChecks(ctx: CheckContext): Problem[] {
  if (!ctx.styleChecks) return []
  const out: Problem[] = []
  for (const q of ctx.model.quests) {
    for (const n of q.nodes) {
      if (n.type !== 'dialog' || !n.text.trim()) continue
      const ref = { page: 'quests' as const, id: q.id, sub: n.id }
      const style = (message: string, key: string) => out.push({ level: 'style', area: 'Style', message: `${q.title} · ${n.title || n.id}: ${message}`, ref, key: `style:${q.id}:${n.id}:${key}` })
      const text = n.text
      const quotes = (text.match(/"/g) ?? []).length
      if (quotes % 2) style('a quotation mark is not closed.', 'quote')
      if ((text.match(/\(/g) ?? []).length !== (text.match(/\)/g) ?? []).length) style('brackets are not balanced.', 'bracket')
      if (/ {2,}/.test(text)) style('doubled spaces.', 'spaces')
      if (/[“”]/.test(text) && /"/.test(text)) style('mixes straight and curly quotes.', 'curly')
      for (const p of paragraphs(text)) {
        const narration = p.replace(/"[^"]*"/g, '')
        if (/\b(I|we|he|she)\s+(am|walk|look|say|see|go|went|looked|said|saw)\b/i.test(narration) && !/\byou\b/i.test(narration)) style('narration should be in the second person ("you"), as vanilla writes it.', 'person')
        if (!/[.!?"…:)]$/.test(p.trim())) style('a paragraph ends without punctuation.', 'punct')
      }
      const numbers = text.replace(TOKEN_RE, '').match(/\b\d[\d,]{2,}\b/g) ?? []
      for (const num of numbers) if (!n.highlights.some((h) => h.includes(num))) style(`highlight the number ${num}, as vanilla does.`, `num:${num}`)
      if (/\w\$[A-Za-z]/.test(text)) style('a $token is glued to a word.', 'glued')
    }
  }
  return out
}
