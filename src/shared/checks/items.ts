/** Item checks (PLAN.md §4.7): new ids only, prefixed, not colliding with the game or any installed mod. */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { prefixProblem, ID_PATTERN } from '.'

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
    if (!it.icon) out.push({ level: 'warning', area: 'Item', message: `${it.name} has no icon.`, ref })
    if (!it.description.trim()) out.push({ level: 'warning', area: 'Item', message: `${it.name} has no description (shown in its cargo tooltip).`, ref, key: `nodesc:${it.id}` })
    if (it.kind === 'special' && !it.special?.plugin) out.push({ level: 'error', area: 'Item', message: `${it.name}: a special item needs a plugin class (vanilla's generic one works).`, ref })
  }
  return out
}
