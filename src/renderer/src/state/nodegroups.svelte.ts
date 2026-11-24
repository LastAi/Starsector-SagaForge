/**
 * #67 U43: node groups in the editor: the built-in ones, the library (Settings › Node group library)
 * and the active mod's copies (shared/nodegroups.ts). Placing a group copies its definition into the
 * mod, so the mod never depends on files outside it.
 */
import { BUILTIN_GROUPS } from '../../../shared/groups'
import { groupChoices, groupDefProblems, groupHash, type GroupEntry, type NodeGroupDef } from '../../../shared/nodegroups'
import { project } from './project.svelte'

class GroupLibrary {
  entries = $state.raw<GroupEntry[]>([])
  /** Library files that aren't valid groups (shown in the Node groups panel). */
  broken = $state.raw<{ file: string; problems: string[] }[]>([])
  loaded = false

  async load(): Promise<void> {
    const list = await window.api.listNodeGroups().catch(() => [])
    const ok: GroupEntry[] = []
    const bad: { file: string; problems: string[] }[] = []
    for (const { file, def } of list) {
      const p = typeof def === 'string' ? ["It isn't valid JSON."] : groupDefProblems(def)
      if (p.length) bad.push({ file, problems: p })
      else ok.push({ def: def as NodeGroupDef, source: 'library', hash: groupHash(def as NodeGroupDef), file })
    }
    this.entries = ok
    this.broken = bad
    this.loaded = true
  }
}
export const groupLib = new GroupLibrary()

/** The active mod's copies. */
export const modGroups = (): NodeGroupDef[] => project.m?.nodeGroups ?? []

/** What + Node offers: one entry per group id (the mod's copy first). */
export const groupMenu = (): GroupEntry[] => groupChoices(modGroups(), BUILTIN_GROUPS, groupLib.entries)

/** Copy a definition into the mod (or replace nothing if it already has that id). */
export function ensureInMod(def: NodeGroupDef): void {
  if (modGroups().some((d) => d.id === def.id)) return
  project.change((m) => { m.nodeGroups = [...(m.nodeGroups ?? []), structuredClone($state.snapshot(def) as NodeGroupDef)] })
}
