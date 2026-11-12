/**
 * The active mod as the UI sees it (ModProject, PLAN.md §3) and the generic file-write request.
 * Serializers and exporters live in shared/ (pure, tested); the main process only checks and
 * writes (write guard, changed-on-disk check, backups).
 */
import type {
  Descriptions, EncounterDef, FactionFile, FactionsRuntime, ItemDef, PersonDef, Phrase, ProjectFile, QuestPlan,
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
  dependencies: { id: string; name?: string }[]
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
  /** The mod's own .faction files (additions and overrides). */
  factions: FactionFile[]
  releases: ReleaseSnapshot[]
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
  /** Images or other binary files copied into the mod (never overwrites). */
  copies?: { from: string; to: string }[]
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
