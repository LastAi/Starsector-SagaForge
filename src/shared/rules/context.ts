/**
 * The Test context (PLAN.md §5): sample values for the player, the speaker, the faction and the
 * market, turned into the token table and memory the rules engine uses. Tokens the editor can't
 * fill stay visible as [$token].
 */
import type { GameDefinitions } from '../defs/types'
import { newContext, newPlayer, type PlayContext } from './engine'
import type { Value } from './parse'

export interface TestContext {
  playerFirst: string
  playerLast: string
  playerGender: 'MALE' | 'FEMALE'
  /** Person on the visual panel / talked to (ids as in the game). */
  person: string
  faction: string
  market: string
  credits: number
  storyPoints: number
  rep: Record<string, number>
  commission: string
  /** Extra memory values ($global.x → "3"). */
  memory: Record<string, string>
  /** Outcomes for conditions the engine can't evaluate. */
  assume: Record<string, boolean>
}

export const defaultTestContext = (): TestContext => ({
  playerFirst: 'Ana', playerLast: 'Varga', playerGender: 'FEMALE', person: '', faction: '', market: '',
  credits: 120000, storyPoints: 3, rep: {}, commission: '', memory: {}, assume: {}
})

export interface Lookup {
  person(id: string): { first: string; last: string; gender: string; rank: string; post: string; faction: string } | null
  faction(id: string): { name: string; withArticle: string; long: string } | null
  market(id: string): { name: string; faction: string } | null
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Token table: every vanilla token's sample, overridden by what the context says. Both cases are added. */
export function buildTokens(t: TestContext, defs: GameDefinitions, look: Lookup): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tok of defs.tokens) out[tok.token] = tok.sample
  const put = (k: string, v: string) => { out[`$${k}`] = v; out[`$${cap(k)}`] = cap(v) }
  const female = t.playerGender === 'FEMALE'
  put('playerName', `${t.playerFirst} ${t.playerLast}`.trim())
  put('playerFirstName', t.playerFirst)
  put('playerLastName', t.playerLast)
  put('playerSirOrMadam', female ? "ma'am" : 'sir')
  put('playerHeOrShe', female ? 'she' : 'he')
  put('playerHisOrHer', female ? 'her' : 'his')
  put('playerHimOrHer', female ? 'her' : 'him')
  put('playerManOrWoman', female ? 'woman' : 'man')
  put('playerBrotherOrSister', female ? 'sister' : 'brother')
  const p = t.person ? look.person(t.person) : null
  if (p) {
    const pf = p.gender === 'FEMALE'
    put('personName', `${p.first} ${p.last}`.trim())
    put('personFirstName', p.first)
    put('personLastName', p.last)
    put('personRank', p.rank)
    put('personPost', p.post)
    put('heOrShe', pf ? 'she' : 'he')
    put('hisOrHer', pf ? 'her' : 'his')
    put('himOrHer', pf ? 'her' : 'him')
    put('himOrHerself', pf ? 'herself' : 'himself')
    put('manOrWoman', pf ? 'woman' : 'man')
  }
  const fid = t.faction || p?.faction || ''
  const f = fid ? look.faction(fid) : null
  if (f) {
    put('faction', f.name)
    put('theFaction', f.withArticle || `the ${f.name}`)
    put('factionLong', f.long || f.name)
    put('theFactionLong', `the ${f.long || f.name}`)
  }
  const mk = t.market ? look.market(t.market) : null
  if (mk) { put('marketName', mk.name); put('market', mk.name) }
  return out
}

/** A fresh engine context from the Test context. */
export function contextFrom(t: TestContext, defs: GameDefinitions, look: Lookup): PlayContext {
  const ctx = newContext()
  ctx.tokens = buildTokens(t, defs, look)
  ctx.player = { ...newPlayer(), firstName: t.playerFirst, lastName: t.playerLast, name: `${t.playerFirst} ${t.playerLast}`.trim(), gender: t.playerGender, credits: t.credits, storyPoints: t.storyPoints, rep: { ...t.rep }, commission: t.commission || null }
  const mem = ctx.memory
  const p = t.person ? look.person(t.person) : null
  if (t.person) { mem.set('$id', t.person); mem.set('$isPerson', true); mem.set('$person.id', t.person) }
  const fid = t.faction || p?.faction || ''
  if (fid) { mem.set('$faction.id', fid); mem.set('$entity.faction.id', fid) }
  if (t.market) { mem.set('$market.id', t.market); mem.set('$hasMarket', true); mem.set('$menuState', 'main') }
  mem.set('$player.credits', t.credits)
  if (t.commission) { mem.set('$player.commissionFactionId', t.commission); mem.set('$global.commissionFaction', t.commission) }
  for (const [k, v] of Object.entries(t.memory)) mem.set(k.startsWith('$') ? k : `$${k}`, parseValue(v))
  ctx.assume = { ...t.assume }
  return ctx
}

export function parseValue(s: string): Value {
  if (s === 'true') return true
  if (s === 'false') return false
  if (s.trim() !== '' && !isNaN(Number(s))) return Number(s)
  return s
}
