/**
 * #67 U45 (user, 2026-11-24): conditions in plain words. A condition line (rules.csv syntax) read
 * back as a sentence ("Quest "Back Taxes" is at stage pay"), whether it can work where it is used
 * (outside a dialog only $global and $player memory exist), and the facts the Conditions reference
 * page lists. Shared by the condition editor, the checks and the reference.
 */
import { parseCondition } from './rules/parse'
import type { ModModel } from './serialize'
import type { Problem } from './api'

/** Where conditions are tested: in a dialog (rules), or outside any dialog (SagaLib: progress events, world events). */
export type CondScope = 'dialog' | 'global'

export interface CondNames {
  quest?: (id: string) => string | undefined
  person?: (id: string) => string | undefined
  faction?: (id: string) => string | undefined
  /** Progress event id → name. */
  progress?: (id: string) => string | undefined
  setting?: (id: string) => string | undefined
  /** #67 U46: encounter id → name, named fleet id → name. */
  encounter?: (id: string) => string | undefined
  fleet?: (id: string) => string | undefined
  /** A rule command's one-line summary (the definitions). */
  command?: (name: string) => string | undefined
}

/** Names from the model (and, when given, the game's factions and the rule commands). */
export function namesFrom(m: ModModel, extra: Pick<CondNames, 'faction' | 'command'> = {}): CondNames {
  return {
    quest: (id) => m.quests.find((q) => q.id === id)?.title,
    person: (id) => { const p = m.people.find((x) => x.id === id); return p ? `${p.name.first} ${p.name.last}`.trim() || p.id : undefined },
    progress: (id) => m.progress?.find((p) => p.id === id)?.name,
    setting: (id) => m.project.settings?.find((s) => s.id === id)?.label,
    encounter: (id) => m.encounters.find((e) => e.id === id)?.name,
    fleet: (id) => { const t = m.fleets?.templates.find((x) => x.id === id); return t ? t.name || t.id : undefined },
    ...extra
  }
}

const OPS: Record<string, string> = { '==': 'is', '!=': 'is not', '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than' }
const LEVEL = (s: string) => s.toLowerCase().replace(/_/g, ' ')
const q = (s: string | undefined, id: string) => `"${s ?? id}"`

/** Whose memory a key is in. */
export function keyScope(key: string): 'global' | 'player' | 'faction' | 'market' | 'entity' | 'person' | 'local' | 'other' {
  const m = /^\$(global|player|faction|market|entity|person)\./.exec(key)
  if (m) return m[1] as 'global'
  return /^\$[\w]+$/.test(key) ? 'local' : 'other'
}
const SCOPE_WORD: Record<string, string> = {
  global: 'Game flag', player: "The player's", faction: "Their faction's", market: "The market's", entity: "This place's (or fleet's)", person: "This person's", local: "This conversation's", other: ''
}

