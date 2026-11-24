/**
 * #67 U44 (user, 2026-11-23): the token lookup. What text tokens there are, grouped, with their
 * values where the editor knows them (this conversation's person and faction, the mod's people, the
 * Test context's player), pictures, and whether each works where it is used. Shared by the token
 * window, the "$" autocomplete and the checks.
 */
import type { GameDefinitions } from './defs/types'
import type { DialogNode, EncounterDef, PersonDef, QuestPlan } from './model'
import type { ModModel } from './serialize'
import type { Problem } from './api'
import { effectiveFleet } from './encounters'
import { NAME_TOKENS, nameToken } from './modelversions'
import { fullName } from './personname'

export type TokenGroupId = 'here' | 'people' | 'player' | 'person' | 'faction' | 'market' | 'entity' | 'fleet' | 'phrases' | 'variables' | 'other'
export const TOKEN_GROUPS: { id: TokenGroupId; title: string }[] = [
  { id: 'here', title: 'This conversation' },
  { id: 'people', title: 'Your people' },
  { id: 'player', title: 'The player' },
  { id: 'person', title: 'The person you talk to' },
  { id: 'faction', title: 'Their faction' },
  { id: 'market', title: 'The market' },
  { id: 'entity', title: 'The place' },
  { id: 'fleet', title: 'The fleet' },
  { id: 'phrases', title: 'Phrases' },
  { id: 'variables', title: 'Quest variables' },
  { id: 'other', title: 'Other' }
]

export interface TokenImage { kind: 'portrait' | 'crest'; path: string }
export interface TokenEntry {
  token: string
  /** The capitalised form ($PersonName), when the game has one. */
  cap?: string
  /** What it means. */
  label: string
  group: TokenGroupId
  /** What it becomes here (or an example). */
  value?: string
  /** The value is only the game's example, not known for this conversation. */
  example?: boolean
  /** Who or what it belongs to (a person of the mod, a phrase's owner): shown once with a picture. */
  owner?: { id: string; name: string; image?: TokenImage }
  image?: TokenImage
  /** Whether it is filled where it is used: no = never here (with why), maybe = it depends. */
  works?: 'yes' | 'maybe' | 'no'
  why?: string
}

/** Who and what a conversation has (for "This conversation" and which tokens work). */
export interface TokenContext {
  /** e.g. "Back Taxes: comm link (the fleet's comm link)". */
  label: string
  /** Is someone spoken to; and who, when known. */
  person: 'yes' | 'no' | 'unknown'
  personId?: string
  personWhy?: string
  faction?: string
  market: 'yes' | 'no' | 'unknown'
  fleet: 'yes' | 'no' | 'unknown'
}

export const NO_CONTEXT: TokenContext = { label: '', person: 'unknown', market: 'unknown', fleet: 'unknown' }

/** The encounter whose comm-link dialog this quest is. */
export const commEncounterOf = (m: ModModel, q: QuestPlan | undefined): EncounterDef | undefined => (q ? m.encounters.find((e) => e.commDialog === q.id) : undefined)

/** Who and what a quest's conversation has, as far as the plan says. */
export function tokenContext(m: ModModel, q: QuestPlan | undefined): TokenContext {
  if (!q) return NO_CONTEXT
  const enc = commEncounterOf(m, q)
  if (enc) {
    const f = effectiveFleet(enc, m)
    const cmd = f.flagshipCommander || undefined
    return {
      label: `${enc.name}: the fleet's comm link`, person: 'yes', personId: cmd,
      personWhy: cmd ? `the fleet's commander (Encounters › ${enc.name} › Flagship by)` : `the fleet's commander, made up by the game: Flagship by isn't set (Encounters › ${enc.name})`,
      faction: f.faction, market: 'no', fleet: 'yes'
    }
  }
  const st = q.start as { kind: string; person?: string }
  if (st.kind === 'contact' && st.person) {
    const p = m.people.find((x) => x.id === st.person)
    return { label: `${q.title} (a contact's mission)`, person: 'yes', personId: st.person, personWhy: 'the contact who offers it', faction: p?.faction, market: 'yes', fleet: 'no' }
  }
  if (st.kind === 'bar' || st.kind === 'barScene') return { label: `${q.title} (at a bar)`, person: 'unknown', market: 'yes', fleet: 'no' }
  return { label: q.title, person: 'unknown', market: 'unknown', fleet: 'unknown' }
}

const NEEDS: Partial<Record<TokenGroupId, keyof Pick<TokenContext, 'person' | 'market' | 'fleet'>>> = { person: 'person', market: 'market', fleet: 'fleet' }
const WHY_NO: Record<'person' | 'market' | 'fleet', string> = {
  person: 'no one is spoken to in this conversation',
  market: 'not at a market here (a fleet\'s comm link is out in space)',
  fleet: 'there is no fleet in this conversation'
}

