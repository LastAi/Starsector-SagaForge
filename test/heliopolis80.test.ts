/**
 * Task #80: editor fixes found while building Heliopolis (mods/Heliopolis/sagaforge/design/FINDINGS.md
 * H1–H8): derelicts from a ship variant, lock-like conversations only, a progress stage's Spawn,
 * an interjection that goes on to an Arrive, "Start another quest" at a stage, reputation with a
 * named person, a special trade good preset, and an Arrive straight after an Encounter's outcome.
 */
import { describe, expect, it } from 'vitest'
import { vanguardModel } from './fixtures/vanguard'
import { newQuest, newNode, firstStageOf, startQuestLines, startQuestStageProblem } from '../src/shared/quest'
import { newSystem, newEntity, locationProblems } from '../src/shared/locations'
import { encounterProblems } from '../src/shared/encounters'
import { isLockLike, lockedEntityIds } from '../src/shared/patterns'
import { compileQuest, repLine } from '../src/shared/export/questrules'
import { eventOpLines } from '../src/shared/export/events'
import { arriveAfterOutcomeProblems, interjectionProblems, questProblems } from '../src/shared/checks/quests'
import { defsFor } from '../src/shared/defs'
import type { CheckContext } from '../src/shared/checks'
import type { DialogNode, QuestPlan } from '../src/shared/model'

const dialog = (id: string, options: { id: string; text: string }[]): DialogNode => ({ id, type: 'dialog', x: 0, y: 0, visual: { kind: 'keep' }, displays: [], text: 'Text.', highlights: [], options, conditions: [], script: [], phrases: [] })

describe('H1: a derelict built from a ship variant', () => {
  const ctx = (type: string) => {
    const m = vanguardModel()
    const s = newSystem('vgc_h1', 'H1', 0, 0)
    s.entities.push({ ...newEntity('derelict', 'vgc_h1_wreck', 'Wreck', 'star', 3000, 0), type })
    m.systems.push(s)
    return { model: m, index: { markets: [], systems: [], planetTypes: [], customEntityTypes: [{ id: 'wreck' }], conditions: [], industries: [], variants: [{ id: 'tarsus_Standard' }] }, loaded: { sourceId: 'vgc' } } as unknown as CheckContext
  }
  const about = (type: string) => locationProblems(ctx(type)).filter((p) => p.message.includes('"Wreck"')).map((p) => p.message)
  it('accepts a variant id and "wreck", and names an unknown variant', () => {
    expect(about('tarsus_Standard')).toEqual([])
    expect(about('wreck')).toEqual([])
    expect(about('nope_Hull')).toEqual(['"Wreck": unknown ship variant "nope_Hull" (a derelict\'s type is a variant id, or "wreck" for a random hull).'])
  })
})

describe('H2: only lock-like conversations lock a place', () => {
  const conv = (id: string, conds: string[]) => {
    const q = newQuest(id, id, 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: conds }
    q.nodes = [q.nodes[0], dialog('hold', [{ id: 'leave', text: 'Leave' }]), { id: 'close', type: 'link', x: 0, y: 0, mode: 'option', target: 'defaultLeave' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'hold' }, { id: 'b', from: 'hold', handle: 'leave', to: 'close' }]
    return q
  }
  it('a Leave-only conversation is a lock; a first-visit scene that changes things and hands back is not', () => {
    const lock = conv('vgc_lock', ['$id == vgc_probe score:500', '!SF_QuestDone vgc_q'])
    const welcome = conv('vgc_welcome', ['$id == vgc_station score:1000', '!$global.vgc_met'])
    welcome.nodes.push({ id: 'met', type: 'action', x: 0, y: 0, title: '', ops: [{ op: 'set', key: '$global.vgc_met', value: 'true' }] }, { id: 'open', type: 'link', x: 0, y: 0, mode: 'trigger', target: 'OpenInteractionDialog', fire: 'FireAll' })
    welcome.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'hold' }, { id: 'b', from: 'hold', handle: 'leave', to: 'met' }, { id: 'c', from: 'met', handle: 'next', to: 'open' }]
    expect(isLockLike(lock)).toBe(true)
    expect(isLockLike(welcome)).toBe(false)
    expect([...lockedEntityIds([lock, welcome])]).toEqual(['vgc_probe'])
  })
  it('a scene that ends back at the menu is not a lock either', () => {
    const q = conv('vgc_menu', ['$id == vgc_station'])
    q.nodes[2] = { id: 'close', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }
    expect(isLockLike(q)).toBe(false)
  })
})

