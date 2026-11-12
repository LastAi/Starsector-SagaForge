/**
 * Saga Forge's plan model (PLAN.md §4). Plan files live in <mod>/sagaforge/ and are the truth for
 * quests, people, items, locations, encounters, phrases and test profiles. Factions are read from
 * the mod's own .faction files (declarative files are the truth for them, §3).
 *
 * Every plan file has a "format" number. Readers must accept every format ever written.
 */
import type { FactionPatch, ScriptedFactionChange } from './faction'

export const PLAN_FORMAT = 1

// ---------------------------------------------------------------- project.json

export interface ProjectFile {
  format: number
  /** Id prefix, e.g. "vgc_". Every id the editor creates starts with it. */
  prefix: string
  /** Saga overview card positions, by card id (quest id). */
  saga: { positions: Record<string, [number, number]> }
  /** Problems ignored with a reason (key = Problem.key). */
  ignores: { key: string; reason: string }[]
  /** Quest ids this mod owns (used to recognise rows in person_missions.csv / bar_events.csv). */
  ownedQuestIds: string[]
  /** Last export: hashes of owned blocks / generated files, to detect hand edits. */
  exported: Record<string, string>
  /** Optional settings for this mod. */
  options: { addToExistingSavesDefault?: boolean }
  /** The mod's own illustrations: key → image path in the mod (added to its settings.json on export). */
  illustrations?: Record<string, string>
}

export const newProjectFile = (prefix: string): ProjectFile => ({
  format: PLAN_FORMAT, prefix, saga: { positions: {} }, ignores: [], ownedQuestIds: [], exported: {}, options: {}
})

// ---------------------------------------------------------------- references

/** Ids are plain strings; these aliases document what they point at. */
export type FactionRef = string
export type PersonRef = string
export type MarketRef = string
export type EntityRef = string
export type QuestRef = string
export type ItemRef = string

// ---------------------------------------------------------------- phrases (§4.3)

export interface PhraseCase { when: string[]; text: string }

export interface Phrase {
  /** "$vgc_reyes_title" */
  token: string
  /** Person id, 'mod', or "node:<quest>/<node>" for an inline variation. */
  owner: string
  mode: 'first-match' | 'random'
  cases: PhraseCase[]
  otherwise?: string
  notes?: string
}

// ---------------------------------------------------------------- people (§4.2)

export type Placement =
  | { at: 'market'; market: MarketRef; inCommDirectory: boolean }
  | { at: 'fleet'; encounter: string }
  | { at: 'none' }

export interface PersonDef {
  id: string
  name: { first: string; last: string }
  gender: 'MALE' | 'FEMALE' | 'ANY'
  faction: FactionRef
  rank: string
  post: string
  portrait: string
  voice?: string
  personality?: string
  placement: Placement
  contact?: { types: string[]; importance: string }
  tags: string[]
  phrases: Phrase[]
  description?: string
  notes?: string
}

// ---------------------------------------------------------------- items (§4.7)

export interface ItemDef {
  kind: 'commodity' | 'special'
  id: string
  name: string
  icon: string
  basePrice: number
  stackSize: number
  cargoSpace: number
  tags: string[]
  special?: { rarity: number; plugin: string; pluginParams?: string; manufacturer?: string }
  description: string
  /** Every CSV column the form doesn't show, kept as-is. */
  otherColumns: Record<string, string>
  preset?: string
}

/** descriptions.csv rows for the mod's own objects: key "<TYPE>:<id>" (FACTION, PLANET, CUSTOM, RESOURCE, ...). */
export type Descriptions = Record<string, { text1: string; text2?: string; text3?: string; notes?: string }>

// ---------------------------------------------------------------- dialog (§4.3, §4.9)

