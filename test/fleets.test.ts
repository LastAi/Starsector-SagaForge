/** Phase 5 (DESIGN-PHASE5.md): named fleets, fleet type names, the doctrine preview, removing people. */
import { describe, expect, it } from 'vitest'
import { planExport } from '../src/shared/export'
import { encounterRuntime, needsSagaLib11 } from '../src/shared/export/runtime'
import { compileQuest } from '../src/shared/export/questrules'
import { doctrinePreview, fleetProblems, templateUsers } from '../src/shared/fleets'
import { encounterProblems, newEncounter } from '../src/shared/encounters'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { defsFor } from '../src/shared/defs'
import { parseLooseObject } from '../src/shared/loosejson'
import { hashText } from '../src/main/install'
import type { GameIndex } from '../src/shared/api'
import type { ProjectState } from '../src/shared/project'
import type { CheckContext } from '../src/shared/checks'

const named = (id: string) => ({ id, name: id, definedBy: 'starsector-core', changedBy: [] })
const index = { factions: [named('pirates')], items: [], people: [], markets: [], variants: [named('wolf_Assault'), named('hound_Standard')], systems: [], planetTypes: [], customEntityTypes: [] } as unknown as GameIndex
function state(m: ModModel, files: Record<string, string> = {}): ProjectState {
  return {
    sourceId: 'sfw', modDir: '/x', isNew: false, modInfo: { id: 'sfw', name: 'W', version: '1', gameVersion: '0.98a-RC8', dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: m.factionsRuntime, descriptions: {}, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}

function mod(): ModModel {
  const m = emptyModel('sfw_')
  m.people = [{ id: 'sfw_butters', name: { first: 'Butters', last: '' }, gender: 'MALE', faction: 'pirates', rank: '', post: '', portrait: '', placement: { at: 'none' }, tags: [], phrases: [] }]
  m.fleets = {
    templates: [{ id: 'sfw_pride', name: "Butters's Pride", faction: 'pirates', fleetType: 'sfw_catfleet', ships: [{ variant: 'hound_Standard' }, { variant: 'wolf_Assault', name: 'Thirty Days' }], flagship: 1, captain: 'sfw_butters', captainDiesOnDefeat: true }],
    typeNames: { sfw_catfleet: 'Cat Patrol' }
  }
  const e = newEncounter('sfw_meet', 'Meeting Butters', 'independent')
  e.fleet.size = 'template'
  e.fleet.template = 'sfw_pride'
  m.encounters = [e]
  return m
}

describe('named fleets (R27)', () => {
  it('expands a named fleet into the encounter: ships, names, flagship, captain, template id', () => {
    const m = mod()
    expect(encounterRuntime(m.encounters[0], m).fleet).toEqual({
      faction: 'pirates', type: 'sfw_catfleet', size: 'explicit', points: 0, variants: ['hound_Standard', 'wolf_Assault'], shipNames: ['', 'Thirty Days'],
      flagship: 1, template: 'sfw_pride', flagshipCommander: 'sfw_butters', captainDiesOnDefeat: true, name: "Butters's Pride"
    })
    expect(needsSagaLib11(m)).toBe(true)
    expect(templateUsers(m.encounters, 'sfw_pride').map((u) => u.id)).toEqual(['sfw_meet'])
  })

  it('writes the fleet type names for every faction, merged by key', () => {
    const m = mod()
    const w = planExport(m, state(m), index, null).writes.find((x) => x.path === 'data/world/factions/default_fleet_type_names.json')!
    expect(parseLooseObject(w.text).value).toEqual({ sfw_catfleet: 'Cat Patrol' })
  })

  it('checks named fleets and their encounters, and no longer asks a named fleet for fleet points', () => {
    const m = mod()
    m.fleets!.templates[0].ships.push({ variant: 'nope_Variant' })
    m.fleets!.templates[0].captain = 'sfw_nobody'
    m.encounters.push({ ...newEncounter('sfw_other', 'Other', 'pirates'), fleet: { ...newEncounter('x', 'x', 'pirates').fleet, size: 'template', template: 'sfw_gone' } })
    const ctx = { model: m, index, defs: defsFor('0.98a'), loaded: state(m) } as unknown as CheckContext
    const msgs = fleetProblems(ctx).map((p) => p.message)
    expect(msgs.some((x) => x.includes('unknown variant "nope_Variant"'))).toBe(true)
    expect(msgs.some((x) => x.includes('"sfw_nobody" isn\'t one of the mod\'s people'))).toBe(true)
    expect(msgs.some((x) => x.includes('Other: pick one of the named fleets'))).toBe(true)
    expect(encounterProblems({ ...ctx, model: mod() } as CheckContext).some((p) => p.message.includes('fleet points'))).toBe(false)
  })

  it('"Remove a person" compiles to SagaLib\'s command', () => {
    const q = newQuest('sfw_q', 'Q')
    q.nodes.push({ id: 'act', type: 'action', x: 0, y: 0, ops: [{ op: 'removePerson', person: 'sfw_butters' }] })
    const start = q.nodes.find((n) => n.type === 'start')!
    q.edges = [{ id: 'e', from: start.id, handle: 'next', to: 'act' }]
    expect(compileQuest(q, { sagalib: true, phrases: [] }).rows.map((r) => r.script).join('\n')).toContain('SF_RemovePerson sfw_butters')
  })
})

describe('doctrine preview (R4)', () => {
  it('uses vanilla\'s ship-size counts and normalises the composition', () => {
    const p = doctrinePreview({ warships: 3, carriers: 2, phaseShips: 2, shipSize: 1, officerQuality: 2, shipQuality: 3, numShips: 2, combatFreighterProbability: 0.25 })
    expect(p.mix.warships).toBeCloseTo(3 / 7)
    // FleetFactoryV3: size 1 = base {9,4,2,0} + extra {3,2,1,1}/2
    expect(p.sizes).toEqual({ frigates: 10.5, destroyers: 5, cruisers: 2.5, capitals: 0.5 })
    expect(p.quality).toEqual({ officers: 2, ships: 3, numbers: 2 })
    expect(doctrinePreview({ shipSize: 5 }).sizes.capitals).toBe(1.5)
  })
})
