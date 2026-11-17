/** Open the reference document (R8) at a list's section, with facts counted from the game's own rules. */
import { app, cleanError } from '../state/app.svelte'
import { referenceHtml } from '../../../shared/reference'

export async function openReference(anchor: string): Promise<void> {
  try {
    const rules = await app.loadRules()
    const voiceRules: Record<string, number> = {}
    for (const r of rules) {
      if (r.sourceId !== 'starsector-core') continue
      for (const m of r.conditions.matchAll(/\$voice\s*==\s*(\w+)/g)) voiceRules[m[1]] = (voiceRules[m[1]] ?? 0) + 1
    }
    const html = referenceHtml(app.defs, { gameVersion: app.index?.install.gameVersion ?? app.defs.gameVersion ?? '?', voiceRules, factionKeyUsage: app.index?.factionKeyUsage, fleetTypeNames: app.index?.fleetTypeNames })
    await window.api.openReference(html, anchor)
  } catch (e) { app.error = cleanError(e) }
}
