/**
 * #67 U19 (user, 2026-11-21): the Saga board as storylines. Quests joined by a story link (a
 * prerequisite, one quest starting another: "Start another quest", or a Link › fire a trigger into
 * one of its nodes, or a flag one quest sets that another's start tests) form a questline, drawn as one lane, left to right by how many steps in a quest
 * is. Quests with no link share the last lane. Flags are not links here: the board shows a quest's
 * flags when its card is selected.
 */
import type { QuestPlan } from './model'

export interface StoryLink { from: string; to: string; kind: 'requires' | 'starts' | 'unlocks'; label: string }

/**
 * The memory keys a quest's start needs to be set (its prerequisite flags and its start's own
 * conditions). A key tested negatively ("!$global.busy", "== false") blocks the start instead of
 * opening it, so it is no story link (Heliopolis's "busy" flags joined every quest into one line).
 */
export function startKeys(q: QuestPlan): string[] {
  const lines = [
    ...q.requires.flatMap((r) => ('flag' in r ? [r.is === undefined || r.is === '' ? r.flag : `${r.flag} == ${r.is}`] : [])),
    ...((q.start as { conditions?: string[] }).conditions ?? [])
  ]
  const keys: string[] = []
  for (const l of lines) {
    if (/==\s*false\b|!=\s*true\b/.test(l)) continue
    for (const m of l.matchAll(/(!?)(\$global\.[A-Za-z0-9_]+)/g)) if (!m[1]) keys.push(m[2])
  }
  return [...new Set(keys)]
}
export interface LaneQuest { id: string; col: number; row: number }
/** At most this many quests stacked in one column of a lane. */
export const MAX_ROWS = 4
export interface Lane { id: string; title: string; quests: LaneQuest[]; rows: number; alone?: boolean }

/**
 * Every story link between the quests (one per pair and kind). `setters` (the flags registry) names
 * the quests that set a key: a quest whose start tests a key another quest sets is "unlocked" by it.
 */
export function storyLinks(quests: QuestPlan[], setters: (key: string) => string[] = () => []): StoryLink[] {
  const ids = new Set(quests.map((q) => q.id))
  const out = new Map<string, StoryLink>()
  const add = (l: StoryLink) => { if (l.from !== l.to && ids.has(l.from) && ids.has(l.to)) out.set(`${l.kind}:${l.from}>${l.to}`, l) }
  for (const q of quests) {
    for (const r of q.requires) if ('quest' in r) add({ from: r.quest, to: q.id, kind: 'requires', label: r.ended === 'any' ? 'ended' : r.ended })
    for (const key of startKeys(q)) for (const s of setters(key)) if (!out.has(`requires:${s}>${q.id}`)) add({ from: s, to: q.id, kind: 'unlocks', label: key.replace(/^\$global\./, '') })
    for (const n of q.nodes) {
      if (n.type === 'action') for (const op of n.ops) if (op.op === 'startQuest' && op.quest) add({ from: q.id, to: op.quest, kind: 'starts', label: 'starts' })
      if (n.type === 'link' && n.mode === 'trigger') {
        const t = quests.find((o) => o.id !== q.id && n.target.startsWith(`${o.id}_`))
        if (t) add({ from: q.id, to: t.id, kind: 'starts', label: 'goes on in' })
      }
    }
  }
  return [...out.values()]
}

/** The lanes: questlines first (the biggest first, then by their first quest's place in the mod), then the quests on their own. */
export function storylines(quests: QuestPlan[], setters: (key: string) => string[] = () => []): { lanes: Lane[]; links: StoryLink[] } {
  const links = storyLinks(quests, setters)
  const order = new Map(quests.map((q, i) => [q.id, i]))
  // questlines: connected groups (links in either direction)
  const nb = new Map<string, Set<string>>(quests.map((q) => [q.id, new Set()]))
  for (const l of links) { nb.get(l.from)!.add(l.to); nb.get(l.to)!.add(l.from) }
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const q of quests) {
    if (seen.has(q.id)) continue
    const g: string[] = []
    const stack = [q.id]
    while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); g.push(id); for (const x of nb.get(id)!) stack.push(x) }
    groups.push(g.sort((a, b) => order.get(a)! - order.get(b)!))
  }
  const lines = groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length || order.get(a[0])! - order.get(b[0])!)
  const alone = groups.filter((g) => g.length === 1).map((g) => g[0])
  const lanes: Lane[] = lines.map((g) => {
    // column: the longest chain of links leading to the quest (a cycle stops counting)
    const into = (id: string) => links.filter((l) => l.to === id).map((l) => l.from)
    const col = new Map<string, number>()
    const depth = (id: string, path: Set<string>): number => {
      if (col.has(id)) return col.get(id)!
      if (path.has(id)) return 0
      path.add(id)
      const d = Math.max(-1, ...into(id).map((x) => depth(x, path))) + 1
      path.delete(id)
      col.set(id, d)
      return d
    }
    for (const id of g) depth(id, new Set())
    // a step with many quests (one quest unlocking a dozen) wraps into columns of MAX_ROWS
    const steps = [...new Set(g.map((id) => col.get(id)!))].sort((a, b) => a - b)
    const qs: LaneQuest[] = []
    let x = 0
    let rows = 1
    for (const d of steps) {
      const at = g.filter((id) => col.get(id) === d).sort((a, b) => order.get(a)! - order.get(b)!)
      at.forEach((id, i) => qs.push({ id, col: x + Math.floor(i / MAX_ROWS), row: i % MAX_ROWS }))
      rows = Math.max(rows, Math.min(at.length, MAX_ROWS))
      x += Math.ceil(at.length / MAX_ROWS)
    }
    // named after its first step's quest that leads to the most others (the questline's hub)
    const outs = (id: string) => links.filter((l) => l.from === id).length
    const head = qs.filter((x) => col.get(x.id) === steps[0]).map((x) => x.id).sort((a, b) => outs(b) - outs(a) || order.get(a)! - order.get(b)!)[0]
    const first = quests.find((q) => q.id === head)!
    return { id: `line:${first.id}`, title: first.title, quests: qs, rows }
  })
  if (alone.length) {
    // on their own: in rows of 6
    const per = 6
    lanes.push({ id: 'alone', title: 'On their own', alone: true, rows: Math.ceil(alone.length / per), quests: alone.map((id, i) => ({ id, col: i % per, row: Math.floor(i / per) })) })
  }
  return { lanes, links }
}
