/** Fixes from the workflow walk (INGAME-CHECKS "Workflow checks", 2026-11-15). */
import { describe, expect, it } from 'vitest'
import { worldProblems } from '../src/shared/checks/world'
import { questProblems } from '../src/shared/checks/quests'
import { defsFor } from '../src/shared/defs'
import { newFactionDoc, shipPrefixFor } from '../src/shared/factionform'
import { emptyModel } from '../src/shared/serialize'
import { newSystem, newEntity, newMarket, renameEntity } from '../src/shared/locations'
import { newQuest } from '../src/shared/quest'
import type { CheckContext } from '../src/shared/checks'
import type { GameIndex } from '../src/shared/api'

const index = { factions: [], items: [], people: [], markets: [{ id: 'jangala', name: 'Jangala', entities: ['jangala'] }], codeSystems: [] } as unknown as GameIndex
const ctx = (m: ReturnType<typeof emptyModel>) => ({ model: m, index, loaded: { files: {} } } as unknown as CheckContext)

describe('an arrival at a market id (W4)', () => {
  it('is an error with a fix that names the station', () => {
    const m = emptyModel('vgh_')
    const s = newSystem('vgh_kestrel', 'Kestrel', 0, 0)
    const st = newEntity('station', 'vgh_kestrel_station', 'Haven Station', 'star', 450, 0)
    st.market = newMarket('vgh_haven', 'Haven Station', 'vgh_vanguard')
    s.entities = [st]
    m.systems = [s]
    const q = newQuest('vgh_q', 'Q')
    q.nodes.push({ id: 'dock', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'vgh_haven' })
    m.quests = [q]
    const p = worldProblems(ctx(m)).find((x) => x.message.includes('market\'s id'))
    expect(p?.level).toBe('error')
    expect(p?.fixes?.[0].arg).toEqual({ quest: 'vgh_q', node: 'dock', entity: 'vgh_kestrel_station' })
    // the station's own id is fine, and so is a vanilla market whose entity has the same id
    ;(q.nodes[q.nodes.length - 1] as { entity: string }).entity = 'vgh_kestrel_station'
    expect(worldProblems(ctx(m)).some((x) => x.message.includes('market\'s id'))).toBe(false)
    ;(q.nodes[q.nodes.length - 1] as { entity: string }).entity = 'jangala'
    expect(worldProblems(ctx(m)).some((x) => x.message.includes('market\'s id'))).toBe(false)
  })
})

describe('renaming an entity (F27)', () => {
  it('moves every reference in the mod with it', () => {
    const m = emptyModel('vgh_')
    const s = newSystem('vgh_kestrel', 'Kestrel', 0, 0)
    const planet = newEntity('planet', 'vgh_kestrel_planet', 'Kestrel I', 'star', 2600, 0)
    const st = newEntity('station', 'vgh_kestrel_station', 'Haven Station', 'vgh_kestrel_planet', 450, 0)
    st.market = newMarket('vgh_kestrel_station', 'Haven Station', 'vgh_vanguard')
    s.entities = [planet, st]
    s.removals = [{ target: 'vgh_kestrel_station', quest: 'q', stage: 'x' }]
    m.systems = [s]
    m.descriptions['CUSTOM:vgh_kestrel_station'] = { text1: 'A ring of habitats.' }
    m.people = [{ id: 'vgh_reyes', placement: { at: 'market', market: 'vgh_kestrel_station', inCommDirectory: true } } as never]
    const q = newQuest('vgh_q', 'Q')
    q.stages = [{ id: 'go', title: 'Go', journal: '', kind: 'normal', marker: 'vgh_kestrel_station', renamedFrom: [] }]
    q.start = { kind: 'trigger', trigger: 'OpenInteractionDialog', conditions: ['$id == vgh_kestrel_station score:500'] }
    q.nodes.push({ id: 'dock', type: 'wait', x: 0, y: 0, mode: 'arrive', entity: 'vgh_kestrel_station' })
    m.quests = [q]
    m.testProfiles = [{ id: 'p', name: 'P', quests: {}, flags: {}, player: { startAt: 'vgh_kestrel_station' } }]
    renameEntity(m, 'vgh_kestrel_station', 'vgh_haven')
    expect(st.id).toBe('vgh_haven')
    expect(st.market!.id).toBe('vgh_haven')
    expect((m.people[0].placement as { market: string }).market).toBe('vgh_haven')
    expect(s.removals[0].target).toBe('vgh_haven')
    expect(m.descriptions['CUSTOM:vgh_haven']?.text1).toBe('A ring of habitats.')
    expect(m.descriptions['CUSTOM:vgh_kestrel_station']).toBeUndefined()
    const q2 = m.quests[0]
    expect(q2.stages[0].marker).toBe('vgh_haven')
    expect((q2.start as { conditions: string[] }).conditions[0]).toBe('$id == vgh_haven score:500')
    expect((q2.nodes.find((n) => n.id === 'dock') as { entity: string }).entity).toBe('vgh_haven')
    expect(m.testProfiles[0].player.startAt).toBe('vgh_haven')
    // the planet's own id is untouched (whole words only), and a station orbiting it keeps that orbit
    renameEntity(m, 'vgh_kestrel_planet', 'vgh_kestrel_i')
    expect(planet.id).toBe('vgh_kestrel_i')
    expect(st.orbit.focus).toBe('vgh_kestrel_i')
  })
})

