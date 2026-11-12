/** Types shared by the main process, the preload bridge and the UI. */
import type { GameDefinitions } from './defs/types'
import type { DefsPatch } from './defs'
import type { RuleRow } from './rules/types'
import type { ProjectState, WriteRequest, WriteResult, FactionLayers } from './project'

export type InstallInfo =
  | { ok: true; root: string; coreDir: string; modsDir: string | null; gameVersion: string | null }
  | { ok: false; root: string; error: string }

export type ValidInstall = Extract<InstallInfo, { ok: true }>
export type ModsMode = 'workspace' | 'game'

export interface SourceInfo {
  /** Mod id from mod_info.json, or 'starsector-core' for the base game. */
  id: string
  name: string
  version: string
  /** Folder name (empty for the base game). */
  folder: string
  dir: string
  /** dir with junctions/symlinks resolved. */
  realDir: string
  isCore: boolean
  /** Enabled in the game's launcher (enabled_mods.json). The editor indexes all mods regardless (Q8). */
  enabled: boolean
  isLink: boolean
  /** Lives in the user's mods folder, so it can be the active mod. */
  writable: boolean
  /** Where the editor writes for this mod. Empty if not writable. */
  writeDir: string
  /** Present in the game's mods folder (directly or as a link). */
  inGameMods: boolean
  /** Mod ids from mod_info.json "dependencies". */
  dependencies: string[]
  gameVersion: string
  utility: boolean
  /** mod_info.json sortString (the game sorts mods by it, else by name). */
  sortString: string
}

export type ProblemLevel = 'error' | 'warning' | 'save' | 'style' | 'info'

/** What a problem points at; clicking it opens this. */
export interface ProblemRef {
  page: 'factions' | 'people' | 'items' | 'quests' | 'locations' | 'encounters' | 'dialog' | 'saga' | 'export' | 'index'
  id?: string
  /** Node, option, stage, ... inside the object. */
  sub?: string
}

export interface ProblemFix {
  label: string
  /** Handled by the page that owns `ref`. */
  action: string
  arg?: unknown
}

export interface Problem {
  level: ProblemLevel
  /** Short area label: "Quest", "Faction", "Index", "Rules", ... */
  area: string
  message: string
  sourceId?: string
  file?: string
  ref?: ProblemRef
  fixes?: ProblemFix[]
  /** Stable key, used to ignore a problem with a reason (stored in sagaforge/project.json). */
  key?: string
}

/** Who defines and who changes an id (PLAN.md §6, Reading). */
export interface Origin {
  /** Source id that defines it ('starsector-core' = vanilla, or 'code:<sourceId>' when created in Java). */
  definedBy: string
  /** Later sources that patch it (factions) or replace it (rows). */
  changedBy: string[]
}

export interface FactionInfo extends Origin {
  id: string
  name: string
  /** [r,g,b,a] */
  color: number[] | null
  /** Path of the faction file relative to the source, e.g. data/world/factions/hegemony.faction */
  file: string
  logo: string
  crest: string
  /** Listed in a factions.csv (the game only loads listed factions). */
  listed: boolean
  showInIntelTab: boolean
}

export interface PersonInfo extends Origin {
  id: string
  name: string
  faction: string
  market: string
  portrait: string
  /** 'code' = created in Java (vanilla's ids.People, or a mod's code); 'sagalib' = another Saga Forge mod's people JSON. */
  kind: 'code' | 'sagalib'
}

export interface MarketInfo extends Origin {
  /** The market's primary entity id (what rules and SagaLib use). */
  id: string
  name: string
  entities: string[]
  faction: string
  size: number
  system: string
  conditions: string[]
  industries: string[]
  submarkets: string[]
}

export interface SystemInfo extends Origin {
  id: string
  name: string
  /** Hyperspace location from starmap.json (null if the system is placed in code without one). */
  x: number | null
  y: number | null
}

export interface ItemInfo extends Origin {
  id: string
  name: string
  kind: 'commodity' | 'special'
  icon: string
  tags: string[]
  basePrice: number
  desc: string
}

export interface NamedEntry extends Origin { id: string; name: string }

export interface HullInfo extends Origin {
  id: string
  name: string
  hullSize: string
  designation: string
  tech: string
  hints: string
  isSkin: boolean
}

export interface IllustrationInfo extends Origin {
  /** "<category>/<key>" */
  id: string
  /** settings.json graphics category (vanilla's ShowImageVisual uses "illustrations" by default). */
  category: string
  key: string
  path: string
}

export interface PortraitInfo { path: string; sourceId: string }

