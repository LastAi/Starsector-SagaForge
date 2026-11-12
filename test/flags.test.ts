import { describe, expect, it } from 'vitest'
import { buildRegistry, flagProblems, renameFlag, suggest } from '../src/shared/flags'
import { emptyModel } from '../src/shared/serialize'
import { findBlocks, writeBlock, handRules, blockHash, detachBlock, outsideBlocks } from '../src/shared/export/blocks'
import { newQuest } from '../src/shared/quest'
import { lostConvoy } from './fixtures/vgc'

describe('flags registry (PLAN.md §4.8)', () => {
  function model() {
    const m = emptyModel('vgc_')
    const a = lostConvoy()
    const offer = a.nodes.find((n) => n.id === 'pay2')!
    if (offer.type === 'action') offer.ops.push({ op: 'set', key: '$global.vgc_convoy_saved', value: 'true' })
    const b = newQuest('vgc_salvage', 'Salvage Rights')
    b.requires = [{ quest: 'vgc_lost_convoy', ended: 'success' }, { flag: '$global.vgc_convoySaved' }]
    m.quests = [a, b]
    return m
  }

  it('finds setters and readers, and the classic typo with a suggestion', () => {
    const m = model()
    const reg = buildRegistry(m, [])
    expect(reg.get('$global.vgc_convoy_saved')!.setBy.length).toBe(1)
    expect(reg.get('$global.vgc_convoySaved')!.readBy[0].quest).toBe('vgc_salvage')
    expect(suggest('$global.vgc_convoySaved', reg)).toBe('$global.vgc_convoy_saved')
    const probs = flagProblems(reg, 'vgc_')
    const typo = probs.find((p) => p.key === 'flagunset:$global.vgc_convoySaved')!
    expect(typo.message).toMatch(/Did you mean \$global\.vgc_convoy_saved/)
    expect(reg.get('$vgc_lost_convoy_offer_catch_asked')!.generated).toBe(true)
    // the one-click fix renames the key in the plans
    renameFlag(m, '$global.vgc_convoySaved', '$global.vgc_convoy_saved')
    expect(flagProblems(buildRegistry(m, []), 'vgc_').some((p) => p.key === 'flagunset:$global.vgc_convoySaved')).toBe(false)
  })

  it('reads the mod\'s hand-written rules and knows keys set by other mods', () => {
    const m = emptyModel('vgc_')
    const rules = 'id,trigger,conditions,script,text,options,notes\nmine,OpenCommLink,$global.other_mod_flag,$global.vgc_hand = 1,,,\n'
    const reg = buildRegistry(m, handRules(rules, 'me'), [{ id: 'x', trigger: 't', conditions: '', script: '$global.other_mod_flag = true', text: '', options: '', notes: '', sourceId: 'other', file: '', line: 1 }])
    expect(reg.get('$global.other_mod_flag')!.external).toBe('other')
    expect(flagProblems(reg, 'vgc_').some((p) => p.key === 'flagunset:$global.other_mod_flag')).toBe(false)
  })
})

describe('owned blocks (PLAN.md §6 rule 4)', () => {
  const head = 'id,trigger,conditions,script,text,options,notes\r\n'
  const hand = 'mine,OpenCommLink,,,Hello,,\r\n'

  it('adds, replaces and keeps hand-written rows untouched', () => {
    const r1 = writeBlock(head + hand, 'quest=vgc_q', ['vgc_q_a,DialogOptionSelected,,,"Text, with comma",,'], 7)
    expect(r1.state).toBe('new')
    expect(r1.text.startsWith(head + hand)).toBe(true)
    expect(r1.text).toContain('# sagaforge:begin quest=vgc_q hash=')
    expect(r1.text.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
    const blocks = findBlocks(r1.text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].hash).toBe(blockHash(blocks[0].body))
    // same rows again: unchanged
    expect(writeBlock(r1.text, 'quest=vgc_q', ['vgc_q_a,DialogOptionSelected,,,"Text, with comma",,'], 7).state).toBe('same')
    const r2 = writeBlock(r1.text, 'quest=vgc_q', ['vgc_q_b,DialogOptionSelected,,,,,'], 7)
    expect(r2.state).toBe('changed')
    expect(r2.text).toContain(hand)
    expect(r2.text).not.toContain('vgc_q_a')
    expect(handRules(r2.text, 'me').map((r) => r.id)).toEqual(['mine'])
    expect(outsideBlocks(r2.text)).toBe(head + hand)
  })

  it('notices hand edits inside a block, and detaches', () => {
    const r1 = writeBlock(head, 'quest=vgc_q', ['vgc_q_a,X,,,,,'], 7)
    const edited = r1.text.replace('vgc_q_a,X', 'vgc_q_a,Y')
    expect(writeBlock(edited, 'quest=vgc_q', ['vgc_q_a,Z,,,,,'], 7).state).toBe('edited-by-hand')
    expect(writeBlock(edited, 'quest=vgc_q', ['vgc_q_a,Z,,,,,'], 7, { force: true }).state).toBe('changed')
    const det = detachBlock(edited, 'quest=vgc_q')
    expect(findBlocks(det)).toHaveLength(0)
    expect(handRules(det, 'me').map((r) => r.trigger)).toEqual(['Y'])
  })
})
