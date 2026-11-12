/** The Vanguard Compact example (PITCH.md) as plan objects, used as test fixtures and golden cases. */
import type { QuestPlan, Phrase, PersonDef } from '../../src/shared/model'

export const reyesTitle: Phrase = {
  token: '$vgc_reyes_title', owner: 'vgc_reyes', mode: 'first-match',
  cases: [
    { when: ['$player.commissionFactionId == vgc_vanguard'], text: 'Commander $playerLastName' },
    { when: ['RepIsAtWorst vgc_vanguard FRIENDLY'], text: 'Captain $playerLastName' }
  ],
  otherwise: 'Captain'
}

export const reyes: PersonDef = {
  id: 'vgc_reyes', name: { first: 'Ilse', last: 'Reyes' }, gender: 'FEMALE', faction: 'vgc_vanguard', rank: 'spaceCommodore', post: 'stationCommander',
  portrait: 'graphics/portraits/portrait_mercenary02.png', voice: 'soldier', placement: { at: 'market', market: 'vgc_haven', inCommDirectory: true },
  contact: { types: ['military'], importance: 'HIGH' }, tags: [], phrases: [reyesTitle]
}

export function lostConvoy(): QuestPlan {
  return {
    format: 1, id: 'vgc_lost_convoy', title: 'The Lost Convoy', kind: 'quest', icon: '',
    start: { kind: 'contact', person: 'vgc_reyes', freq: 10, minRep: 'FAVORABLE', offerText: 'Reyes has a salvage job.', optionText: 'Ask about the missing convoy' },
    requires: [],
    stages: [
      { id: 'find', title: 'Find the convoy', journal: 'Find the missing convoy in Kestrel.', kind: 'normal', renamedFrom: ['search'] },
      { id: 'return', title: 'Report to Reyes', journal: 'Return to Haven Station.', kind: 'normal', renamedFrom: [] }
    ],
    variables: [{ name: 'pay', type: 'number', scope: 'quest', initial: '1' }],
    rewards: [{ id: 'done', credits: 60000, rep: [{ faction: 'vgc_vanguard', amount: 5 }] }],
    repeatable: false,
    nodes: [
      { id: 'start', type: 'start', x: 0, y: 0 },
      {
        id: 'offer', type: 'dialog', x: 200, y: 0, title: 'Offer', visual: { kind: 'person', person: 'vgc_reyes' }, displays: [], highlights: ['60,000'],
        text: '"$vgc_reyes_title." Reyes doesn\'t look up from her slate.\n\n"Find them, and the Compact pays 60,000 credits."', conditions: [], script: [], phrases: [],
        options: [
          { id: 'accept', text: 'Accept the job' },
          { id: 'catch', text: '"What\'s the catch?"', showOnce: 'conversation' },
          { id: 'double', text: '"Forty crew is worth more than that."', story: { cost: 1 }, showIf: ['$global.vgc_lost_convoy_pay == 1'] },
          { id: 'decline', text: '"Not interested."', shortcut: 'ESC' }
        ]
      },
      { id: 'catch', type: 'dialog', x: 400, y: 100, title: 'Catch', visual: { kind: 'keep' }, displays: [], highlights: [], text: '"Pirates, probably."', conditions: [], script: [], phrases: [], options: [{ id: 'back', text: 'Back' }] },
      { id: 'pay2', type: 'action', x: 400, y: 200, ops: [{ op: 'set', key: '$global.vgc_lost_convoy_pay', value: '2' }] },
      { id: 'go', type: 'stage', x: 600, y: 0, stage: 'find' },
      { id: 'wreck', type: 'dialog', x: 800, y: 0, title: 'Wreck found', visual: { kind: 'illustration', category: 'illustrations', key: 'space_wreckage' }, displays: [{ kind: 'commodity', item: 'vgc_black_box', qty: 1 }], highlights: [], text: 'The convoy\'s hulks drift in the belt.', conditions: [], script: [], phrases: [], options: [{ id: 'leave_wreck', text: 'Leave' }] },
      { id: 'ret', type: 'stage', x: 1000, y: 0, stage: 'return' },
      { id: 'done', type: 'end', x: 1200, y: 0, outcome: 'success', reward: 'done' },
      { id: 'no', type: 'link', x: 400, y: 300, mode: 'trigger', target: 'PopulateOptions', fire: 'FireAll' }
    ],
    edges: [
      { id: 'e1', from: 'start', handle: 'next', to: 'offer' },
      { id: 'e2', from: 'offer', handle: 'accept', to: 'go' },
      { id: 'e3', from: 'offer', handle: 'catch', to: 'catch' },
      { id: 'e4', from: 'catch', handle: 'back', to: 'offer' },
      { id: 'e5', from: 'offer', handle: 'double', to: 'pay2' },
      { id: 'e6', from: 'pay2', handle: 'next', to: 'offer' },
      { id: 'e7', from: 'offer', handle: 'decline', to: 'no' },
      { id: 'e8', from: 'go', handle: 'next', to: 'wreck' },
      { id: 'e9', from: 'wreck', handle: 'leave_wreck', to: 'ret' },
      { id: 'e10', from: 'ret', handle: 'next', to: 'done' }
    ]
  }
}
