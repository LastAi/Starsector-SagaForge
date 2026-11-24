/** #67 U43 (user, 2026-11-23): node groups, the hail on contact and the built-in Fleet response group. */
import { describe, expect, it } from 'vitest'
import { newQuest } from '../src/shared/quest'
import { compileQuest } from '../src/shared/export/questrules'
import { newCommDialog } from '../src/shared/encounters'
import { hailRules } from '../src/shared/export/hails'
import { emptyModel, planTexts } from '../src/shared/serialize'
import { BUILTIN_GROUPS } from '../src/shared/groups'
import {
  applyReplace, chartNodeOf, compareGroups, expandGroups, expandModelGroups, groupChoices, groupDefProblems, groupHash,
  groupInstanceProblems, otherVersions, replacePlan, ungroup, type NodeGroupDef
} from '../src/shared/nodegroups'
import type { DialogNode, QuestPlan } from '../src/shared/model'

describe('#67 U43: hail on contact and the Fleet response node group (the Knights of Ludd\'s way)', () => {
  const place = (id: string, response: string) => ({ id, type: 'group', x: 0, y: 0, group: 'sagaforge.fleet_response', values: { response } }) as never
  const model = () => {
    const m = emptyModel()
    m.project.prefix = 'toc_'
    const e = { format: 1, id: 'toc_back_taxes', name: 'Back Taxes', fleet: { faction: 'hegemony', type: 'investigators', size: 'fp', points: 60 }, spawn: { when: 'quest-stage', at: 'jangala' }, behavior: 'intercept-player', flags: {}, commDialog: 'toc_back_taxes_comm', hail: { text: 'You\'re being hailed by the Hegemony.', describe: true } } as never
    m.encounters.push(e)
    m.nodeGroups = [structuredClone(BUILTIN_GROUPS[0])]
    const q = newCommDialog(e)
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.options = [{ id: 'pay', text: 'Pay' }, { id: 'refuse', text: 'Refuse' }, { id: 'flee', text: 'Flee' }] as never
    q.nodes = q.nodes.filter((n) => n.id !== 'cut_link')
    q.nodes.push(place('go', 'release'), place('fight', 'fight'), place('run', 'flee'))
    q.edges = [...q.edges.filter((x) => x.from !== 'offer'), { id: 'a', from: 'offer', handle: 'pay', to: 'go' }, { id: 'b', from: 'offer', handle: 'refuse', to: 'fight' }, { id: 'c', from: 'offer', handle: 'flee', to: 'run' }]
    m.quests.push(q)
    return m
  }
  const opts = (m: ReturnType<typeof model>) => ({ sagalib: true, phrases: [], groups: m.nodeGroups, prefix: m.project.prefix })

  it('the hail: BeginFleetEncounter for this fleet, once per meeting; lines, description, the block, HailPlayer', () => {
    const r = hailRules(model().encounters, 'mod')
    expect(r).toHaveLength(1)
    expect(r[0].trigger).toBe('BeginFleetEncounter')
    expect(r[0].conditions).toBe('$entity.sagaforge_encounter == toc_back_taxes score:1000\n!$sagaforge_hailed')
    expect(r[0].script).toBe('$sagaforge_hailed = true 0\nFleetDesc\nMakeOtherFleetPreventDisengage hail true\nHailPlayer')
    expect(r[0].text).toBe('You\'re being hailed by the Hegemony.')
    const m = model()
    m.encounters[0].commDialog = undefined
    expect(hailRules(m.encounters, 'mod')).toEqual([])
  })
  it('the built-in Fleet response group is a valid definition', () => {
    expect(BUILTIN_GROUPS.map((d) => groupDefProblems(d))).toEqual(BUILTIN_GROUPS.map(() => []))
  })
  it('let go, fight and flee end the comm link with vanilla\'s commands', () => {
    const m = model()
    const c = compileQuest(m.quests[0], opts(m))
    const script = (opt: string) => c.rows.find((r) => r.conditions.includes(`$option == toc_back_taxes_comm_${opt}`))?.script.split('\n')
    expect(script('pay')).toEqual(['SF_Despawn', 'ShowDefaultVisual', 'EndConversation NO_CONTINUE'])
    expect(script('refuse')).toEqual(['MakeOtherFleetAllowDisengage sagaforge false', 'MakeOtherFleetHostile sagaforge true', 'MakeOtherFleetAggressive sagaforge true', 'MakeOtherFleetPreventDisengage sagaforge true', 'ShowDefaultVisual', 'EndConversation NO_CONTINUE'])
    expect(script('flee')).toEqual(['MakeOtherFleetPreventDisengage sagaforge false', 'MakeOtherFleetPreventDisengage hail false', '$entity.sagaforge_fled = true', 'ShowDefaultVisual', 'EndConversation NO_CONTINUE'])
    expect(c.usesSagaLib).toBe(true)
    // the expanded nodes map back to the placed node
    expect(chartNodeOf('go__do')).toBe('go')
  })
  it('a missing group and an unknown exit are problems', () => {
    const m = model()
    const q = m.quests[0]
    q.nodes.push({ id: 'x', type: 'group', x: 0, y: 0, group: 'toc.nope', values: {} } as never)
    q.edges.push({ id: 'z', from: 'fight', handle: 'won', to: 'x' })
    expect(groupInstanceProblems(q, m.nodeGroups).map((x) => x.key).sort()).toEqual(['group:toc_back_taxes_comm:x', 'groupexit:toc_back_taxes_comm:fight:won'])
  })
})

