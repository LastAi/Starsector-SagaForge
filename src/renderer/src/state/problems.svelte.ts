/** Problems: live checks of the open mod, the index's file problems, and Check mod results. */
import type { Problem } from '../../../shared/api'
import { checkModel } from '../../../shared/checks'
import { app, cleanError } from './app.svelte'
import { project } from './project.svelte'

class ProblemsStore {
  /** Results of the last Check mod (cross-file checks with every rule of the game and mods). */
  full = $state.raw<Problem[] | null>(null)
  checking = $state(false)

  live = $derived.by((): Problem[] => {
    const m = project.m
    const index = app.index
    const loaded = project.loaded
    if (!m || !index || !loaded) return []
    return checkModel({ model: m, index, defs: app.defs, loaded, rules: null, styleChecks: app.settings.styleChecks })
  })

  all = $derived.by((): Problem[] => {
    const base = this.full ?? this.live
    const idx = (app.index?.problems ?? []).filter((p) => p.sourceId === app.index?.activeSourceId)
    return [...base, ...idx]
  })

  counts = $derived.by(() => {
    const c = { error: 0, warning: 0, save: 0, style: 0, info: 0 }
    for (const p of this.all) c[p.level]++
    return c
  })

  async checkMod(): Promise<void> {
    const m = project.m
    const index = app.index
    const loaded = project.loaded
    if (!m || !index || !loaded) return
    this.checking = true
    try {
      const rules = await app.loadRules()
      this.full = checkModel({ model: $state.snapshot(m) as typeof m, index, defs: app.defs, loaded, rules, styleChecks: app.settings.styleChecks })
      app.go('problems')
    } catch (e) {
      app.error = cleanError(e)
    } finally {
      this.checking = false
    }
  }
}

export const problems = new ProblemsStore()