describe('H3: a progress event stage spawns an encounter', () => {
  it('its Spawn counts, in the stage\'s actions and in its outcomes', () => {
    const m = vanguardModel()
    const lc = m.quests.find((q) => q.id === 'vgc_lost_convoy')!
    lc.nodes = lc.nodes.filter((n) => n.id !== 'ambush')
    lc.edges = lc.edges.filter((e) => e.from !== 'ambush' && e.to !== 'ambush')
    const ctx = { model: m, index: { factions: [{ id: 'pirates' }], markets: [], variants: [] }, defs: { fleetTypes: [{ id: m.encounters[0].fleet.type }] } } as unknown as CheckContext
    const noQuest = () => encounterProblems(ctx).filter((p) => p.message.includes('no quest or world event spawns it'))
    expect(noQuest()).toHaveLength(1)
    const stage = { id: 's1', progress: 100, title: 'S', text: '', actions: [] as never[], outcomes: [{ id: 'o', label: 'O', weight: 1, actions: [{ op: 'spawn' as const, encounter: 'vgc_belt_ambush' }] }] }
    m.progress = [{ id: 'vgc_pe', name: 'PE', max: 300, startConditions: [], stages: [stage], factors: [] }]
    expect(noQuest()).toHaveLength(0)
  })
})

describe('H4: an interjection goes on to an Arrive and still hands back', () => {
  function story(): QuestPlan {
    const q = newQuest('vgc_kin', 'Kin')
    q.start = { kind: 'interject', option: 'salExplore', conditions: ['$id == vgc_probe'], once: 'entity' }
    q.stages = [{ id: 'home', title: 'Home', journal: '', kind: 'normal', renamedFrom: [] }]
    const start = q.nodes[0]
    q.nodes = [start, dialog('d', [{ id: 'take', text: 'Take them home' }, { id: 'no', text: 'Leave them' }]),
      { id: 'st', type: 'stage', x: 0, y: 0, stage: 'home' }, { ...newNode('wait', 'arrive', 0, 0), entity: 'vgc_station' } as never,
      dialog('there', [{ id: 'bye', text: 'Leave' }]), { id: 'back', type: 'link', x: 0, y: 0, mode: 'option', target: 'salExplore' }, { id: 'menu', type: 'link', x: 0, y: 0, mode: 'menu', target: '' }]
    q.edges = [{ id: 'a', from: start.id, handle: 'next', to: 'd' }, { id: 'b', from: 'd', handle: 'take', to: 'st' }, { id: 'c', from: 'st', handle: 'next', to: 'arrive' },
      { id: 'd', from: 'arrive', handle: 'next', to: 'there' }, { id: 'e', from: 'there', handle: 'bye', to: 'menu' }, { id: 'f', from: 'd', handle: 'no', to: 'back' }]
    return q
  }
  it('the Stage before the Arrive hands back to the option it cut into; the Arrive\'s own scene doesn\'t', () => {
    const rows = compileQuest(story(), { sagalib: true, phrases: [] }).rows
    const st = rows.find((r) => r.script.startsWith('SF_Step vgc_kin home'))!
    expect(st.script.split('\n')).toEqual(['SF_Step vgc_kin home', '$option = salExplore 0', 'FireBest DialogOptionSelected'])
    const there = rows.find((r) => r.script.includes('SF_BackToMenu'))
    expect(there).toBeTruthy()
  })
  it('the check counts the Arrive as handing back', () => {
    expect(interjectionProblems(story()).filter((p) => p.message.includes('doesn\'t hand back'))).toEqual([])
  })
})

describe('H5: Start another quest at a stage', () => {
  const started = () => {
    const q = newQuest('vgc_next', 'Next')
    q.start = { kind: 'manual' }
    q.stages = [{ id: 'travel', title: 'Travel', journal: '', kind: 'normal', renamedFrom: [] }]
    q.nodes = [q.nodes[0], { id: 'st', type: 'stage', x: 0, y: 0, stage: 'travel' }]
    q.edges = [{ id: 'a', from: 'start', handle: 'next', to: 'st' }]
    return q
  }
  it('finds the first stage and exports SF_Start then SF_Step', () => {
    expect(firstStageOf(started())).toBe('travel')
    expect(startQuestLines({ quest: 'vgc_next', stage: 'travel' })).toEqual(['SF_Start vgc_next', 'SF_Step vgc_next travel'])
    expect(startQuestLines({ quest: 'vgc_next' })).toEqual(['SF_Start vgc_next'])
    expect(eventOpLines({ op: 'startQuest', quest: 'vgc_next', stage: 'travel' })).toEqual(['SF_Start vgc_next', 'SF_Step vgc_next travel'])
    const q = newQuest('vgc_first', 'First')
    q.nodes.push({ id: 'go', type: 'action', x: 0, y: 0, title: '', ops: [{ op: 'startQuest', quest: 'vgc_next', stage: 'travel' }] })
    q.edges.push({ id: 'x', from: 'offer', handle: 'accept', to: 'go' })
    expect(compileQuest(q, { sagalib: true, phrases: [] }).rows.find((r) => r.script.includes('SF_Start vgc_next'))!.script).toContain('SF_Step vgc_next travel')
  })
  it('warns without a stage, and names an unknown one', () => {
    const qs = [started()]
    expect(startQuestStageProblem({ quest: 'vgc_next' }, qs)?.level).toBe('warning')
    expect(startQuestStageProblem({ quest: 'vgc_next', stage: 'travel' }, qs)).toBeNull()
    expect(startQuestStageProblem({ quest: 'vgc_next', stage: 'gone' }, qs)?.level).toBe('error')
  })
  it('no warning when the quest fires the started quest\'s first node itself (Link › trigger)', () => {
    const from = newQuest('vgc_first', 'First')
    from.nodes.push({ id: 'go', type: 'link', x: 0, y: 0, mode: 'trigger', target: 'vgc_next_st', fire: 'FireBest' })
    expect(startQuestStageProblem({ quest: 'vgc_next' }, [started()], from)).toBeNull()
  })
})