export interface OptionDef {
  /** Option id suffix (slug); the exported option id is "<quest>_<id>". */
  id: string
  text: string
  /** Only offered when these conditions hold (exported as its own small rule). */
  showIf?: string[]
  tooltip?: string
  /** Shown but disabled when these conditions hold ([] = always disabled). */
  disabledIf?: string[]
  /** Story-point option: cost in story points (1) and bonus XP fraction. */
  story?: { cost: number; bonusXp?: number }
  /** "ESC" or a key name. */
  shortcut?: string
  showOnce?: 'conversation' | 'ever'
  /** Color for SetOptionColor-like use; story options use the story color. */
  color?: string
}

export type Visual =
  | { kind: 'none' }
  | { kind: 'keep' }
  | { kind: 'person'; person: PersonRef; second?: PersonRef; third?: PersonRef }
  | { kind: 'illustration'; category: string; key: string }
  | { kind: 'planet'; entity: EntityRef; info?: boolean }
  | { kind: 'mapMarker'; entity: EntityRef; title?: string }
  | { kind: 'fleets'; encounter: string }
  | { kind: 'ship'; variant: string }
  | { kind: 'hide' }
  | { kind: 'save' }
  | { kind: 'restore' }

/** One display placed in a Dialog node's text (§4.9). `at` = paragraph index it comes after (-1 = before the text). */
export type Display = { at?: number } & (
  | { kind: 'credits'; amount: number }
  | { kind: 'commodity'; item: ItemRef; qty: number }
  | { kind: 'specialItem'; item: ItemRef; data?: string; qty: number }
  | { kind: 'weapon'; id: string; qty: number }
  | { kind: 'fighter'; id: string; qty: number }
  | { kind: 'ship'; variant: string; remove?: boolean }
  | { kind: 'storyPoints'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'rep'; faction?: FactionRef; person?: PersonRef; amount: number }
  | { kind: 'text'; text: string; color?: string; small?: boolean }
  | { kind: 'cost'; items: { item: ItemRef; qty: number }[]; credits?: number }
  | { kind: 'capacity' }
  | { kind: 'image'; category: string; key: string }
  | { kind: 'faction'; faction: FactionRef }
  | { kind: 'shipList'; variants: string[] }
  | { kind: 'cargo'; items: { item: ItemRef; qty: number }[] }
  | { kind: 'heading'; text: string }
  | { kind: 'skills'; person: PersonRef }
  | { kind: 'sound'; id: string }
  | { kind: 'music'; id: string }
)

// ---------------------------------------------------------------- quests (§4.4)

export type QuestStart =
  | { kind: 'contact'; person: PersonRef; freq: number; minRep?: string; maxRep?: string; importance?: string; tags?: string; offerText?: string; optionText?: string }
  | { kind: 'bar'; freq: number; prob: number; tags?: string; blurb?: string; optionText?: string; person?: PersonRef }
  /** Adds an option to an existing menu (PopulateOptions, FireAll: never takes the menu over). */
  | { kind: 'option'; trigger: string; conditions: string[]; optionText: string; order?: number }
  /** A dialog that opens on a trigger (OpenCommLink, OpenInteractionDialog, or a custom one). */
  | { kind: 'trigger'; trigger: string; conditions: string[] }
  | { kind: 'manual' }

export type Prereq =
  | { quest: QuestRef; ended: 'success' | 'fail' | 'any' }
  | { flag: string; is?: string }

export interface StageDef {
  /** Step id stored in $global.<quest>_step. Never change after release; use renamedFrom. */
  id: string
  title: string
  /** Journal text (intel description) for this step. */
  journal: string
  /** "Next step" line in the intel. */
  nextStep?: string
  marker?: EntityRef
  kind: 'normal' | 'success' | 'fail'
  renamedFrom: string[]
  color?: string
}

export interface QuestVar {
  name: string
  type: 'number' | 'string' | 'bool' | 'entity' | 'person' | 'target'
  scope: 'quest' | 'global'
  initial: string
  /** type 'target': random target criteria. STUB in 1.0 (PLAN.md §4.4): never exported. */
  target?: { kind: 'market' | 'system' | 'entity' | 'person'; criteria: unknown[] }
}

