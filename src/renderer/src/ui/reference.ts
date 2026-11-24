/** Open the reference document (R8) at a list's section, with facts counted from the game's own rules. */
import { app, cleanError } from '../state/app.svelte'
import { mods } from '../state/mods.svelte'
import { referencePages } from '../../../shared/reference'
import { isVisible } from '../../../shared/modlist'
import { ruleOptions } from '../../../shared/ruleoptions'

/** A file URL for an image of a source (the reference window is a local page). */
const fileUrl = (dir: string, rel: string) => encodeURI(`file:///${`${dir}/${rel}`.replace(/\\/g, '/').replace(/^\/+/, '')}`)

export async function openReference(anchor: string): Promise<void> {
  try {
    const rules = await app.loadRules()
    const voiceRules: Record<string, number> = {}
    for (const r of rules) {
      if (r.sourceId !== 'starsector-core') continue
      for (const m of r.conditions.matchAll(/\$voice\s*==\s*(\w+)/g)) voiceRules[m[1]] = (voiceRules[m[1]] ?? 0) + 1
    }
    const index = app.index
    // #67 (user, 2026-11-22): the conditions of vanilla, the active mod and its listed mods (Saga › Mods), with their icons
    const src = (id: string) => index?.sources.find((s) => s.id === id)
    const conditions = (index?.conditions ?? []).filter((c) => isVisible(c.definedBy, mods.visible)).map((c) => {
      const s = src(c.definedBy)
      return { ...c, iconUrl: c.icon && s ? fileUrl(s.dir, c.icon) : undefined, source: c.definedBy === 'starsector-core' ? '' : s?.name ?? c.definedBy }
    })
    const planetTypeName = (id: string) => index?.planetTypes.find((t) => t.id === id)?.name ?? id
    // #67 U34: the type, market, loot, blueprint and skill pages, from the index the mod sees
    const iconUrl = (sourceId: string, rel: string) => { const s = src(sourceId); return s ? fileUrl(s.dir, rel) : undefined }
    const facts = index ? { ix: index, visible: mods.visible, iconUrl, options: ruleOptions(rules.filter((r) => isVisible(r.sourceId, mods.visible))) } : null
    const { pages, fileOf } = referencePages(app.defs, { gameVersion: index?.install.gameVersion ?? app.defs.gameVersion ?? '?', voiceRules, factionKeyUsage: index?.factionKeyUsage, fleetTypeNames: index?.fleetTypeNames, conditions, planetTypeName, index: facts })
    await window.api.openReference(pages, fileOf(anchor), anchor)
  } catch (e) { app.error = cleanError(e) }
}
