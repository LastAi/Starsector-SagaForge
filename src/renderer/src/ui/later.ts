/**
 * "Set later" for a form field (R9; docs/DESIGN-PHASE1.md §1). `later(obj, path, edit)` gives a
 * Field what it needs to show and change the mark; `edit` applies a change to the object through
 * the undo history (the page's own editing helper).
 */
import type { TodoMap } from '../../../shared/model'
import { isTodoActive, markTodo, setTodoNote, unmarkTodo } from '../../../shared/todo'

export interface LaterSpec {
  /** Marked and still to do. */
  active: boolean
  note: string
  toggle: () => void
  setNote: (note: string) => void
}

export function later<T extends { todo?: TodoMap }>(obj: T | null | undefined, path: string, edit: (fn: (o: T) => void) => void): LaterSpec | undefined {
  if (!obj) return undefined
  const active = isTodoActive(obj, path)
  return {
    active,
    note: obj.todo?.[path]?.note ?? '',
    toggle: () => edit((o) => { if (isTodoActive(o, path)) unmarkTodo(o, path); else markTodo(o, path) }),
    setNote: (note) => edit((o) => setTodoNote(o, path, note))
  }
}
