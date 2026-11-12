// Copied from Ship Editor (src/renderer/src/history.svelte.ts); may drift, see docs/PLAN.md §2.
/**
 * Undo/redo for one editable value (used for variants; hulls use HullDoc, which has several
 * parts). Same idea: every change records a snapshot first. `src` keys (the file as read) are
 * ignored when deciding whether something changed.
 */
const MAX_UNDO = 200
const json = (v: unknown) => JSON.stringify(v, (k, x) => (k === 'src' ? undefined : x))

export class UndoDoc<T extends object> {
  private state = $state<T>() as T
  private undoStack = $state.raw<T[]>([])
  private redoStack = $state.raw<T[]>([])
  private saved = $state('')

  canUndo = $derived(this.undoStack.length > 0)
  canRedo = $derived(this.redoStack.length > 0)
  dirty = $derived(json(this.state) !== this.saved)

  constructor(initial: T, dirty = false) {
    this.state = initial
    this.saved = dirty ? '' : json(initial)
  }

  get value(): T { return this.state }

  snapshot(): T { return $state.snapshot(this.state) as T }

  markSaved(v: T): void {
    this.state = v
    this.saved = json(v)
  }

  change(fn: (v: T) => void): void {
    const before = this.snapshot()
    const j = json(before)
    fn(this.state)
    if (json(this.state) !== j) {
      this.undoStack = [...this.undoStack.slice(-(MAX_UNDO - 1)), before]
      this.redoStack = []
    }
  }

  /**
   * For changes made live (e.g. while dragging, straight on `value`): record `before` as one
   * undo step, if anything changed since.
   */
  record(before: T): void {
    if (json(before) === json(this.snapshot())) return
    this.undoStack = [...this.undoStack.slice(-(MAX_UNDO - 1)), before]
    this.redoStack = []
  }

  undo(): void {
    const prev = this.undoStack.at(-1)
    if (!prev) return
    this.undoStack = this.undoStack.slice(0, -1)
    this.redoStack = [...this.redoStack, this.snapshot()]
    this.state = prev
  }

  redo(): void {
    const next = this.redoStack.at(-1)
    if (!next) return
    this.redoStack = this.redoStack.slice(0, -1)
    this.undoStack = [...this.undoStack, this.snapshot()]
    this.state = next
  }
}
