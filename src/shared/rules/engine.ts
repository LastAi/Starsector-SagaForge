/**
 * A small copy of the game's rules engine (PLAN.md §5, Play mode; docs/FORMATS.md, rules.csv):
 * FireBest picks the matching rule with the highest score, a rule adds its options (clearing the
 * old ones only when it has options), then its text, then runs its script. Used by the dialog
 * preview, the Dialog browser and Play mode. Things it can't know (other mods' Java commands,
 * battles) are answered by `assume` or hooks, never guessed silently: they are logged.
 */
import type { RuleRow } from './types'
import {
  ruleScore, optionCondition, parseConditions, parseOptions, parseScript, textVariants, paragraphs, tokenize, TOKEN_RE,
  type Condition, type OptionLine, type ScriptLine, type Value
} from './parse'

export interface EngineRule {
  row: RuleRow
  conds: Condition[]
  script: ScriptLine[]
  options: OptionLine[]
  variants: string[]
  score: number
  /** The `$option == x` it answers, if any. */
  option: string | null
}

export interface RuleSet {
  all: EngineRule[]
  byTrigger: Map<string, EngineRule[]>
  byOption: Map<string, EngineRule[]>
  byId: Map<string, EngineRule>
}

export function compileRule(row: RuleRow): EngineRule {
  const conds = parseConditions(row.conditions)
  return { row, conds, script: parseScript(row.script), options: parseOptions(row.options), variants: textVariants(row.text), score: ruleScore(conds), option: optionCondition(conds) }
}

export function compileRules(rows: RuleRow[]): RuleSet {
  const all = rows.map(compileRule)
  const byTrigger = new Map<string, EngineRule[]>()
  const byOption = new Map<string, EngineRule[]>()
  const byId = new Map<string, EngineRule>()
  for (const r of all) {
    const t = byTrigger.get(r.row.trigger) ?? []
    t.push(r)
    byTrigger.set(r.row.trigger, t)
    if (r.option) { const o = byOption.get(r.option) ?? []; o.push(r); byOption.set(r.option, o) }
    byId.set(r.row.id, r)
  }
  return { all, byTrigger, byOption, byId }
}

// ---------------------------------------------------------------- state

export type VisualState =
  | { kind: 'none' }
  | { kind: 'person'; person: string; second?: string; third?: string }
  | { kind: 'image'; category: string; key: string }
  | { kind: 'planet'; entity: string; info?: boolean }
  | { kind: 'mapMarker'; entity: string; title?: string }
  | { kind: 'fleets'; key: string }
  | { kind: 'ship'; variant: string }
  | { kind: 'default' }

export interface Para {
  kind: 'text' | 'gained' | 'lost' | 'rep' | 'note' | 'display' | 'choice'
  text: string
  /** Named game color ('h', 'good', 'bad', 'gray', 'story', 'faction:<id>') or [r,g,b]. */
  color?: string | number[]
  small?: boolean
  highlights: string[]
  highlightColors?: string[]
  /** Item/commodity id for an icon, faction id for a callout, ... */
  ref?: string
  /** A display drawn as a labelled placeholder (SF_Show…, cost panels). */
  placeholder?: { label: string; height: number }
  /** Shown above, faded (text of earlier steps). */
  previous?: boolean
  ruleId?: string
}

export interface ViewOption {
  id: string
  text: string
  order: number
  enabled: boolean
  tooltip?: string
  story?: { cost: number }
  shortcut?: string
  color?: string
}

export interface DialogView {
  visual: VisualState
  savedVisual?: VisualState
  paragraphs: Para[]
  options: ViewOption[]
  ended: boolean
}

export interface LogEntry {
  kind: 'rule' | 'cond' | 'script' | 'warn' | 'info' | 'choice'
  text: string
  ruleId?: string
}

export interface PlayerState {
  name: string
  firstName: string
  lastName: string
  gender: 'MALE' | 'FEMALE'
  credits: number
  storyPoints: number
  xp: number
  cargo: Record<string, number>
  rep: Record<string, number>
  personRep: Record<string, number>
  commission: string | null
  ships: string[]
}

export interface PlayContext {
  /** Memory by full key as written in rules: "$global.x", "$player.x", "$faction.id", "$x" (local). */
  memory: Map<string, Value>
  /** Token values ($playerName, phrases, ...), matched case-sensitively like the game. */
  tokens: Record<string, string>
  player: PlayerState
  /** Outcomes for condition commands the engine can't evaluate (raw line → result). */
  assume: Record<string, boolean>
  day: number
  random: () => number
}

