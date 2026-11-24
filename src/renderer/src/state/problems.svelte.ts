/** Problems: live checks of the open mod, the index's file problems, and Check mod results. */
import type { Problem } from '../../../shared/api'
import { checkModel } from '../../../shared/checks'
import { withoutOptionalPass } from '../../../shared/checks/mods'
import { imagePaths } from '../../../shared/checks/items'
import { renameFlag } from '../../../shared/flags'
import { applySaveFix } from '../../../shared/release'
import { applyPatternFix, protectWreck } from '../../../shared/patterns'
import { IMAGE_KINDS } from '../../../shared/imagekinds'
import { app, cleanError } from './app.svelte'
import { project } from './project.svelte'
import { versions, versionInfo, chooseTarget, replacing } from './versions.svelte'
import { replaceRefs } from '../../../shared/versionrefs'
import type { DiffCategory } from '../../../shared/versiondiff'

/** #47: the version comparison for the checks (two installs only). */
function versionCtx() {
  const vi = versionInfo(app.versions)
  return vi && versions.diff ? { diff: versions.diff, targetIsNewer: vi.targetIsNewer } : null
}

class ProblemsStore {
  /** Results of the last Check mod (cross-file checks with every rule of the game and mods). */
  full = $state.raw<Problem[] | null>(null)
  checking = $state(false)

  live = $derived.by((): Problem[] => {
    const m = project.m
    const index = app.index
    const loaded = project.loaded
    if (!m || !index || !loaded) return []
    return checkModel({ model: m, index, defs: app.defs, loaded, rules: null, styleChecks: app.settings.styleChecks, version: versionCtx() })
  })

  all = $derived.by((): Problem[] => {
    const base = this.full ?? this.live
    const idx = (app.index?.problems ?? []).filter((p) => p.sourceId === app.index?.activeSourceId)
    return [...base, ...idx]
  })

  counts = $derived.by(() => {
    const c = { error: 0, todo: 0, warning: 0, save: 0, style: 0, info: 0 }
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
      const model = $state.snapshot(m) as typeof m
      const files = await window.api.filesExist(imagePaths(model))
      // the mod's own images, for the size check (R5)
      const own = project.loaded?.sourceId
      const mine = new Set<string>()
      for (const k of IMAGE_KINDS) for (const f of await window.api.listImages(k.folder)) if (f.sourceId === own) mine.add(f.path)
      const imageSizes = await window.api.imageSizes([...mine])
      for (const c of project.pendingCopies) files[c.to] = !c.remove
      const ctx = { model, index, defs: app.defs, loaded, rules, styleChecks: app.settings.styleChecks, files, imageSizes, version: versionCtx() }
      const first = checkModel(ctx)
      // #60: a second pass without the optional mods (what still depends on them without a condition)
      this.full = [...first, ...withoutOptionalPass(ctx, first, checkModel)]
      app.go('problems')
    } catch (e) {
      app.error = cleanError(e)
    } finally {
      this.checking = false
    }
  }
}

export const problems = new ProblemsStore()

/**
 * Apply a problem's fix through the undo history. Returns false for "open" fixes (the caller
 * navigates). Fixes that create something (a wreck's protection) open it.
 */
export function applyProblemFix(action: string, arg: unknown): boolean {
  const done = applyFix(action, arg)
  // the last Check mod results no longer match the mod: show the live checks again
  if (done && problems.full) { problems.full = null; app.flash('Fixed. Run Check mod again for the checks against other mods.') }
  return done
}

function applyFix(action: string, arg: unknown): boolean {
  // #60: Saga › Mods
  if (action === 'modAdd') { const a = arg as { id: string; name: string; use: 'required' | 'optional' }; project.change((m) => { const l = (m.project.mods ??= []); const x = l.find((y) => y.id === a.id); if (x) x.use = a.use; else l.push({ id: a.id, name: a.name, use: a.use }) }); app.flash(`${a.name} is in the mod's list as ${a.use}.`); return true }
  if (action === 'setSortString') { project.change((m) => { m.project.sortString = String(arg) }); app.flash('The sortString is written into mod_info.json on the next export.'); return true }
  if (action === 'renameFlag') { const a = arg as { from: string; to: string }; project.change((m) => renameFlag(m, a.from, a.to)); return true }
  if (action === 'listFaction') { project.change((m) => { const f = m.factions.find((x) => x.id === arg); if (f?.kind === 'addition') f.listed = true }); return true }
  if (action === 'aliasStage' || action === 'addToExisting') { project.change((m) => { applySaveFix(m, action, arg) }); return true }
  if (action === 'protectWreck') {
    let id: string | null = null
    project.change((m) => { id = protectWreck(m, String(arg)) })
    if (id) { app.go('quests', id); app.selected.questNode = null; app.flash('Added a conversation that protects the wreck. Edit its text here.') }
    return true
  }
  if (action === 'arrivePlace') {
    const a = arg as { quest: string; node: string; entity: string }
    project.change((m) => { const n = m.quests.find((q) => q.id === a.quest)?.nodes.find((x) => x.id === a.node); if (n?.type === 'wait') n.entity = a.entity })
    return true
  }
  if (action === 'linkToMenu' || action === 'spawnAt') { project.change((m) => { applyPatternFix(m, action, arg) }); return true }
  // #61: Nexerelin's invasions
  if (action === 'protectInvasion') { project.change((m) => { for (const s of m.systems) for (const e of s.entities) if (e.id === arg && e.market) e.market.protectFromInvasion = true }); app.flash('The market is protected from invasion (Nexerelin never invades it).'); return true }
  // #47: version problems
  if (action === 'versionRemove') { const a = arg as { cat: DiffCategory; id: string }; let n = 0; project.change((m) => { n = replaceRefs(m, a.cat, a.id, null) }); app.flash(`Removed ${n} use${n === 1 ? '' : 's'} of ${a.id}.`); return true }
  if (action === 'versionReplace') { replacing.req = arg as { cat: DiffCategory; id: string }; return true }
  if (action === 'versionTarget') { const vi = versionInfo(app.versions); if (vi) chooseTarget(vi.newerSlot); return true }
  return false
}
