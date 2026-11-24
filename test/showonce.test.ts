/** #67 (found building The Other Captain, 2026-11-24): a show-once option into an Action node sets its asked flag. */
import { describe, expect, it } from 'vitest'
import { compileQuest } from '../src/shared/export/questrules'
import { newQuest } from '../src/shared/quest'
import type { DialogNode } from '../src/shared/model'

describe('show-once options into any node', () => {
  it('sets the asked flag when the option leads into an Action node', () => {
    const q = newQuest('toc_q', 'Q', 'dialog')
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.options = [{ id: 'truth', text: 'Tell the truth', showOnce: 'conversation', showIf: ['$global.x'] }, { id: 'bye', text: 'Bye' }]
    q.nodes.push({ id: 'act', type: 'action', x: 0, y: 0, ops: [{ op: 'set', key: '$global.told', value: 'true' }] })
    q.nodes.push({ id: 'out', type: 'link', x: 0, y: 0, mode: 'close', target: '' })
    q.edges.push({ id: 'e1', from: 'offer', handle: 'truth', to: 'act' }, { id: 'e2', from: 'act', handle: 'next', to: 'offer' }, { id: 'e3', from: 'offer', handle: 'bye', to: 'out' })
    const rows = compileQuest(q, { sagalib: false, phrases: [] }).rows
    const act = rows.find((r) => r.script.includes('$global.told = true'))!
    expect(act.script).toContain('$toc_q_offer_truth_asked = true 0')
    // and the option's own rule hides it once asked
    expect(rows.some((r) => r.conditions.includes('!$toc_q_offer_truth_asked'))).toBe(true)
  })
})