/** The read-only picture of the game and every installed mod (PLAN.md §3, GameIndex). */
export interface GameIndex {
  install: ValidInstall
  modsMode: ModsMode
  workspaceDir: string | null
  modsRoot: string | null
  /** Source id of the active mod (the only mod the editor writes). */
  activeSourceId: string | null
  sources: SourceInfo[]
  factions: FactionInfo[]
  people: PersonInfo[]
  markets: MarketInfo[]
  systems: SystemInfo[]
  items: ItemInfo[]
  industries: NamedEntry[]
  conditions: NamedEntry[]
  submarkets: NamedEntry[]
  hulls: HullInfo[]
  wings: NamedEntry[]
  weapons: NamedEntry[]
  hullmods: NamedEntry[]
  /** Ship variant ids (from .variant file names). */
  variants: NamedEntry[]
  illustrations: IllustrationInfo[]
  portraits: PortraitInfo[]
  customEntityTypes: NamedEntry[]
  planetTypes: NamedEntry[]
  sounds: string[]
  music: string[]
  /** Rule counts per source; the rules themselves come from getRules(). */
  ruleCounts: Record<string, number>
  /** Game colors and the dialog font from the merged settings.json. */
  ui: UiSettings
  problems: Problem[]
  stats: { filesRead: number; ms: number }
  /** Extensions and whether they are on (Settings -> Extensions). */
  extensions: { id: string; name: string; description: string; on: boolean; available: boolean; reason?: string }[]
  ext: Record<string, unknown>
}

export interface UiSettings {
  colors: Record<string, number[]>
  /** settings.json "defaultFont" etc. */
  fonts: Record<string, string>
}

/** A BMFont (.fnt) with its page image, read from the game folder at runtime, never copied. */
export interface FontData {
  key: string
  path: string
  fnt: string
  pages: { file: string; bytes: Uint8Array }[]
  sourceId: string
}

export interface ImageData { path: string; bytes: Uint8Array; sourceId: string; mime: string }

/** User definition files (patches to the built-in game definitions). */
export interface UserDefinitions {
  dir: string
  files: { name: string; gameVersion: string; error?: string }[]
  patches: DefsPatch[]
}

export interface Startup {
  starsectorDir: string | null
  workspaceDir: string | null
  modsMode: ModsMode
  install: InstallInfo | null
  /** Set when started in automated screenshot / end-to-end mode. */
  smoke: string | null
  definitions: UserDefinitions
  settings: AppSettings
}

/** User preferences (Settings dialog) the UI needs. */
export interface AppSettings {
  styleChecks: boolean
  extensions: Record<string, boolean>
}

export interface WorkspaceResult { ok: boolean; error?: string; workspaceDir: string | null }

export interface EditorApi {
  getStartup(): Promise<Startup>
  pickFolder(current?: string | null, title?: string): Promise<string | null>
  pickFile(opts: { title?: string; current?: string | null; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
  checkInstall(dir: string): Promise<InstallInfo>
  setInstall(dir: string): Promise<InstallInfo>
  setWorkspace(dir: string): Promise<WorkspaceResult>
  setModsMode(mode: ModsMode): Promise<WorkspaceResult>
  setActiveMod(writeDir: string | null): Promise<GameIndex>
  getIndex(reload?: boolean): Promise<GameIndex>
  /** Every rules.csv row of the game and all installed mods (lazy; large). */
  getRules(): Promise<RuleRow[]>
  /** A faction's layers: the defining file and every patch, by source (for the override editor). */
  loadFaction(id: string): Promise<FactionLayers>
  /** A game or mod image (portraits, illustrations, icons, logos) by game path, from the source that wins. */
  loadImage(gamePath: string, sourceId?: string): Promise<ImageData | null>
  /** A file picked by the user (absolute path), e.g. a new logo, read for preview. */
  readPickedImage(absPath: string): Promise<ImageData | null>
  loadFont(key: string): Promise<FontData | null>
  /** The active mod's plans, faction files and the shared files the editor may write. */
  loadProject(): Promise<ProjectState | null>
  /** Write files into the active mod (write guard + changed-on-disk check + optional backups). */
  writeFiles(req: WriteRequest): Promise<WriteResult>
  /** Run Check mod's file checks that need the disk (images exist, etc.). */
  filesExist(paths: string[]): Promise<Record<string, boolean>>
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings>
  ext<T = unknown>(extensionId: string, method: string, arg?: unknown): Promise<T>
  createMod(mod: { id: string; name: string }): Promise<GameIndex>
  setDirty(dirty: boolean): Promise<void>
  smokeReady(info?: unknown): Promise<void>
}

declare global {
  interface Window {
    api: EditorApi
  }
}

export type { GameDefinitions }
