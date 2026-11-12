/**
 * Extension point (PLAN.md §10, Q7). An extension adds support for another mod's format
 * (Nexerelin faction config, MagicLib bounties, LunaLib settings, ...) without touching the core
 * editor. Same model as Ship Editor's extensions (docs/extensions.md there). None ship in 1.0;
 * tasks #27 and #31 add the first ones. See docs/extensions.md for the contract.
 */
import type { GameIndex, Problem } from '../../shared/api'
import type { ProjectState, FileWrite } from '../../shared/project'
import type { IndexCache } from '../gameindex'
import type { WriteRules } from '../workspace'

export interface ExtensionInfo {
  id: string
  name: string
  description: string
  /** The mod whose format it handles; the extension is unavailable when it isn't installed. */
  requiresMod?: string
  defaultEnabled: boolean
}

export interface ExtContext {
  cache: IndexCache
  rules: WriteRules
  reload(): Promise<IndexCache>
}

/**
 * Main-process side. Everything is optional except `info` and `methods`.
 *  - index: read the extension's files from every source; `data` goes to GameIndex.ext[id].
 *  - check: extra problems for Check mod (the active mod's project is passed in).
 *  - exportFiles: extra files for Export (they go through the same preview, write guard and backups).
 *  - methods: called from the UI with window.api.ext(id, method, arg).
 */
export interface MainExtension {
  info: ExtensionInfo
  index?(cache: IndexCache): Promise<{ data: unknown; problems: Problem[] }>
  check?(cache: IndexCache, project: ProjectState): Promise<Problem[]> | Problem[]
  exportFiles?(cache: IndexCache, project: ProjectState): Promise<FileWrite[]> | FileWrite[]
  methods: Record<string, (ctx: ExtContext, arg: any) => Promise<unknown>> // eslint-disable-line @typescript-eslint/no-explicit-any
}

const EXTENSIONS: MainExtension[] = []

/** Register an extension (built-ins call this at startup; tests use it too). */
export function registerExtension(ext: MainExtension): void {
  const i = EXTENSIONS.findIndex((e) => e.info.id === ext.info.id)
  if (i >= 0) EXTENSIONS[i] = ext
  else EXTENSIONS.push(ext)
}

export const extensions = (): readonly MainExtension[] => EXTENSIONS

export function enabledExtensions(choices: Record<string, boolean> | undefined): Set<string> {
  return new Set(EXTENSIONS.filter((e) => choices?.[e.info.id] ?? e.info.defaultEnabled).map((e) => e.info.id))
}

/** After the core index: each enabled (and available) extension indexes its own files. */
export async function runExtensionIndex(cache: IndexCache, enabled: Set<string>): Promise<void> {
  const states: GameIndex['extensions'] = []
  for (const ext of EXTENSIONS) {
    const available = !ext.info.requiresMod || cache.sources.some((s) => s.id === ext.info.requiresMod)
    const on = available && enabled.has(ext.info.id)
    states.push({ id: ext.info.id, name: ext.info.name, description: ext.info.description, on, available, reason: available ? undefined : `needs ${ext.info.requiresMod}` })
    if (!on || !ext.index) continue
    try {
      const r = await ext.index(cache)
      cache.index.ext[ext.info.id] = r.data
      cache.index.problems.push(...r.problems)
    } catch (e) {
      cache.index.problems.push({ level: 'error', area: 'Extension', message: `The ${ext.info.name} extension failed: ${(e as Error)?.message ?? e}` })
    }
  }
  cache.index.extensions = states
}

export async function extensionChecks(cache: IndexCache, project: ProjectState): Promise<Problem[]> {
  const out: Problem[] = []
  for (const ext of EXTENSIONS) {
    if (!cache.index.extensions.some((s) => s.id === ext.info.id && s.on) || !ext.check) continue
    try { out.push(...await ext.check(cache, project)) } catch (e) {
      out.push({ level: 'error', area: 'Extension', message: `The ${ext.info.name} check failed: ${(e as Error)?.message ?? e}` })
    }
  }
  return out
}

export async function callExtension(ctx: ExtContext, id: string, method: string, arg: unknown): Promise<unknown> {
  const ext = EXTENSIONS.find((e) => e.info.id === id)
  if (!ext) throw new Error(`Unknown extension "${id}"`)
  if (!ctx.cache.index.extensions.some((s) => s.id === id && s.on)) throw new Error(`The ${ext.info.name} extension is switched off (Settings -> Extensions).`)
  const fn = Object.prototype.hasOwnProperty.call(ext.methods, method) ? ext.methods[method] : undefined
  if (!fn) throw new Error(`Extension "${id}" has no method "${method}"`)
  return fn(ctx, arg ?? {})
}
