/**
 * Which Saga Forge and SagaLib versions meet here (user, 2026-11-19):
 *  - the SagaLib in the game's mods folder is older than the one this Saga Forge is made for
 *    (always a warning: Play in game runs on it), or older than the mod's mod_info.json asks for;
 *  - it is newer than this Saga Forge knows, or the mod was saved or exported by a newer Saga Forge
 *    (its plan files have a newer format, project.json's savedWith, or its SagaLib dependency):
 *    update Saga Forge.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import type { ModModel } from '../serialize'
import { PLAN_FORMAT } from '../model'
import { SAGA_FORGE_VERSION, SAGALIB_MADE_FOR, SAGALIB_MOD_ID } from '../appinfo'
import { cmpVersionStrings } from '../version'

const UPDATE = 'Update Saga Forge (github.com/LastAi/Starsector-SagaForge/releases)'

/** The newest plan format in the mod's plan files (project, quests, systems, encounters). */
export function newestPlanFormat(m: Pick<ModModel, 'project' | 'quests' | 'systems' | 'encounters'>): number {
  const all = [m.project.format, ...m.quests.map((q) => q.format), ...m.systems.map((s) => (s as { format?: number }).format), ...m.encounters.map((e) => (e as { format?: number }).format)]
  return Math.max(0, ...all.filter((f): f is number => typeof f === 'number'))
}

/** The mod was saved by a newer Saga Forge (savedWith or a plan format this one doesn't know). */
export function savedByNewer(m: Pick<ModModel, 'project' | 'quests' | 'systems' | 'encounters'>): string | null {
  if (newestPlanFormat(m) > PLAN_FORMAT) return `its plan files use format ${newestPlanFormat(m)}; this Saga Forge (${SAGA_FORGE_VERSION}) knows format ${PLAN_FORMAT}`
  const w = m.project.savedWith
  if (w && cmpVersionStrings(w, SAGA_FORGE_VERSION) > 0) return `it was last saved with Saga Forge ${w}; this is ${SAGA_FORGE_VERSION}`
  return null
}

export function appVersionProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const m = ctx.model
  const newer = savedByNewer(m)
  if (newer) out.push({ level: 'error', area: 'Saga Forge', key: 'sfnewer', message: `This mod was made with a newer Saga Forge: ${newer}. This version may not know some of its fields, and saving or exporting could drop them. ${UPDATE}.` })
  const dep = ctx.loaded?.modInfo?.dependencies?.find((d) => d.id === SAGALIB_MOD_ID)
  if (dep?.version && cmpVersionStrings(dep.version, SAGALIB_MADE_FOR) > 0) out.push({ level: 'warning', area: 'Saga Forge', key: 'sfnewerlib', message: `The mod's mod_info.json asks for SagaLib ${dep.version}, newer than this Saga Forge is made for (${SAGALIB_MADE_FOR}): a newer Saga Forge exported it. ${UPDATE}.` })

  const lib = ctx.index?.sources?.find((s) => s.id === SAGALIB_MOD_ID)
  const usesLib = !!dep || m.quests.some((q) => q.kind === 'quest') || m.people.length > 0 || m.systems.length > 0
  if (!lib) {
    if (usesLib) out.push({ level: 'warning', area: 'SagaLib', key: 'libmissing', message: `SagaLib isn't in the game's mods folder, so this mod can't run in game. Install SagaLib ${SAGALIB_MADE_FOR} (it comes with Saga Forge's release).` })
    return out
  }
  const have = lib.version || '0'
  if (cmpVersionStrings(have, SAGALIB_MADE_FOR) < 0) {
    const short = dep?.version && cmpVersionStrings(have, dep.version) < 0
    out.push({ level: 'warning', area: 'SagaLib', key: `libold:${have}`, message: `The game's mods folder has SagaLib ${have}; this Saga Forge is made for SagaLib ${SAGALIB_MADE_FOR}.${short ? ` This mod needs ${dep!.version} (its mod_info.json): the launcher won't enable it with ${have}.` : ' Newer features (and their fixes) won\'t work in game.'} Update SagaLib in the mods folder.` })
  } else if (cmpVersionStrings(have, SAGALIB_MADE_FOR) > 0) {
    out.push({ level: 'warning', area: 'SagaLib', key: `libnew:${have}`, message: `The game's mods folder has SagaLib ${have}, newer than this Saga Forge is made for (${SAGALIB_MADE_FOR}). It runs mods made with this version, but the editor doesn't know its new features. ${UPDATE}.` })
  }
  return out
}
