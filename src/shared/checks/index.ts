/**
 * Live checks over the editable model (PLAN.md §6, Problems and checks). Pure functions, used by
 * the UI (live problems) and by Check mod (with the full rule set of the game and every mod).
 * Each area adds its checks in its own module; this file combines them.
 */
import type { GameIndex, Problem } from '../api'
import type { GameDefinitions } from '../defs/types'
import type { ModModel } from '../serialize'
import type { ProjectState } from '../project'
import type { RuleRow } from '../rules/types'
import { factionProblems } from './factions'
import { allQuestProblems } from './quests'
import { buildRegistry, flagProblems } from '../flags'
import { handRules } from '../export/blocks'
import { locationProblems } from '../locations'
import { encounterProblems } from '../encounters'
import { saveChecker } from '../release'
import { styleChecks } from './style'
import { itemProblems, missingImageProblems } from './items'
import { todoProblems } from '../todo'
import { inactiveProblems, softenInactive } from '../inactive'
import { imageSizeProblems } from './images'
import { nameProblems } from './names'
import { worldProblems } from './world'
import { fleetProblems } from '../fleets'
import { versionProblems } from '../versionrefs'
import { poolProblems } from './pools'
import { eventProblems } from './events'
import { progressProblems } from './progress'
import type { VersionDiff } from '../versiondiff'
import { modTakeoverProblems } from '../export'

export interface CheckContext {
  model: ModModel
  index: GameIndex
  defs: GameDefinitions
  loaded: ProjectState
  /** Every rules.csv row of the game and all mods (Check mod only; live checks pass null). */
  rules: RuleRow[] | null
  styleChecks: boolean
  /**
   * Whether each image path in imagePaths(model) exists in the mod, the game or an installed mod
   * (or is waiting to be copied in on save). Check mod only; live checks leave it out.
   */
  files?: Record<string, boolean> | null
  /** Sizes of the mod's own images in the kinds' folders (Check mod only), for the size check (R5). */
  imageSizes?: Record<string, { w: number; h: number }> | null
  /** #47: the comparison with the other install and which side is targeted (two installs only). */
  version?: { diff: VersionDiff; targetIsNewer: boolean } | null
}

type Checker = (ctx: CheckContext) => Problem[]
const CHECKERS: Checker[] = [basicProblems, factionProblems, allQuestProblems, flagsChecker, locationProblems, encounterProblems, saveChecker, styleChecks, itemProblems, missingImageProblems, (ctx) => todoProblems(ctx.model), (ctx) => inactiveProblems(ctx.model), imageSizeProblems, nameProblems, worldProblems, fleetProblems, poolProblems, eventProblems, progressProblems,
  (ctx) => (ctx.version ? versionProblems(ctx.model, ctx.version.diff, ctx.version.targetIsNewer, ctx.defs) : []),
  // Check mod only: rules that would take over the game's or other mods' dialog (Export runs it too)
  (ctx) => (ctx.rules ? modTakeoverProblems(ctx.model, ctx.loaded, ctx.index, ctx.rules) : [])]

function flagsChecker(ctx: CheckContext): Problem[] {
  const own = handRules(ctx.loaded.files['data/campaign/rules.csv']?.text, ctx.loaded.sourceId)
  const ext = ctx.rules ? ctx.rules.filter((r) => r.sourceId !== ctx.loaded.sourceId) : []
  return flagProblems(buildRegistry(ctx.model, own, ext), ctx.model.project.prefix)
}

/** Register more checkers (each milestone's module adds its own). */
export function addChecker(c: Checker): void { if (!CHECKERS.includes(c)) CHECKERS.push(c) }

export function checkModel(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  for (const c of CHECKERS) {
    try { out.push(...c(ctx)) } catch (e) {
      out.push({ level: 'error', area: 'Editor', message: `A check failed: ${(e as Error)?.message ?? e}` })
    }
  }
  const ignored = new Map(ctx.model.project.ignores.map((i) => [i.key, i.reason]))
  // problems inside inactive content are warnings (R10)
  return softenInactive(ctx.model, out).filter((p) => !(p.key && ignored.has(p.key)) && (ctx.styleChecks || p.level !== 'style'))
}

function basicProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  for (const e of ctx.loaded.errors) out.push({ level: 'error', area: 'Plan file', file: e.file, message: `Can't read ${e.file}: ${e.message}. It is left as it is until fixed by hand.`, key: `planfile:${e.file}` })
  if (!ctx.model.project.prefix) out.push({ level: 'warning', area: 'Project', message: 'The mod has no id prefix yet.', key: 'noprefix' })
  return out
}

/** Ids must use the mod's prefix (PLAN.md §6 rule 3). */
export function prefixProblem(prefix: string, id: string, what: string, ref: Problem['ref']): Problem | null {
  if (!prefix || id.startsWith(prefix)) return null
  return { level: 'warning', area: what, message: `${what} id "${id}" doesn't start with the mod's prefix "${prefix}".`, ref, key: `prefix:${what}:${id}` }
}

export const ID_PATTERN = /^[a-z0-9_]+$/