export interface EngineHooks {
  /** Handle a script command (e.g. SagaLib's SF_*). Return true if handled. */
  command?(e: Engine, name: string, args: string[], rule: EngineRule): boolean
  /** Evaluate a condition command; undefined = not known. */
  condition?(e: Engine, name: string, args: string[]): boolean | undefined
  /** Item / faction names for "Gained" lines. */
  itemName?(id: string): string
  factionName?(id: string): string
  /** A token filled at display time (SagaLib's phrases); undefined = not one of these. */
  token?(e: Engine, token: string): string | undefined
}

export const emptyView = (): DialogView => ({ visual: { kind: 'none' }, paragraphs: [], options: [], ended: false })

export function newPlayer(): PlayerState {
  return { name: 'Varga', firstName: 'Ana', lastName: 'Varga', gender: 'FEMALE', credits: 120000, storyPoints: 3, xp: 0, cargo: {}, rep: {}, personRep: {}, commission: null, ships: [] }
}

export function newContext(): PlayContext {
  return { memory: new Map(), tokens: {}, player: newPlayer(), assume: {}, day: 0, random: Math.random }
}

const truthy = (v: Value | undefined) => v !== undefined && v !== false && v !== 0 && v !== '' && v !== 'false'

/** Parse a literal the way memory values compare: numbers, booleans, else strings. */
export function literal(s: string): Value {
  const t = s.trim().replace(/^"|"$/g, '')
  if (t === 'true') return true
  if (t === 'false') return false
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return t
}

const MAX_DEPTH = 40

export class Engine {
  view: DialogView = emptyView()
  log: LogEntry[] = []
  private depth = 0
  /** Rules whose script ran this step (for the chart's path). */
  fired: string[] = []

  constructor(public rules: RuleSet, public ctx: PlayContext, public hooks: EngineHooks = {}) {}

  get(key: string): Value | undefined { return this.ctx.memory.get(key) }
  set(key: string, v: Value | undefined): void { if (v === undefined) this.ctx.memory.delete(key); else this.ctx.memory.set(key, v) }

  /** A token or memory reference as a value ($x, $global.x, or a literal). */
  resolve(s: string): Value | undefined {
    if (s.startsWith('$')) return this.ctx.memory.has(s) ? this.ctx.memory.get(s) : this.ctx.tokens[s]
    return literal(s)
  }

  evalCondition(c: Condition): boolean {
    if (c.kind === 'score') return true
    let r: boolean
    if (c.kind === 'memory') {
      const v = this.get(c.key)
      if (!c.op) r = truthy(v)
      else {
        const rhs = c.value === undefined ? undefined : c.value.startsWith('$') ? this.resolve(c.value) : literal(c.value)
        r = compare(v, c.op, rhs)
      }
    } else {
      const hooked = this.hooks.condition?.(this, c.name, c.args)
      const known = hooked ?? builtinCondition(this, c.name, c.args)
      if (known === undefined) {
        const key = assumeKey(c)
        r = this.ctx.assume[key] ?? this.ctx.assume[c.name] ?? true
        this.log.push({ kind: 'cond', text: `Assumed ${r ? 'true' : 'false'}: ${key} (the editor can't evaluate ${c.name}; set it in the Test context)` })
      } else r = known
    }
    return c.negate ? !r : r
  }

  matches(rule: EngineRule): boolean {
    for (const c of rule.conds) if (!this.evalCondition(c)) return false
    return true
  }

  /** Candidates for a trigger, best first (score, then file order). */
  candidates(trigger: string): EngineRule[] {
    const list = (this.rules.byTrigger.get(trigger) ?? []).filter((r) => this.matches(r))
    return list.sort((a, b) => b.score - a.score)
  }

  fireBest(trigger: string, keepOptions = false): EngineRule | null {
    const c = this.candidates(trigger)
    const best = c[0]
    if (!best) { this.log.push({ kind: 'warn', text: `FireBest ${trigger}: no rule matches` }); return null }
    const tied = c.filter((r) => r.score === best.score && r !== best)
    this.log.push({ kind: 'rule', ruleId: best.row.id, text: `Rule ${best.row.id} (FireBest ${trigger}: score ${best.score}${c.length > 1 ? `, beat ${c.length - 1} other${c.length > 2 ? 's' : ''}` : ''}${tied.length ? `; tied with ${tied.map((t) => t.row.id).join(', ')}` : ''})` })
    this.apply(best, keepOptions)
    return best
  }