describe('H6: reputation with a named person', () => {
  it('a named person is AdjustRepPerson with vanilla\'s limit; "$person" is the person talked to', () => {
    expect(repLine({ person: 'vgc_reyes', amount: 5 })).toBe('AdjustRepPerson vgc_reyes COOPERATIVE 5')
    expect(repLine({ person: 'vgc_reyes', amount: -10 })).toBe('AdjustRepPerson vgc_reyes VENGEFUL -10')
    expect(repLine({ person: '$person', amount: 3 })).toBe('AdjustRepActivePerson 3')
    expect(repLine({ faction: 'hegemony', amount: 3 })).toBe('AdjustRep hegemony 3')
  })
  it('world events and progress stages export a named person too (they used to drop it), never "$person"', () => {
    expect(eventOpLines({ op: 'rep', person: 'vgc_reyes', amount: 3 })).toEqual(['AdjustRepPerson vgc_reyes COOPERATIVE 3'])
    expect(eventOpLines({ op: 'rep', faction: 'hegemony', amount: -2 })).toEqual(['AdjustRep hegemony -2'])
    expect(eventOpLines({ op: 'rep', person: '$person', amount: 3 })).toEqual([])
  })
})

describe('H7: a special trade good preset', () => {
  it('is a special item in both game versions', () => {
    for (const v of ['0.98a', '0.98.5a']) {
      const p = defsFor(v).itemPresets.find((x) => x.id === 'special_trade_good')
      expect(p?.kind).toBe('special')
      expect(p?.columns['plugin']).toBe('com.fs.starfarer.api.campaign.impl.items.GenericSpecialItemPlugin')
    }
  })
})

describe('H8: an Arrive straight after an Encounter\'s outcome', () => {
  function q(withStage: boolean): QuestPlan {
    const x = newQuest('vgc_fight', 'Fight')
    x.stages.push({ id: 'after', title: 'After', journal: '', kind: 'normal', renamedFrom: [] })
    x.nodes.push({ id: 'enc', type: 'encounter', x: 0, y: 0, encounter: 'vgc_belt_ambush' }, { id: 'won', type: 'action', x: 0, y: 0, title: '', ops: [] },
      { ...newNode('wait', 'arrive', 0, 0), entity: 'vgc_probe' } as never, { id: 'st', type: 'stage', x: 0, y: 0, stage: 'after' })
    x.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'enc' }, { id: 'b', from: 'enc', handle: 'defeated', to: 'won' })
    if (withStage) x.edges.push({ id: 'c', from: 'won', handle: 'next', to: 'st' }, { id: 'd', from: 'st', handle: 'next', to: 'arrive' })
    else x.edges.push({ id: 'c', from: 'won', handle: 'next', to: 'arrive' })
    return x
  }
  it('warns without a Stage between them, not with one', () => {
    const p = arriveAfterOutcomeProblems(q(false))
    expect(p.map((x) => x.key)).toEqual(['arriveafter:vgc_fight:enc:arrive'])
    expect(arriveAfterOutcomeProblems(q(true))).toEqual([])
  })
  it('is part of the quest checks', () => {
    const m = vanguardModel()
    const x = q(false)
    m.quests.push(x)
    const ctx = { model: m, index: { factions: [], items: [], people: [], markets: [], variants: [], customEntityTypes: [], planetTypes: [] }, defs: defsFor('0.98a'), loaded: { sourceId: 'vgc' } } as unknown as CheckContext
    expect(questProblems(ctx, x).some((p) => p.key === 'arriveafter:vgc_fight:enc:arrive')).toBe(true)
  })
})
