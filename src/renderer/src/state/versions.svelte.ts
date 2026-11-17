/**
 * #47 (TARGET-VERSION-ASSESSMENT.md §3): which install the active mod targets. The target is
 * remembered per mod in sagaforge/project.json ("target"); without it, mod_info.json's gameVersion
 * decides. Switching reloads the game index for that install.
 */
import { app, cleanError } from './app.svelte'
import { project } from './project.svelte'
import { installAges, sameFamily, versionFamily } from '../../../shared/version'
import type { VersionState } from '../../../shared/api'
import { defsFor } from '../../../shared/defs'
import { versionDiff, versionLabels, type DiffCategory, type VersionDiff } from '../../../shared/versiondiff'

export type Slot = 'main' | 'migration'

/** The slot whose install has this version family, if any. */
export function slotOf(v: VersionState | null, version: string | null | undefined): Slot | null {
  if (!v || !version) return null
  if (v.main?.ok && sameFamily(v.main.version, version)) return 'main'
  if (v.migration?.ok && sameFamily(v.migration.version, version)) return 'migration'
  return null
}

/** What the header and pages show about versions; null with a single install (D7: nothing new). */
export function versionInfo(v: VersionState | null = app.versions): null | {
  target: string; other: string; targetIsNewer: boolean; olderSlot: Slot; newerSlot: Slot
} {
  if (!v?.migration?.ok || !v.main?.ok) return null
  const ages = installAges(v.main.version, v.migration.version)
  if (!ages) return null
  const target = v.target === 'migration' ? v.migration.version! : v.main.version!
  const other = v.target === 'migration' ? v.main.version! : v.migration.version!
  return { target, other, targetIsNewer: ages.newer === v.target, olderSlot: ages.older, newerSlot: ages.newer }
}

/** The slot the active mod wants: its saved target, else the install matching its gameVersion. */
export function wantedSlot(): Slot | null {
  const v = app.versions
  if (!v?.migration?.ok || !project.loaded) return null
  return slotOf(v, project.m?.project.target) ?? slotOf(v, project.loaded.modInfo.gameVersion)
}

/** The comparison between the two installs (P2), and the labels it gives pickers. */
class VersionStore {
  diff = $derived.by((): VersionDiff | null => {
    const vi = versionInfo(app.versions)
    if (!vi || !app.index || !app.otherIndex) return null
    const targetRules = app.rules ? [...new Set(app.rules.filter((r) => r.sourceId === 'starsector-core').map((r) => r.id))] : null
    const t = { defs: defsFor(app.index.install.gameVersion), index: app.index, ruleIds: targetRules }
    const o = { defs: defsFor(app.otherIndex.install.gameVersion), index: app.otherIndex, ruleIds: app.otherRuleIds }
    return vi.targetIsNewer ? versionDiff(o, t) : versionDiff(t, o)
  })
  labels = $derived(versionLabels(this.diff))
}
export const versions = new VersionStore()

/** "Pick a replacement…" for a version problem: the id being replaced (the Shell shows the dialog). */
export const replacing = $state<{ req: { cat: DiffCategory; id: string } | null }>({ req: null })

/** The target's ids of a category, for the replacement picker. */
export function optionsFor(cat: DiffCategory): { id: string; name?: string }[] {
  const i = app.index
  if (!i) return []
  const d = app.defs
  switch (cat) {
    case 'faction': return i.factions
    case 'hull': return i.hulls
    case 'variant': return i.variants
    case 'wing': return i.wings
    case 'weapon': return i.weapons
    case 'hullmod': return i.hullmods
    case 'item': return i.items
    case 'industry': return i.industries
    case 'condition': return i.conditions
    case 'submarket': return i.submarkets
    case 'entityType': return i.customEntityTypes
    case 'planetType': return i.planetTypes
    case 'music': return i.music.map((id) => ({ id }))
    case 'portrait': return i.portraits.map((p) => ({ id: p.path }))
    case 'illustration': return i.illustrations.filter((x) => x.category === 'illustrations').map((x) => ({ id: x.key, name: x.path }))
    case 'rank': return d.ranks
    case 'post': return d.posts
    case 'fleetType': return d.fleetTypes
    default: return []
  }
}

let syncing = false
/**
 * After a project is loaded: switch to the install the mod targets (D3). Does nothing with one
 * install, while unsaved changes exist, or when already there.
 */
export async function syncTarget(): Promise<void> {
  const want = wantedSlot()
  if (syncing || !want || !app.versions || want === app.versions.target || project.dirty) return
  syncing = true
  try { await applyTarget(want) } finally { syncing = false }
}

async function applyTarget(slot: Slot): Promise<void> {
  const r = await window.api.setTarget(slot)
  app.versions = r.versions
  app.index = r.index
  app.resetGameData()
  await project.load()
}

/** The user picks the target for the active mod: switch, and remember it in the mod's plan. */
export async function chooseTarget(slot: Slot): Promise<void> {
  const v = app.versions
  if (!v || slot === v.target) return
  if (project.dirty && !confirm('You have unsaved changes. Switching the target version reloads the mod: save first, or lose them. Switch anyway?')) return
  try {
    await applyTarget(slot)
    const version = (slot === 'migration' ? app.versions?.migration?.version : app.versions?.main?.version) ?? null
    if (project.m && version && versionFamily(project.m.project.target) !== versionFamily(version)) {
      project.change((m) => { m.project.target = version })
      await project.save()
    }
    app.flash(`Now targeting Starsector ${version}.`)
  } catch (e) { app.error = cleanError(e) }
}