/** A condition line as a sentence. */
export function describeCondition(line: string, n: CondNames = {}): string {
  const c = parseCondition(line)
  if (c.kind === 'score') return `Rule priority (score ${c.score}), not a test`
  const not = (s: string) => (c.negate ? `Not: ${s}` : s)
  if (c.kind === 'command') {
    const a = c.args
    switch (c.name) {
      case 'RepIsAtWorst': case 'RepGTE': return not(`Reputation with ${n.faction?.(a[0]) ?? a[0]} is ${LEVEL(a[1] ?? '?')} or better`)
      case 'RepIsAtBest': case 'RepLTE': return not(`Reputation with ${n.faction?.(a[0]) ?? a[0]} is ${LEVEL(a[1] ?? '?')} or worse`)
      case 'SF_AtStep': return not(`Quest ${q(n.quest?.(a[0]), a[0])} is at stage ${a[1] ?? '?'}`)
      case 'SF_QuestDone': return not(`Quest ${q(n.quest?.(a[0]), a[0])} ${a[1] === 'success' ? 'succeeded' : a[1] === 'fail' ? 'failed' : 'has ended'}`)
      case 'SF_HasMod': return not(`Mod ${a.join(' and ')} ${a.length > 1 ? 'are' : 'is'} enabled`)
      case 'SF_HasAnyMod': return not(`One of the mods ${a.join(', ')} is enabled`)
      case 'SF_PlayerGender': return not(`The player is ${(a[0] ?? '?').toLowerCase()}`)
      case 'SF_FactionRep': return not(`${a[0] === '$faction.id' ? 'Their faction' : n.faction?.(a[0]) ?? a[0]} ${a[2] === 'notHostile' ? 'is not hostile to' : `gets on with`} ${n.faction?.(a[1]) ?? a[1]}${a[2] && a[2] !== 'notHostile' ? ` (${LEVEL(a[2])} or better)` : ''}`)
      case 'SF_HasResearch': return not(`${a[1] ? `${n.faction?.(a[1]) ?? a[1]} has` : 'The player has'} researched ${a[0] ?? '?'} (Vaults of Knowledge)`)
      case 'SF_BountyState': return not(`MagicLib bounty ${a[0] ?? '?'} is ${a[1] ?? '?'}`)
      case 'SF_TargetCommodity': return not(`The player has the goods for ${a[1] ?? '?'} (quest ${q(n.quest?.(a[0]), a[0])})`)
      case 'PlayerCredits': case 'HasCredits': return not(`The player has at least ${a[0] ?? '?'} credits`)
      case 'StoryPoints': return not(`The player has at least ${a[0] ?? '1'} story point${a[0] === '1' ? '' : 's'}`)
    }
    const sum = n.command?.(c.name)
    return not(`${c.name}${a.length ? ` ${a.join(' ')}` : ''}${sum ? `: ${sum.replace(/\.$/, '')}` : ' (a rule command)'}`)
  }
  const { key, op, value } = c
  const v = value ?? ''
  // the quest and event keys SagaLib keeps
  const g = /^\$global\.(.+)$/.exec(key)?.[1]
  if (g) {
    const qs = /^(.+)_(state|step)$/.exec(g)
    if (qs && n.quest?.(qs[1])) {
      const t = q(n.quest(qs[1]), qs[1])
      if (qs[2] === 'state' && op === '==') return not(`Quest ${t} ${v === 'active' ? 'is running' : v === 'success' ? 'succeeded' : v === 'fail' ? 'failed' : `is ${v}`}`)
      if (qs[2] === 'step' && op === '==') return not(`Quest ${t} is at stage ${v}`)
    }
    const ps = /^(.+)_stage$/.exec(g)
    if (ps && n.progress?.(ps[1])) return not(op ? `Progress event ${q(n.progress(ps[1]), ps[1])}: its last stage reached ${OPS[op] ?? op} ${v}` : `Progress event ${q(n.progress(ps[1]), ps[1])} has reached a stage`)
    // #67 U46: how an encounter's last fleet ended, and a named fleet's defeats (SagaLib keeps both)
    const es = /^sagaforge_enc_(.+)_state$/.exec(g)
    if (es) {
      const t = q(n.encounter?.(es[1]), es[1])
      if (op === '==' && v === 'defeated') return not(`Encounter ${t}: its fleet was beaten`)
      if (op === '==' && v === 'avoided') return not(`Encounter ${t}: its fleet left unbeaten`)
      if (op === '==' && v === 'spawned') return not(`Encounter ${t}: its fleet is out there now`)
      if (!op) return c.negate ? `Encounter ${t} has never spawned` : `Encounter ${t} has spawned at least once`
    }
    const fd = /^sagaforge_fleet_(.+)_defeats$/.exec(g)
    if (fd && op) return not(`Named fleet ${q(n.fleet?.(fd[1]), fd[1])} beaten ${op === '>=' ? `at least ${v} time${v === '1' ? '' : 's'}` : `${OPS[op] ?? op} ${v} times`}`)
    if (fd && !op) return c.negate ? `Named fleet ${q(n.fleet?.(fd[1]), fd[1])} has never been beaten` : `Named fleet ${q(n.fleet?.(fd[1]), fd[1])} has been beaten`
    const away = /^sagaforge_away_(.+)$/.exec(g)
    if (away) return not(`${n.person?.(away[1]) ?? away[1]} is away (presence)`)
    const st = n.setting?.(g)
    if (st) return not(op ? `Setting "${st}" ${OPS[op] ?? op} ${v}` : `Setting "${st}" is on`)
  }
  if (key === '$player.gender' && op === '==') return not(`The player is ${v.toLowerCase()}`)
  if (key === '$player.credits' && op) return not(op === '>=' ? `The player has at least ${v} credits` : op === '<' ? `The player has less than ${v} credits` : `The player's credits: ${OPS[op] ?? op} ${v}`)
  if (key === '$player.commissionFactionId' && op === '==') return not(`The player is commissioned with ${n.faction?.(v) ?? v}`)
  if (key === '$market.factionId' && op === '==') return not(`The market belongs to ${n.faction?.(v) ?? v}`)
  if (key === '$entity.sagaforge_fled') return c.negate ? 'The player has not fled from this fleet' : 'The player fled from this fleet'
  const sc = keyScope(key)
  const name = sc === 'other' ? key : key.replace(/^\$(global|player|faction|market|entity|person)\./, '').replace(/^\$/, '')
  if (!op) return c.negate ? `${SCOPE_WORD[sc]} ${name} is not set (or false)`.trim() : `${SCOPE_WORD[sc]} ${name} is set (true)`.trim()
  return not(`${SCOPE_WORD[sc]} ${name} ${OPS[op] ?? op} ${v}`.trim())
}

