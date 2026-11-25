/**
 * #67 U50 (user, 2026-11-24): when Play presses Play ▶ on a quest whose trigger start (e.g. "dock at a
 * Hegemony market") doesn't match the Test context, offer ways to meet it instead of the game's own
 * dialog: a few markets that fit (at most MAX_START_CHOICES), or "its conditions met here". Memory
 * conditions are set; condition commands Play can't set stay as they are (assumed, see the Play log).
 */
import { parseCondition } from './rules/parse'
import { literal } from './rules/engine'
import type { Value } from './rules/parse'
import { NEVER_SET_KEYS } from './conditions'

export interface PlaceOption { id: string; name: string; faction: string; size: number; own?: boolean; entities?: string[] }
export interface StartChoice {
  label: string
  /** Dock here first (its market's memory and name tokens). */
  market?: PlaceOption
  /** Memory to set (undefined = unset). */
  memory: [string, Value | undefined][]
}
export const MAX_START_CHOICES = 5

/** A condition line as the user wrote it, without a trailing "score:N". */
export const showCondition = (line: string) => line.replace(/\s+score\s*:\s*-?[\d.]+\s*$/i, '').trim()

const PLACE_KEYS = new Set(['$market.id', '$id', '$entity.id'])

export function startChoices(conds: string[], markets: PlaceOption[], factionName: (id: string) => string, max = MAX_START_CHOICES): { choices: StartChoice[]; open: string[]; noPlace: boolean; never: string[] } {
  const memory: [string, Value | undefined][] = []
  const open: string[] = []
  // #67 U54: keys the game never sets: Play doesn't fake them (the quest wouldn't start in game either)
  const never: string[] = []
  const tests: ((m: PlaceOption) => boolean)[] = []
  const what: string[] = []
  // used when no market fits: the place's memory set directly
  const placeMem: [string, Value | undefined][] = []
  for (const line of conds) {
    const c = parseCondition(line)
    if (c.kind === 'score') continue
    if (c.kind === 'command') { open.push(showCondition(c.raw)); continue }
    if (NEVER_SET_KEYS[c.key]) { never.push(c.key); continue }
    const lit = c.value !== undefined && !c.value.startsWith('$') ? literal(c.value) : undefined
    // where: the faction of the place (a market's owner; #67 U54: $faction.id, as vanilla), the market or place itself, its size
    if (c.key === '$faction.id' && lit !== undefined && (c.op === '==' || c.op === '!=')) {
      const f = String(lit)
      const is = (c.op === '==') !== c.negate
      tests.push((m) => (m.faction === f) === is)
      if (is) placeMem.push([c.key, f])
      what.push(is ? `a ${factionName(f)} market` : `not ${factionName(f)}`)
      continue
    }
    if (PLACE_KEYS.has(c.key) && lit !== undefined && c.op === '==' && !c.negate) {
      const id = String(lit)
      tests.push((m) => m.id === id || !!m.entities?.includes(id))
      placeMem.push([c.key, id])
      what.push(id)
      continue
    }
    if (c.key === '$market.size' && typeof lit === 'number' && c.op && !c.negate) {
      const op = c.op
      tests.push((m) => cmp(m.size, op, lit))
      if (op === '==' || op === '>=' || op === '<=') placeMem.push([c.key, lit])
      what.push(`size ${op} ${lit}`)
      continue
    }
    // anything else in memory: set it so the line is true
    if (!c.op) { memory.push([c.key, c.negate ? undefined : true]); continue }
    if (lit === undefined) { open.push(showCondition(c.raw)); continue }
    const op = c.negate ? NOT[c.op] : c.op
    if (op === '==' || op === '>=' || op === '<=') memory.push([c.key, lit])
    else if (op === '>' && typeof lit === 'number') memory.push([c.key, lit + 1])
    else if (op === '<' && typeof lit === 'number') memory.push([c.key, lit - 1])
    else if (op === '!=') memory.push([c.key, typeof lit === 'boolean' ? !lit : undefined])
    else open.push(showCondition(c.raw))
  }
  if (!tests.length) return { choices: [{ label: 'Start here, with its conditions met', memory }], open, noPlace: false, never }
  const fit = markets.filter((m) => tests.every((t) => t(m)))
    .sort((a, b) => Number(!!b.own) - Number(!!a.own) || b.size - a.size || a.name.localeCompare(b.name))
    .slice(0, max)
  const choices: StartChoice[] = fit.map((m) => ({ label: `Dock at ${m.name} (${factionName(m.faction)}, size ${m.size})`, market: m, memory }))
  if (!fit.length) return { choices: [{ label: `Start with its conditions met (no market fits: ${what.join(', ')})`, memory: [...placeMem, ...memory] }], open, noPlace: true, never }
  return { choices, open, noPlace: false, never }
}

const NOT: Record<string, string> = { '==': '!=', '!=': '==', '>': '<=', '<': '>=', '>=': '<', '<=': '>' }
function cmp(a: number, op: string, b: number): boolean {
  switch (op) { case '==': return a === b; case '!=': return a !== b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b }
  return false
}
