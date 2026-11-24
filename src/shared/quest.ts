/** Creating and editing quest plans (PLAN.md §4.4, §5). Pure helpers used by the Quest page. */
import { PLAN_FORMAT, type DialogNode, type NodeType, type QEdge, type QNode, type QuestPlan, type Phrase } from './model'
import type { NodeGroupDef } from './nodegroups'
import { renameTodoElement } from './todo'

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
    case 'raid': return { ...base, type, title: 'Raid', text: 'Your marines are ready.', objective: 'Raid the compound', danger: 'MEDIUM', difficulty: 100, xp: 3000 }
    case 'end': return { ...base, type, outcome: 'success' }
    // the vanilla-safe ending: back to the menu, or closed where there is none (a wreck)
    case 'link': return { ...base, type, mode: 'menu', target: '' }
    case 'note': return { ...base, type, text: '' }
    // #79 (SagaLib 1.4): the mod's own Java; results are added in the inspector
    case 'plugin': return { ...base, type, title: '', className: '', args: [], results: [] }
    // #67 U3 (SagaLib 1.4): a fight on the spot (SF_Fight), the fleet set on the node
    case 'fight': return { ...base, type, title: 'Defenders', fleet: { faction: 'derelict', size: 'fp', points: 60, quality: 0.5 } }
    // #67 U43: a placed node group (the caller sets which)
    case 'group': return { ...base, type, group: '', values: {} }
  }
}

/** A Wait node on a MagicLib bounty's end (SagaLib 1.3): its outputs, MagicLib's end states. */
export const BOUNTY_WAIT_OUTCOMES = ['succeeded', 'failed', 'expired', 'dismissed'] as const

/**
 * Switches a Wait node's mode and keeps its links: into "bounty" the one output becomes
 * "succeeded"; out of it "succeeded" becomes the one output and the other outcomes' links go.
 */
/** #67: a reward's id changed: End nodes and "Give a reward" steps follow it (they kept the old id). */
export function renameReward(q: QuestPlan, from: string, to: string): void {
  const r = q.rewards.find((x) => x.id === from)
  if (!r || from === to) return
  r.id = to
  for (const n of q.nodes) {
    if (n.type === 'end' && n.reward === from) n.reward = to
    if (n.type === 'action') for (const op of n.ops) if (op.op === 'reward' && op.reward === from) op.reward = to
  }
}

export function setWaitMode(q: QuestPlan, nodeId: string, mode: 'arrive' | 'days' | 'bounty'): void {
  const n = q.nodes.find((x) => x.id === nodeId)
  if (n?.type !== 'wait' || n.mode === mode) return
  const was = n.mode
  n.mode = mode
  // #67: the form showed 7 days while an unset value exported 0: store what it shows
  if (mode === 'days') n.days ??= 7
  if (mode === 'bounty') { for (const e of q.edges) if (e.from === nodeId && e.handle === 'next') e.handle = 'succeeded' }
  else if (was === 'bounty') {
    q.edges = q.edges.filter((e) => e.from !== nodeId || e.handle === 'succeeded')
    for (const e of q.edges) if (e.from === nodeId) e.handle = 'next'
  }
}

/** Output handles of a node, in order (Dialog: one per option). */
export function handlesOf(n: QNode, groups?: NodeGroupDef[]): { id: string; label: string }[] {
  switch (n.type) {
    // #67 U43: a placed group's exits are its definition's
    case 'group': return (groups?.find((d) => d.id === n.group)?.exits ?? []).map((x) => ({ id: x.key, label: x.label }))
    case 'wait': return n.mode === 'bounty' ? BOUNTY_WAIT_OUTCOMES.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })) : [{ id: 'next', label: '' }]
    case 'start': case 'action': case 'stage': return [{ id: 'next', label: '' }]
    case 'dialog': return n.options.length ? n.options.map((o) => ({ id: o.id, label: o.text })) : [{ id: 'next', label: '(continue)' }]
    case 'branch': return [...n.cases.map((c) => ({ id: c.id, label: c.label })), { id: 'else', label: 'otherwise' }]
    case 'encounter': return [{ id: 'next', label: 'after spawning' }, { id: 'defeated', label: 'Defeated' }, { id: 'avoided', label: 'Avoided' }]
    case 'raid': return [{ id: 'done', label: 'Raid done' }, { id: 'back', label: 'Backed out' }]
    // #67 U3: vanilla's defender battle: beaten, or the player left (or lost)
    case 'fight': return [{ id: 'won', label: 'Won' }, { id: 'left', label: 'Left' }]
    case 'end': return [{ id: 'next', label: '' }]
    // #79: one output per declared result, then "next" for no result, another result or a failure
    case 'plugin': {
      const rs = [...new Set(n.results.filter((r) => r && r !== 'next'))]
      return [...rs.map((r) => ({ id: r, label: `returns ${r}` })), { id: 'next', label: rs.length ? 'otherwise (no result, failed)' : '' }]
    }
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
  renameTodoElement(q, 'nodes', from, to)
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