export interface CatalogInput {
  m: ModModel
  defs: Pick<GameDefinitions, 'tokens'>
  /** Token values as the preview fills them for this conversation (buildTokens). */
  values: Record<string, string>
  ctx: TokenContext
  quest?: QuestPlan
  node?: DialogNode
  /** The portrait of a person and the crest of a faction (game paths), when known. */
  portrait?: (personId: string) => string | undefined
  crest?: (factionId: string) => string | undefined
}

const isCapOf = (cap: string, low: string) => cap !== low && cap.length === low.length && cap[1] === low[1].toUpperCase() && cap.slice(2) === low.slice(2)

/** Every token, grouped (TOKEN_GROUPS order), with values and whether it works here. */
export function tokenCatalog(i: CatalogInput): TokenEntry[] {
  const out: TokenEntry[] = []
  const { m, ctx } = i
  const works = (g: TokenGroupId): Pick<TokenEntry, 'works' | 'why'> => {
    const need = NEEDS[g]
    if (!need) return { works: 'yes' }
    const s = ctx[need]
    return s === 'no' ? { works: 'no', why: WHY_NO[need] } : s === 'unknown' ? { works: 'maybe', why: 'depends on where the conversation happens' } : { works: 'yes' }
  }
  // the game's tokens, one entry per token with its capitalised form
  const all = i.defs.tokens
  const low = all.filter((t) => !all.some((o) => isCapOf(t.token, o.token)))
  for (const t of low) {
    const g = (TOKEN_GROUPS.some((x) => x.id === t.group) ? t.group : 'other') as TokenGroupId
    const cap = all.find((o) => isCapOf(o.token, t.token))?.token
    const v = i.values[t.token]
    const known = v !== undefined && v !== t.sample
    const ownKnown = g === 'person' ? !!ctx.personId : g === 'faction' ? !!ctx.faction : g === 'player'
    out.push({ token: t.token, cap, label: t.summary.replace(/ Tokens are matched.*$/, ''), group: g, value: v ?? t.sample, example: !(known || ownKnown), ...works(g) })
  }
  // this conversation: who $person… and $faction… are
  if (ctx.person === 'yes' || ctx.faction) {
    const portrait = ctx.personId ? i.portrait?.(ctx.personId) : undefined
    const crest = ctx.faction ? i.crest?.(ctx.faction) : undefined
    const pick = ['$personName', '$personFirstName', '$personLastName', '$personRank', '$personPost', '$heOrShe', '$hisOrHer', '$faction', '$theFaction']
    for (const tok of pick) {
      const e = out.find((x) => x.token === tok)
      if (!e) continue
      const isPerson = e.group === 'person'
      if (isPerson && ctx.person !== 'yes') continue
      out.push({ ...e, group: 'here', example: isPerson ? !ctx.personId : !ctx.faction, image: isPerson ? (portrait ? { kind: 'portrait', path: portrait } : undefined) : crest ? { kind: 'crest', path: crest } : undefined })
    }
  }
  // the mod's people: their name tokens (always the same person, anywhere)
  for (const p of m.people) {
    const portrait = i.portrait?.(p.id) ?? (p.portrait || undefined)
    const owner = { id: p.id, name: personName(p), image: portrait ? { kind: 'portrait' as const, path: portrait } : undefined }
    const val = { name: personName(p), firstName: p.name.first || p.name.last, lastName: p.name.last }
    for (const [w, what] of NAME_TOKENS) out.push({ token: nameToken(p.id, w), label: `${owner.name}'s ${what}, in any conversation`, group: 'people', value: val[w], owner, works: 'yes' })
  }
  // phrases (the mod's, people's and this node's variations), without the name tokens above
  const nameToks = new Set(m.people.flatMap((p) => NAME_TOKENS.map(([w]) => nameToken(p.id, w))))
  const phrases = [...m.phrases, ...m.people.flatMap((p) => p.phrases), ...(i.node?.phrases ?? [])]
  for (const ph of phrases) {
    if (nameToks.has(ph.token)) continue
    const person = m.people.find((p) => p.id === ph.owner)
    const first = ph.cases.find((c) => c.text.trim())?.text ?? ph.otherwise
    out.push({
      token: ph.token, label: ph.owner.startsWith('node:') ? 'a variation in this dialog' : person ? `a phrase of ${personName(person)}` : 'a phrase of the mod',
      group: 'phrases', value: first || '(empty)', owner: person ? { id: person.id, name: personName(person), image: person.portrait ? { kind: 'portrait', path: i.portrait?.(person.id) ?? person.portrait } : undefined } : undefined, works: 'yes'
    })
  }
  // the quest's variables
  for (const v of i.quest?.variables ?? []) out.push({ token: `$global.${i.quest!.id}_${v.name}`, label: `quest variable ${v.name} (${v.type})`, group: 'variables', value: v.initial || undefined, example: true, works: 'yes' })
  return out
}

