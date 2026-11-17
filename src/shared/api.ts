/** Types shared by the main process, the preload bridge and the UI. */
import type { GameDefinitions } from './defs/types'
import type { DefsPatch } from './defs'
import type { RuleRow } from './rules/types'
import type { RuntimeText } from './translate'
import type { ProjectState, WriteRequest, WriteResult, FactionLayers } from './project'
import type { QuestPlan } from './model'

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

export type ProblemLevel = 'error' | 'todo' | 'warning' | 'save' | 'style' | 'info'

/** What a problem points at; clicking it opens this. */
export interface ProblemRef {
  page: 'factions' | 'people' | 'items' | 'quests' | 'locations' | 'encounters' | 'fleets' | 'images' | 'dialog' | 'saga' | 'export' | 'index'
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
/** One row of data/campaign/procgen/drop_groups.csv: an item (commodity, item_<id>, wpn_<id>, ftr_<id>, nothing, or a filter) in a group, with its weight. */
export interface DropGroupRow { group: string; item: string; freq: number; definedBy: string }

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

/** A planets.json entry (planet type or star), merged over every source (R15, R19). */
export interface PlanetTypeInfo extends NamedEntry { isStar: boolean; texture: string; iconColor: number[] | null; raw: Record<string, unknown> }
/** A custom_entities.json entry, merged and with its baseId resolved (R19, R20). */
export interface EntityTypeInfo extends NamedEntry { sprite: string; sheet: string; icon: string; tags: string[]; radius: number | null; raw: Record<string, unknown> }
/** procgen tables: per star type its habitable zone start; categories and planet types with weights. */
export interface ProcgenData {
  stars: Record<string, { habZoneStart: number }>
  categories: { id: string; freq: number; mult: Record<string, number> }[]
  types: { id: string; kind: string; category: string; freq: number; habMin: number; habMax: number; habAvg: number; mult: Record<string, number> }[]
}
/** A body of a system read from Java source (R14). `id` is '' when the code passes null. */
export interface CodeBody { id: string; name: string; kind: 'planet' | 'custom' | 'jumpPoint' | 'asteroidBelt' | 'ring' | 'terrain'; type: string; focus: string; angle: number; orbitRadius: number; days: number; radius: number; width: number }
export interface CodeSystem { id: string; name: string; file: string; sourceId: string; star: { id: string; type: string; radius: number; corona: number } | null; bodies: CodeBody[]; skipped: number }

/** A person name category: how many names each source gives it (empty gender counts for both). */
export interface NameCategoryInfo { id: string; counts: Record<string, { male: number; female: number; last: number }> }
/** A ship name list: how many names each source gives it. */
export interface ShipNameListInfo { id: string; counts: Record<string, number> }
/** A faction key (top-level, or "custom.<key>") and how many vanilla factions set it, with one example. */
export interface FactionKeyUsage { key: string; count: number; example: { faction: string; value: unknown } }

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
  customEntityTypes: EntityTypeInfo[]
  /** planets.json entries: planet types and stars (isStar). */
  planetTypes: PlanetTypeInfo[]
  /** Vanilla's random-generation tables (R18), for "fits here"; optional for older caches. */
  procgen?: ProcgenData
  /** Star systems read from the Java sources the game and mods ship (R14). */
  codeSystems?: CodeSystem[]
  /** The sector's normal area, settings.json sectorWidth / sectorHeight (merged with enabled mods). */
  sectorSize?: [number, number]
  /** Phase 8a: every drop_groups.csv row of the game and the installed mods (groups merge: a mod's rows are added; checked in game). */
  dropGroups?: DropGroupRow[]
  sounds: string[]
  music: string[]
  /** Person name categories from every source's person_names.csv (R3); optional for older caches. */
  nameCategories?: NameCategoryInfo[]
  /** Ship name lists from every source's ship_names.json (R3). */
  shipNameLists?: ShipNameListInfo[]
  /** Default fleet names by fleet type (merged default_fleet_type_names.json of every source). */
  fleetTypeNames?: Record<string, string>
  /** Faction keys vanilla's factions use that the form has no field for (R7), most used first. */
  factionKeyUsage?: FactionKeyUsage[]
  /** Rule counts per source; the rules themselves come from getRules(). */
  ruleCounts: Record<string, number>
  /**
   * The rule files the game loads, from the merged settings.json "rules" list (0.98.5a), else just
   * data/campaign/rules.csv. Each is read in every source. Missing in older caches.
   */
  ruleFiles?: string[]
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
  /** The main and migration installs and the target (#47); optional for tests. */
  versions?: VersionState
}

/** #47: the two installs (TARGET-VERSION-ASSESSMENT.md §3) and which one is targeted. */
export interface VersionState {
  main: { dir: string; ok: boolean; version: string | null } | null
  migration: { dir: string; ok: boolean; version: string | null } | null
  target: 'main' | 'migration'
  modsMode: ModsMode
  error?: string
}

