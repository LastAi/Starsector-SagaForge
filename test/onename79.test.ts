/**
 * Task #79, second part: one-name characters (Heliopolis's cats). "One name" keeps the name in the
 * last-name slot; vanilla's $personFirstName would be empty, SagaLib 1.4 fills it (and 0.98.5a's
 * $PersonFirstName) with the one name, and a one-name person's $<id>_firstName token is the one name.
 * Helpers, export, the SagaLib dependency, Problems, the Test context and Play. SagaLib's side:
 * mods/SagaLib NamesTests and the golden case names.json.
 */
import { describe, expect, it } from 'vitest'
import { firstNameOf, firstNamePhrase, firstNameUses, fullName, isOneName, oneNameOf, personNameTokens, splitIndexName, storedName } from '../src/shared/personname'
import { addNameTokens } from '../src/shared/modelversions'
import { emptyModel, type ModModel } from '../src/shared/serialize'
import { planExport } from '../src/shared/export'
import { needsSagaLib14 } from '../src/shared/export/runtime'
import { oneNameProblems } from '../src/shared/checks/onename'
import { buildTokens, contextFrom, defaultTestContext, type Lookup } from '../src/shared/rules/context'
import { compileQuest, startOptionId } from '../src/shared/export/questrules'
import { compileRules, Engine } from '../src/shared/rules/engine'
import { newSimState, sagaHooks } from '../src/shared/play'
import { testModState } from './fixtures/testmod'
import { MOUSEY, SEVENTYNINE_A, TYGER, namesConversation, catsEncounter } from './fixtures/seventynine'
import type { CheckContext } from '../src/shared/checks'
import type { GameIndex } from '../src/shared/api'
import type { GameDefinitions } from '../src/shared/defs/types'
import type { PersonDef } from '../src/shared/model'

const index = { sources: [], factions: [], people: [{ id: 'other_cat', name: 'Butters', faction: 'independent', market: '', portrait: '', kind: 'sagalib', definedBy: 'other', changedBy: [] }], markets: [], systems: [], items: [], hulls: [], weapons: [], hullmods: [], industries: [], variants: [], codeSystems: [], places: [] } as unknown as GameIndex
const model = (): ModModel => {
  const m = emptyModel('pga_')
  m.people.push({ ...TYGER }, { ...MOUSEY })
  m.quests.push(namesConversation(), catsEncounter().comm)
  m.encounters.push(catsEncounter().enc)
  return m
}
const ctx = (m: ModModel): CheckContext => ({ model: m, index, defs: {} as never, loaded: testModState(SEVENTYNINE_A, m, {}), rules: null, styleChecks: false })

describe('#79 one-name characters: the name', () => {
  it('reads like vanilla\'s FullName, with the one name in the last-name slot', () => {
    expect(fullName({ first: '', last: 'Tyger' })).toBe('Tyger')
    expect(fullName({ first: 'Ana', last: 'Varga' })).toBe('Ana Varga')
    expect(isOneName({ first: '  ', last: 'Butters' })).toBe(true)
    expect(isOneName({ first: 'Ana', last: '' })).toBe(false)
    expect(oneNameOf({ first: 'Mousey', last: '' })).toBe('Mousey')
    expect(storedName({ name: { first: 'Mousey', last: '' }, oneName: true })).toEqual({ first: '', last: 'Mousey' })
    expect(storedName({ name: { first: 'Ana', last: 'Varga' } })).toEqual({ first: 'Ana', last: 'Varga' })
    expect(firstNameOf({ first: '', last: 'Tyger' })).toBe('Tyger')
    expect(firstNameOf({ first: 'Ana', last: 'Varga' })).toBe('Ana')
    expect(splitIndexName('Butters')).toEqual({ first: '', last: 'Butters' })
    expect(splitIndexName('Ana van Varga')).toEqual({ first: 'Ana', last: 'van Varga' })
  })

  it('the active person\'s tokens: vanilla\'s, then SagaLib\'s one-name ones (golden case names.json)', () => {
    expect(personNameTokens({ first: '', last: 'Tyger' })).toEqual({ $personName: 'Tyger', $PersonName: 'Tyger', $personFirstName: 'Tyger', $personLastName: 'Tyger', $PersonFirstName: 'Tyger' })
    expect(personNameTokens({ first: 'Ana', last: 'Varga' })).toEqual({ $personName: 'Ana Varga', $PersonName: 'Ana Varga', $personFirstName: 'Ana', $personLastName: 'Varga' })
    expect(personNameTokens({ first: 'Ana', last: 'Varga' }, true).$PersonFirstName).toBe('Ana')
    expect(firstNamePhrase('$pga_tyger_firstName', 'pga_tyger', '', { first: '', last: 'Tyger' })).toBe('Tyger')
    expect(firstNamePhrase('$pga_tyger_firstName', 'pga_tyger', 'Kitty', { first: '', last: 'Tyger' })).toBe('Kitty')
  })

  it('the generated $<id>_firstName token is the one name', () => {
    const m = addNameTokens(model())
    const ph = m.people.find((p) => p.id === 'pga_tyger')!.phrases
    expect(ph.find((p) => p.token === '$pga_tyger_firstName')?.otherwise).toBe('Tyger')
    expect(ph.find((p) => p.token === '$pga_tyger_name')?.otherwise).toBe('Tyger')
    expect(ph.find((p) => p.token === '$pga_tyger_lastName')?.otherwise).toBe('Tyger')
  })
})

