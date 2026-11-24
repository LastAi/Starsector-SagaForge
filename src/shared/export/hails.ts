/**
 * #67 U43 (user, 2026-11-23): an encounter that hails the player when it reaches them, the way
 * vanilla's interceptions do (the Knights of Ludd, Hegemony investigators): on BeginFleetEncounter it
 * shows its lines, blocks leaving and calls HailPlayer, which opens its comm dialog (OpenCommLink,
 * scoped to the fleet) before the fleet screen. Once per meeting ($sagaforge_hailed, local memory):
 * a fleet that catches the player again hails again.
 */
import type { EncounterDef } from '../model'
import type { RuleRow } from '../rules/types'

export function hailRules(encounters: EncounterDef[], sourceId: string): RuleRow[] {
  const out: RuleRow[] = []
  let line = 0
  for (const e of encounters) {
    if (!e.hail || !e.commDialog) continue
    const h = e.hail
    out.push({
      id: `${e.id}_hail`, trigger: 'BeginFleetEncounter',
      conditions: [`$entity.sagaforge_encounter == ${e.id} score:1000`, '!$sagaforge_hailed'].join('\n'),
      script: ['$sagaforge_hailed = true 0', ...(h.describe ? ['FleetDesc'] : []), ...(h.block !== false ? ['MakeOtherFleetPreventDisengage hail true'] : []), 'HailPlayer'].join('\n'),
      text: h.text?.trim() ?? '', options: '', notes: `Saga Forge: ${e.name} hails the player`, sourceId, file: 'hails', line: ++line
    })
  }
  return out
}
