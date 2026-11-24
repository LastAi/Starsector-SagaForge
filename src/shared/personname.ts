/**
 * #79: one-name characters (Heliopolis's cats: Tyger, Butters, Mousey). The name is kept in the
 * last-name slot with an empty first name ("One name" on People, `oneName: true`). Vanilla's
 * FullName.getFullName() trims, so $personName and $personLastName read right, and its UI uses the
 * full name; but vanilla fills $personFirstName (0.98.5a also $PersonFirstName) with the empty first
 * name. SagaLib 1.4 fills both with the one name for any such person, any mod's (FORMATS.md
 * "One-name characters"; SagaLib core/Names.java, golden case names.json).
 */
import type { Phrase, QuestPlan } from './model'

export interface NameParts { first: string; last: string }

const blank = (s: string | undefined | null) => !s || !s.trim()

/** The full name as the game shows it (vanilla FullName.getFullName: first + " " + last, trimmed). */
export const fullName = (n: NameParts): string => `${n.first ?? ''} ${n.last ?? ''}`.trim()

/** A one-name person: the first name empty or blank, the last name not (with or without the flag). */
export const isOneName = (n: NameParts): boolean => blank(n.first) && !blank(n.last)

/** The one name of a person marked "One name": the last name, or the first when only that is set. */
export const oneNameOf = (n: NameParts): string => (n.last ?? '').trim() || (n.first ?? '').trim()

/** A person's name as exported and as SagaLib creates them: with the flag, first "" and the one name last. */
export function storedName(p: { name: NameParts; oneName?: boolean }): NameParts {
  return p.oneName ? { first: '', last: oneNameOf(p.name) } : p.name
}

/** What a first-name token says in game with SagaLib: the first name, or the one name. */
export const firstNameOf = (n: NameParts): string => (isOneName(n) ? n.last.trim() : n.first ?? '')

/** A person whose name in the index is one string (another mod's): one word is a one name (in the last-name slot). */
export function splitIndexName(name: string): NameParts {
  const t = name.trim()
  const i = t.indexOf(' ')
  return i < 0 ? { first: '', last: t } : { first: t.slice(0, i), last: t.slice(i + 1) }
}

/** The first-name tokens of the active person that SagaLib 1.4 fills (one-name people only), as its OneNameTokens. */
export function oneNameTokens(n: NameParts): Record<string, string> {
  if (!isOneName(n)) return {}
  const one = n.last.trim()
  return { $personFirstName: one, $PersonFirstName: one }
}

/**
 * The active person's name tokens as the game fills them: vanilla's generator ($personName,
 * $PersonName, $personFirstName, $personLastName; 0.98.5a also $PersonFirstName, $PersonLastName),
 * then SagaLib's one-name tokens over them.
 */
export function personNameTokens(n: NameParts, v0985 = false): Record<string, string> {
  const full = fullName(n)
  return {
    $personName: full, $PersonName: full, $personFirstName: n.first ?? '', $personLastName: n.last ?? '',
    ...(v0985 ? { $PersonFirstName: n.first ?? '', $PersonLastName: n.last ?? '' } : {}),
    ...oneNameTokens(n)
  }
}

/** SagaLib's fallback for a person's generated `$<id>_firstName` phrase: blank text of a one-name person → the one name. */
export function firstNamePhrase(token: string, owner: string | undefined, text: string, n: NameParts | undefined): string {
  if (text.trim() || !owner || !n || token !== `$${owner}_firstName`) return text
  return isOneName(n) ? n.last.trim() : text
}

/** Tokens a text may use for the active person's first name. */
export const FIRST_NAME_TOKENS = ['$personFirstName', '$PersonFirstName'] as const

/** Where the mod's texts name a one-name person by first name (checks/onename.ts, SagaLib dependency). */
export interface FirstNameUse {
  /** first: $personFirstName / $PersonFirstName with a one-name person in the dialog; token: their $<id>_firstName. */
  kind: 'first' | 'token'
  person: string
  /** Their one name. */
  one: string
  tokens: string[]
  where: string
  ref: { page: 'quests' | 'people'; id: string; sub?: string }
  /** For the problem's key (ignore with a reason). */
  key: string
  quest?: string
  node?: string
}

interface UsesModel {
  quests: QuestPlan[]
  people: { id: string; name: NameParts; oneName?: boolean; phrases: Phrase[]; inactive?: boolean }[]
  phrases: Phrase[]
  encounters?: { id: string; fleet: { flagshipCommander?: string; size?: string; template?: string }; commDialog?: string }[]
  fleets?: { templates: { id: string; captain?: string }[] }
}

