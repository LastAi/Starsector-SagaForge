/**
 * #60 (PLAN.md §10.1, §10.2): the active mod's list of other mods as the UI uses it: which sources
 * the read-only lists and pickers show (vanilla + this mod + its required and optional mods), the
 * "Show all installed mods" switch per list, the Add as optional / required question when
 * something is picked from an unlisted mod, each item's effective conditions for the chips, and the
 * optional mods' switches for Play mode and the Test context.
 */
import { app } from './app.svelte'
import { project } from './project.svelte'
import { CORE_ID, SAGALIB_ID, isVisible, neverPairs, neverWithOf, optionalMods, originSource, possible, switchPlay, useOf, visibleSources } from '../../../shared/modlist'
import { effectiveConds, type ItemConds } from '../../../shared/moduses'
import type { ModUse, SettingDef } from '../../../shared/model'
import { isSettingToken } from '../../../shared/itemversions'
import { tokenLabel, versionSettings } from '../../../shared/settings'

class ModsState {
  /** "Show all installed mods" per list (key = the list, e.g. "factions", "people:existing"). */
  showAll = $state<Record<string, boolean>>({})
  /** The Add as optional / required question (Shell draws it). */
  asking = $state<{ id: string; name: string; what: string; done: (use: ModUse['use'] | null) => void } | null>(null)
  /** Play mode and the Test context: which optional mods count (default: installed and enabled). */
  playOn = $state<Record<string, boolean>>({})

  /** Vanilla, the active mod, its required and optional mods. */
  // #67 U33: from the raw index (the index view itself depends on this set)
  visible = $derived(visibleSources(project.m?.project, app.rawIndex?.activeSourceId ?? null))

  /** Each item's effective "Only with / Only without" (own, automatic, inherited). */
  effective = $derived.by((): Map<string, ItemConds> => {
    const m = project.m
    if (!m || !app.index || !project.loaded) return new Map()
    return effectiveConds(m, app.index, project.loaded.sourceId, (id) => this.name(id))
  })

  name(id: string): string {
    return project.m?.project.mods?.find((x) => x.id === id)?.name ?? app.index?.sources.find((s) => s.id === id)?.name ?? id
  }

  /** #67 U18: one part of a version's name: a mod's name, or a setting token as "Difficulty = Hard" ("Ironman = on"). */
  versionName(x: string): string {
    return isSettingToken(x) ? tokenLabel(x, project.m?.project.settings) : this.name(x)
  }

  /** #67 U18: the settings marked for versions (Saga › Settings). */
  versionSettings(): SettingDef[] { return versionSettings(project.m?.project.settings) }

  optional(): ModUse[] { return project.m ? optionalMods(project.m.project) : [] }

  /** True when the list shows everything (its switch is on, or there is no active mod). */
  all(list: string): boolean { return !project.m || !!this.showAll[list] }

  /** A list filtered to the visible sources (unless its "Show all installed mods" switch is on). */
  filter<T>(list: string, items: T[], definedBy: (x: T) => string | undefined): T[] {
    if (this.all(list)) return items
    const v = this.visible
    return items.filter((x) => isVisible(definedBy(x), v))
  }

  /** How many items the filter hides. */
  hidden<T>(list: string, items: T[], definedBy: (x: T) => string | undefined): number {
    return this.all(list) ? 0 : items.length - this.filter(list, items, definedBy).length
  }

  /**
   * Something was picked from a mod (the definedBy of the id): if that mod isn't in the list, offer
   * Add as optional / Add as required right there, so the filter is never a dead end.
   */
  async picked(definedBy: string | undefined, what: string): Promise<void> {
    const m = project.m
    if (!m || !definedBy) return
    const src = originSource(definedBy)
    if (src === CORE_ID || src === project.loaded?.sourceId || src === SAGALIB_ID || src === 'plan') return
    if (useOf(m.project, src) !== 'none') return
    const name = this.name(src)
    const use = await new Promise<ModUse['use'] | null>((resolve) => {
      this.asking?.done(null)
      this.asking = { id: src, name, what, done: (u) => { this.asking = null; resolve(u) } }
    })
    if (!use) return
    project.change((mm) => { ((mm.project.mods ??= []), mm.project.mods).push({ id: src, name, use }) })
    app.flash(`${name} is in the mod's list as ${use} (Saga › Mods).`)
  }

  /** The source that defines an id in a list of index entries. */
  definedByOf(list: { id: string; definedBy?: string }[] | undefined, id: string): string | undefined {
    return list?.find((x) => x.id === id)?.definedBy
  }

  /** Play mode / Test context: every mod that counts: the enabled installed mods and the required ones, with the optional mods as switched. */
  playEnabled(): Set<string> {
    const out = new Set<string>((app.index?.sources ?? []).filter((s) => s.enabled || s.isCore).map((s) => s.id))
    for (const x of project.m?.project.mods ?? []) if (x.use === 'required') out.add(x.id)
    const on = this.playMods()
    for (const x of this.optional()) { if (on.has(x.id)) out.add(x.id); else out.delete(x.id) }
    return out
  }

  /**
   * Play mode / Test context: the optional mods that count now. #76: never two mods that never run
   * together (when both are on, e.g. both enabled in your game, the one listed first counts).
   */
  playMods(): Set<string> {
    const out = new Set<string>()
    const pairs = neverPairs(project.m?.project)
    for (const x of this.optional()) {
      const dflt = !!app.index?.sources.find((s) => s.id === x.id)?.enabled
      if ((this.playOn[x.id] ?? dflt) && possible([...out, x.id], pairs)) out.add(x.id)
    }
    return out
  }

  /** A Play mode / Test context switch: turning a mod on turns off the mods that never run with it (#76). */
  setPlay(id: string, value: boolean): void {
    const pairs = neverPairs(project.m?.project)
    const now = switchPlay(this.playMods(), id, value, pairs)
    const next = { ...this.playOn }
    for (const x of this.optional()) next[x.id] = now.has(x.id)
    this.playOn = next
  }

  /** The optional mods that never run with this one (for the switches' tooltips). */
  neverWith(id: string): string[] {
    const opt = new Set(this.optional().map((x) => x.id))
    return neverWithOf(project.m?.project, id).filter((x) => opt.has(x.id)).map((x) => this.name(x.id))
  }
}

export const mods = new ModsState()
// #67 U33: the app's index view merges only the sources this mod counts
app.visibleOf = (raw) => visibleSources(project.m?.project, raw.activeSourceId ?? null)

/** Opens Saga › Mods (the header pill, Problems, the condition editors). */
export function openModsTab(): void {
  app.selected.sagaOpen = 'mods'
  app.selected.sagaTab = 'mods'
  app.go('saga')
}

/** #60: an extension's tools show in this mod only when its mod is in the list (Settings › Extensions = app-wide availability). */
export function toolVisible(extId: string): boolean {
  const e = app.index?.extensions.find((x) => x.id === extId)
  if (!e?.on) return false
  if (!e.requiresMod) return true
  const u = project.m?.project.mods?.find((x) => x.id === e.requiresMod)?.use
  return u === 'required' || u === 'optional'
}