const personName = (p: PersonDef) => fullName(p.name) || p.id

/** Entries matching a search: token, meaning, value or owner (all words). */
export function searchTokens(entries: TokenEntry[], q: string): TokenEntry[] {
  const words = q.toLowerCase().replace(/^\$/, '').split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  return entries.filter((e) => {
    const hay = `${e.token} ${e.cap ?? ''} ${e.label} ${e.value ?? ''} ${e.owner?.name ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** For the "$" autocomplete: tokens starting with what was typed first, then the others that match. */
export function completeTokens(entries: TokenEntry[], typed: string, max = 12): TokenEntry[] {
  const t = typed.replace(/^\$/, '').toLowerCase()
  const seen = new Set<string>()
  const uniq = entries.filter((e) => e.group !== 'here' && !seen.has(e.token) && seen.add(e.token))
  const starts = uniq.filter((e) => e.token.slice(1).toLowerCase().startsWith(t) || e.cap?.slice(1).toLowerCase().startsWith(t))
  const rest = t ? uniq.filter((e) => !starts.includes(e) && `${e.token} ${e.label} ${e.owner?.name ?? ''}`.toLowerCase().includes(t)) : []
  return [...starts, ...rest].slice(0, max)
}

// ------------------------------------------------------------------ checks

const TOKEN_IN_TEXT = /\$[A-Za-z][\w.]*/g
const MARKET_TOKENS = /^\$(market|Market)[A-Za-z]*$/
const PERSON_TOKENS = /^\$(person|Person)[A-Za-z]*$|^\$(heOrShe|HeOrShe|hisOrHer|HisOrHer|himOrHer|HimOrHer|himOrHerself|HimOrHerself|manOrWoman|ManOrWoman)$/

/**
 * #67 U44: tokens that won't be filled where they are used, and a portrait that isn't the person
 * the $person… tokens name (a fleet's comm-link dialog, where the plan knows who is spoken to).
 */
export function tokenProblems(m: ModModel): Problem[] {
  const out: Problem[] = []
  for (const q of m.quests) {
    const enc = commEncounterOf(m, q)
    if (!enc) continue
    const ctx = tokenContext(m, q)
    for (const n of q.nodes) {
      if (n.type !== 'dialog') continue
      const ref = { page: 'quests' as const, id: q.id, sub: n.id }
      const texts = [n.text, n.repeat?.text ?? '', ...n.options.map((o) => o.text)].join('\n')
      const toks = [...new Set(texts.match(TOKEN_IN_TEXT) ?? [])]
      const market = toks.filter((t) => MARKET_TOKENS.test(t))
      if (market.length) out.push({ level: 'warning', area: 'Quest', ref, key: `tokmarket:${q.id}:${n.id}`, message: `"${n.title || n.id}" uses ${market.join(', ')}, but ${enc.name}'s comm link is out in space: there is no market, and the game leaves the token as it is.` })
      const usesPerson = toks.some((t) => PERSON_TOKENS.test(t))
      if (usesPerson && !ctx.personId) out.push({ level: 'info', area: 'Quest', ref, key: `tokperson:${q.id}:${n.id}`, message: `"${n.title || n.id}" uses $person… tokens: in ${enc.name}'s comm link they name the fleet's commander, whom the game makes up (Flagship by isn't set). To name one of your people, set Flagship by, or use their own token (e.g. $<person>_name).` })
      const v = n.visual
      if (v.kind === 'person' && v.person && !v.person.startsWith('$') && ctx.personId && v.person !== ctx.personId && usesPerson) {
        out.push({ level: 'warning', area: 'Quest', ref, key: `tokvisual:${q.id}:${n.id}`, message: `"${n.title || n.id}" shows ${v.person}'s portrait, but its $person… tokens name ${ctx.personId} (${enc.name}'s Flagship by). Use one person for both, or their own token (e.g. $${v.person}_name).` })
      } else if (v.kind === 'person' && v.person && !v.person.startsWith('$') && !ctx.personId && usesPerson) {
        out.push({ level: 'warning', area: 'Quest', ref, key: `tokvisual:${q.id}:${n.id}`, message: `"${n.title || n.id}" shows ${v.person}'s portrait, but its $person… tokens name the fleet's made-up commander. Set ${enc.name}'s Flagship by to ${v.person}, or use $${v.person}_name.` })
      }
    }
  }
  return out
}
