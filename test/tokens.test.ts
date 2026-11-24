/** #67 U44 (user, 2026-11-23): the token lookup's catalog, the autocomplete's order, and the token checks. */
import { describe, expect, it } from 'vitest'
import { emptyModel } from '../src/shared/serialize'
import { newCommDialog, newEncounter } from '../src/shared/encounters'
import { defsFor } from '../src/shared/defs'
import { buildTokens, defaultTestContext, type Lookup } from '../src/shared/rules/context'
import { completeTokens, searchTokens, tokenCatalog, tokenContext, tokenProblems } from '../src/shared/tokens'
import type { DialogNode, PersonDef } from '../src/shared/model'

const defs = defsFor('0.98a')
const varro = { id: 'toc_varro', name: { first: 'Anselm', last: 'Varro' }, gender: 'MALE', faction: 'hegemony', rank: 'spaceCommander', post: 'fleetCommander', portrait: 'graphics/portraits/varro.png', placement: { at: 'none' }, tags: [], phrases: [] } as unknown as PersonDef
const model = (captain?: string) => {
  const m = emptyModel('toc_')
  m.people.push(structuredClone(varro))
  const e = newEncounter('toc_back_taxes', 'Back Taxes', 'hegemony')
  e.commDialog = 'toc_back_taxes_comm'
  if (captain) e.fleet.flagshipCommander = captain
  m.encounters.push(e)
  m.quests.push(newCommDialog(e))
  return m
}
const look: Lookup = {
  person: (id) => (id === 'toc_varro' ? { first: 'Anselm', last: 'Varro', gender: 'MALE', rank: 'Commander', post: 'Fleet commander', faction: 'hegemony' } : null),
  faction: (id) => (id === 'hegemony' ? { name: 'Hegemony', withArticle: 'the Hegemony', long: 'Hegemony' } : null),
  market: () => null
}
const catalog = (m: ReturnType<typeof model>) => {
  const ctx = tokenContext(m, m.quests[0])
  const values = buildTokens({ ...defaultTestContext(), person: ctx.personId ?? '', faction: ctx.faction ?? '' }, defs, look)
  return tokenCatalog({ m, defs, values, ctx, quest: m.quests[0], portrait: (id) => (id === 'toc_varro' ? 'graphics/portraits/varro.png' : undefined) })
}

describe('#67 U44: the token lookup', () => {
  it('a fleet\'s comm link: $person… is its Flagship by, no market, a fleet', () => {
    expect(tokenContext(model('toc_varro'), model('toc_varro').quests[0])).toMatchObject({ person: 'yes', personId: 'toc_varro', faction: 'hegemony', market: 'no', fleet: 'yes' })
    const c = tokenContext(model(), model().quests[0])
    expect(c.personId).toBeUndefined()
    expect(c.personWhy).toContain('made up by the game')
  })
  it('one entry per token with its capitalised form; this conversation\'s values and portrait', () => {
    const es = catalog(model('toc_varro'))
    const name = es.find((e) => e.group === 'person' && e.token === '$personName')!
    expect(name.cap).toBe('$PersonName')
    expect(es.some((e) => e.token === '$PersonName')).toBe(false)
    const here = es.find((e) => e.group === 'here' && e.token === '$personName')!
    expect(here.value).toBe('Anselm Varro')
    expect(here.example).toBe(false)
    expect(here.image).toEqual({ kind: 'portrait', path: 'graphics/portraits/varro.png' })
    // without a Flagship by: the game's example, marked as one
    expect(catalog(model()).find((e) => e.group === 'here' && e.token === '$personName')!.example).toBe(true)
  })
  it('the mod\'s people have their own name tokens; market tokens don\'t work in a comm link', () => {
    const es = catalog(model('toc_varro'))
    expect(es.filter((e) => e.group === 'people').map((e) => `${e.token}=${e.value}`)).toEqual(['$toc_varro_name=Anselm Varro', '$toc_varro_firstName=Anselm', '$toc_varro_lastName=Varro'])
    const market = es.find((e) => e.group === 'market')!
    expect(market.works).toBe('no')
    expect(market.why).toContain('comm link')
  })
  it('search finds by value or owner; the autocomplete puts tokens starting with what was typed first', () => {
    const es = catalog(model('toc_varro'))
    expect(searchTokens(es, 'varro').some((e) => e.token === '$toc_varro_name')).toBe(true)
    const ac = completeTokens(es, '$personN')
    expect(ac[0].token).toBe('$personName')
    expect(completeTokens(es, '$toc_v').map((e) => e.token)).toEqual(['$toc_varro_name', '$toc_varro_firstName', '$toc_varro_lastName'])
  })
  it('checks: market tokens in a comm link; $person… with no Flagship by; a portrait that isn\'t $person', () => {
    const m = model()
    const offer = m.quests[0].nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = '"$personName here. Docked at $marketName?"'
    offer.visual = { kind: 'person', person: 'toc_varro' }
    const keys = tokenProblems(m).map((p) => p.key)
    expect(keys).toEqual(['tokmarket:toc_back_taxes_comm:offer', 'tokperson:toc_back_taxes_comm:offer', 'tokvisual:toc_back_taxes_comm:offer'])
    // with Varro as Flagship by, only the market remains
    m.encounters[0].fleet.flagshipCommander = 'toc_varro'
    expect(tokenProblems(m).map((p) => p.key)).toEqual(['tokmarket:toc_back_taxes_comm:offer'])
  })
})
