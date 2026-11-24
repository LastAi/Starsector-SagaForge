/**
 * #67 U45: condition helpers for the editor: names for the plain-words reading, "holds now?" with
 * the Test context, and the flags registry (where each key is set and read), cached briefly.
 */
import { namesFrom, type CondNames } from '../../../shared/conditions'
import { parseCondition } from '../../../shared/rules/parse'
import { Engine, builtinCondition, compileRules } from '../../../shared/rules/engine'
import { contextFrom } from '../../../shared/rules/context'
import { buildRegistry, type FlagEntry } from '../../../shared/flags'
import { handRules } from '../../../shared/export/blocks'
import { app } from './app.svelte'
import { project } from './project.svelte'
import { factionLook, lookup, saveTestCtx, testCtx } from './testctx.svelte'

export function condNames(): CondNames {
  const m = project.m
  const extra = { faction: (id: string) => factionLook(id)?.name, command: (n: string) => app.defs.ruleCommands.find((c) => c.name === n)?.summary }
  return m ? namesFrom(m, extra) : extra
}

/** Whether a condition holds with the Test context: yes, no, or ? (the editor can't tell). */
export function holdsNow(line: string): 'yes' | 'no' | '?' {
  try {
    const c = parseCondition(line)
    if (c.kind === 'score') return 'yes'
    const e = new Engine(compileRules([]), contextFrom($state.snapshot(testCtx), app.defs, lookup))
    if (c.kind === 'command') {
      const r = builtinCondition(e, c.name, c.args)
      if (r === undefined) return '?'
      return (c.negate ? !r : r) ? 'yes' : 'no'
    }
    return e.evalCondition(c) ? 'yes' : 'no'
  } catch { return '?' }
}

/** A plain flag condition ($scope.key or !$scope.key) can be switched in the Test context. */
export function flagOf(line: string): string | null {
  const c = parseCondition(line)
  return c.kind === 'memory' && !c.op ? c.key : null
}
export function toggleTestFlag(key: string): void {
  if (testCtx.memory[key] === 'true') delete testCtx.memory[key]
  else testCtx.memory[key] = 'true'
  saveTestCtx()
}

let cache: { at: number; reg: Map<string, FlagEntry> } | null = null
/** The flags registry (Saga › Flags), recomputed at most every 2 seconds. */
export function flagRegistry(): Map<string, FlagEntry> {
  const m = project.m
  if (!m || !project.loaded) return new Map()
  if (cache && Date.now() - cache.at < 2000) return cache.reg
  const reg = buildRegistry(m, handRules(project.loaded.files['data/campaign/rules.csv']?.text, project.loaded.sourceId), app.rules?.filter((r) => r.sourceId !== project.loaded?.sourceId) ?? [])
  cache = { at: Date.now(), reg }
  return reg
}