/** H5: the stage a quest's Start leads straight into (Start → Stage), if any: where "Start another quest" starts it. */
export function firstStageOf(q: QuestPlan): string | undefined {
  const start = q.nodes.find((n) => n.type === 'start')
  const to = start && q.edges.find((e) => e.from === start.id)?.to
  const n = to ? q.nodes.find((x) => x.id === to) : undefined
  return n?.type === 'stage' ? n.stage : undefined
}

/**
 * #67 U5 (FINDINGS H12): this quest's nodes that another quest or conversation enters with a
 * Link › fire a trigger at the node's own trigger (`<quest>_<node>`, as the export names it), with
 * the titles of the ones that do. The reachability check starts from them too.
 */
export function crossEntries(q: QuestPlan, all: QuestPlan[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const ids = new Set(q.nodes.map((n) => n.id))
  for (const o of all) {
    if (o.id === q.id) continue
    for (const n of o.nodes) {
      if (n.type !== 'link' || n.mode !== 'trigger' || !n.target.startsWith(`${q.id}_`)) continue
      const node = n.target.slice(q.id.length + 1)
      if (!ids.has(node)) continue
      const list = out.get(node) ?? []
      if (!list.includes(o.title || o.id)) list.push(o.title || o.id)
      out.set(node, list)
    }
  }
  return out
}

/** H5: what is wrong with a "Start another quest": an unknown stage (error), or none while the quest has a first stage (warning). */
export function startQuestStageProblem(op: { quest: string; stage?: string }, quests: QuestPlan[], from?: QuestPlan): { level: 'error' | 'warning'; message: string } | null {
  const t = quests.find((x) => x.id === op.quest)
  if (!t) return null
  if (op.stage && !t.stages.some((s) => s.id === op.stage)) return { level: 'error', message: `starts "${t.title}" at stage "${op.stage}", which isn't in its outline.` }
  const first = firstStageOf(t)
  // the other way: a Link › trigger into the started quest's first node (its Stage node runs then)
  const start = t.nodes.find((n) => n.type === 'start')
  const firstNode = start && t.edges.find((e) => e.from === start.id)?.to
  const fired = !!firstNode && !!from?.nodes.some((n) => n.type === 'link' && n.mode === 'trigger' && n.target === `${t.id}_${firstNode}`)
  if (!op.stage && first && !fired) return { level: 'warning', message: `starts "${t.title}" without a stage: it is only marked active, and its first Stage node ("${first}") never runs, so it has no journal entry, marker or step. Pick the stage it starts at.` }
  return null
}

/** H5: the lines of "Start another quest": SF_Start, then SF_Step at its stage when one is picked. */
export function startQuestLines(op: { quest: string; stage?: string }): string[] {
  if (!op.quest) return []
  return [`SF_Start ${op.quest}`, ...(op.stage ? [`SF_Step ${op.quest} ${op.stage}`] : [])]
}

/** #71: a node that starts this quest (SF_Start or SF_Step for it): a Stage node, a Start-quest action of itself, a script line. */
export function startsQuest(q: QuestPlan, n: QNode): boolean {
  const own = (l: string) => new RegExp(`^\\s*SF_(Start|Step)\\s+${q.id}(\\s|$)`).test(l)
  if (n.type === 'stage') return true
  if (n.type === 'action') return n.ops.some((o) => (o.op === 'startQuest' && o.quest === q.id) || (o.op === 'line' && own(o.line)))
  if (n.type === 'dialog') return n.script.some(own)
  return false
}

/**
 * #71: the nodes the player reaches from the Start node before the quest starts (an offer, a
 * briefing before the first Stage node). A Dialog that starts it in its script still shows its
 * text first (the script runs after the text), so it is one of them; a Stage or Action that starts
 * it isn't, and nothing after it is. Links to a node of this quest are followed.
 */
export function beforeStart(q: QuestPlan): Set<string> {
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const start = q.nodes.find((n) => n.type === 'start')
  const out = new Set<string>()
  const seen = new Set<string>()
  const stack = start ? q.edges.filter((e) => e.from === start.id).map((e) => e.to) : []
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    if (!n || n.type === 'note' || n.type === 'start') continue
    const starts = startsQuest(q, n)
    if (!starts || n.type === 'dialog') out.add(id)
    if (starts) continue
    if (n.type === 'link') { if (n.mode === 'node') stack.push(n.target); continue }
    for (const e of q.edges) if (e.from === id) stack.push(e.to)
  }
  return out
}

/** Node ids reachable from the start (for "unreachable" problems and Play's fading). */
export function reachable(q: QuestPlan, extraRoots: string[] = []): Set<string> {
  const start = q.nodes.find((n) => n.type === 'start')
  const out = new Set<string>()
  const stack = start ? [start.id, ...extraRoots] : [...extraRoots]
  // #61: the Stage node "If a market of this quest changes owner" goes to is reached from SagaLib's daily check
  if (q.ownerChange?.do === 'stage') for (const n of q.nodes) if (n.type === 'stage' && n.stage === q.ownerChange.stage) stack.push(n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const e of q.edges) if (e.from === id) stack.push(e.to)
  }
  return out
}