export interface Reward {
  id: string
  credits?: number
  rep?: { faction: FactionRef; amount: number }[]
  personRep?: { person: PersonRef; amount: number }[]
  items?: { item: ItemRef; qty: number }[]
  ships?: string[]
  xp?: number
  storyPoints?: number
}

export type NodeType = 'start' | 'dialog' | 'branch' | 'action' | 'stage' | 'encounter' | 'wait' | 'end' | 'link' | 'note'

interface NodeBase { id: string; type: NodeType; x: number; y: number; notes?: string }

export interface StartNode extends NodeBase { type: 'start' }
export interface DialogNode extends NodeBase {
  type: 'dialog'
  title?: string
  speaker?: PersonRef
  visual: Visual
  displays: Display[]
  text: string
  highlights: string[]
  options: OptionDef[]
  /** Extra condition / script lines, as rules.csv text. */
  conditions: string[]
  script: string[]
  /** Phrases inline in this node (tokens "$<quest>_<node>_v1"...). */
  phrases: Phrase[]
}
export interface BranchCase { id: string; label: string; conditions: string[] }
export interface BranchNode extends NodeBase { type: 'branch'; title?: string; cases: BranchCase[] }
export type ActionOp =
  | { op: 'credits'; amount: number }
  | { op: 'rep'; faction?: FactionRef; person?: PersonRef; amount: number }
  | { op: 'item'; item: ItemRef; qty: number }
  | { op: 'set'; key: string; value: string; days?: number }
  | { op: 'unset'; key: string }
  | { op: 'reward'; reward: string }
  | { op: 'spawn'; encounter: string }
  | { op: 'despawn'; encounter: string }
  | { op: 'startQuest'; quest: QuestRef }
  | { op: 'storyPoints'; amount: number }
  | { op: 'xp'; amount: number }
  | { op: 'line'; line: string }
export interface ActionNode extends NodeBase { type: 'action'; title?: string; ops: ActionOp[] }
export interface StageNode extends NodeBase { type: 'stage'; stage: string }
export interface EncounterNode extends NodeBase { type: 'encounter'; encounter: string }
export interface WaitNode extends NodeBase {
  type: 'wait'
  mode: 'arrive' | 'days'
  entity?: EntityRef
  days?: number
  /** Text shown when the player arrives (an OpenInteractionDialog rule at the place). */
  arriveText?: string
}
export interface EndNode extends NodeBase { type: 'end'; outcome: 'success' | 'fail' | 'abandon'; reward?: string }
export interface LinkNode extends NodeBase {
  type: 'link'
  /** 'option' = continue into an existing option id; 'trigger' = FireBest/FireAll a trigger (e.g. PopulateOptions). */
  mode: 'option' | 'trigger' | 'node'
  target: string
  fire?: 'FireBest' | 'FireAll'
}
export interface NoteNode extends NodeBase { type: 'note'; text: string; w?: number; h?: number }

export type QNode = StartNode | DialogNode | BranchNode | ActionNode | StageNode | EncounterNode | WaitNode | EndNode | LinkNode | NoteNode

export interface QEdge {
  id: string
  from: string
  /** Option id (dialog), case id (branch: 'else' for otherwise), 'defeated' / 'avoided' (encounter), or 'next'. */
  handle: string
  to: string
}

export interface QuestPlan {
  format: number
  id: string
  title: string
  /** 'quest' = runs through SagaLib (journal, stages); 'dialog' = a conversation only (no SagaLib unless it uses SF_ commands). */
  kind: 'quest' | 'dialog'
  icon: string
  start: QuestStart
  requires: Prereq[]
  stages: StageDef[]
  variables: QuestVar[]
  rewards: Reward[]
  repeatable: boolean
  timeLimitDays?: number
  /** Credits paid by vanilla's mission UI on completion (shown in the offer), optional. */
  nodes: QNode[]
  edges: QEdge[]
  notes?: string
}

