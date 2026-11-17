/**
 * Quest templates (R30; DESIGN-PHASE6.md §2): ready charts with stages, placeholder text, a reward
 * and a note on what to fill in, built the way the editor's own quests are (contact offer → stage →
 * Arrive / Encounter → report → End). Saved templates are plain quest plan files whose id is
 * replaced when used.
 */
import type { DialogNode, QEdge, QNode, QuestPlan, StageDef } from './model'
import { newQuest } from './quest'
import { markTodo } from './todo'

export interface QuestTemplate { id: string; label: string; summary: string; build: (id: string, title: string) => QuestPlan }

/** A template's blanks become "Set later" to-dos (R9), so Problems lists them as a checklist: the contact, every place, every fleet. */
export function markTemplateBlanks(q: QuestPlan): QuestPlan {
  if (q.start.kind === 'contact' && !q.start.person) markTodo(q, 'start.person', 'from the template: who offers it')
  for (const n of q.nodes) {
    if (n.type === 'wait' && n.mode === 'arrive' && !n.entity) markTodo(q, `nodes#${n.id}.entity`, 'from the template: where')
    if (n.type === 'encounter' && !n.encounter) markTodo(q, `nodes#${n.id}.encounter`, 'from the template: which fleet')
  }
  return q
}

/** A small builder: nodes laid out left to right, edges by handle. */
function chart(id: string, title: string) {
  const q = newQuest(id, title, 'quest')
  q.stages = []
  q.nodes = q.nodes.filter((n) => n.type === 'start')
  q.edges = []
  let x = 20, y = 60
  const at = () => { x += 240; return { x, y } }
  const add = (n: QNode) => { q.nodes.push(n); return n.id }
  const link = (from: string, handle: string, to: string) => { q.edges.push({ id: `e_${from}_${handle}`, from, handle, to } as QEdge) }
  const dialog = (nid: string, title: string, text: string, options: { id: string; text: string; shortcut?: string }[]): string =>
    add({ id: nid, type: 'dialog', ...at(), title, visual: { kind: 'none' }, displays: [], text, highlights: [], options, conditions: [], script: [], phrases: [] } as DialogNode)
  const stage = (s: StageDef): string => { q.stages.push(s); return add({ id: `st_${s.id}`, type: 'stage', ...at(), stage: s.id }) }
  const arrive = (nid: string, optionText: string, text: string): string => add({ id: nid, type: 'wait', ...at(), mode: 'arrive', entity: '', optionText, arriveText: text })
  const end = (nid: string, reward?: string): string => add({ id: nid, type: 'end', ...at(), outcome: 'success', reward })
  const menu = (nid: string): string => { y += 120; const r = add({ id: nid, type: 'link', x, y, mode: 'menu', target: '' }); y -= 120; return r }
  const note = (text: string) => add({ id: 'note', type: 'note', x: 20, y: 260, text })
  const encounter = (nid: string): string => add({ id: nid, type: 'encounter', ...at(), encounter: '' })
  /** Contact offer: accept goes on, decline ends the branch. */
  const offer = (text: string, acceptText: string) => {
    const o = dialog('offer', 'Offer', text, [{ id: 'accept', text: acceptText }, { id: 'decline', text: 'Not interested', shortcut: 'ESC' }])
    link('start', 'next', o)
    y += 120
    const back = add({ id: 'declined', type: 'link', x, y, mode: 'menu', target: '' })
    y -= 120
    link(o, 'decline', back)
    return o
  }
  const normal = (sid: string, title: string, journal: string, nextStep: string): StageDef => ({ id: sid, title, journal, nextStep, kind: 'normal', renamedFrom: [] })
  return { q, dialog, stage, arrive, end, menu, note, encounter, offer, link, normal }
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    id: 'delivery', label: 'Delivery', summary: 'Take something to a place; get paid on arrival.',
    build: (id, title) => {
      const b = chart(id, title)
      const o = b.offer('"I need a cargo delivered to <place>, quietly and on time. The pay is good."', 'Accept the delivery')
      const s = b.stage(b.normal('deliver', 'Deliver the cargo', 'Deliver the cargo to <place>.', 'Go to <place>'))
      b.link(o, 'accept', s)
      const a = b.arrive('arrive', 'Hand over the cargo', 'The dock crew is waiting for you.')
      b.link(s, 'next', a)
      const d = b.dialog('handover', 'Handover', '"Right on time." The cargo is checked and signed for, and the payment comes through.', [{ id: 'done', text: 'Continue' }])
      b.link(a, 'next', d)
      b.q.stages.push({ id: 'done', title: 'Delivered', journal: 'You delivered the cargo.', kind: 'success', renamedFrom: [] })
      const e = b.end('end', 'pay')
      b.link(d, 'done', e)
      b.link(e, 'next', b.menu('back'))
      b.q.rewards = [{ id: 'pay', credits: 20000 }]
      b.note('Delivery template: pick the contact (Quest settings › Start), the place (the Arrive node), and replace <place> in the texts. To carry a real item, add an Action that gives it after "Accept" and takes it in the handover.')
      return b.q
    }
  },
  {
    id: 'bounty', label: 'Bounty', summary: 'Destroy a fleet, then report back for the reward.',
    build: (id, title) => {
      const b = chart(id, title)
      const o = b.offer('"A raider fleet has been hitting our traders near <place>. Destroy it and the bounty is yours."', 'Take the bounty')
      const s = b.stage(b.normal('hunt', 'Destroy the raiders', 'Find and destroy the raider fleet near <place>.', 'Hunt the raiders'))
      b.link(o, 'accept', s)
      const en = b.encounter('fleet')
      b.link(s, 'next', en)
      b.link(en, 'next', b.menu('back_after_spawn'))
      const r = b.stage(b.normal('report', 'Report back', 'The raiders are destroyed. Report back to collect the bounty.', 'Return to your contact'))
      b.link(en, 'defeated', r)
      const a = b.arrive('arrive', 'Report the kill', '"Good hunting, I hear."')
      b.link(r, 'next', a)
      b.q.stages.push({ id: 'done', title: 'Bounty paid', journal: 'You collected the bounty.', kind: 'success', renamedFrom: [] })
      const e = b.end('end', 'bounty')
      b.link(a, 'next', e)
      b.link(e, 'next', b.menu('back'))
      b.q.rewards = [{ id: 'bounty', credits: 50000 }]
      b.note('Bounty template: make the raider fleet on the Encounters page (spawn at the hunting ground, hostile) and pick it in the Encounter node. Set the Arrive node\'s place to the contact\'s market.')
      return b.q
    }
  },
  {
    id: 'investigate', label: 'Investigate a place', summary: 'Go somewhere, find something out, bring it back.',
    build: (id, title) => {
      const b = chart(id, title)
      const o = b.offer('"Something happened at <place>, and nobody will tell me what. Go and look."', 'Look into it')
      const s = b.stage(b.normal('investigate', 'Investigate <place>', 'Find out what happened at <place>.', 'Go to <place>'))
      b.link(o, 'accept', s)
      const a = b.arrive('arrive', 'Look around', 'You find signs of what happened here.')
      b.link(s, 'next', a)
      const d = b.dialog('discovery', 'Discovery', 'Among the debris you find a data core, still warm.', [{ id: 'take', text: 'Take the data core' }])
      b.link(a, 'next', d)
      const r = b.stage(b.normal('report', 'Report back', 'You found what happened. Bring the data back.', 'Return to your contact'))
      b.link(d, 'take', r)
      const back = b.arrive('arrive_back', 'Hand over the data core', '"Let me see that."')
      b.link(r, 'next', back)
      b.q.stages.push({ id: 'done', title: 'Case closed', journal: 'You brought the data back.', kind: 'success', renamedFrom: [] })
      const e = b.end('end', 'pay')
      b.link(back, 'next', e)
      b.link(e, 'next', b.menu('back'))
      b.q.rewards = [{ id: 'pay', credits: 30000 }]
      b.note('Investigate template: set the place (first Arrive) and the contact\'s market (second Arrive). A wreck as the place can get "Protect this wreck" so vanilla\'s salvage can\'t remove it first.')
      return b.q
    }
  },
  {
    id: 'rescue', label: 'Rescue', summary: 'Find survivors and bring them home.',
    build: (id, title) => {
      const b = chart(id, title)
      const o = b.offer('"A ship went missing near <place> with my people aboard. Find them."', 'Find them')
      const s = b.stage(b.normal('find', 'Find the survivors', 'Search <place> for the missing crew.', 'Search <place>'))
      b.link(o, 'accept', s)
      const a = b.arrive('arrive', 'Search for survivors', 'A weak beacon is still transmitting.')
      b.link(s, 'next', a)
      const d = b.dialog('survivors', 'Survivors', 'You find the survivors in an escape pod, cold but alive.', [{ id: 'aboard', text: 'Bring them aboard' }])
      b.link(a, 'next', d)
      const r = b.stage(b.normal('return', 'Bring them home', 'Bring the survivors home.', 'Return to your contact'))
      b.link(d, 'aboard', r)
      const back = b.arrive('arrive_back', 'Bring the survivors in', '"You found them. Thank you."')
      b.link(r, 'next', back)
      b.q.stages.push({ id: 'done', title: 'Rescued', journal: 'You brought the survivors home.', kind: 'success', renamedFrom: [] })
      const e = b.end('end', 'thanks')
      b.link(back, 'next', e)
      b.link(e, 'next', b.menu('back'))
      b.q.rewards = [{ id: 'thanks', credits: 25000 }]
      b.note('Rescue template: set the search place and the way home. For a pod that only appears during the quest, give the object Locations › Appears at the "find" stage (SagaLib 1.1).')
      return b.q
    }
  },
  {
    id: 'chain', label: 'Talk to someone', summary: 'A chain of conversations: meet one person, then another.',
    build: (id, title) => {
      const b = chart(id, title)
      const o = b.offer('"Talk to <person> at <place>. Tell them I sent you."', 'I\'ll talk to them')
      const s = b.stage(b.normal('meet', 'Meet <person>', 'Find <person> at <place>.', 'Go to <place>'))
      b.link(o, 'accept', s)
      const a = b.arrive('arrive', 'Ask for <person>', '<person> is expecting you.')
      b.link(s, 'next', a)
      const d = b.dialog('talk', 'Conversation', '"So they sent you. Here is what you need to know."', [{ id: 'thanks', text: 'Thank them and leave' }])
      b.link(a, 'next', d)
      b.q.stages.push({ id: 'done', title: 'Message delivered', journal: 'You met <person>.', kind: 'success', renamedFrom: [] })
      const e = b.end('end')
      b.link(d, 'thanks', e)
      b.link(e, 'next', b.menu('back'))
      b.note('Talk template: set the place, and give the Conversation node <person> as its speaker (Dialog › Speaker). Add more Stage → Arrive → Dialog steps for a longer chain.')
      return b.q
    }
  }
]

/**
 * A saved template used for a new quest: every mention of the old quest id (rule conditions,
 * flags, phrase tokens) becomes the new id, and the title is the new one.
 */
export function fromSavedTemplate(saved: QuestPlan, id: string, title: string): QuestPlan {
  const text = JSON.stringify(saved).split(saved.id).join(id)
  const q = JSON.parse(text) as QuestPlan
  q.id = id
  q.title = title
  delete q.inactive
  delete q.todo
  return q
}
