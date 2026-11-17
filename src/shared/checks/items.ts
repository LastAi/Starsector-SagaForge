/** Item checks (PLAN.md §4.7): new ids only, prefixed, not colliding with the game or any installed mod. */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'
import { ITEM_PLUGINS, pluginInfo } from '../itemplugins'
import { isTodoActive } from '../todo'

export function itemProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  const seen = new Set<string>()
  for (const it of ctx.model.items) {
    const ref = { page: 'items' as const, id: it.id }
    if (seen.has(it.id)) out.push({ level: 'error', area: 'Item', message: `Two items use the id "${it.id}".`, ref })
    seen.add(it.id)
    if (!ID_PATTERN.test(it.id)) out.push({ level: 'error', area: 'Item', message: `Item id "${it.id}" may only use lowercase letters, digits and _.`, ref })
    const pp = prefixProblem(ctx.model.project.prefix, it.id, 'Item', ref)
    if (pp) out.push(pp)
    const other = ctx.index.items.find((x) => x.id === it.id && x.definedBy !== ctx.loaded.sourceId)
    if (other) out.push({ level: 'error', area: 'Item', message: `Item id "${it.id}" is also used by ${other.definedBy === 'starsector-core' ? 'vanilla' : other.definedBy}: a row with that id would replace the other mod's whole row.`, ref })
    if (!it.name.trim()) out.push({ level: 'error', area: 'Item', message: `"${it.id}" has no name.`, ref })
    if (!it.icon && !isTodoActive(it, 'icon')) out.push({ level: 'warning', area: 'Item', message: `${it.name} has no icon.`, ref })
    if (!it.description.trim()) out.push({ level: 'warning', area: 'Item', message: `${it.name} has no description (shown in its cargo tooltip).`, ref, key: `nodesc:${it.id}` })
    if (it.kind === 'special' && !it.special?.plugin) out.push({ level: 'error', area: 'Item', message: `${it.name}: a special item needs a plugin class (vanilla's generic one works).`, ref })
    // a class typed by hand may be the mod's own code: a warning only (R13)
    else if (it.kind === 'special' && it.special?.plugin && !ITEM_PLUGINS.some((x) => x.id === it.special!.plugin)) {
      const short = pluginInfo(it.special.plugin)
      out.push(short
        ? { level: 'error', area: 'Item', message: `${it.name}: plugin "${it.special.plugin}" needs its full class name: ${short.id}.`, ref }
        : { level: 'warning', area: 'Item', message: `${it.name}: plugin "${it.special.plugin}" isn't one of the game's plugin classes. Fine if it is your own class (the mod must contain it); check the spelling otherwise.`, ref, key: `plugin:${it.id}` })
    }
  }
  return out
}

/** Image paths Check mod looks up on disk: item icons and quest icons the user set. */
export function imagePaths(model: CheckContext['model']): string[] {
  const out = new Set<string>()
  for (const it of model.items) if (it.icon) out.add(it.icon)
  for (const q of model.quests) if (q.icon) out.add(q.icon)
  for (const t of model.types?.entities ?? []) for (const p of [t.sprite, t.icon, t.interactionImage]) if (p) out.add(p)
  for (const t of model.types?.planets ?? []) if (t.texture) out.add(t.texture)
  return [...out]
}

/** Check mod: an item or quest icon that points at a file nobody has (the game shows a missing texture). */
export function missingImageProblems(ctx: CheckContext): Problem[] {
  const files = ctx.files
  if (!files) return []
  const out: Problem[] = []
  for (const it of ctx.model.items) {
    if (it.icon && files[it.icon] === false) out.push({ level: 'error', area: 'Item', message: `${it.name}: icon file ${it.icon} doesn't exist in the mod, the game or an installed mod. Pick an icon.`, ref: { page: 'items', id: it.id } })
  }
  for (const q of ctx.model.quests) {
    if (q.icon && files[q.icon] === false) out.push({ level: 'error', area: 'Quest', message: `${q.title}: icon file ${q.icon} doesn't exist in the mod, the game or an installed mod. Pick an icon in the quest settings.`, ref: { page: 'quests', id: q.id } })
  }
  // the mod's own celestial types (R21)
  for (const t of ctx.model.types?.entities ?? []) for (const p of [t.sprite, t.icon, t.interactionImage]) {
    if (p && files[p] === false) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: ${p} doesn't exist in the mod, the game or an installed mod.`, ref: { page: 'locations' } })
  }
  for (const t of ctx.model.types?.planets ?? []) if (t.texture && files[t.texture] === false) out.push({ level: 'error', area: 'Type', message: `Type ${t.name}: texture ${t.texture} doesn't exist in the mod, the game or an installed mod.`, ref: { page: 'locations' } })
  return out
}