/** User preferences (Settings dialog) the UI needs. */
export interface AppSettings {
  styleChecks: boolean
  extensions: Record<string, boolean>
  /** R32: where release zips go (the chosen folder, or Saga Forge's own data/releases). */
  releasesDir: string
  /** True when the user chose releasesDir in Settings. */
  releasesDirChosen: boolean
}

/** R32: a packed release, or the zip that already exists (nothing written). */
export type PackResult = { exists: string } | { zip: string; post: string; folder: string; files: number; leftOut: { path: string; why: string }[] }

export interface WorkspaceResult { ok: boolean; error?: string; workspaceDir: string | null }

export interface EditorApi {
  getStartup(): Promise<Startup>
  pickFolder(current?: string | null, title?: string): Promise<string | null>
  pickFile(opts: { title?: string; current?: string | null; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
  checkInstall(dir: string): Promise<InstallInfo>
  setInstall(dir: string): Promise<InstallInfo>
  setWorkspace(dir: string): Promise<WorkspaceResult>
  setModsMode(mode: ModsMode): Promise<WorkspaceResult>
  /** #47: set (or with null remove) the migration install. */
  setMigrationInstall(dir: string | null): Promise<VersionState>
  /** #47: target the main or the migration install; the index is rebuilt for it. */
  setTarget(slot: 'main' | 'migration'): Promise<{ versions: VersionState; index: GameIndex }>
  /** #47: the migration install becomes the main install. */
  finishMigration(): Promise<VersionState>
  /** #47: the game index of the install that isn't the target (null with one install). */
  getOtherIndex(): Promise<GameIndex | null>
  /** #47: vanilla rule ids of the install that isn't the target. */
  getOtherRuleIds(): Promise<string[] | null>
  /** R29: tell the spellchecker the active mod's own words (names like "Ailuros"). */
  addSpellWords(words: string[]): Promise<void>
  /** R29: the right-click menu's "Add to the mod's word list". */
  onSpellAdd(cb: (word: string) => void): void
  /** R30: quest templates saved by the user (Saga Forge's data folder › templates). */
  listQuestTemplates(): Promise<{ file: string; quest: QuestPlan }[]>
  /** R30: save a quest as a template; returns the file. */
  saveQuestTemplate(name: string, quest: QuestPlan): Promise<string>
  /** #47: copy the active mod into sagaforge/backups/<stamp> <label>/ (never pruned); returns that folder. */
  snapshotMod(label: string): Promise<string>
  /** R32: pack the active mod into a release zip (+ forum post draft) in the releases folder. */
  packRelease(req: { version: string; forumPost: string; overwrite?: boolean }): Promise<PackResult>
  /** R32: show a file in the system file manager. */
  showInFolder(file: string): Promise<void>
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
  /** Every image under a game folder (graphics/portraits, …) in the game and every mod; the last-loaded source wins (R5). */
  listImages(folder: string): Promise<{ path: string; sourceId: string }[]>
  /** Width and height of the active mod's own images (paths in the mod), for Check mod. */
  imageSizes(paths: string[]): Promise<Record<string, { w: number; h: number }>>
  /** Choose image files (several), or a folder (its images). Absolute paths. */
  pickImages(opts: { title?: string; folder?: boolean }): Promise<string[]>
  /** Show the reference document (R8) at a section; Saga Forge writes it to its own data folder. */
  openReference(html: string, anchor: string): Promise<void>
  loadFont(key: string): Promise<FontData | null>
  /** The active mod's plans, faction files and the shared files the editor may write. */
  loadProject(): Promise<ProjectState | null>
  /** Write files into the active mod (write guard + changed-on-disk check + optional backups). */
  writeFiles(req: WriteRequest): Promise<WriteResult>
  /** Run Check mod's file checks that need the disk (images exist, etc.). */
  filesExist(paths: string[]): Promise<Record<string, boolean>>
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K] | null): Promise<AppSettings>
  ext<T = unknown>(extensionId: string, method: string, arg?: unknown): Promise<T>
  createMod(mod: { id: string; name: string }): Promise<GameIndex>
  /** R31: installed mods with texts to translate. */
  translatableMods(): Promise<{ id: string; name: string; version: string; texts: number; dialog: boolean }[]>
  /** R31: an installed mod's runtime files (its texts), read only; null if it isn't installed. */
  modTexts(modId: string): Promise<RuntimeText[] | null>
  /** R31: create "<mod id>_<language>", a translation mod, and make it the active mod. */
  createTranslation(req: { target: string; language: string; languageName: string }): Promise<GameIndex>
  setDirty(dirty: boolean): Promise<void>
  smokeReady(info?: unknown): Promise<void>
}

declare global {
  interface Window {
    api: EditorApi
  }
}

export type { GameDefinitions }