/**
 * Who a conversation is with, as far as the plan says: a contact's or bar's person, the person its
 * start option or trigger is scoped to (`$id == <person>`), or the commander of the encounter whose
 * comm dialog it is (`$entity.sagaforge_encounter == <encounter>`, or its comm dialog).
 */
function conversationPerson(q: QuestPlan, m: UsesModel, isPerson: (id: string) => boolean): string | undefined {
  const s = q.start as { kind: string; person?: string; conditions?: string[] }
  if ((s.kind === 'contact' || s.kind === 'bar') && s.person) return s.person
  const commander = (enc: string) => { const e = m.encounters?.find((x) => x.id === enc); return (e && (e.fleet.size === 'template' ? m.fleets?.templates.find((t) => t.id === e.fleet.template)?.captain : e.fleet.flagshipCommander)) || undefined }
  for (const l of s.conditions ?? []) {
    const id = /^\$id\s*==\s*(\S+)/.exec(l.trim())?.[1]
    if (id && isPerson(id)) return id
    const enc = /^\$(?:entity\.)?sagaforge_encounter\s*==\s*(\S+)/.exec(l.trim())?.[1]
    if (enc && commander(enc)) return commander(enc)
  }
  const e = m.encounters?.find((x) => x.commDialog === q.id)
  return e ? commander(e.id) : undefined
}

export function firstNameUses(m: UsesModel, indexPeople: { id: string; name: string }[] = []): FirstNameUse[] {
  const out: FirstNameUse[] = []
  const names = new Map<string, NameParts>(indexPeople.map((p) => [p.id, splitIndexName(p.name)]))
  for (const p of m.people) names.set(p.id, storedName(p))
  const one = (id: string | undefined) => { const n = id ? names.get(id) : undefined; return n && isOneName(n) ? n.last.trim() : null }
  const firstRe = /\$(personFirstName|PersonFirstName)(?![\w])/g
  const firsts = (s: string) => [...new Set([...s.matchAll(firstRe)].map((x) => `$${x[1]}`))]
  for (const q of m.quests) {
    if (q.inactive) continue
    const startPerson = conversationPerson(q, m, (id) => names.has(id))
    for (const n of q.nodes) {
      const texts = n.type === 'dialog'
        ? JSON.stringify([n.text, n.options.map((o) => [o.text, o.tooltip]), n.displays, n.phrases])
        : n.type === 'raid' ? JSON.stringify([n.text, n.raidText, n.objective, n.tooltip])
          : n.type === 'wait' ? JSON.stringify([n.arriveText, n.optionText]) : ''
      if (!texts) continue
      const who = n.type === 'dialog' ? n.speaker || (n.visual.kind === 'person' ? n.visual.person : undefined) || startPerson : startPerson
      const o = one(who)
      const toks = firsts(texts)
      const where = `${q.title || q.id} › ${(n as { title?: string }).title || n.id}`
      if (o && toks.length) out.push({ kind: 'first', person: who!, one: o, tokens: toks, where, ref: { page: 'quests', id: q.id, sub: n.id }, quest: q.id, node: n.id, key: `${q.id}:${n.id}` })
    }
  }
  // the generated $<id>_firstName of the mod's one-name people
  const own = m.people.filter((p) => !p.inactive && isOneName(storedName(p)))
  if (!own.length) return out
  const places: { where: string; text: string; ref: FirstNameUse['ref'] }[] = [
    ...m.quests.filter((q) => !q.inactive).flatMap((q) => q.nodes.map((n) => ({ where: `${q.title || q.id} › ${(n as { title?: string }).title || n.id}`, text: JSON.stringify(n), ref: { page: 'quests' as const, id: q.id, sub: n.id } }))),
    ...m.people.map((p) => ({ where: `${fullName(storedName(p)) || p.id}'s phrases`, text: JSON.stringify(p.phrases), ref: { page: 'people' as const, id: p.id } })),
    { where: 'the mod-wide phrases', text: JSON.stringify(m.phrases), ref: { page: 'people' as const, id: '' } }
  ]
  for (const p of own) {
    const re = new RegExp(`\\$${p.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_firstName(?![\\w])`)
    for (const pl of places) if (re.test(pl.text)) out.push({ kind: 'token', person: p.id, one: storedName(p).last.trim(), tokens: [`$${p.id}_firstName`], where: pl.where, ref: pl.ref, key: `${pl.ref.id}:${pl.ref.sub ?? ''}:${p.id}` })
  }
  return out
}

/** The mod's texts use a first-name token where a one-name person is (SagaLib 1.4 fills it). */
export const usesOneNameFirstName = (m: UsesModel, indexPeople: { id: string; name: string }[] = []): boolean => firstNameUses(m, indexPeople).some((u) => u.kind === 'first')
