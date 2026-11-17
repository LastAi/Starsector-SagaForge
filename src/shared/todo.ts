/**
 * "Set later" (INGAME-CHECKS R9; docs/DESIGN-PHASE1.md §1). A to-do is a mark on one field of a
 * person, quest, item, encounter or system: `obj.todo[path] = { note, was }`. It is active until the
 * field changes from `was` (the value when it was marked), or while the field is empty; then it
 * counts as done, Problems stops listing it, and Save drops it from the plan file.
 *
 * Paths are dotted; a segment `name#id` picks the element of array `name` whose `id` is `id`
 * (`nodes#arrive.entity`, `stages#find.marker`).
 */
import type { Problem, ProblemRef } from './api'
import type { ModModel } from './serialize'
import type { TodoMap } from './model'

type WithTodo = { todo?: TodoMap }

/** The value at a field path, as a string ('' when missing). */
export function todoValue(obj: unknown, path: string): string {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return ''
    const [name, id] = seg.split('#')
    cur = (cur as Record<string, unknown>)[name]
    if (id !== undefined) cur = Array.isArray(cur) ? cur.find((x) => (x as { id?: string })?.id === id) : undefined
  }
  if (cur == null) return ''
  return typeof cur === 'object' ? JSON.stringify(cur) : String(cur)
}

/** A field is still to do: marked, and empty or unchanged since it was marked. */
export function isTodoActive(obj: WithTodo | null | undefined, path: string): boolean {
  const t = obj?.todo?.[path]
  if (!t) return false
  const v = todoValue(obj, path)
  return v === '' || v === (t.was ?? '')
}

/** Mark a field "Set later" (keeps an existing note). */
export function markTodo(obj: WithTodo, path: string, note?: string): void {
  const old = obj.todo?.[path]
  obj.todo = { ...(obj.todo ?? {}), [path]: { note: note ?? old?.note, was: todoValue(obj, path) } }
  if (!obj.todo[path].note) delete obj.todo[path].note
}

export function unmarkTodo(obj: WithTodo, path: string): void {
  if (!obj.todo?.[path]) return
  delete obj.todo[path]
  if (!Object.keys(obj.todo).length) delete obj.todo
}

export function setTodoNote(obj: WithTodo, path: string, note: string): void {
  if (!obj.todo?.[path]) return
  if (note.trim()) obj.todo[path].note = note.trim()
  else delete obj.todo[path].note
}

/** Drop to-dos that are done (Save). Returns true if anything was dropped. */
export function pruneTodos(obj: WithTodo): boolean {
  if (!obj.todo) return false
  let changed = false
  for (const p of Object.keys(obj.todo)) if (!isTodoActive(obj, p)) { delete obj.todo[p]; changed = true }
  if (!Object.keys(obj.todo).length) delete obj.todo
  return changed
}

/** Rename the element id inside to-do paths (a node or stage renamed: `nodes#a…` → `nodes#b…`). */
export function renameTodoElement(obj: WithTodo, array: string, from: string, to: string): void {
  if (!obj.todo) return
  const pre = `${array}#${from}`
  for (const p of Object.keys(obj.todo)) {
    if (p === pre || p.startsWith(`${pre}.`)) { obj.todo[`${array}#${to}${p.slice(pre.length)}`] = obj.todo[p]; delete obj.todo[p] }
  }
}

/** Drop to-dos of an array element that was deleted (a node or stage). */
export function dropTodoElement(obj: WithTodo, array: string, id: string): void {
  if (!obj.todo) return
  const pre = `${array}#${id}`
  for (const p of Object.keys(obj.todo)) if (p === pre || p.startsWith(`${pre}.`)) delete obj.todo[p]
  if (!Object.keys(obj.todo).length) delete obj.todo
}

/** Readable names for the fields that can be marked (the rest show their path). */
const LABELS: Record<string, string> = {
  portrait: 'Portrait', 'placement.market': 'Placement › Market', 'placement.encounter': 'Placement › Encounter',
  'start.person': 'Start › Contact', icon: 'Icon', 'spawn.at': 'Spawn › At', 'fleet.flagshipCommander': 'Fleet › Flagship by'
}
export function todoLabel(path: string): string {
  if (LABELS[path]) return LABELS[path]
  const m = /^(nodes|stages)#([^.]+)\.(.+)$/.exec(path)
  if (m) return `${m[1] === 'nodes' ? 'node' : 'stage'} "${m[2]}" › ${m[3] === 'entity' ? 'Place' : m[3] === 'marker' ? 'Map marker' : m[3]}`
  return path
}

export interface TodoEntry { ref: ProblemRef; owner: string; path: string; note?: string }

/** Every active to-do in the mod. */
export function activeTodos(m: Pick<ModModel, 'people' | 'quests' | 'items' | 'encounters' | 'systems'>): TodoEntry[] {
  const out: TodoEntry[] = []
  const add = (obj: WithTodo, ref: ProblemRef, owner: string) => {
    for (const [p, t] of Object.entries(obj.todo ?? {})) {
      if (!isTodoActive(obj, p)) continue
      const sub = /^(nodes|stages)#([^.]+)/.exec(p)
      out.push({ ref: { ...ref, sub: ref.page === 'quests' && sub?.[1] === 'nodes' ? sub[2] : ref.sub }, owner, path: p, note: t.note })
    }
  }
  for (const p of m.people) add(p, { page: 'people', id: p.id }, `${p.name.first} ${p.name.last}`.trim())
  for (const q of m.quests) add(q, { page: 'quests', id: q.id }, q.title)
  for (const i of m.items) add(i, { page: 'items', id: i.id }, i.name)
  for (const e of m.encounters) add(e, { page: 'encounters', id: e.id }, e.name)
  for (const s of m.systems) add(s, { page: 'locations', id: s.id }, s.name)
  return out
}

/** The To do level in Problems. */
export function todoProblems(m: Parameters<typeof activeTodos>[0]): Problem[] {
  return activeTodos(m).map((t) => ({
    level: 'todo', area: 'To do', ref: t.ref,
    message: `${t.owner} › ${todoLabel(t.path)}: set later${t.note ? ` (${t.note})` : ''}.`,
    // no key: a to-do can't be ignored (that would sidestep the release block)
  }))
}
