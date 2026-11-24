/** Types shared by the main process, the preload bridge and the UI. */
import type { GameDefinitions } from './defs/types'
import type { DefsPatch } from './defs'
import type { RuleRow } from './rules/types'
import type { RuntimeText } from './translate'
import type { ProjectState, WriteRequest, WriteResult, FactionLayers, JarInfo } from './project'
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
  /** #60: made with Saga Forge (ships SagaLib's content index). */
  sagaforge?: boolean
  /** #60: a translation mod (Phase 8c): the id of the mod it translates. */
  translates?: string
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
  /** #67 U33: each source's own version when several define or change it (indexview.ts effectiveOf). */
  layers?: unknown[]
  layerHow?: 'json' | 'csv' | boolean
}

export interface FactionInfo extends Origin {
  id: string
  name: string
  /** [r,g,b,a], merged over every installed mod's patch. */
  color: number[] | null
  /** #67: the colour each layer (the defining file, then patches in load order) sets, for factionColor(). */
  colors?: { sourceId: string; color: number[] }[]
  /** #67 U33: the name, logo and crest each layer sets (indexview.ts). */
  layerValues?: { sourceId: string; name?: string; logo?: string; crest?: string }[]
  /** Path of the faction file relative to the source, e.g. data/world/factions/hegemony.faction */
  file: string
  logo: string
  crest: string
  /** Listed in a factions.csv (the game only loads listed factions). */
  listed: boolean
  /**
   * #67 U39: the ships each layer (the defining file, then patches) adds to knownShips (hulls and
   * blueprint tags): the variant picker's "faction's ships" and "From a faction's fleet" use the
   * layers of the sources that count for the mod.
   */
  knownShips?: { sourceId: string; hulls: string[]; tags: string[] }[]
  showInIntelTab: boolean
}

export interface PersonInfo extends Origin {
  id: string
  name: string
  faction: string
  market: string
  portrait: string
  /** 'code' = created in Java (vanilla's ids.People, or a mod's code); 'sagalib' = another Saga Forge mod's people JSON; 'seen' (#64) = from a sector snapshot. */
  kind: 'code' | 'sagalib' | 'seen'
  /** #64: their post and rank (from a sector snapshot). */
  post?: string
  rank?: string
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
  /** #75: commodities: commodities.csv econUnit (cargo units per economy unit); tags nonecon / meta say whether it's in the economy. */
  econUnit?: number
}

/** #67 U39: a ship variant: its hull (for "the faction's ships") and its display name in the file. */
export interface VariantInfo extends Origin { id: string; name: string; hull?: string; displayName?: string }
export interface NamedEntry extends Origin {
  id: string
  name: string
  /** #67 U34: the game's description (industries, submarkets, hullmods), for the reference. */
  desc?: string
  /** #67 U34: the CSV's tags (industries; wings, weapons, hullmods for blueprint tags). */
  tags?: string[]
}
/** #67 U34: an industries.csv row with what the Industries reference shows. */
export interface IndustryInfo extends NamedEntry { upkeep?: number; income?: number; icon?: string; upgrade?: string; downgrade?: string }
/** #67 U34: a salvage_entity_gen_data.csv row (salvage, defenders and XP of an entity type). */
export interface SalvageGenInfo extends Origin { id: string; type: string; dropValue: string; dropRandom: string; defFaction: string; probDefenders: number; xpDiscover: number; xpSalvage: number }
/** #67 U34: a skill_data.csv row (who can have it). */
export interface SkillInfo extends NamedEntry { tier: number; officer: boolean; admiral: boolean; admin: boolean; icon?: string; author?: string }
/** #67 U34: a settings.json graphics icon the editor offers by key (raidObjectives, VoK's ui_icons_tech_tree); id "<category>/<key>". */
export interface GraphicIconInfo extends Origin { id: string; category: string; key: string; path: string }
/** #67 U34: a descriptions.csv text for a planet type (PLANET) or custom entity (CUSTOM); id "PLANET:<id>". */
export interface TypeDescInfo extends Origin { id: string; text: string }
/** #67: a market condition with what the Conditions reference shows; how planets roll it from condition_gen_data.csv (onPlanets: planet type ids). */
export interface ConditionInfo extends NamedEntry { desc?: string; icon?: string; planetary?: boolean; group?: string; hazard?: number; onPlanets?: string[] }

