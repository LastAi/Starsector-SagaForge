// Copied from Ship Editor (src/main/config.ts); may drift, see docs/PLAN.md §2.
/** App settings, stored as JSON in the app's user-data folder. */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface AppConfig {
  starsectorDir: string | null
  /** 'workspace' = the user's mods are in workspaceDir; 'game' = work directly in <Starsector>/mods. */
  modsMode: 'workspace' | 'game'
  /** Separate folder holding the user's own mods (used in 'workspace' mode). */
  workspaceDir: string | null
  /** Folder of the active mod (the only mod saves go into). */
  activeModDir: string | null
  /** Extensions switched on or off by the user (missing = the extension's default). */
  extensions: Record<string, boolean>
  /** Problems level Style (off by default, PLAN.md Q9). */
  styleChecks: boolean
}

const DEFAULTS: AppConfig = { starsectorDir: null, modsMode: 'workspace', workspaceDir: null, activeModDir: null, extensions: {}, styleChecks: false }

const configFile = () => path.join(app.getPath('userData'), 'config.json')

export function loadConfig(): AppConfig {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    return { ...DEFAULTS, ...data }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(config: AppConfig): void {
  const file = configFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2))
  fs.renameSync(tmp, file) // atomic replace, so a crash never leaves a half-written file
}