/** Keys a condition reads (its key and $… arguments). */
export function conditionKeys(line: string): string[] {
  const c = parseCondition(line)
  if (c.kind === 'score') return []
  if (c.kind === 'memory') return [c.key, ...(c.value?.startsWith('$') ? [c.value] : [])]
  return c.args.filter((a) => a.startsWith('$'))
}

/** Why a condition can't work here (outside a dialog only $global and $player exist), or null. */
export function conditionScopeProblem(line: string, scope: CondScope): string | null {
  if (scope !== 'global') return null
  const bad = conditionKeys(line).filter((k) => !['global', 'player'].includes(keyScope(k)))
  if (!bad.length) return null
  return `${bad.join(', ')}: there is no ${[...new Set(bad.map((k) => keyScope(k) === 'local' ? 'conversation' : keyScope(k)))].join(' or ')} here. This runs outside any dialog, where only $global and $player keys exist, so it is never true.`
}

/** #67 U45: conditions that can never be true where they are (progress events and world events). */
export function conditionScopeProblems(m: ModModel): Problem[] {
  const out: Problem[] = []
  const check = (lines: string[], where: string, ref: Problem['ref'], key: string) => {
    for (const l of lines) {
      const why = conditionScopeProblem(l, 'global')
      if (why) out.push({ level: 'warning', area: 'Conditions', ref, key: `condscope:${key}:${l}`, message: `${where}: "${l}" — ${why}` })
    }
  }
  for (const p of m.progress ?? []) {
    const ref = { page: 'saga' as const, id: 'progress', sub: p.id }
    check(p.startConditions, `Progress event "${p.name}" › Starts when`, ref, `${p.id}:start`)
    for (const f of p.factors) check(f.conditions, `Progress event "${p.name}" › factor "${f.desc}"`, ref, `${p.id}:${f.id}`)
  }
  for (const s of m.events ?? []) for (const e of s.events) check(e.conditions, `World event "${e.name}"`, { page: 'saga' as const, id: 'events', sub: s.id }, `${s.id}:${e.id}`)
  return out
}

/** The Conditions reference page's rows: [form, example, means, where it works]. */
export const CONDITION_FORMS: string[][] = [
  ['$scope.key', '$global.toc_fought_hegemony', 'The key is set and true (not set counts as false).', 'everywhere its memory exists'],
  ['!$scope.key', '!$global.toc_name_cleared', '"!" in front turns any condition around: not set, or false.', 'everywhere'],
  ['$scope.key == value', '$player.gender == FEMALE', 'Equal. Text is compared as written (case matters), numbers as numbers.', 'everywhere'],
  ['$scope.key != value', '$market.factionId != hegemony', 'Not equal.', 'everywhere'],
  ['$scope.key >= number', '$player.credits >= 10000', 'At least (also >, <=, <).', 'everywhere'],
  ['Command args', 'RepIsAtWorst hegemony FAVORABLE', 'A rule command that answers true or false (Rules › Rule commands lists them; "Use" says condition).', 'in a dialog; SagaLib runs most of them outside one too'],
  ['SF_… command', 'SF_AtStep toc_main pay', 'SagaLib\'s conditions: quest stage and result, mods, gender, faction relations, research, bounties.', 'everywhere (needs SagaLib)'],
  ['score:N', 'score:1000', 'Not a test: makes the rule win over others on the same trigger.', 'rules only']
]

/** The memory scopes and where they exist. */
export const CONDITION_SCOPES: string[][] = [
  ['$global', 'The whole game: your flags, quest states ($global.<quest>_state, _step), progress stages ($global.<event>_stage), settings, how an encounter last ended ($global.sagaforge_enc_<id>_state: spawned, defeated, avoided), how often a named fleet was beaten ($global.sagaforge_fleet_<id>_defeats).', 'everywhere'],
  ['$player', 'The player: credits, gender, commission ($player.commissionFactionId), level.', 'everywhere'],
  ['$faction', 'The faction of who or what the dialog is with.', 'in a dialog'],
  ['$market', 'The market the dialog happens at.', 'in a dialog at a market'],
  ['$entity', 'The place, station or fleet the dialog is with ($entity.sagaforge_fled: this fleet saw the player flee).', 'in a dialog'],
  ['$person', 'The person spoken to.', 'in a dialog with someone'],
  ['$key (no scope)', 'The dialog\'s own memory ($option, $menuState); gone when it closes.', 'in a dialog']
]
