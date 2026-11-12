/** App-wide UI state: the game index, settings, the current page and lazily loaded game data. */
import type { AppSettings, GameIndex, ImageData, FontData, UserDefinitions } from '../../../shared/api'
import type { RuleRow } from '../../../shared/rules/types'
import { compileRules, type RuleSet } from '../../../shared/rules/engine'
import { defsFor } from '../../../shared/defs'
import type { GameDefinitions } from '../../../shared/defs/types'

export type PageId = 'saga' | 'factions' | 'people' | 'items' | 'quests' | 'locations' | 'encounters' | 'dialog' | 'problems'

export const PAGES: { id: PageId; label: string }[] = [
  { id: 'saga', label: 'Saga' },
  { id: 'factions', label: 'Factions' },
  { id: 'people', label: 'People' },
  { id: 'items', label: 'Items' },
  { id: 'quests', label: 'Quests' },
  { id: 'locations', label: 'Locations' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'dialog', label: 'Dialog' },
  { id: 'problems', label: 'Problems' }
]

class AppState {
  index = $state.raw<GameIndex | null>(null)
  settings = $state<AppSettings>({ styleChecks: false, extensions: {} })
  definitions = $state.raw<UserDefinitions | null>(null)
  page = $state<PageId>((localStorage.getItem('sf.page') as PageId) || 'factions')
  /** Selection per page (id of the open object), remembered while the app runs. */
  selected = $state<Record<string, string | null>>({})
  error = $state<string | null>(null)
  notice = $state<string | null>(null)
  smoke = $state<string | null>(null)
  /** Extra argument for screenshot mode (e.g. a tab to open). */
  smokeArg = $state<string | null>(null)
  rules = $state.raw<RuleRow[] | null>(null)
  private rulesPromise: Promise<RuleRow[]> | null = null
  /** Every rule of the game and all mods, compiled for the engine (lazy). */
  ruleSet = $state.raw<RuleSet | null>(null)

  async loadRuleSet(): Promise<RuleSet> {
    if (this.ruleSet) return this.ruleSet
    const rows = await this.loadRules()
    this.ruleSet = compileRules(rows)
    return this.ruleSet
  }

  get defs(): GameDefinitions { return defsFor(this.index?.install.gameVersion) }

  go(page: PageId, id?: string | null): void {
    this.page = page
    try { localStorage.setItem('sf.page', page) } catch { /* ignore */ }
    if (id !== undefined) this.selected[page] = id
  }

  async loadRules(): Promise<RuleRow[]> {
    if (this.rules) return this.rules
    this.rulesPromise ??= window.api.getRules().then((r) => (this.rules = r))
    return this.rulesPromise
  }

  resetGameData(): void {
    this.rules = null
    this.rulesPromise = null
    this.ruleSet = null
    images.clear()
  }

  flash(msg: string): void {
    this.notice = msg
    setTimeout(() => { if (this.notice === msg) this.notice = null }, 4000)
  }
}

export const app = new AppState()

/** Images from the game (read-only), as blob URLs, cached. */
const imageCache = new Map<string, Promise<string | null>>()
export const images = {
  clear(): void {
    for (const p of imageCache.values()) p.then((u) => u && URL.revokeObjectURL(u))
    imageCache.clear()
  },
  url(gamePath: string | null | undefined, sourceId?: string): Promise<string | null> {
    if (!gamePath) return Promise.resolve(null)
    const key = `${sourceId ?? ''}|${gamePath}`
    let p = imageCache.get(key)
    if (!p) {
      p = window.api.loadImage(gamePath, sourceId).then(toUrl).catch(() => null)
      imageCache.set(key, p)
    }
    return p
  },
  picked(abs: string): Promise<string | null> {
    const key = `picked|${abs}`
    let p = imageCache.get(key)
    if (!p) { p = window.api.readPickedImage(abs).then(toUrl).catch(() => null); imageCache.set(key, p) }
    return p
  }
}

function toUrl(d: ImageData | null): string | null {
  if (!d) return null
  return URL.createObjectURL(new Blob([d.bytes as BlobPart], { type: d.mime }))
}

const fontCache = new Map<string, Promise<FontData | null>>()
export function loadFont(key: string): Promise<FontData | null> {
  let p = fontCache.get(key)
  if (!p) { p = window.api.loadFont(key).catch(() => null); fontCache.set(key, p) }
  return p
}

export const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
