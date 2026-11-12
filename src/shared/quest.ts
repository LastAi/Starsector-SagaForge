/** Creating and editing quest plans (PLAN.md §4.4, §5). Pure helpers used by the Quest page. */
import { PLAN_FORMAT, type DialogNode, type NodeType, type QEdge, type QNode, type QuestPlan, type Phrase } from './model'

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  const b = slug(base) || 'node'
  if (!set.has(b)) return b
  for (let i = 2; ; i++) if (!set.has(`${b}${i}`)) return `${b}${i}`
}

export function newQuest(id: string, title: string, kind: 'quest' | 'dialog' = 'quest'): QuestPlan {
  const offer: DialogNode = {
    id: 'offer', type: 'dialog', x: 260, y: 40, title: 'Offer', visual: { kind: 'none' }, displays: [], highlights: [], conditions: [], script: [], phrases: [],
    text: kind === 'quest' ? '"I have a job for you, $playerLastName."' : '"Yes?"',
    options: kind === 'quest' ? [{ id: 'accept', text: 'Accept the job' }, { id: 'decline', text: 'Not interested', shortcut: 'ESC' }] : [{ id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  }
  const nodes: QNode[] = [{ id: 'start', type: 'start', x: 20, y: 60 }, offer]
  const edges: QEdge[] = [{ id: 'e_start', from: 'start', handle: 'next', to: 'offer' }]
  return {
    format: PLAN_FORMAT, id, title, kind, icon: '',
    start: kind === 'quest' ? { kind: 'contact', person: '', freq: 10, minRep: 'FAVORABLE' } : { kind: 'option', trigger: 'PopulateOptions', conditions: ['$isPerson'], optionText: title },
    requires: [], stages: kind === 'quest' ? [{ id: 'go', title: 'Go', journal: '', kind: 'normal', renamedFrom: [] }] : [],
    variables: [], rewards: [], repeatable: false, nodes, edges
  }
}

export function newNode(type: NodeType, id: string, x: number, y: number): QNode {
  const base = { id, x, y }
  switch (type) {
    case 'start': return { ...base, type }
    case 'dialog': return { ...base, type, title: '', visual: { kind: 'keep' }, displays: [], text: '', highlights: [], options: [], conditions: [], script: [], phrases: [] }
    case 'branch': return { ...base, type, title: '', cases: [{ id: 'c1', label: 'Case 1', conditions: [] }] }
    case 'action': return { ...base, type, title: '', ops: [] }
    case 'stage': return { ...base, type, stage: '' }
    case 'encounter': return { ...base, type, encounter: '' }
    case 'wait': return { ...base, type, mode: 'arrive' }
    case 'end': return { ...base, type, outcome: 'success' }
    case 'link': return { ...base, type, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' }
    case 'note': return { ...base, type, text: '' }
  }
}

/** Output handles of a node, in order (Dialog: one per option). */
export function handlesOf(n: QNode): { id: string; label: string }[] {
  switch (n.type) {
    case 'start': case 'action': case 'stage': case 'wait': return [{ id: 'next', label: '' }]
    case 'dialog': return n.options.length ? n.options.map((o) => ({ id: o.id, label: o.text })) : [{ id: 'next', label: '(continue)' }]
    case 'branch': return [...n.cases.map((c) => ({ id: c.id, label: c.label })), { id: 'else', label: 'otherwise' }]
    case 'encounter': return [{ id: 'next', label: 'after spawning' }, { id: 'defeated', label: 'Defeated' }, { id: 'avoided', label: 'Avoided' }]
    case 'end': return [{ id: 'next', label: '' }]
    default: return []
  }
}

/** Inline variation token for a node: "$<quest>_<node>_v<n>". */
export function nextVariationToken(q: QuestPlan, node: DialogNode): string {
  const used = new Set(node.phrases.map((p) => p.token))
  for (let i = 1; ; i++) { const t = `$${q.id}_${node.id}_v${i}`; if (!used.has(t)) return t }
}

export function newPhrase(token: string, owner: string): Phrase {
  return { token, owner, mode: 'first-match', cases: [{ when: [], text: '' }], otherwise: '' }
}

/** Rename a node id everywhere in the quest (edges, links). */
export function renameNode(q: QuestPlan, from: string, to: string): void {
  for (const n of q.nodes) {
    if (n.id === from) n.id = to
    if (n.type === 'link' && n.mode === 'node' && n.target === from) n.target = to
  }
  for (const e of q.edges) { if (e.from === from) e.from = to; if (e.to === from) e.to = to }
}

/**
 * Which nodes belong to which stage, for the chart's group frames: everything reachable from a
 * Stage node without passing another Stage node. The nodes before the first stage are "before".
 */
export function stageGroups(q: QuestPlan): { stage: string; nodes: string[] }[] {
  const out: { stage: string; nodes: string[] }[] = []
  for (const s of q.nodes) {
    if (s.type !== 'stage') continue
    const seen = new Set<string>([s.id])
    const stack = q.edges.filter((e) => e.from === s.id).map((e) => e.to)
    while (stack.length) {
      const id = stack.pop()!
      const n = q.nodes.find((x) => x.id === id)
      if (!n || seen.has(id) || n.type === 'stage') continue
      seen.add(id)
      for (const e of q.edges) if (e.from === id) stack.push(e.to)
    }
    const prev = out.find((g) => g.stage === s.stage)
    if (prev) prev.nodes.push(...[...seen].filter((x) => !prev.nodes.includes(x)))
    else out.push({ stage: s.stage, nodes: [...seen] })
  }
  return out
}

/** Node ids reachable from the start (for "unreachable" problems and Play's fading). */
export function reachable(q: QuestPlan): Set<string> {
  const start = q.nodes.find((n) => n.type === 'start')
  const out = new Set<string>()
  const stack = start ? [start.id] : []
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const e of q.edges) if (e.from === id) stack.push(e.to)
  }
  return out
}