// ---------------------------------------------------------------- locations (§4.5)

export interface OrbitDef { focus: string; radius: number; angle: number; days: number }

export interface MarketDef {
  id: string
  name: string
  faction: FactionRef
  size: number
  conditions: string[]
  industries: string[]
  submarkets: string[]
  freePort: boolean
  people: PersonRef[]
}

export interface SystemEntity {
  id: string
  /** planet | station | jumpPoint | asteroidBelt | ring | nebula | commRelay | navBuoy | sensorArray | derelict | custom */
  kind: string
  /** planets.json type, custom_entities.json type, ... */
  type: string
  name: string
  orbit: OrbitDef
  radius?: number
  market?: MarketDef
  /** For belts/rings: width, count. */
  width?: number
  count?: number
  description?: string
  interaction?: string
  tags?: string[]
}

export interface StarSystemDef {
  format: number
  id: string
  name: string
  kind: 'new' | 'existing'
  hyperspace?: [number, number]
  star?: { type: string; radius: number; corona: number }
  entities: SystemEntity[]
  addToExistingSaves: boolean
  tags?: string[]
  music?: string
  notes?: string
}

// ---------------------------------------------------------------- encounters (§4.6)

export interface EncounterDef {
  format: number
  id: string
  name: string
  fleet: {
    faction: FactionRef
    type: string
    size: 'fp' | 'explicit'
    points?: number
    variants?: string[]
    quality?: number
    flagshipCommander?: PersonRef
    name?: string
  }
  spawn: { at: EntityRef; when: 'quest-stage' | 'new-game' | 'periodic'; quest?: QuestRef; stage?: string; despawnOnStageEnd?: boolean; days?: number }
  behavior: 'patrol' | 'guard' | 'intercept-player' | 'travel' | 'ambush'
  travelTo?: EntityRef
  flags: { hostile?: boolean; noRepImpact?: boolean; important?: boolean; allowDisengage?: boolean }
  /** Comm-link dialog: a dialog-kind QuestPlan id ("<encounter>_comm"). */
  commDialog?: string
  outcomes: { defeated?: string; avoided?: string }
  notes?: string
}

// ---------------------------------------------------------------- faction runtime data (§4.1)

export interface FactionsRuntime {
  /** New factions' starting relations: faction id → other faction id → value (-1..1). */
  relations: Record<string, Record<string, number>>
  scripted: Record<string, ScriptedFactionChange[]>
}

// ---------------------------------------------------------------- test profiles (§4.10)

export interface TestProfile {
  id: string
  name: string
  quests: Record<QuestRef, { state: 'not-started' | 'active' | 'success' | 'fail'; step?: string }>
  flags: Record<string, string>
  player: {
    credits?: number
    storyPoints?: number
    commission?: FactionRef
    rep?: Record<FactionRef, number>
    cargo?: { item: string; qty: number }[]
    startAt?: EntityRef
    gender?: 'MALE' | 'FEMALE'
    name?: string
  }
}

// ---------------------------------------------------------------- release snapshots (§6)

export interface ReleaseSnapshot {
  format: number
  version: string
  date: string
  quests: Record<string, { stages: string[]; variables: string[]; renamed: Record<string, string[]> }>
  flags: string[]
  people: string[]
  markets: string[]
  systems: Record<string, { addToExistingSaves: boolean; entities: string[] }>
  factions: string[]
  items: string[]
  encounters: string[]
}

// ---------------------------------------------------------------- the faction files of the mod

export interface FactionFile {
  kind: 'addition' | 'override'
  /** Faction id (addition) or the target faction id (override). */
  id: string
  /** Path inside the mod, e.g. data/world/factions/vgc_vanguard.faction */
  file: string
  text: string
  hash: string
  raw: Record<string, unknown>
  /** Addition: listed in the mod's factions.csv. */
  listed: boolean
}

export type { FactionPatch, ScriptedFactionChange }