describe('#67 U43: node groups', () => {
  const def = (): NodeGroupDef => ({
    format: 1, id: 'toc.pay_or_fight', label: 'Pay or fight', version: 1,
    fields: [
      { key: 'amount', label: 'Amount', type: 'number', default: 1000 },
      { key: 'who', label: 'Who asks', type: 'text', default: 'the officer' },
      { key: 'polite', label: 'Polite', type: 'bool', default: false }
    ],
    entry: 'ask',
    exits: [{ key: 'paid', label: 'Paid', node: 'take', handle: 'next' }, { key: 'refused', label: 'Refused', node: 'ask', handle: 'no' }],
    nodes: [
      { id: 'ask', type: 'dialog', title: '', visual: { kind: 'keep' }, displays: [], text: '"Pay {{amount}} credits," says {{who}}.', highlights: [], conditions: [], script: [], phrases: [],
        options: [{ id: 'yes', text: 'Pay {{amount}}' }, { id: 'no', text: 'Refuse' }, { if: 'polite', id: 'thanks', text: 'Thank them' }] },
      { id: 'take', type: 'action', title: '', ops: [{ op: 'credits', amount: '{{amount}}' }, { if: 'amount != 0', op: 'line', line: '$global.{{prefix}}paid = true' }] }
    ],
    edges: [{ from: 'ask', handle: 'yes', to: 'take' }]
  })
  const quest = (): QuestPlan => ({
    ...newQuest('toc_q', 'Q'),
    nodes: [{ id: 'start', type: 'start', x: 0, y: 0 }, { id: 'g', type: 'group', x: 100, y: 50, group: 'toc.pay_or_fight', values: { amount: 500 } }, { id: 'end', type: 'end', x: 0, y: 0, outcome: 'success' }],
    edges: [{ id: 'e1', from: 'start', handle: 'next', to: 'g' }, { id: 'e2', from: 'g', handle: 'paid', to: 'end' }]
  })

  it('the hash ignores key order and formatting, and follows content', () => {
    const a = def()
    const shuffled = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(a))).reverse()) as unknown as NodeGroupDef
    expect(groupHash(a)).toBe(groupHash(shuffled))
    expect(groupHash(a)).not.toBe(groupHash({ ...a, label: 'Other' }))
    expect(compareGroups(a, { ...a, version: 2, label: 'x' })).toBe('newer')
    expect(compareGroups(a, { ...a, label: 'x' })).toBe('modified')
    expect(compareGroups(a, def())).toBe('same')
  })
  it('expands into normal nodes: fields filled in (typed), ifs applied, ids and option ids per placed node, edges joined', () => {
    const q = expandGroups(quest(), [def()], 'toc_')
    expect(q.nodes.map((n) => n.id)).toEqual(['start', 'g__ask', 'g__take', 'end'])
    const ask = q.nodes[1] as DialogNode
    expect(ask.text).toBe('"Pay 500 credits," says the officer.')
    expect(ask.options.map((o) => o.id)).toEqual(['g__yes', 'g__no'])
    expect([ask.x, ask.y]).toEqual([100, 50])
    expect((q.nodes[2] as unknown as { ops: unknown[] }).ops).toEqual([{ op: 'credits', amount: 500 }, { op: 'line', line: '$global.toc_paid = true' }])
    expect(q.edges.map((e) => `${e.from}:${e.handle}>${e.to}`).sort()).toEqual(['g__ask:g__yes>g__take', 'g__take:next>end', 'start:next>g__ask'])
    const c = compileQuest(quest(), { sagalib: true, phrases: [], groups: [def()], prefix: 'toc_' })
    expect(c.rows.some((r) => r.script.includes('AddCredits 500'))).toBe(true)
  })
  it('Expand into nodes (one way): the placed node becomes its nodes, readable ids, edges kept', () => {
    const q = quest()
    expect(ungroup(q, 'g', [def()], 'toc_')).toEqual(['g_ask', 'g_take'])
    expect(q.nodes.some((n) => n.type === 'group')).toBe(false)
    expect(q.edges.map((e) => `${e.from}:${e.handle}>${e.to}`).sort()).toEqual(['g_ask:g__yes>g_take', 'g_take:next>end', 'start:next>g_ask'])
  })
  it('checks a definition: namespaced id, its tokens, its exits, no groups or starts inside', () => {
    expect(groupDefProblems(def())).toEqual([])
    const bad = { ...def(), id: 'pay', entry: 'zzz', exits: [{ key: 'a', label: 'A', node: 'nope', handle: 'next' }], nodes: [...def().nodes, { id: 'inner', type: 'group' }, { id: 's', type: 'start', text: '{{missing}}' }] }
    const p = groupDefProblems(bad)
    for (const bit of ['namespaced', 'entry', 'Exit "a"', "groups can't hold groups", 'Start node', '{{missing}}']) expect(p.some((x) => x.includes(bit)), bit).toBe(true)
  })
  it('Replace matches fields by key: kept, added, dropped; lost exits are listed and their edges go', () => {
    const m = emptyModel('toc_')
    m.nodeGroups = [def()]
    m.quests.push(quest())
    const v2: NodeGroupDef = { ...def(), version: 2, changes: 'who is now a person', fields: [{ key: 'amount', label: 'Amount', type: 'number', default: 1000 }, { key: 'who', label: 'Who', type: 'person' }, { key: 'tone', label: 'Tone', type: 'choice', options: ['calm', 'angry'] }], exits: [{ key: 'refused', label: 'Refused', node: 'ask', handle: 'no' }] }
    expect(replacePlan(m, def(), v2)).toEqual({ kept: ['amount'], added: ['tone'], dropped: ['who', 'polite'], lostExits: [{ quest: 'toc_q', node: 'g', exit: 'paid' }], reset: [] })
    applyReplace(m, v2)
    expect(m.nodeGroups![0].version).toBe(2)
    expect((m.quests[0].nodes[1] as unknown as { values: unknown }).values).toEqual({ amount: 500 })
    expect(m.quests[0].edges.map((e) => e.id)).toEqual(['e1'])
  })
  it('the mod carries its copy (sagaforge/nodegroups) and the export sees normal nodes', () => {
    const m = emptyModel('toc_')
    m.nodeGroups = [def()]
    m.quests.push(quest())
    expect(planTexts(m)['sagaforge/nodegroups/toc.pay_or_fight.group.json']).toContain('"toc.pay_or_fight"')
    expect(expandModelGroups(m).quests[0].nodes.some((n) => n.type === 'group')).toBe(false)
  })
  it('the menu shows each id once: the mod\'s copy before a built-in or library one', () => {
    const lib = [{ def: { ...BUILTIN_GROUPS[0], version: 3 }, source: 'library' as const, hash: 'x' }]
    expect(groupChoices([], BUILTIN_GROUPS, lib).map((e) => `${e.source}:${e.def.version}`)).toEqual(['library:3'])
    expect(groupChoices([BUILTIN_GROUPS[0]], BUILTIN_GROUPS, lib).map((e) => e.source)).toEqual(['mod'])
    expect(otherVersions(BUILTIN_GROUPS[0].id, [BUILTIN_GROUPS[0]], BUILTIN_GROUPS, lib).map((e) => e.relation)).toEqual(['newer'])
  })
})
