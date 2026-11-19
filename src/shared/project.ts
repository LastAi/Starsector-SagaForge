/**
 * The active mod as the UI sees it (ModProject, PLAN.md §3) and the generic file-write request.
 * Serializers and exporters live in shared/ (pure, tested); the main process only checks and
 * writes (write guard, changed-on-disk check, backups).
 */
import type {
  Descriptions, EncounterDef, FactionFile, FactionsRuntime, FleetPlans, ItemDef, PoolPlan, EventSchedulerPlan, ProgressEventPlan, ScatterPlan, BountyPlan, ModTypes, NameLists, PersonDef, Phrase, ProjectFile, QuestPlan,
  ReleaseSnapshot, StarSystemDef, TestProfile
} from './model'

export type { ReleaseSnapshot }

/** A text file of the mod with the hash it had when read (for the changed-on-disk check). */
export interface ModText { text: string; hash: string }

export interface ModInfo {
  id: string
  name: string
  version: string
  gameVersion: string
  dependencies: { id: string; name?: string; /** The minimum version mod_info.json asks for, if any. */ version?: string }[]
}

/** Plan files that failed to read; shown in Problems, never overwritten silently. */
export interface PlanError { file: string; message: string }

export interface ProjectState {
  sourceId: string
  modDir: string
  modInfo: ModInfo
  /** True when sagaforge/project.json didn't exist yet (the UI asks for the prefix). */
  isNew: boolean
  project: ProjectFile
  quests: QuestPlan[]
  people: PersonDef[]
  items: ItemDef[]
  systems: StarSystemDef[]
  encounters: EncounterDef[]
  phrases: Phrase[]
  testProfiles: TestProfile[]
  factionsRuntime: FactionsRuntime
  descriptions: Descriptions
  /** Person name pools and ship name lists (sagaforge/names.json); missing = none. */
  names?: NameLists
  /** The mod's own entity, planet and star types (sagaforge/types.json); missing = none. */
  types?: ModTypes
  /** Fleet templates and fleet type names (sagaforge/fleets.json); missing = none. */
  fleets?: FleetPlans
  /** Named random pools (sagaforge/pools.json, Phase 7a); missing = none. */
  pools?: PoolPlan[]
  /** World event schedulers (sagaforge/events.json, Phase 8d); missing = none. */
  events?: EventSchedulerPlan[]
  /** Progress events (sagaforge/progress.json, Phase 8d-3); missing = none. */
  progress?: ProgressEventPlan[]
  /** Scatter at new game (sagaforge/scatter.json, Phase 7e); missing = none. */
  scatter?: ScatterPlan[]
  /** #27: MagicLib bounties (sagaforge/bounties.json); missing = none. */
  bounties?: BountyPlan[]
  /** #63: Nexerelin faction configs (sagaforge/nexerelin.json); missing (no plan file) = read the mod's config files in. */
  nexerelin?: Record<string, Record<string, unknown>>
  /** #63: ready-made fleets added to the player faction (sagaforge/nexerelin.json "player"). */
  nexerelinPlayer?: Record<string, unknown>
  /** The mod's own .faction files (additions and overrides). */
  factions: FactionFile[]
  releases: ReleaseSnapshot[]
  /** #60: framework files the mod ships for other mods (modlist.ts FRAMEWORK_FILES); missing = none. */
  frameworkFiles?: string[]
  /** Text of every plan file and shared output file the editor may write, by path in the mod. */
  files: Record<string, ModText>
  errors: PlanError[]
}

/** One file to write in the active mod. */
export interface FileWrite {
  /** Path inside the mod, forward slashes. */
  path: string
  text: string
  /** Hash the file had when read; null = the file must not exist yet. Omit to skip the check. */
  expectedHash?: string | null
  /** Delete instead of write (only plan files under sagaforge/). */
  remove?: boolean
}

export interface WriteRequest {
  writes: FileWrite[]
  /** Copy the previous version of changed files to sagaforge/backups/<timestamp>/ first. */
  backup: boolean
  /**
   * Images or other binary files written into the mod: copied from a file (`from`), or given as
   * bytes (an image cropped and resized on import, R5). An existing file is kept unless `replace`
   * is set; a replaced file is backed up first.
   */
  copies?: { from?: string; to: string; bytes?: Uint8Array; replace?: boolean }[]
}

export interface WriteResult {
  written: string[]
  /** New hashes of written files. */
  hashes: Record<string, string>
  /** Files that changed on disk since they were read (nothing was written then). */
  conflicts: string[]
  backupDir?: string
}

/** A faction's layers for the override editor: the base definition and every patch, in load order. */
export interface FactionLayers {
  id: string
  layers: { sourceId: string; file: string; raw: Record<string, unknown> }[]
}