/** #64: a place in the sector: an entity with an id (planet, station, jump point, custom entity). */
export interface PlaceInfo extends Origin { id: string; name: string; system: string; kind: string; faction?: string; market?: string }
/** #77: a VoK tech (aotd_tech_options.csv row): its tree (modId), tier and whether it is researched from the start. */
export interface ResearchTechInfo extends Origin { id: string; name: string; tier: number; modId: string; fromStart: boolean; requires: string[]; otherReq: string }
/** #64: another Saga Forge mod's quest: SagaLib keeps its state in $global.<id>_state. */
export interface SagaQuestInfo extends Origin { id: string; title: string; kind: string; stages: string[] }
/** #64: the sector snapshot the editor imported (SagaLib dev menu › Write sector snapshot). */
export interface SnapshotInfo {
  file: string
  imported: string
  gameVersion: string
  day: string
  /** The mods enabled when it was taken. */
  mods: { id: string; name: string; version: string }[]
  /** What it added to the index (ids the game files and Java sources don't show), per source. */
  added: Record<string, { systems: number; places: number; markets: number; people: number }>
  /** Things it couldn't tie to a mod (left out: e.g. vanilla's random systems). */
  skipped: number
}

/** #64: SagaLib's sector snapshot file (docs/FORMAT.md "Sector snapshot"). */
export interface SectorSnapshot {
  format: number
  sagalib?: string
  gameVersion?: string
  day?: string
  mods?: { id: string; name?: string; version?: string }[]
  systems?: { id: string; name?: string; x?: number; y?: number }[]
  places?: { id: string; name?: string; system?: string; kind?: string; type?: string; faction?: string; market?: string }[]
  markets?: { id: string; entity?: string; name?: string; faction?: string; size?: number; system?: string }[]
  people?: { id: string; first?: string; last?: string; faction?: string; market?: string; post?: string; rank?: string; portrait?: string }[]
}

/** A planets.json entry (planet type or star), merged over every source (R15, R19). */
/** #67 U33: rawLayers = each source's own JSON when several sources set the type (indexview.ts merges the visible ones). */
export interface RawLayer { sourceId: string; raw: Record<string, unknown> }
export interface PlanetTypeInfo extends NamedEntry { isStar: boolean; texture: string; iconColor: number[] | null; raw: Record<string, unknown>; rawLayers?: RawLayer[] }
/** A custom_entities.json entry, merged and with its baseId resolved (R19, R20). */
export interface EntityTypeInfo extends NamedEntry { sprite: string; sheet: string; icon: string; tags: string[]; radius: number | null; raw: Record<string, unknown>; rawLayers?: RawLayer[] }
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
  /** #67 U34: ship_data.csv tags (blueprint tags such as base_bp). */
  tags?: string[]
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
  industries: IndustryInfo[]
  conditions: ConditionInfo[]
  submarkets: NamedEntry[]
  hulls: HullInfo[]
  wings: NamedEntry[]
  weapons: NamedEntry[]
  hullmods: NamedEntry[]
  /** Ship variant ids (from .variant file names). */
  variants: VariantInfo[]
  /** #67 U39: default_ship_roles.json rows (role → variant, weight) of every source; a mod's file adds to vanilla's. */
  shipRoles?: { role: string; variant: string; weight: number; definedBy: string }[]
  illustrations: IllustrationInfo[]
  /** #67 U49: illustration keys a Saga Forge mod has in its project but its export hasn't registered yet (not in the game). */
  unexportedIllustrations?: { key: string; mod: string; modName: string }[]
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
  /** #67 U34: salvage data per entity type, skills, and the planet/entity type descriptions. */
  salvageGen?: SalvageGenInfo[]
  skills?: SkillInfo[]
  typeDescs?: TypeDescInfo[]
  graphicsIcons?: GraphicIconInfo[]
  sounds: string[]
  music: string[]
  /** Person name categories from every source's person_names.csv (R3); optional for older caches. */
  nameCategories?: NameCategoryInfo[]
  /** Ship name lists from every source's ship_names.json (R3). */
  shipNameLists?: ShipNameListInfo[]
  /** Default fleet names by fleet type (merged default_fleet_type_names.json of every source). */
  fleetTypeNames?: Record<string, string>
  /** The same without the active mod's file: what the game calls each type without the mod. */
  fleetTypeNamesBase?: Record<string, string>
  /** Faction keys vanilla's factions use that the form has no field for (R7), most used first. */
  factionKeyUsage?: FactionKeyUsage[]
  /** #64: places (entities with ids) of other Saga Forge mods' systems and from a sector snapshot. */
  places?: PlaceInfo[]
  /** #64: other Saga Forge mods' quests (from their content.csv), for "after Mod1's quest X". */
  sagaQuests?: SagaQuestInfo[]
  /** #64: other Saga Forge mods' encounters and pools. */
  sagaEncounters?: NamedEntry[]
  sagaPools?: NamedEntry[]
  /** #64: the imported sector snapshot ("seen in game"), if any. */
  snapshot?: SnapshotInfo | null
  /** #77: AoTD Vaults of Knowledge techs of every source's aotd_tech_options.csv (merged by id), for prerequisites and grants. */
  researchTechs?: ResearchTechInfo[]
  /** #77: factions with a research stance row in any source's aotd_faction_behaviour.csv (merged by factionId). */
  researchFactions?: (NamedEntry & { stance: string })[]
  /** #77: the icon ids any source lists under settings.json graphics.ui_icons_tech_tree (VoK's tech icons). */
  researchIcons?: string[]
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
  extensions: { id: string; name: string; description: string; on: boolean; available: boolean; reason?: string; /** #60: the mod it is for: its tools show in a mod only when that mod is in its list (Saga › Mods). */ requiresMod?: string }[]
  ext: Record<string, unknown>
}