  fireAll(trigger: string): EngineRule[] {
    const c = this.candidates(trigger)
    if (!c.length) return []
    this.log.push({ kind: 'rule', text: `FireAll ${trigger}: ${c.map((r) => r.row.id).join(', ')}` })
    // options of every rule first, then text + script per rule (FireAll's order)
    const opts = c.flatMap((r) => r.options.map((o) => ({ o, r })))
    if (opts.length) {
      this.view.options = []
      for (const { o, r } of opts) this.addOption(o, r)
    }
    for (const r of c) { this.addRuleText(r); this.runScript(r) }
    return c
  }

  /** The player picks an option: $option is set, then FireBest DialogOptionSelected. */
  select(optionId: string): EngineRule | null {
    const o = this.view.options.find((x) => x.id === optionId)
    this.log.push({ kind: 'choice', text: `Chose "${o?.text ?? optionId}" (${optionId})` })
    for (const p of this.view.paragraphs) p.previous = true
    if (o) this.view.paragraphs.push({ kind: 'choice', text: o.text, color: 'option', highlights: [] })
    if (o?.story) { this.ctx.player.storyPoints -= o.story.cost; this.view.paragraphs.push({ kind: 'note', text: `Used ${o.story.cost} story point${o.story.cost === 1 ? '' : 's'}`, color: 'story', highlights: [] }) }
    this.set('$option', optionId)
    this.fired = []
    return this.fireBest('DialogOptionSelected')
  }

  apply(rule: EngineRule, keepOptions = false): void {
    if (++this.depth > MAX_DEPTH) { this.log.push({ kind: 'warn', text: `Stopped: more than ${MAX_DEPTH} rules fired in a row (a loop?)` }); this.depth--; return }
    try {
      const adders = rule.options
      const addsByScript = rule.script.some((s) => s.kind === 'command' && s.name === 'AddOption')
      if (adders.length || addsByScript) {
        if (!keepOptions) this.view.options = []
        for (const o of adders) this.addOption(o, rule)
      }
      this.addRuleText(rule)
      this.runScript(rule)
    } finally { this.depth-- }
  }

  private addOption(o: OptionLine, rule: EngineRule): void {
    this.view.options = this.view.options.filter((x) => x.id !== o.id)
    this.view.options.push({ id: o.id, text: this.subst(o.text, rule), order: o.order ?? 0, enabled: true })
    this.view.options.sort((a, b) => a.order - b.order)
  }

  private addRuleText(rule: EngineRule): void {
    if (!rule.variants.length || !rule.variants.some(Boolean)) return
    const pick = rule.variants.length > 1 ? rule.variants[Math.floor(this.ctx.random() * rule.variants.length)] : rule.variants[0]
    if (!pick) return
    for (const p of paragraphs(this.subst(pick, rule))) this.view.paragraphs.push({ kind: 'text', text: p, highlights: [], ruleId: rule.row.id })
  }

  /** Fill tokens: the token table (vanilla's and phrases) first, then memory. Unknown ones stay as [$token]. */
  subst(text: string, _rule?: EngineRule): string {
    return text.replace(TOKEN_RE, (tok) => {
      // "$global.foo." at the end of a sentence: try without trailing dots
      const trimmed = tok.replace(/\.+$/, '')
      const tail = tok.slice(trimmed.length)
      const dyn = this.hooks.token?.(this, trimmed)
      if (dyn !== undefined) return this.subst(dyn) + tail
      if (tok in this.ctx.tokens) return this.ctx.tokens[tok]
      if (trimmed in this.ctx.tokens) return this.ctx.tokens[trimmed] + tail
      if (this.ctx.memory.has(trimmed)) return String(this.ctx.memory.get(trimmed)) + tail
      return `[${trimmed}]${tail}`
    })
  }

  runScript(rule: EngineRule): void {
    this.fired.push(rule.row.id)
    for (const s of rule.script) {
      if (this.view.ended) break
      if (s.kind === 'set') {
        const v = s.value.startsWith('$') ? this.resolve(s.value) : literal(s.value)
        this.set(s.key, v)
        this.log.push({ kind: 'script', ruleId: rule.row.id, text: `${s.key} = ${String(v)}${s.expire !== undefined ? ` (expires ${s.expire === 0 ? 'when the dialog closes' : `in ${s.expire} days`})` : ''}` })
      } else if (s.kind === 'incr') {
        const v = Number(this.get(s.key) ?? 0) + s.by
        this.set(s.key, v)
        this.log.push({ kind: 'script', ruleId: rule.row.id, text: `${s.key} = ${v}` })
      } else if (s.kind === 'unset') {
        this.set(s.key, undefined)
      } else {
        if (this.hooks.command?.(this, s.name, s.args, rule)) continue
        if (!builtinCommand(this, s.name, s.args, rule)) this.log.push({ kind: 'info', ruleId: rule.row.id, text: `Not simulated: ${s.raw}` })
      }
    }
  }

