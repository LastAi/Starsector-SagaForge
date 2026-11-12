import { describe, expect, it } from 'vitest'
import { compileQuest, phraseCombos } from '../src/shared/export/questrules'
import { compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { newSimState, sagaHooks, questState, applyProfile, profileFromPlay } from '../src/shared/play'
import { newQuest, reachable, handlesOf } from '../src/shared/quest'
import { lostConvoy, reyesTitle } from './fixtures/vgc'

function play(q = lostConvoy(), setup?: (e: Engine) => void) {
  const c = compileQuest(q, { sagalib: true, phrases: [reyesTitle] })
  const sim = newSimState()
  const ctx = newContext()
  ctx.tokens.$playerLastName = 'Varga'
  ctx.random = () => 0
  const e = new Engine(compileRules(c.rows), ctx, sagaHooks({ quests: [q], phrases: new Map([[reyesTitle.token, reyesTitle]]) }, sim))
  setup?.(e)
  return { c, e, sim }
}
const opts = (e: Engine) => e.view.options.map((o) => o.id)
const current = (e: Engine) => e.view.paragraphs.filter((p) => !p.previous && p.kind !== 'choice').map((p) => p.text)

describe('quest plan → rules', () => {
  it('compiles readable, prefixed rules with no problems', () => {
    const { c } = play()
    expect(c.problems.filter((p) => p.level !== 'info')).toEqual([])
    const ids = c.rows.map((r) => r.id)
    expect(ids).toContain('vgc_lost_convoy_offer')
    expect(ids).toContain('vgc_lost_convoy_blurb')
    expect(ids.every((id) => id.startsWith('vgc_lost_convoy_'))).toBe(true)
    // the offer is re-entered from "Back" and from the action, so it has its own trigger
    expect(c.entry.offer.trigger).toBe('vgc_lost_convoy_offer')
    // the catch dialog answers its option itself
    expect(c.entry.catch).toEqual({ trigger: 'DialogOptionSelected', conds: ['$option == vgc_lost_convoy_catch'] })
    expect(c.generatedFlags).toEqual([{ key: '$vgc_lost_convoy_offer_catch_asked', node: 'offer', option: 'catch', scope: 'conversation' }])
    expect(c.usesSagaLib).toBe(true)
  })

  it('plays the offer: phrase, show-once option, story option only while pay == 1', () => {
    const { e, sim } = play()
    e.view.options = [{ id: 'vgc_lost_convoy_start', text: 'Ask', order: 0, enabled: true }]
    e.select('vgc_lost_convoy_start')
    expect(current(e)[0]).toBe('"Captain." Reyes doesn\'t look up from her slate.')
    expect(sim.phraseLog).toEqual(['$vgc_reyes_title: otherwise'])
    // pay is not set before the quest starts, so the story option is hidden
    expect(opts(e)).toEqual(['vgc_lost_convoy_accept', 'vgc_lost_convoy_catch', 'vgc_lost_convoy_decline'])
    e.select('vgc_lost_convoy_catch')
    expect(current(e)).toEqual(['"Pirates, probably."'])
    e.select('vgc_lost_convoy_back')
    expect(opts(e)).not.toContain('vgc_lost_convoy_catch')
  })

  it('plays through to the reward, with stages in memory', () => {
    const { e, sim } = play(lostConvoy(), (e) => e.set('$player.commissionFactionId', 'vgc_vanguard'))
    e.view.options = [{ id: 'vgc_lost_convoy_start', text: 'Ask', order: 0, enabled: true }]
    e.select('vgc_lost_convoy_start')
    expect(current(e)[0]).toMatch(/^"Commander Varga\."/)
    e.select('vgc_lost_convoy_accept')
    expect(questState(e, 'vgc_lost_convoy')).toEqual({ state: 'active', step: 'find' })
    expect(e.get('$global.vgc_lost_convoy_pay')).toBe(1)
    expect(current(e)).toEqual(['The convoy\'s hulks drift in the belt.', 'Gained 1× vgc_black_box'])
    e.select('vgc_lost_convoy_leave_wreck')
    expect(questState(e, 'vgc_lost_convoy').state).toBe('success')
    expect(e.ctx.player.credits).toBe(120000 + 60000)
    expect(sim.journal.map((j) => j.text)).toEqual(['Find the missing convoy in Kestrel.', 'Return to Haven Station.'])
    // a test profile copied from here restores the state
    const prof = profileFromPlay(e, 'p1', 'After', [lostConvoy()])
    expect(prof.quests.vgc_lost_convoy).toEqual({ state: 'success', step: 'return' })
    const ctx2 = newContext()
    applyProfile(ctx2, prof, [lostConvoy()])
    expect(ctx2.memory.get('$global.vgc_lost_convoy_step')).toBe('return')
  })

  it('splits phrases into rules for mods without SagaLib (≤ 4 combinations)', () => {
    expect(phraseCombos([reyesTitle]).length).toBe(3)
    const q = newQuest('vgc_talk', 'Talk', 'dialog')
    const offer = q.nodes.find((n) => n.id === 'offer')!
    if (offer.type === 'dialog') offer.text = '"Hello, $vgc_reyes_title."'
    q.edges.push({ id: 'x', from: 'offer', handle: 'leave', to: 'end' })
    q.nodes.push({ id: 'end', type: 'link', x: 0, y: 0, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' })
    const c = compileQuest(q, { sagalib: false, phrases: [reyesTitle] })
    const offerRules = c.rows.filter((r) => r.id.startsWith('vgc_talk_offer'))
    expect(offerRules.map((r) => r.text)).toEqual(['"Hello, Commander $playerLastName."', '"Hello, Captain $playerLastName."', '"Hello, Captain."'])
    expect(c.usesSagaLib).toBe(false)
  })

  it('scores rules about the mod\'s own things on contested triggers, on the same line (never a bare score line)', () => {
    const q = newQuest('vgc_g', 'G', 'dialog')
    q.start = { kind: 'trigger', trigger: 'OpenCommLink', conditions: ['$entity.sagaforge_encounter == vgc_x', '$faction.id == pirates'] }
    q.nodes.push({ id: 'out', type: 'link', x: 0, y: 0, mode: 'option', target: 'cutCommLink' })
    q.edges.push({ id: 'x', from: 'offer', handle: 'leave', to: 'out' })
    const c = compileQuest(q, { sagalib: false, phrases: [] })
    const greet = c.rows.find((r) => r.trigger === 'OpenCommLink')!
    expect(greet.conditions.split('\n')).toEqual(['$entity.sagaforge_encounter == vgc_x score:1000', '$faction.id == pirates'])
    for (const r of c.rows) for (const l of r.conditions.split('\n')) expect(l.trim().startsWith('score'), r.id).toBe(false)
  })

  it('a branch that ends without showing anything goes back to the menu (no stale options)', () => {
    const q = newQuest('vgc_t', 'T', 'quest')
    q.nodes.push({ id: 'go', type: 'stage', x: 0, y: 0, stage: 'go' })
    q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'go' })
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    // with SagaLib: back to the menu, or the dialog closes where there is none (a wreck)
    expect(c.rows.find((r) => r.id === 'vgc_t_go')!.script.split('\n')).toEqual(['SF_Step vgc_t go', 'SF_BackToMenu'])
    expect(c.problems.some((p) => p.key === 'menuback:vgc_t:go' && p.level === 'info')).toBe(true)
    // without SagaLib it is vanilla's FireAll PopulateOptions
    const d = newQuest('vgc_d', 'D', 'dialog')
    d.nodes.push({ id: 'say', type: 'action', x: 0, y: 0, ops: [{ op: 'set', key: '$vgc_said', value: 'true' }] })
    d.edges.push({ id: 'a', from: 'offer', handle: 'leave', to: 'say' })
    const cd = compileQuest(d, { sagalib: false, phrases: [] })
    expect(cd.rows.find((r) => r.script.includes('$vgc_said'))!.script.split('\n').at(-1)).toBe('FireAll PopulateOptions')
  })

  it('the menu-back closes a dialog with no menu (a wreck) and keeps a market\'s menu', () => {
    const q = newQuest('vgc_w', 'W', 'quest')
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgc_wreck'] }
    q.nodes.push({ id: 'go', type: 'stage', x: 0, y: 0, stage: 'go' })
    q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'go' }, { id: 'b', from: 'offer', handle: 'decline', to: 'go' })
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    const run = (extra: Parameters<typeof compileRules>[0]) => {
      const e = new Engine(compileRules([...c.rows, ...extra]), newContext(), sagaHooks({ quests: [q], phrases: new Map() }, newSimState()))
      e.set('$id', 'vgc_wreck')
      e.fireBest('OpenInteractionDialog')
      e.select(e.view.options[0].id)
      return e
    }
    expect(run([]).view.ended).toBe(true)
    const market = run([{ ...c.rows[0], id: 'menu', trigger: 'PopulateOptions', conditions: '', script: '', text: '', options: 'trade:Trade' }])
    expect(market.view.ended).toBe(false)
    expect(market.view.options.map((o) => o.id)).toEqual(['trade'])
  })

  it('reports dead ends and lists handles and reachability', () => {
    const q = lostConvoy()
    q.edges = q.edges.filter((e) => e.id !== 'e7')
    const c = compileQuest(q, { sagalib: true, phrases: [] })
    expect(c.problems.some((p) => p.message.includes('Not interested') && p.level === 'error')).toBe(true)
    expect(reachable(q).has('no')).toBe(false)
    expect(handlesOf(q.nodes.find((n) => n.id === 'offer')!).map((h) => h.id)).toEqual(['accept', 'catch', 'double', 'decline'])
  })
})
