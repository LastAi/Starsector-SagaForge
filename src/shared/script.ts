/**
 * Script view (R29; DESIGN-PHASE6.md §1): a whole quest as a screenplay, in the order the player
 * meets it (depth first from the Start node, options in order): scene headings, speaker names,
 * the text, the options as choices, and stage, arrival and ending notes. Also as Markdown for a
 * proofreader or co-writer.
 */
import type { QNode, QuestPlan } from './model'
import { chartNodeOf, expandGroups, GROUP_SEP } from './nodegroups'
import type { ModModel } from './serialize'
import { handlesOf } from './quest'
import { paragraphs } from './rules/parse'
import { branchPool, chances } from './pools'
import { arriveTakesOver } from './targets'
import { argsText, shortClass } from './plugins'

export type ScriptBlock =
  | { kind: 'scene'; node: string; text: string }
  | { kind: 'speaker'; node: string; text: string }
  | { kind: 'line'; node: string; text: string }
  | { kind: 'choice'; node: string; text: string; to: string }
  | { kind: 'note'; node: string; text: string }

export function questScript(plan: QuestPlan, m: ModModel): ScriptBlock[] {
  // #67 U43: a placed node group reads as its nodes; its lines point at the placed node
  const q = expandGroups(plan, m.nodeGroups, m.project.prefix)
  const out: ScriptBlock[] = []
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const person = (id?: string) => { const p = m.people.find((x) => x.id === id); return p ? `${p.name.first} ${p.name.last}`.trim() : id ?? '' }
  const place = (id?: string) => m.systems.flatMap((s) => s.entities).find((e) => e.id === id)?.name ?? id ?? '(no place yet)'
  const label = (id: string) => { const n = byId.get(id); return n ? ((n as { title?: string }).title || n.id) : id }
  const outs = (id: string) => q.edges.filter((e) => e.from === id)
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = byId.get(id) as QNode | undefined
    if (!n) return
    switch (n.type) {
      case 'dialog': {
        out.push({ kind: 'scene', node: n.id, text: n.title || n.id })
        if (n.speaker) out.push({ kind: 'speaker', node: n.id, text: person(n.speaker).toUpperCase() })
        for (const p of paragraphs(n.text)) out.push({ kind: 'line', node: n.id, text: p })
        // #67 U6: the text shown when the player comes back
        if (n.repeat?.text.trim()) {
          out.push({ kind: 'note', node: n.id, text: `When you come back (${n.repeat.scope === 'ever' ? 'after the first time ever' : 'later in the same visit'}):` })
          for (const p of paragraphs(n.repeat.text)) out.push({ kind: 'line', node: n.id, text: p })
        }
        for (const o of n.options) {
          const e = outs(n.id).find((x) => x.handle === o.id)
          out.push({ kind: 'choice', node: n.id, text: o.text, to: e ? label(e.to) : '(goes nowhere yet)' })
        }
        break
      }
      case 'stage': {
        const st = q.stages.find((s) => s.id === n.stage)
        out.push({ kind: 'note', node: n.id, text: `Journal: ${st?.title ?? n.stage}${st?.journal ? ` — ${st.journal}` : ''}` })
        break
      }
      case 'wait':
        if (n.mode === 'arrive') {
          out.push({ kind: 'note', node: n.id, text: `The player arrives at ${place(n.entity)}${arriveTakesOver(q, n) ? '' : ` and picks "${n.optionText || 'Look around'}"`}.` })
          for (const p of paragraphs(n.arriveText ?? '')) out.push({ kind: 'line', node: n.id, text: p })
        } else out.push({ kind: 'note', node: n.id, text: `${n.days ?? 0} days later.` })
        break
      case 'encounter': out.push({ kind: 'note', node: n.id, text: `The fleet "${m.encounters.find((e) => e.id === n.encounter)?.name ?? n.encounter}" appears.` }); break
      case 'end': out.push({ kind: 'note', node: n.id, text: `The quest ends: ${n.outcome}${n.reward ? ` (reward ${n.reward})` : ''}.` }); break
      case 'link': out.push({ kind: 'note', node: n.id, text: n.mode === 'menu' ? 'Back to the menu.' : n.mode === 'close' ? (n.toFleet ? 'The comm link is cut: back to the fleet screen.' : 'The dialog closes.') : n.mode === 'bar' ? 'Back to the bar.' : `Continues at ${n.target}.` }); break
      case 'raid': {
        // Phase 7b (RC-F4)
        out.push({ kind: 'scene', node: n.id, text: n.title || 'Raid' })
        for (const p of paragraphs(n.text)) out.push({ kind: 'line', node: n.id, text: p })
        out.push({ kind: 'note', node: n.id, text: `Ground raid: "${n.objective}" (danger ${n.danger.toLowerCase()}).` })
        for (const p of paragraphs(n.raidText ?? '')) out.push({ kind: 'line', node: n.id, text: p })
        break
      }
      // #67 U3: a fight on the spot
      case 'fight': out.push({ kind: 'note', node: n.id, text: `A fight here${n.fleet.name ? ` with ${n.fleet.name}` : ''}: ${n.engageText || 'Engage the automated defenses'}, or leave.` }); break
      case 'action': if (n.title) out.push({ kind: 'note', node: n.id, text: n.title }); break
      case 'plugin': {
        // #79: the mod's own Java runs here; its declared results are the ways on
        const args = argsText(n.args)
        const rs = [...new Set(n.results.filter((r) => r && r !== 'next'))]
        out.push({ kind: 'note', node: n.id, text: `${n.title ? `${n.title}: ` : ''}the plugin ${n.className.trim() ? shortClass(n.className) : '(no class yet)'} runs${args ? ` (${args})` : ''}${rs.length ? `. It returns ${rs.join(' / ')}, or nothing.` : '.'}` })
        break
      }
      case 'branch': {
        if (n.random) {
          // Phase 7a: a Random branch with each case's chance (a named pool: its name)
          const p = branchPool(q, n, m.pools ?? [])
          const ch = p ? chances(p) : []
          const pct = (id: string) => { const c = ch.find((x) => x.id === id); return c ? ` ${Math.round(c.chance * 100)}%` : '' }
          out.push({ kind: 'note', node: n.id, text: `At random${n.random.pool ? ` (pool ${p?.name || n.random.pool})` : ''}: ${n.cases.map((c) => `${c.label}${pct(c.id)}`).join(' / ')} / otherwise${pct('nothing')}` })
        } else out.push({ kind: 'note', node: n.id, text: `Branch: ${n.cases.map((c) => c.label).join(' / ')} / otherwise` })
        break
      }
      default: break
    }
    // the next nodes, in handle order
    for (const h of handlesOf(n, m.nodeGroups)) for (const e of outs(n.id).filter((x) => x.handle === h.id)) visit(e.to)
  }
  const start = q.nodes.find((n) => n.type === 'start')
  if (start) visit(start.id)
  // nodes no path reaches, at the end
  for (const n of q.nodes) if (!seen.has(n.id) && n.type !== 'note' && n.type !== 'start') { out.push({ kind: 'note', node: n.id, text: '(not reached from the start)' }); visit(n.id) }
  return out.map((b) => (b.node.includes(GROUP_SEP) ? { ...b, node: chartNodeOf(b.node) } : b))
}

export function scriptMarkdown(q: QuestPlan, blocks: ScriptBlock[]): string {
  const lines = [`# ${q.title}`, '']
  for (const b of blocks) {
    if (b.kind === 'scene') lines.push('', `## ${b.text}`, '')
    else if (b.kind === 'speaker') lines.push(`**${b.text}**`, '')
    else if (b.kind === 'line') lines.push(b.text, '')
    else if (b.kind === 'choice') lines.push(`- **${b.text}** → ${b.to}`)
    else lines.push(`*[${b.text}]*`, '')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