describe('#79 one-name characters: export, dependency, Problems', () => {
  it('exports the flag with the one name in the last-name slot', () => {
    const m = model()
    m.people[1] = { ...MOUSEY, name: { first: 'Mousey', last: '' } } // typed into the first-name field before the switch
    const plan = planExport(m, testModState(SEVENTYNINE_A, m, {}), index, null, { addDependency: true })
    const json = JSON.parse(plan.writes.find((w) => w.path === 'data/sagaforge/people/seventynine_a_people.json')!.text.replace(/^\s*#.*$/gm, '')) as { people: PersonDef[] }
    expect(json.people.find((p) => p.id === 'pga_tyger')).toMatchObject({ name: { first: '', last: 'Tyger' }, oneName: true })
    expect(json.people.find((p) => p.id === 'pga_mousey')).toMatchObject({ name: { first: '', last: 'Mousey' }, oneName: true })
    expect(JSON.stringify(json.people.find((p) => p.id === 'pga_tyger')?.phrases)).toContain('"otherwise":"Tyger"')
  })

  it('needs SagaLib 1.4 when a first-name token meets a one-name person', () => {
    expect(needsSagaLib14(model())).toBe(true)
    const m = model()
    for (const q of m.quests) for (const n of q.nodes) if (n.type === 'dialog') n.text = 'Hello, $personName.'
    expect(needsSagaLib14(m)).toBe(false)
  })

  it('warns where a line names a one-name person by first name, or uses their $<id>_firstName', () => {
    const probs = oneNameProblems(ctx(model()))
    expect(probs.map((p) => `${p.level}:${p.key}`)).toEqual(expect.arrayContaining(['warning:onenamefirst:pga_names:offer', 'warning:onenamefirst:pga_cats_comm:offer']))
    expect(probs.map((p) => p.key)).toEqual(expect.arrayContaining(['onenametoken:pga_names:offer:pga_tyger', 'onenametoken:pga_cats_comm:offer:pga_mousey']))
    expect(probs.find((p) => p.key === 'onenamefirst:pga_names:offer')?.message).toContain('Tyger (who the dialog is with) has one name')
    // another mod's person with one word for a name counts too; a two-name speaker doesn't
    const m = model()
    const q = namesConversation()
    q.id = 'pga_other'
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: [], optionText: 'x' }
    const offer = q.nodes.find((n) => n.id === 'offer')!
    if (offer.type === 'dialog') { offer.speaker = 'other_cat'; offer.text = 'Hi, $personFirstName.' }
    m.quests.push(q)
    m.people.push({ ...TYGER, id: 'pga_ana', name: { first: 'Ana', last: 'Varga' }, oneName: undefined })
    expect(firstNameUses(m, [{ id: 'other_cat', name: 'Butters' }]).some((u) => u.quest === 'pga_other' && u.one === 'Butters')).toBe(true)
    if (offer.type === 'dialog') offer.speaker = 'pga_ana'
    expect(firstNameUses(m).some((u) => u.quest === 'pga_other')).toBe(false)
  })
})

describe('#79 one-name characters: Test context and Play', () => {
  const look: Lookup = {
    person: (id) => (id === 'pga_tyger' ? { ...storedName(TYGER), gender: 'MALE', rank: 'Citizen', post: 'Agent', faction: 'independent' } : null),
    faction: () => null, market: () => null
  }
  const defs = { tokens: [] } as unknown as GameDefinitions

  it('the Test context fills the first-name tokens with the one name', () => {
    const t = buildTokens({ ...defaultTestContext(), person: 'pga_tyger' }, defs, look)
    expect([t.$personFirstName, t.$PersonFirstName, t.$personName, t.$personLastName]).toEqual(['Tyger', 'Tyger', 'Tyger', 'Tyger'])
  })

  it('Play shows the conversation\'s line as the game will', () => {
    const m = addNameTokens(model())
    const q = m.quests.find((x) => x.id === 'pga_names')!
    const phrases = new Map(m.people.flatMap((p) => p.phrases).map((p) => [p.token, p]))
    const c = compileQuest(q, { sagalib: true, phrases: [...phrases.values()] })
    const e = new Engine(compileRules(c.rows), contextFrom({ ...defaultTestContext(), person: 'pga_tyger' }, defs, look), sagaHooks({ quests: [q], phrases, person: (id) => (look.person(id) ?? undefined) }, newSimState()))
    e.fireAll('PopulateOptions')
    e.select(startOptionId(q))
    const text = e.view.paragraphs.map((p) => p.text).join(' | ')
    expect(text).toContain('first [Tyger], First [Tyger], full [Tyger], last [Tyger], token [Tyger], name token [Tyger]')
    expect(text).toContain('"Hi, Tyger."')
  })
})