  para(p: Omit<Para, 'highlights'> & { highlights?: string[] }): void {
    this.view.paragraphs.push({ highlights: [], ...p })
  }

  itemName(id: string): string { return this.hooks.itemName?.(id) ?? id }
  factionName(id: string): string { return this.hooks.factionName?.(id) ?? id }
}

/** Key of an unknown condition command in PlayContext.assume: the line without a leading "!". */
export const assumeKey = (c: { name: string; args: string[] }) => [c.name, ...c.args].join(" ")

export function compare(a: Value | undefined, op: string, b: Value | undefined): boolean {
  const na = typeof a === 'number' ? a : typeof a === 'string' && a !== '' && !isNaN(Number(a)) ? Number(a) : NaN
  const nb = typeof b === 'number' ? b : typeof b === 'string' && b !== '' && !isNaN(Number(b)) ? Number(b) : NaN
  const numeric = !isNaN(na) && !isNaN(nb)
  switch (op) {
    case '==': return numeric ? na === nb : String(a ?? '') === String(b ?? '') || (a === undefined && (b === false || b === 'false'))
    case '!=': return numeric ? na !== nb : !(String(a ?? '') === String(b ?? '') || (a === undefined && (b === false || b === 'false')))
    case '>': return numeric && na > nb
    case '>=': return numeric && na >= nb
    case '<': return numeric && na < nb
    case '<=': return numeric && na <= nb
  }
  return false
}

const REP_ACTIONS: Record<string, number> = { COOPERATIVE: 0.75, FRIENDLY: 0.5, WELCOMING: 0.25, FAVORABLE: 0.1, NEUTRAL: 0, SUSPICIOUS: -0.1, INHOSPITABLE: -0.25, HOSTILE: -0.5, VENGEFUL: -0.75 }

