/**
 * The Test context (PLAN.md §5): sample values for the player, the speaker, the faction and the
 * market, turned into the token table and memory the rules engine uses. Tokens the editor can't
 * fill stay visible as [$token].
 */
import type { GameDefinitions } from '../defs/types'
import { newContext, newPlayer, type PlayContext } from './engine'
import type { Value } from './parse'
import { firstNameOf, fullName } from '../personname'

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
  /** Phase 7b (RC-F3): what kind of place the dialog is at; sets the keys vanilla's rules test there. */
  place?: PlacePreset
  /** The place's id ($id / $entity.id when no one is spoken to), e.g. one of the mod's planets. */
  entity?: string
  /** #70: people with a presence rule who are away (sets $global.sagaforge_away_<id> true; the others false). */
  away?: string[]
  /** #62: the mod's settings as the player set them in LunaLib's menu (id → value); missing = the default. */
  settings?: Record<string, string>
}

export type PlacePreset = 'none' | 'market' | 'bar' | 'planet' | 'ruins' | 'ruinsExplored' | 'deciv' | 'derelict'

const PLANET = { '$market.isPlanetConditionMarketOnly': 'true', '$market.isSurveyed': 'true' }

/** The presets and the memory each sets, as vanilla's dialogs see that place (FORMATS.md, "Place presets"). */
export const PLACE_PRESETS: { id: PlacePreset; label: string; help: string; memory: Record<string, string> }[] = [
  { id: 'none', label: '(only the fields below)', help: 'Nothing beyond the fields below.', memory: {} },
  { id: 'market', label: 'Colony, main menu', help: "A colony's menu: trade, the bar, the comm directory.", memory: { '$hasMarket': 'true', '$menuState': 'main' } },
  { id: 'bar', label: 'Colony bar', help: 'Inside a bar, where bar scenes and bar missions are offered (AddBarEvents).', memory: { '$hasMarket': 'true', '$menuState': 'bar' } },
  { id: 'planet', label: 'Uncolonised planet, surveyed', help: "Vanilla's planet dialog (surveyOpen): no colony, survey done.", memory: { ...PLANET } },
  { id: 'ruins', label: 'Planet with vast ruins, unexplored', help: 'Vanilla adds "Explore the ruins" (salRuins_vast, order 5).', memory: { ...PLANET, '$market.hasRuins': 'true', '$market.hasUnexploredRuins': 'true', '$market.mc:ruins_vast': 'true' } },
  { id: 'ruinsExplored', label: 'Planet with vast ruins, explored', help: 'The ruins were explored already (salRuins_alreadyExplored).', memory: { ...PLANET, '$market.hasRuins': 'true', '$market.ruinsExplored': 'true', '$market.mc:ruins_vast': 'true' } },
  { id: 'deciv', label: 'Decivilised world', help: 'A colony that collapsed (surveyOpenDeciv): decivilized, widespread ruins, wasCivilized.', memory: { ...PLANET, '$market.wasCivilized': 'true', '$market.mc:decivilized': 'true', '$market.hasRuins': 'true', '$market.hasUnexploredRuins': 'true', '$market.mc:ruins_widespread': 'true' } },
  { id: 'derelict', label: 'Derelict ship or wreck', help: "A salvageable wreck: vanilla's salvage rules answer it, and it never fires PopulateOptions.", memory: { '$customType': 'wreck', '$tag:salvageable': 'true' } }
]

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
    put('personName', fullName(p))
    // #79 (SagaLib 1.4): a one-name person's first-name tokens are the one name
    put('personFirstName', firstNameOf(p))
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
  // #67 U50/U54: at a market with no speaker or faction given, $faction is the market's owner, as in game
  const mf = t.market && !fid ? look.market(t.market)?.faction : ''
  if (mf) { mem.set('$faction.id', mf); mem.set('$entity.faction.id', mf) }
  if (t.entity && !t.person) { mem.set('$id', t.entity); mem.set('$entity.id', t.entity) }
  for (const [k, v] of Object.entries(PLACE_PRESETS.find((p) => p.id === t.place)?.memory ?? {})) mem.set(k, parseValue(v))
  mem.set('$player.credits', t.credits)
  // #67 U50: the usual case, transponder on (vanilla's plain docking needs it; the memory fields can turn it off)
  mem.set('$player.transponderOn', true)
  // #67: conditions on the player's gender ("Player is female", U4's pictures) read it from memory, as in game
  mem.set('$player.gender', t.playerGender)
  if (t.commission) { mem.set('$player.commissionFactionId', t.commission); mem.set('$global.commissionFaction', t.commission) }
  // #70: SagaLib's away flags (the memory fields below can still override them)
  for (const id of t.away ?? []) mem.set(`$global.sagaforge_away_${id}`, true)
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
