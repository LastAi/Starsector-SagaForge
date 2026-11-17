/**
 * Style checks (PLAN.md §6, Q9): vanilla's writing conventions. Level "style", off by default
 * (Settings → Checks); they never block Export.
 *  - speech in "double quotes"; narration in the second person ("you")
 *  - numbers and credit amounts highlighted
 *  - punctuation (R29): balanced quotes and brackets, no doubled spaces, a $token glued to a word,
 *    straight and curly quotes not mixed, paragraphs that end with punctuation; in every text the
 *    player sees (dialog, options, arrivals, journal, offers, phrases, descriptions)
 */
import type { Problem, ProblemRef } from '../api'
import type { CheckContext } from '.'
import { paragraphs, TOKEN_RE } from '../rules/parse'

/** Punctuation problems of one text: [message, key]. `prose`: also each paragraph must end with punctuation. */
export function punctuation(text: string, prose: boolean): [string, string][] {
  const out: [string, string][] = []
  if (!text.trim()) return out
  if ((text.match(/"/g) ?? []).length % 2) out.push(['a quotation mark is not closed.', 'quote'])
  if ((text.match(/\(/g) ?? []).length !== (text.match(/\)/g) ?? []).length) out.push(['brackets are not balanced.', 'bracket'])
  if (/ {2,}/.test(text)) out.push(['doubled spaces.', 'spaces'])
  if (/[“”]/.test(text) && /"/.test(text)) out.push(['mixes straight and curly quotes.', 'curly'])
  if (/\w\$[A-Za-z]/.test(text)) out.push(['a $token is glued to a word.', 'glued'])
  if (prose) for (const p of paragraphs(text)) if (!/[.!?"…:)\]]$/.test(p.trim())) { out.push(['a paragraph ends without punctuation.', 'punct']); break }
  return out
}

export function styleChecks(ctx: CheckContext): Problem[] {
  if (!ctx.styleChecks) return []
  const out: Problem[] = []
  const m = ctx.model
  const check = (where: string, text: string | undefined, prose: boolean, ref: ProblemRef, keyBase: string) => {
    for (const [msg, key] of punctuation(text ?? '', prose)) out.push({ level: 'style', area: 'Style', message: `${where}: ${msg}`, ref, key: `style:${keyBase}:${key}` })
  }
  for (const q of m.quests) {
    const qref = { page: 'quests' as const, id: q.id }
    const s = q.start
    if (s.kind === 'contact') { check(`${q.title} · offer`, s.offerText, true, qref, `${q.id}:offer`); check(`${q.title} · offer option`, s.optionText, false, qref, `${q.id}:offeropt`) }
    if (s.kind === 'bar') { check(`${q.title} · bar blurb`, s.blurb, true, qref, `${q.id}:blurb`); check(`${q.title} · bar option`, s.optionText, false, qref, `${q.id}:baropt`) }
    for (const st of q.stages) {
      check(`${q.title} · stage "${st.title}" journal`, st.journal, true, qref, `${q.id}:st:${st.id}`)
      check(`${q.title} · stage "${st.title}" next step`, st.nextStep, false, qref, `${q.id}:next:${st.id}`)
    }
    for (const n of q.nodes) {
      const ref = { page: 'quests' as const, id: q.id, sub: n.id }
      const label = `${q.title} · ${(n as { title?: string }).title || n.id}`
      if (n.type === 'wait' && n.mode === 'arrive') { check(label, n.arriveText, true, ref, `${q.id}:${n.id}`); check(`${label} option`, n.optionText, false, ref, `${q.id}:${n.id}:opt`) }
      if (n.type !== 'dialog') continue
      for (const o of n.options) check(`${label} · option "${o.text}"`, o.text, false, ref, `${q.id}:${n.id}:${o.id}`)
      for (const p of n.phrases) for (const c of p.cases) check(`${label} · phrase ${p.token}`, c.text, false, ref, `${q.id}:${n.id}:${p.token}`)
      if (!n.text.trim()) continue
      const style = (message: string, key: string) => out.push({ level: 'style', area: 'Style', message: `${label}: ${message}`, ref, key: `style:${q.id}:${n.id}:${key}` })
      for (const [msg, key] of punctuation(n.text, true)) style(msg, key)
      for (const p of paragraphs(n.text)) {
        const narration = p.replace(/"[^"]*"/g, '')
        if (/\b(I|we|he|she)\s+(am|walk|look|say|see|go|went|looked|said|saw)\b/i.test(narration) && !/\byou\b/i.test(narration)) style('narration should be in the second person ("you"), as vanilla writes it.', 'person')
      }
      const numbers = n.text.replace(TOKEN_RE, '').match(/\b\d[\d,]{2,}\b/g) ?? []
      for (const num of numbers) if (!n.highlights.some((h) => h.includes(num))) style(`highlight the number ${num}, as vanilla does.`, `num:${num}`)
    }
  }
  for (const p of [...m.phrases, ...m.people.flatMap((x) => x.phrases)]) {
    for (const c of p.cases) check(`Phrase ${p.token}`, c.text, false, { page: 'saga' }, `phrase:${p.token}`)
    check(`Phrase ${p.token} (otherwise)`, p.otherwise, false, { page: 'saga' }, `phrase:${p.token}:else`)
  }
  for (const [k, d] of Object.entries(m.descriptions)) check(`Description ${k}`, d.text1, true, { page: 'locations' }, `desc:${k}`)
  for (const it of m.items) check(`Item ${it.name} description`, it.description, true, { page: 'items', id: it.id }, `item:${it.id}`)
  return out
}
