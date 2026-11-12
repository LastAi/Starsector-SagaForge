/**
 * The active mod being edited: its loaded files and the editable model, with one undo history
 * for the whole mod (Ctrl+Z / Ctrl+Y) and Save (Ctrl+S) through the main process's write guard.
 */
import { UndoDoc } from '../history.svelte'
import { modelFromProject, modelToWrites, type ModModel } from '../../../shared/serialize'
import type { ProjectState, WriteResult } from '../../../shared/project'
import { app, cleanError } from './app.svelte'

class ProjectStore {
  loaded = $state.raw<ProjectState | null>(null)
  doc = $state<UndoDoc<ModModel> | null>(null)
  loading = $state(false)
  saving = $state(false)
  /** Faction files the user deleted since the last save (removed on save). */
  deletedFactionFiles = $state<string[]>([])
  lastSave = $state<WriteResult | null>(null)
  /** Images picked from outside the mod, copied into it on save: absolute source → path in the mod. */
  pendingCopies = $state<{ from: string; to: string }[]>([])

  get m(): ModModel | null { return this.doc?.value ?? null }
  get dirty(): boolean { return !!this.doc?.dirty || this.deletedFactionFiles.length > 0 || this.pendingCopies.length > 0 }
  get prefix(): string { return this.doc?.value.project.prefix ?? '' }

  async load(): Promise<void> {
    this.loading = true
    try {
      const p = await window.api.loadProject()
      this.loaded = p
      this.doc = p ? new UndoDoc<ModModel>(modelFromProject(p)) : null
      this.deletedFactionFiles = []
      this.pendingCopies = []
    } catch (e) {
      app.error = cleanError(e)
      this.loaded = null
      this.doc = null
    } finally {
      this.loading = false
    }
  }

  change(fn: (m: ModModel) => void): void {
    this.doc?.change(fn)
  }

  /** Copy a picked image into the mod on the next save; returns its game path. */
  copyIn(abs: string, to: string): string {
    this.pendingCopies = [...this.pendingCopies.filter((c) => c.to !== to), { from: abs, to }]
    return to
  }

  undo(): void { this.doc?.undo() }
  redo(): void { this.doc?.redo() }

  /** Write every changed plan file and faction file. Returns false on conflicts or errors. */
  async save(): Promise<boolean> {
    if (!this.doc || !this.loaded) return false
    const writes = modelToWrites(this.doc.snapshot(), this.loaded, this.deletedFactionFiles)
    if (!writes.length && !this.pendingCopies.length) { this.doc.markSaved(this.doc.snapshot()); app.flash('Nothing to save.'); return true }
    this.saving = true
    try {
      const copies = $state.snapshot(this.pendingCopies)
      const r = await window.api.writeFiles({ writes, backup: true, copies })
      this.lastSave = r
      if (r.conflicts.length) {
        app.error = `These files were changed outside Saga Forge since they were opened, so nothing was saved:\n${r.conflicts.join('\n')}\nReload the mod (your unsaved changes will be lost) or copy your changes first.`
        return false
      }
      const keep = this.doc.snapshot()
      const fresh = await window.api.loadProject()
      this.loaded = fresh
      this.deletedFactionFiles = []
      this.pendingCopies = []
      app.resetGameData()
      // Keep the undo history: the saved model becomes the new clean state.
      this.doc.markSaved(fresh ? modelFromProject(fresh) : keep)
      app.index = await window.api.getIndex()
      app.flash(`Saved ${r.written.length} file${r.written.length === 1 ? '' : 's'}.`)
      return true
    } catch (e) {
      app.error = cleanError(e)
      return false
    } finally {
      this.saving = false
    }
  }
}

export const project = new ProjectStore()