export interface UiSettings {
  colors: Record<string, number[]>
  /** settings.json "defaultFont" etc. */
  fonts: Record<string, string>
  /** #67 U33: each source's own colours and fonts, in load order (indexview.ts uses the visible ones). */
  layers?: { sourceId: string; colors: Record<string, number[]>; fonts: Record<string, string> }[]
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
  /** #67 U43: the node group library folder (chosen, or Saga Forge's own data/nodegroups). */
  nodeGroupsDir: string
  nodeGroupsDirChosen: boolean
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
  /** #67 U44: open (or bring up) the token window, a child of the editor's window. */
  openTokenWindow(): Promise<void>
  /** #67 U44: the editor sends the token catalog (TokenPayload) whenever it changes; the window gets it. */
  tokensPublish(payload: unknown): void
  /** #67 U44 (token window): the latest catalog, and later ones as they come. */
  tokensGet(): Promise<unknown>
  onTokens(cb: (payload: unknown) => void): void
  /** #67 U44 (token window): insert a token into the editor's last token field. */
  tokensInsert(token: string): void
  /** #67 U44 (editor): a token to insert, from the token window. */
  onTokenInsert(cb: (token: string) => void): void
  /** R30: quest templates saved by the user (Saga Forge's data folder › templates). */
  listQuestTemplates(): Promise<{ file: string; quest: QuestPlan }[]>
  /** R30: save a quest as a template; returns the file. */
  saveQuestTemplate(name: string, quest: QuestPlan): Promise<string>
  /** #67 U43: the node group library (the folder in Settings): each *.group.json file's content (unparseable ones as text). */
  listNodeGroups(): Promise<{ file: string; def: unknown }[]>
  /** #67 U43: save a node group into the library (<id>.group.json); returns the file. */
  saveNodeGroup(def: unknown): Promise<string>
  /** #67 U43: export a node group to a file the user picks (to share it); null = cancelled. */
  exportNodeGroup(def: unknown): Promise<string | null>
  /** #67 U43: pick a node group file to import; its text, or null = cancelled. */
  readNodeGroupFile(): Promise<{ file: string; text: string } | null>
  /** #47: copy the active mod into sagaforge/backups/<stamp> <label>/ (never pruned); returns that folder. */
  snapshotMod(label: string): Promise<string>
  /** R32: pack the active mod into a release zip (+ forum post draft) in the releases folder. */
  packRelease(req: { version: string; forumPost: string; overwrite?: boolean; notes?: string; /** #67 U38 */ originals?: boolean }): Promise<PackResult>
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
  /** #67 U34: the reference pages (one per group), the page to open and the section in it. */
  openReference(pages: { file: string; html: string }[], file: string, anchor: string): Promise<void>
  loadFont(key: string): Promise<FontData | null>
  /** #67 U33: the sources that count for the active mod: image and font lookups prefer them. */
  setVisibleSources(ids: string[]): Promise<void>
  /** The active mod's plans, faction files and the shared files the editor may write. */
  loadProject(): Promise<ProjectState | null>
  /** #79: the active mod's jars (mod_info.json "jars") and their classes, read again (after a rebuild). */
  modJars(): Promise<JarInfo[]>
  /** Write files into the active mod (write guard + changed-on-disk check + optional backups). */
  writeFiles(req: WriteRequest): Promise<WriteResult>
  /** Run Check mod's file checks that need the disk (images exist, etc.). */
  filesExist(paths: string[]): Promise<Record<string, boolean>>
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K] | null): Promise<AppSettings>
  ext<T = unknown>(extensionId: string, method: string, arg?: unknown): Promise<T>
  createMod(mod: { id: string; name: string }): Promise<GameIndex>
  /** R31: installed mods with texts to translate. */
  /** #64: import a sector snapshot (default: the game's saves/common file); returns what it added. */
  importSnapshot(file?: string | null): Promise<SnapshotInfo | null>
  clearSnapshot(): Promise<null>
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