/** Condition commands the engine evaluates itself. undefined = unknown. */
export function builtinCondition(e: Engine, name: string, args: string[]): boolean | undefined {
  const p = e.ctx.player
  const rep = (f: string) => (f === 'player' ? 1 : p.rep[f] ?? 0)
  switch (name) {
    case 'RepIsAtWorst': return args[1] in REP_ACTIONS ? rep(args[0]) >= REP_ACTIONS[args[1]] : undefined
    case 'RepIsAtBest': return args[1] in REP_ACTIONS ? rep(args[0]) <= REP_ACTIONS[args[1]] : undefined
    case 'RepGTE': return rep(args[0]) >= Number(args[1])
    case 'RepLTE': return rep(args[0]) <= Number(args[1])
    case 'PlayerHasCargo': case 'HasCommodity': return (p.cargo[args[0]] ?? 0) >= Number(args[1] ?? 1)
    case 'PlayerCredits': case 'HasCredits': return p.credits >= Number(args[0] ?? 0)
    case 'StoryPoints': return p.storyPoints >= Number(args[0] ?? 1)
  }
  return undefined
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Script commands the engine simulates; false = not simulated (logged). */
export function builtinCommand(e: Engine, name: string, args: string[], rule: EngineRule): boolean {
  const v = e.view
  const p = e.ctx.player
  const num = (s: string | undefined) => { const r = e.resolve(s ?? '0'); return Number(r ?? 0) }
  switch (name) {
    case 'FireBest': e.fireBest(String(e.resolve(args[0]) ?? args[0]), args[1] === 'true'); return true
    case 'FireAll': e.fireAll(String(e.resolve(args[0]) ?? args[0])); return true
    case 'EndConversation': case 'DismissDialog': v.ended = true; e.log.push({ kind: 'info', text: 'The dialog closes.' }); return true
    case 'AddText': case 'AddTextSmall': {
      const text = e.subst(args[0] ?? '', rule)
      for (const par of paragraphs(text)) e.para({ kind: 'text', text: par, color: args[1], small: name === 'AddTextSmall', ruleId: rule.row.id })
      return true
    }
    // the game adds a rule's whole text as one block, so its highlights apply to every paragraph of it
    case 'SetTextHighlights': { const hl = args.map((a) => e.subst(a, rule)); for (const p of v.paragraphs) if (p.kind === 'text' && p.ruleId === rule.row.id && !p.previous) p.highlights = hl; return true }
    case 'SetTextHighlightColors': { for (const p of v.paragraphs) if (p.kind === 'text' && p.ruleId === rule.row.id && !p.previous) p.highlightColors = args; return true }
    case 'AddCredits': { const n = num(args[0]); p.credits += n; e.para({ kind: 'gained', text: `Gained ${fmt(n)}¢`, color: 'good', highlights: [], ref: 'credits' }); return true }
    case 'SubCredits': { const n = num(args[0]); p.credits -= n; e.para({ kind: 'lost', text: `Lost ${fmt(n)}¢`, color: 'bad', highlights: [], ref: 'credits' }); return true }
    case 'AddRemoveCommodity': {
      const id = args[0]; const n = num(args[1])
      p.cargo[id] = (p.cargo[id] ?? 0) + n
      if (args[2] !== 'false') e.para({ kind: n >= 0 ? 'gained' : 'lost', text: `${n >= 0 ? 'Gained' : 'Lost'} ${fmt(Math.abs(n))}× ${e.itemName(id)}`, color: n >= 0 ? 'good' : 'bad', highlights: [], ref: id })
      return true
    }
    case 'AddRemoveAnyItem': {
      const id = args[1]; const n = num(args[2])
      p.cargo[id] = (p.cargo[id] ?? 0) + n
      e.para({ kind: n >= 0 ? 'gained' : 'lost', text: `${n >= 0 ? 'Gained' : 'Lost'} ${fmt(Math.abs(n))}× ${e.itemName(id)}`, color: n >= 0 ? 'good' : 'bad', highlights: [], ref: id })
      return true
    }
    case 'SF_AddShip': case 'AddShip': p.ships.push(args[0]); e.para({ kind: 'gained', text: `Gained ${args[0]}`, color: 'good', highlights: [], ref: args[0] }); return true
    case 'SF_RemoveShip': case 'RemoveShip': p.ships = p.ships.filter((s) => s !== args[0]); e.para({ kind: 'lost', text: `Lost ${args[0]}`, highlights: [args[0]] }); return true
    case 'AddStoryPoints': { const n = num(args[0]); p.storyPoints += n; e.para({ kind: 'gained', text: `Gained ${n} story point${n === 1 ? '' : 's'}`, color: 'story', highlights: [String(n)] }); return true }
    case 'AddXP': { const n = num(args[0]); p.xp += n; e.para({ kind: 'gained', text: `Gained ${fmt(n)} experience`, color: 'good', highlights: [] }); return true }
    case 'AdjustRep': case 'AdjustRepActivePerson': case 'AdjustRepPerson': {
      const isPerson = name !== 'AdjustRep'
      const target = name === 'AdjustRepActivePerson' ? String(e.get('$id') ?? 'person') : args[0]
      const amtArg = name === 'AdjustRepActivePerson' ? args[0] : args[1]
      // a number is in points (x 0.01); "<limit level> <points>" also works; else a RepActions value
      const ptsArg = name !== 'AdjustRepActivePerson' && args[2] !== undefined && /^-?[\d.]+$/.test(args[2]) ? args[2] : amtArg
      const amount = ptsArg && /^-?[\d.]+$/.test(ptsArg) ? Number(ptsArg) * 0.01 : (REP_DELTA[amtArg ?? ''] ?? 0)
      const map = isPerson ? p.personRep : p.rep
      map[target] = Math.max(-1, Math.min(1, (map[target] ?? 0) + amount))
      const pts = Math.round(Math.abs(amount) * 100)
      e.para({ kind: 'rep', text: `Relationship with ${isPerson ? target : e.factionName(target)} ${amount >= 0 ? 'improved' : 'reduced'} by ${pts}`, color: amount >= 0 ? 'good' : 'bad', highlights: [String(pts)], ref: target })
      return true
    }
    case 'SetEnabled': { const o = v.options.find((x) => x.id === args[0]); if (o) o.enabled = args[1] !== 'false'; return true }
    case 'SetTooltip': { const o = v.options.find((x) => x.id === args[0]); if (o) o.tooltip = e.subst(args.slice(1).join(' '), rule); return true }
    case 'SetStoryOption': { const o = v.options.find((x) => x.id === args[0]); if (o) { o.story = { cost: args.length === 3 ? 1 : Number(args[1] ?? 1) || 1 }; o.color = 'story' } return true }
    case 'SetShortcut': { const o = v.options.find((x) => x.id === args[0]); if (o) o.shortcut = args[1]; return true }
    case 'SetOptionText': { const o = v.options.find((x) => x.id === args[0]); if (o) o.text = e.subst(args.slice(1).join(' '), rule); return true }
    case 'SetOptionColor': { const o = v.options.find((x) => x.id === args[0]); if (o) o.color = args[1]; return true }
    case 'ClearOptions': v.options = []; return true
    case 'AddOption': v.options.push({ id: args[0], text: e.subst(args.slice(1).join(' '), rule), order: 0, enabled: true }); return true
    case 'ShowPersonVisual': v.visual = { kind: 'person', person: args[1] ?? String(e.get('$id') ?? '$person') }; return true
    case 'ShowSecondPerson': if (v.visual.kind === 'person') v.visual.second = args[0]; return true
    case 'ShowThirdPerson': if (v.visual.kind === 'person') v.visual.third = args[0]; return true
    case 'ShowDefaultVisual': v.visual = { kind: 'default' }; return true
    case 'ShowImageVisual': v.visual = args.length > 1 ? { kind: 'image', category: args[0], key: args[1] } : { kind: 'image', category: 'illustrations', key: args[0] }; return true
    case 'ShowLargePlanet': v.visual = { kind: 'planet', entity: args[0] }; return true
    case 'SF_ShowPlanetInfo': v.visual = { kind: 'planet', entity: args[0], info: true }; return true
    case 'ShowMapMarker': v.visual = { kind: 'mapMarker', entity: args[0], title: args[1] }; return true
    case 'SF_ShowFleets': v.visual = { kind: 'fleets', key: args[0] }; return true
    case 'SF_ShowShip': v.visual = { kind: 'ship', variant: args[0] }; return true
    case 'HideVisual': v.visual = { kind: 'none' }; return true
    case 'SaveCurrentVisual': v.savedVisual = v.visual; return true
    case 'RestoreSavedVisual': if (v.savedVisual) v.visual = v.savedVisual; return true
    case 'ShowResCost': e.para({ kind: 'display', text: 'Cost', placeholder: { label: 'Resource cost panel (ShowResCost)', height: 64 } }); return true
    case 'ShowRemainingCapacity': e.para({ kind: 'display', text: 'Remaining capacity', placeholder: { label: 'Remaining cargo / fuel / crew capacity', height: 40 } }); return true
    case 'SF_Show': e.para({ kind: 'display', text: args.join(' '), placeholder: { label: `SF_Show ${args[0] ?? ''}`, height: args[0] === 'heading' ? 22 : args[0] === 'faction' ? 52 : 70 }, ref: args[1] }); return true
    case 'PlaySound': case 'PlayCustomMusic': case 'PauseMusic': case 'ResumeNormalMusic':
      e.log.push({ kind: 'info', text: `${name} ${args.join(' ')}` }); return true
  }
  return false
}

/** RepActions values used by AdjustRep (approximate rep change). */
const REP_DELTA: Record<string, number> = {
  COMBAT_HELP_MINOR: 0.01, COMBAT_HELP_MAJOR: 0.03, COMBAT_HELP_CRITICAL: 0.07, MISSION_SUCCESS: 0.05, MISSION_FAILURE: -0.05,
  COMBAT_AGGRESSIVE: -0.1, COMBAT_AGGRESSIVE_TOFF: -0.05, COMBAT_WITH_ENEMY: 0.01, COMBAT_NO_DAMAGE_ESCAPE: -0.01
}

/** Option ids a rule adds (options column + AddOption lines). */
export function ruleOptionIds(r: EngineRule): string[] {
  return [...r.options.map((o) => o.id), ...r.script.filter((s) => s.kind === 'command' && s.name === 'AddOption').map((s) => (s as { args: string[] }).args[0])]
}

/** Triggers a rule fires (FireBest/FireAll lines). */
export function ruleFires(r: EngineRule): { cmd: string; trigger: string }[] {
  return r.script.filter((s) => s.kind === 'command' && (s.name === 'FireBest' || s.name === 'FireAll'))
    .map((s) => ({ cmd: (s as { name: string }).name, trigger: (s as { args: string[] }).args[0] ?? '' }))
}

export { tokenize }