describe('a colon in an option label (#48, in game)', () => {
  it('is a warning, since the game cuts the label there', () => {
    const m = emptyModel('vgh_')
    const q = newQuest('vgh_q', 'Q')
    const offer = q.nodes.find((n) => n.id === 'offer') as { options: { id: string; text: string }[] }
    offer.options[0].text = 'Ask her: why now?'
    m.quests = [q]
    const p = questProblems({ ...ctx(m), defs: defsFor('0.98a') } as unknown as CheckContext, q).find((x) => x.key?.startsWith('optcolon:'))
    expect(p?.level).toBe('warning')
    expect(p?.message).toContain('it shows "Ask her"')
    offer.options[0].text = 'Ask her - why now?'
    expect(questProblems({ ...ctx(m), defs: defsFor('0.98a') } as unknown as CheckContext, q).some((x) => x.key?.startsWith('optcolon:'))).toBe(false)
  })
})

describe('a quote mark at the end of an option label (#77, in game)', () => {
  it('is a warning, since the game drops it; one inside the label is fine', () => {
    const m = emptyModel('vgh_')
    const q = newQuest('vgh_q', 'Q')
    const offer = q.nodes.find((n) => n.id === 'offer') as { options: { id: string; text: string }[] }
    offer.options[0].text = 'Grant VoK\'s "Agriculture Industrialization"'
    m.quests = [q]
    const probs = () => questProblems({ ...ctx(m), defs: defsFor('0.98a') } as unknown as CheckContext, q)
    const p = probs().find((x) => x.key?.startsWith('optquote:'))
    expect(p?.level).toBe('warning')
    expect(p?.message).toContain('it shows Grant VoK\'s "Agriculture Industrialization)')
    offer.options[0].text = 'Grant "Agriculture Industrialization" (VoK)'
    expect(probs().some((x) => x.key?.startsWith('optquote:'))).toBe(false)
    // the start option and an arrival option are checked too
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: [], optionText: 'Ask about "the vault"' }
    expect(probs().some((x) => x.key === 'optquote:vgh_q:start')).toBe(true)
  })
})

describe('new faction defaults (W2)', () => {
  it('use vanilla files that exist and a ship prefix from the name', () => {
    const d = newFactionDoc('vgh_vanguard', 'Vanguard Compact')
    expect(d.logo).toBe('graphics/factions/neutral_traders.png')
    expect(d.crest).toBe('graphics/factions/crest_neutral_traders.png')
    expect(d.shipNamePrefix).toBe('VCS')
    expect(shipPrefixFor('The Knights of the Lost Star')).toBe('KLSS')
    expect(shipPrefixFor('???')).toBe('ISS')
  })
})
