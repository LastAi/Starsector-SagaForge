/**
 * Saga Forge's plan model (PLAN.md §4). Plan files live in <mod>/sagaforge/ and are the truth for
 * quests, people, items, locations, encounters, phrases and test profiles. Factions are read from
 * the mod's own .faction files (declarative files are the truth for them, §3).
 *
 * Every plan file has a "format" number. Readers must accept every format ever written.
 */
import type { FactionPatch, ScriptedFactionChange } from './faction'
import type { ItemVersion } from './itemversions'

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
  options: {
    addToExistingSavesDefault?: boolean
    /**
     * R31: dialog exported as tokens SagaLib fills, so anyone can translate the mod with a
     * translation mod (default on when the mod uses SagaLib; false = plain text in rules.csv).
     */
    translatable?: boolean
  }
  /** The mod's own illustrations: key → image path in the mod (added to its settings.json on export). */
  illustrations?: Record<string, string>
  /**
   * The game version this mod targets (#47 D3), e.g. "0.98.5a-RC5": with a migration install set,
   * the editor loads that install for this mod. Missing: mod_info.json's gameVersion decides.
   */
  target?: string
  /** Migration report items marked Reviewed (#47 §7.3): item key → note. */
  reviewed?: Record<string, string>
  /** The Saga Forge version that last saved the mod (a newer one than this: Problems says to update). */
  savedWith?: string
  /** R29: the mod's own words the spellchecker accepts (names like "Ailuros"). */
  words?: string[]
  /** R32: release details (Version Checker, forum post draft); Export dialog › Release details. */
  release?: ReleaseDetails
  /**
   * #60 (PLAN.md §10.1): the other mods this mod has content for (Saga › Mods). A mod that isn't
   * listed is not used. Required: in mod_info.json dependencies; optional: everything using it is
   * conditional; incompatible: a warning in game and in the release notes.
   */
  mods?: ModUse[]
  /** #60: the sortString the export writes into mod_info.json (the load-order check's fix); empty = unchanged. */
  sortString?: string
  /**
   * #62 (PLAN.md §10.4): the mod's settings (Saga › Settings), exported as data/config/LunaSettings.csv.
   * LunaLib shows them as a page in its menu; SagaLib sets each value field as $global.<id> on every
   * load (the defaults without LunaLib). Values are shared by every save.
   */
  settings?: SettingDef[]
  /** #62: the mod's icon in LunaLib's menu (an image in the mod); exported as LunaSettingsConfig.json. */
  settingsIcon?: string
  /**
   * #65: the mod's MagicLib achievements (Saga › Achievements), exported as rows of
   * data/config/magic_achievements.csv; quests unlock them (SF_Achievement, SagaLib's MagicLib bridge).
   */
  achievements?: AchievementDef[]
  /**
   * #65: the mod's quest chains on Nexerelin's new-game "skip quests" screen (Saga › Quest skip),
   * exported into data/config/exerelin/questSkip.json (merged JSON). SagaLib's bridge plugin makes
   * Nexerelin set each skipped quest's ending flags and gives its rewards.
   */
  questSkip?: QuestSkipChain[]
}

/** #65: MagicLib's spoiler levels and rarities (MagicAchievementSpoilerLevel, MagicAchievementRarity). */
export const ACHIEVEMENT_SPOILERS = ['VISIBLE', 'SPOILER', 'HIDDEN'] as const
export const ACHIEVEMENT_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const

/** #65: one MagicLib achievement (a magic_achievements.csv row; script = MagicLib's generic MagicAchievement). */
export interface AchievementDef {
  /** Prefixed; unique across every mod (MagicLib skips a second one with the same id). */
  id: string
  name: string
  /** Past tense ("Found the lost convoy."), one or two sentences. */
  description: string
  /** Optional longer text on hover in MagicLib's list. */
  tooltip?: string
  /** Shown once unlocked; empty = MagicLib's image for the rarity. */
  image?: string
  spoiler: (typeof ACHIEVEMENT_SPOILERS)[number]
  rarity: (typeof ACHIEVEMENT_RARITIES)[number]
  notes?: string
}

/** #65: a quest chain on Nexerelin's new-game "skip quests" screen (questSkip.json "questChains"). */
export interface QuestSkipChain {
  /** Prefixed; the chain's key in questSkip.json (shared by every mod). */
  id: string
  name: string
  /** Required by Nexerelin (a chain without one stops the list from loading). */
  image: string
  /** Nexerelin sorts the chains by it (default: the name). */
  sortKey?: string
  tooltip?: string
  /** In the order shown; usually the order they are played in. */
  quests: QuestSkipPlan[]
}

/** #65: one quest of a chain: which ending a skip means, and what else it sets or gives. */
export interface QuestSkipPlan {
  quest: QuestRef
  /** The name on the screen (default: the quest's title). Nexerelin's buttons are narrow: short names. */
  name?: string
  tooltip?: string
  /** The ending a skip means: an End node or a success/fail Stage node of the quest. */
  ending: string
  /** Give the ending's rewards at the start (default true). */
  rewards?: boolean
  /** Computed keys left out (as written in the quest, "$global.x"). */
  omit?: string[]
  /** More keys to set ("$global.x" or "$player.x" → value as in a rule: true, 3, text). */
  extra?: { key: string; value: string }[]
  /** People to show in their market's comm directory (ones the story hid). */
  unhide?: PersonRef[]
}

/** #62: LunaLib's field types the editor makes (FORMATS.md "LunaLib 2.0.5"); Header and Text are layout only. */
export const SETTING_TYPES = ['Boolean', 'Int', 'Double', 'Radio', 'String', 'Header', 'Text'] as const
export type SettingType = (typeof SETTING_TYPES)[number]

/** #62: one row of the mod's LunaLib settings page. */
export interface SettingDef {
  /** fieldID (prefixed); the memory key is $global.<id>. Header/Text need one too (LunaLib skips rows without). */
  id: string
  /** fieldName: the label (Header: the heading; Text: the text). */
  label: string
  /** fieldDescription: the tooltip. */
  tooltip?: string
  type: SettingType
  /** defaultValue as LunaLib reads it: "true"/"false", a number, a choice, a text. */
  default: string
  /** Int/Double: the slider's range (LunaLib's default 0–100). */
  min?: number
  max?: number
  /** Radio: the choices (secondaryValue, comma separated: a choice can't contain a comma). */
  choices?: string[]
  /** Tab on the page (empty = the main tab). */
  tab?: string
  notes?: string
}

/**
 * #62: a number scaled by a setting (encounter fleet size, credit rewards). Int: percent (100 = as
 * made); Double: times (1 = as made); Boolean and Radio: `factors` per value (missing = 1).
 */
export interface SettingScale { setting: string; factors?: Record<string, number> }

/** #60: one entry of the mod's list of other mods. */
export interface ModUse {
  id: string
  name: string
  use: 'required' | 'optional' | 'incompatible'
  /** The lowest version of that mod this one needs (required: written into the dependency). */
  minVersion?: string
  /** Why it is incompatible (shown in game and in the release notes). */
  reason?: string
}

/**
 * #60 (PLAN.md §10.2): "Only with" these mods / "Only without" these mods. Everything listed must
 * hold; `anyOf` turns the "with" list into "any one of them" (SF_HasAnyMod).
 */
export interface ModsCondition {
  with?: string[]
  without?: string[]
  anyOf?: boolean
}

/** R32: what a release needs besides the files (all optional). */
export interface ReleaseDetails {
  /** Version Checker: the raw address of the .version file online (the master copy). */
  masterVersionUrl?: string
  /** Direct download of the latest release zip (Version Checker and the forum post). */
  downloadUrl?: string
  /** The forum thread number (topic=12345) or its address. */
  threadId?: string
  /** Project page with the source (GitHub). */
  projectUrl?: string
  /** Forum post: one sentence on what the mod is. */
  catchLine?: string
  /** Forum post: the author's own words. */
  authorNote?: string
  /** Forum post: the AI use disclaimer (forum requirement). */
  aiUse?: string
  /** Forum post: the license. */
  license?: string
  /** Forum post title: Alpha, Beta or empty (final). */
  status?: '' | 'Alpha' | 'Beta'
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

export interface PhraseCase {
  when: string[]
  text: string
  /** #60: only with / only without these mods (PLAN.md §10.2). */
  mods?: ModsCondition
}

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

/** #70: the game's relation levels, worst first (RepLevel), and "not hostile" (Inhospitable or better). */
export const REP_LEVELS = ['VENGEFUL', 'HOSTILE', 'INHOSPITABLE', 'SUSPICIOUS', 'NEUTRAL', 'FAVORABLE', 'WELCOMING', 'FRIENDLY', 'COOPERATIVE'] as const
export type RepLevelId = (typeof REP_LEVELS)[number]
export interface Presence { faction?: FactionRef; atLeast: RepLevelId | 'notHostile'; elsewhere?: MarketRef }

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
  /**
   * #70 (SagaLib 1.3): only present at their market while its owner is at least `atLeast` with
   * `faction` (unset = their own). Away: hidden from the comm directory, their quests aren't
   * offered, $global.sagaforge_away_<id> is true; listed at `elsewhere` (a market) if set.
   */
  presence?: Presence
  tags: string[]
  phrases: Phrase[]
  description?: string
  notes?: string
  /** Fields marked "Set later" (R9; DESIGN-PHASE1.md §1): field path → note and the value when marked. */
  todo?: TodoMap
  /** Planned but not ready: not exported, its problems are warnings (R10; DESIGN-PHASE1.md §2). */
  inactive?: boolean
  /** #60: only with / only without these mods (PLAN.md §10.2). */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
}

/** Fields marked "Set later" (R9): a dotted field path (`name#id` picks an array element by id) → the note and the value the field had when marked. */
export type TodoMap = Record<string, { note?: string; was?: string }>

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
  /** Fields marked "Set later" (R9). */
  todo?: TodoMap
  /** #64: name, description, icon and base price per combination of optional mods (set at startup from the installed mods). */
  versions?: ItemVersion[]
}

// ---------------------------------------------------------------- name lists (R3; DESIGN-PHASE2.md §1)

/** A person name category (rows of the mod's data/characters/person_names.csv). */
export interface NamePool {
  /** The category id factions weight in their "names" map. */
  id: string
  /** First names for men, for women, and for anyone. */
  male: string[]
  female: string[]
  first: string[]
  last: string[]
  note?: string
}
/** A ship name list (a key of the mod's data/strings/ship_names.json). */
export interface ShipNameList { id: string; names: string[]; note?: string }
export interface NameLists { people: NamePool[]; ships: ShipNameList[] }
export const emptyNameLists = (): NameLists => ({ people: [], ships: [] })

/** descriptions.csv rows for the mod's own objects: key "<TYPE>:<id>" (FACTION, PLANET, CUSTOM, RESOURCE, ...). */
export type Descriptions = Record<string, { text1: string; text2?: string; text3?: string; notes?: string; /** #64: texts per combination of optional mods (set at startup from the installed mods). */ versions?: ItemVersion[] }>

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
  /** #60: only offered with / without these mods (SF_HasMod; exported as its own small rule). */
  mods?: ModsCondition
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
  /**
   * person_missions.csv. `person` empty + tagsAll/tagsAny = a tag-pool start: any contact whose
   * tags (contact types and faction id) match offers it. `tags` = the mission's own tags
   * (`priority`, `non_repeatable`). Timeouts in days; defaults 30–60 (RC-R5).
   */
  | { kind: 'contact'; person: PersonRef; freq: number; minRep?: string; maxRep?: string; importance?: string; tags?: string; offerText?: string; optionText?: string;
      tagsAll?: string; tagsAny?: string; tagsNotAny?: string; timeout?: [number, number] }
  /** bar_events.csv. Days; defaults: duration 30–40, timeout 15–20, accepted timeout 60–90 (RC-R5). */
  | { kind: 'bar'; freq: number; prob: number; tags?: string; blurb?: string; optionText?: string; person?: PersonRef;
      duration?: [number, number]; timeout?: [number, number]; acceptedTimeout?: [number, number] }
  /** Adds an option to an existing menu (PopulateOptions, FireAll: never takes the menu over). */
  | { kind: 'option'; trigger: string; conditions: string[]; optionText: string; order?: number }
  /** A dialog that opens on a trigger (OpenCommLink, OpenInteractionDialog, or a custom one). */
  | { kind: 'trigger'; trigger: string; conditions: string[] }
  /**
   * RC-F2: an interjection: cuts in when the player picks an existing option (e.g. vanilla's
   * salExplore at a derelict), with extra conditions, a chance (0–1) and a once-limit. Every path
   * must hand back (a Link to that option, or back to the menu).
   */
  | { kind: 'interject'; option: string; conditions: string[]; probability?: number; once?: 'none' | 'entity' | 'playthrough' }
  /**
   * Phase 7b (RC-R6): a bar scene without a mission: an option in a colony's bar (vanilla
   * AddBarEvents + AddBarEvent, as its own story scenes do), with conditions, a chance per month (vanilla's RollProbability) and
   * a once-limit (per colony or per playthrough, counted when picked). End it with a Link › Back to
   * the bar.
   */
  | { kind: 'barScene'; conditions: string[]; optionText: string; blurb: string; probability?: number; once?: 'none' | 'market' | 'playthrough' }
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
  /** type 'target' (Phase 7c, SagaLib 1.2): what SagaLib picks when the quest is offered (shared/targets.ts). */
  target?: TargetDef
}

/** Phase 7c (RC-R1): one of vanilla's HubMissionWithSearch criteria (shared/targets.ts CRITERIA) and its arguments. */
export interface Criterion { id: string; args: (string | number | string[])[] }
export interface TargetDef {
  pick: 'system' | 'planet' | 'entity' | 'market'
  /** All must hold. */
  require: Criterion[]
  /** In order; each is dropped when it would leave nothing. */
  prefer: Criterion[]
  /** vanilla searchMakeSystemPreferencesMoreImportant. */
  systemFirst?: boolean
  /** Play mode stands in for the search with this (the sector exists only in a running game); details: Phase 7d facts. */
  mock?: { name?: string; system?: string; dist?: number; faction?: string; factionId?: string; details?: Record<string, string | boolean>; personName?: string }
  /** Phase 7d (RC-R4): a person at the picked colony: someone with one of the posts, else a new person of the faction (the colony's if empty). */
  person?: { posts: string[]; rank?: string; faction?: string }
}

export interface Reward {
  id: string
  credits?: number
  /** #62 (SagaLib 1.3): the credits scaled by one of the mod's settings when the reward is given. */
  creditsScale?: SettingScale
  rep?: { faction: FactionRef; amount: number }[]
  personRep?: { person: PersonRef; amount: number }[]
  items?: { item: ItemRef; qty: number }[]
  ships?: string[]
  xp?: number
  storyPoints?: number
  /** Phase 8a (F7-b, SagaLib 1.2): random items rolled from drop groups, as salvage does. */
  loot?: LootRef[]
}

export type NodeType = 'start' | 'dialog' | 'branch' | 'action' | 'stage' | 'encounter' | 'wait' | 'raid' | 'end' | 'link' | 'note'

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
/**
 * A Random branch's case (Phase 7a): its weight and limit; conditions as in a condition branch
 * (here they make the case eligible, they don't decide).
 */
export interface BranchCase { id: string; label: string; conditions: string[]; weight?: number; limit?: PoolLimit; /** #60: only with / only without these mods. */ mods?: ModsCondition }
export interface BranchNode extends NodeBase {
  type: 'branch'; title?: string; cases: BranchCase[]
  /**
   * Phase 7a: "Random": SagaLib picks one case by weight (SF_RollPool); "otherwise" is the nothing
   * share. `pool`: roll a named pool (Saga › Pools) instead, its entries being the cases. `scope`:
   * roll for the dialog's object (default: same result after a reload, once-per-object limits) or
   * for the world.
   */
  random?: { nothing?: number; pool?: string; scope?: 'object' | 'global' }
}

/** Phase 7a (RANDOM-CONTENT-ASSESSMENT.md §6): limits of a pool entry. */
export interface PoolLimit { once?: 'playthrough' | 'object'; cooldownDays?: number; max?: number }
export interface PoolEntryPlan { id: string; label?: string; weight: number; conditions: string[]; limit?: PoolLimit; /** #60: only with / only without these mods. */ mods?: ModsCondition }
/** A named random pool (sagaforge/pools.json), used by Random branches; loot and encounters later. */
export interface PoolPlan {
  id: string; name: string; draw: 'pickOne' | 'rollEach'; nothing?: number; entries: PoolEntryPlan[]; notes?: string
  /**
   * Phase 7e: what the pool is for. branch (default): Random branches roll it (SagaLib). loot: a
   * drop group of the mod's own (drop_groups.csv; entry ids are a commodity, item_<special>,
   * wpn_<weapon> or ftr_<wing>; no SagaLib). encounters: random encounters at vanilla's encounter
   * points (entries = encounter ids; SagaLib 1.2).
   */
  use?: 'branch' | 'loot' | 'encounters'
  /** use encounters: vanilla's encounter point types (slipstream, outside_system). */
  points?: string[]
  /** use encounters: how often against vanilla's own encounter creators (they use about 10). */
  frequency?: number
  /**
   * Phase 8a (F7-a): use loot: add the entries to this existing drop group (vanilla's or another
   * mod's) instead of making a group of the mod's own. Checked in game: a mod's rows are added to
   * the group, its other rows stay.
   */
  addsTo?: string
  /** #60: only with / only without these mods (SagaLib 1.3; not for loot pools, which the game loads). */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
}

/** Phase 7e (RC-F7): a drop group an entity's salvage rolls: chances (random drops) or a value (credits' worth). */
export interface LootRef { group: string; chances?: number; value?: number }
/** Phase 7e (RC-F7): defenders of a salvage entity (vanilla DefenderDataOverride). */
export interface DefendersDef { faction: string; prob?: number; minStr: number; maxStr: number; maxSize?: number }

/** Phase 7e (RC-R10): copies of one custom entity placed at new game in places picked like a random target. */
export interface ScatterPlan {
  id: string
  name: string
  count: number
  addToExistingSaves?: boolean
  target: TargetDef
  entity: { type: string; name: string; faction?: string }
  loot?: LootRef[]
  defenders?: DefendersDef
  /** Where "within N light-years" measures from: an entity or market id; empty = the player (user, 2026-11-16). */
  from?: string
  notes?: string
  /** #60: only with / only without these mods. */
  mods?: ModsCondition
}
export type ActionOp =
  | { op: 'credits'; amount: number }
  | { op: 'rep'; faction?: FactionRef; person?: PersonRef; amount: number }
  | { op: 'item'; item: ItemRef; qty: number }
  | { op: 'set'; key: string; value: string; days?: number }
  | { op: 'unset'; key: string }
  | { op: 'reward'; reward: string }
  | { op: 'spawn'; encounter: string }
  | { op: 'despawn'; encounter: string }
  /** SagaLib 1.1 (R25, R26): place an object that appears later; remove an object. */
  | { op: 'placeEntity'; entity: string }
  | { op: 'removeEntity'; entity: string; decivilize?: boolean }
  /** SagaLib 1.1 (R27): a person written out of the story (dead, gone): never back, never a captain again. */
  | { op: 'removePerson'; person: string }
  /** Phase 7d (RC-R2): vanilla's mission spawning near a random target (removed when the quest ends); kind entity = a custom entity type, derelict = a faction's derelict ship. */
  | { op: 'spawnAtTarget'; target: string; kind: 'entity' | 'derelict'; type: string; where?: string }
  | { op: 'startQuest'; quest: QuestRef }
  | { op: 'storyPoints'; amount: number }
  | { op: 'xp'; amount: number }
  | { op: 'line'; line: string }
  /** Phase 8d-3 (SagaLib 1.2): one-time points for a progress event (SF_Progress), listed with the text. */
  | { op: 'progress'; event: string; points: number; text?: string }
  /**
   * #59 (SagaLib 1.3): the player takes a MagicLib bounty (SF_StartBounty), as if accepted on the
   * board: MagicLib spawns its fleet and pays when it ends. Without MagicLib it does nothing (test
   * "MagicLib bounty is unavailable" first). The bounty: the mod's own, a hand-written one or another mod's id.
   */
  | { op: 'startBounty'; bounty: string }
  /**
   * #65 (SagaLib 1.3): unlock a MagicLib achievement (Saga › Achievements, or another mod's id;
   * SF_Achievement). Kept in the game's common data, so it stays unlocked in every save. Without
   * MagicLib it does nothing.
   */
  | { op: 'achievement'; achievement: string }
export interface ActionNode extends NodeBase { type: 'action'; title?: string; ops: ActionOp[] }
export interface StageNode extends NodeBase { type: 'stage'; stage: string }
export interface EncounterNode extends NodeBase { type: 'encounter'; encounter: string }
export interface WaitNode extends NodeBase {
  type: 'wait'
  /**
   * bounty (SagaLib 1.3): until a MagicLib bounty ends; outputs succeeded / failed / expired /
   * dismissed. SagaLib watches MagicLib's memory keys while the quest is at the step before the
   * node, and continues at once if the bounty ended earlier (docs/DESIGN-MAGICLIB-BOUNTIES.md §7).
   */
  mode: 'arrive' | 'days' | 'bounty'
  entity?: EntityRef
  days?: number
  /** mode bounty: the mod's own bounty, a hand-written one or another mod's id. */
  bounty?: string
  /** Text shown when the player arrives (an OpenInteractionDialog rule at the place). */
  arriveText?: string
  /**
   * RC-F2: how the arrival plays. Default: an option in the place's own menu (vanilla's menu stays,
   * e.g. salvage), with `optionText`. `takeover`: the scene replaces the arrival (a hail on arrival).
   */
  takeover?: boolean
  optionText?: string
}
/**
 * Phase 7b (RC-F4): a ground raid on the place in the dialog, the way vanilla's own story raids
 * work (AddRaidObjective + the `mktRaidNonMarket` option; no SagaLib). The text leads into the raid
 * menu, where the player commits marines. Outputs: `done` (the raid went through; vanilla shows its
 * result screens, then the quest continues) and `back` (the player backed out of the raid menu;
 * unconnected = the place's menu). Raids in vanilla can't fail, only cost marines.
 */
export type RaidDanger = 'NONE' | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
export interface RaidNode extends NodeBase {
  type: 'raid'
  title?: string
  /** The briefing shown before the raid menu (its option is "Continue"). */
  text: string
  /** The objective's name in the raid menu. */
  objective: string
  danger: RaidDanger
  /** $raidDifficulty: the defenders' strength; 0 = the colony's own ground defences. */
  difficulty: number
  /** Experience for the raid. */
  xp: number
  /** A raidObjectives icon id (settings.json); default genericIcon. */
  icon?: string
  tooltip?: string
  /** Shown while the raid happens, before vanilla's result screens. */
  raidText?: string
}
/** #65: `achievement`: a MagicLib achievement unlocked at this ending (SF_Achievement). */
export interface EndNode extends NodeBase { type: 'end'; outcome: 'success' | 'fail' | 'abandon'; reward?: string; achievement?: string }
export interface LinkNode extends NodeBase {
  type: 'link'
  /**
   * 'menu' = end the branch: back to the market's, person's or fleet's menu, or close the dialog
   * where there is none (SF_BackToMenu with SagaLib, else FireAll PopulateOptions);
   * 'option' = continue into an existing option id; 'trigger' = FireBest/FireAll a trigger;
   * 'node' = jump to another node of this quest; 'bar' (Phase 7b) = back to the bar after a bar
   * scene (BarCMD returnFromEvent). `target` is unused for 'menu' and 'bar'.
   */
  mode: 'menu' | 'option' | 'trigger' | 'node' | 'bar'
  target: string
  fire?: 'FireBest' | 'FireAll'
}
export interface NoteNode extends NodeBase { type: 'note'; text: string; w?: number; h?: number }

export type QNode = StartNode | DialogNode | BranchNode | ActionNode | StageNode | EncounterNode | WaitNode | RaidNode | EndNode | LinkNode | NoteNode

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
  /** Fields marked "Set later" (R9; DESIGN-PHASE1.md §1): field path → note and the value when marked. */
  todo?: TodoMap
  /** Planned but not ready: not exported, its problems are warnings (R10). Also covers conversations (kind dialog). */
  inactive?: boolean
  /**
   * #60: only with / only without these mods: never offered or started otherwise (SagaLib 1.3); the
   * start rule tests it (SF_HasMod). Spreads to the quests that need this one (PLAN.md §10.2).
   */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
  /** #64: named places: a place used in several spots (start, markers, Arrive) as "place:<id>", changed once (also in a version). */
  places?: NamedPlace[]
  /**
   * #61 (PLAN.md §10.3): "If a market of this quest changes owner" (the giver's market, stage
   * markers, Arrive places, named places and random targets that are markets; SagaLib checks them
   * daily). Unset = keep going without watching. Every choice sets $global.<quest>_ownerChanged
   * (the market id) and $global.<quest>_newOwner (the faction).
   */
  ownerChange?: { do: 'keep' | 'fail' | 'stage'; stage?: string }
}

/** #64: a quest's named place. */
export interface NamedPlace { id: string; name: string; entity: EntityRef }

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
  /** Phase 7e (RC-R11): never decivilises (vanilla $core_noDeciv, as pirate and Pather bases); SagaLib 1.2. */
  protectFromDeciv?: boolean
  /** #61 (PLAN.md §10.3): Nexerelin never invades it (SagaLib 1.3 sets $nex_uninvadable in its memory); nothing without Nexerelin. */
  protectFromInvasion?: boolean
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
  /** SagaLib 1.1 (R25): built only when this quest reaches this stage ({} = only by an Action's "Place an object"). */
  appears?: { quest?: string; stage?: string }
  /** SagaLib 1.1 (R26): with appears, takes this object's place and removes it. */
  replaces?: string
  /** SagaLib 1.1 (RC-F1): a planet without a market: its conditions and survey level. */
  conditions?: string[]
  surveyed?: 'none' | 'preliminary' | 'full'
  /** Phase 7e (RC-F7, SagaLib 1.2): salvage loot (drop groups) and defenders. */
  loot?: LootRef[]
  defenders?: DefendersDef
  /** SagaLib 1.2 (user, 2026-11-16): its ruins stay unexplored at new game, even in a system with a colony. */
  ruinsUnexplored?: boolean
  /** #60: only built with / without these mods (SagaLib 1.3). */
  mods?: ModsCondition
}

/** SagaLib 1.1 (R26): an object removed when a quest reaches a stage. */
export interface RemovalDef { target: string; quest: string; stage: string; market?: 'keep' | 'decivilize' }

export interface StarSystemDef {
  format: number
  id: string
  name: string
  kind: 'new' | 'existing'
  hyperspace?: [number, number]
  star?: { type: string; radius: number; corona: number }
  /** SagaLib 1.1 (R16): no star, an empty centre lit by `light` ([r, g, b]). */
  starless?: boolean
  light?: [number, number, number]
  entities: SystemEntity[]
  /** SagaLib 1.1 (R26): objects (any, also vanilla's) removed during quests. */
  removals?: RemovalDef[]
  addToExistingSaves: boolean
  tags?: string[]
  music?: string
  notes?: string
  /** Fields marked "Set later" (R9; DESIGN-PHASE1.md §1): field path → note and the value when marked. */
  todo?: TodoMap
  /** #60: only built with / without these mods (SagaLib 1.3); for an existing system: its additions. */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
}

/**
 * The mod's own celestial types (R21; DESIGN-PHASE3.md §6), exported into its custom_entities.json
 * and planets.json (merged by key).
 */
export interface CustomEntityTypeDef {
  id: string
  name: string
  /** Sprite image (160×160 like vanilla's stations; drawn at `size` in game). */
  sprite: string
  /** Drawn size in game (spriteWidth/Height), vanilla stations 80. */
  size: number
  /** Map icon (64×64), optional. */
  icon?: string
  /** The vanilla type it inherits its settings from (baseId): a station, a derelict, … */
  behavesLike: string
  /** Its radius in the game's units (defaultRadius); vanilla stations 50. */
  radius: number
  interactionImage?: string
  note?: string
}
export interface CustomPlanetTypeDef {
  id: string
  name: string
  /** Texture (1024×512 like vanilla's). */
  texture: string
  /** The vanilla planet or star type whose settings (tilt, atmosphere, colors, corona) are copied. */
  basedOn: string
  isStar: boolean
  note?: string
}
export interface ModTypes { entities: CustomEntityTypeDef[]; planets: CustomPlanetTypeDef[] }
export const emptyModTypes = (): ModTypes => ({ entities: [], planets: [] })

// ---------------------------------------------------------------- fleets (R23, R27, R22; DESIGN-PHASE5.md)

/** A named, reusable fleet: the same ships, names and captain every time it spawns (SagaLib 1.1). */
export interface FleetTemplateDef {
  id: string
  /** The fleet's name on the map ("Butters's Pride"); empty = the faction's name for its fleet type. */
  name: string
  faction: FactionRef
  fleetType: string
  ships: { variant: string; name?: string }[]
  /** Index into ships of the flagship (default: the first). */
  flagship?: number
  /** One of the mod's people commands the flagship. */
  captain?: PersonRef
  /** When the fleet is defeated, its captain is gone for good (dead); otherwise they survive. */
  captainDiesOnDefeat?: boolean
  quality?: number
  notes?: string
}
export interface FleetPlans {
  templates: FleetTemplateDef[]
  /** Fleet type → name for every faction (the mod's data/world/factions/default_fleet_type_names.json). */
  typeNames: Record<string, string>
}
export const emptyFleetPlans = (): FleetPlans => ({ templates: [], typeNames: {} })

// ---------------------------------------------------------------- encounters (§4.6)

export interface EncounterDef {
  format: number
  id: string
  name: string
  fleet: {
    faction: FactionRef
    type: string
    /** 'template' (R27): a named fleet from Fleets (its ships, names and captain; SagaLib 1.1). */
    size: 'fp' | 'explicit' | 'template'
    template?: string
    points?: number
    variants?: string[]
    quality?: number
    flagshipCommander?: PersonRef
    name?: string
    /** #62 (SagaLib 1.3): size 'fp' only: the points scaled by one of the mod's settings when it spawns. */
    sizeScale?: SettingScale
  }
  /** `player-near` (SagaLib 1.1, RC-F5): when the player's fleet comes within `range` of `at` (0 = in its system). */
  /**
   * `roaming` (Phase 8d, RC-R14; SagaLib 1.2): travels on vanilla's routes from `at` to `to`, a new one every
   * `days` on average, at most `max` on the way, staying `stayDays` (and back with `roundTrip`); a real fleet
   * only near the player.
   */
  spawn: { at: EntityRef; when: 'quest-stage' | 'new-game' | 'periodic' | 'player-near' | 'roaming'; quest?: QuestRef; stage?: string; despawnOnStageEnd?: boolean; days?: number; range?: number; to?: EntityRef; max?: number; stayDays?: number; roundTrip?: boolean }
  behavior: 'patrol' | 'guard' | 'intercept-player' | 'travel' | 'ambush'
  travelTo?: EntityRef
  flags: { hostile?: boolean; noRepImpact?: boolean; important?: boolean; allowDisengage?: boolean }
  /** Comm-link dialog: a dialog-kind QuestPlan id ("<encounter>_comm"). */
  commDialog?: string
  outcomes: { defeated?: string; avoided?: string }
  notes?: string
  /** Fields marked "Set later" (R9; DESIGN-PHASE1.md §1): field path → note and the value when marked. */
  todo?: TodoMap
  /** #60: only spawned with / without these mods (SagaLib 1.3). */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
}

// ---------------------------------------------------------------- MagicLib bounties (#27)

/** What MagicLib's bounty board shows (job_show_fleet / job_show_distance). */
export type BountyShowFleet = 'none' | 'text' | 'flagship' | 'flagshipText' | 'preset' | 'presetText' | 'vanilla' | 'all'
export type BountyShowDistance = 'none' | 'vague' | 'distance' | 'system' | 'vanilla' | 'vanillaDistance' | 'exact'

/**
 * #27 (docs/DESIGN-MAGICLIB-BOUNTIES.md): a MagicLib bounty made from one of the mod's encounters
 * (the target fleet) and optionally a simple quest (texts, offer, rewards, "where"). Computed from
 * them at every export; the fields here are MagicLib's own and overrides (empty = from the source).
 */
export interface BountyPlan {
  /** The key in magicBounty_data.json (prefixed); MagicLib's memory key is $<id>. */
  id: string
  /** The encounter whose fleet is the target; empty = the quest's Encounter node. */
  encounter?: string
  /** A simple quest the job comes from. */
  quest?: string
  /** The quest and the encounter are exported only as this bounty, not for SagaLib (default true). */
  only?: boolean
  /** "Where": a random target of the quest ("target:<var>") or an entity id; empty = the encounter's spawn place. */
  where?: string
  type?: 'assassination' | 'destruction' | 'obliteration' | 'neutralization'
  /** Texts; empty = from the quest or encounter. */
  name?: string
  description?: string
  success?: string
  failure?: string
  expired?: string
  reply?: string
  /** The faction that pays (reputation); empty = from the quest's reward or contact. */
  forFaction?: string
  credits?: number
  /** Reputation, 0–100 (MagicLib's scale). */
  rep?: number
  deadline?: number
  /** Where it is offered: markets (each also by its entity), else factions' markets. */
  offer?: { markets?: string[]; factions?: string[]; alliedWith?: boolean; minSize?: number; minLevel?: number; minDays?: number; minFleetPoints?: number; weight?: number }
  /**
   * #59: false = never on MagicLib's board: only a quest's "Start a MagicLib bounty" gives it
   * (exported as a trigger key nobody sets). Default true.
   */
  board?: boolean
  /** A fleet sized by points needs a flagship variant (MagicLib requires one). */
  flagship?: string
  /** Extra ships to match the player's fleet points × this (0 = none). */
  scaling?: number
  show?: { fleet?: BountyShowFleet; distance?: BountyShowDistance; arrow?: boolean; captain?: boolean; type?: boolean }
  /** MagicLib's job_difficultyDescription: "auto", "none" or a text. */
  difficulty?: string
  notes?: string
}

// ---------------------------------------------------------------- faction runtime data (§4.1)

export interface FactionsRuntime {
  /** New factions' starting relations: faction id → other faction id → value (-1..1). */
  relations: Record<string, Record<string, number>>
  scripted: Record<string, ScriptedFactionChange[]>
  /** #60: a starting relation only with / without these mods: faction → other faction → condition (SagaLib 1.3). */
  relationMods?: Record<string, Record<string, ModsCondition>>
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
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

// ---------------------------------------------------------------- world events (Phase 8d, RC-R12; DESIGN-PHASE8.md "8d")

/** A news item in the intel screen when a world event starts (texts translatable). */
export interface EventNews {
  title: string
  text: string
  /** Icon image path (e.g. graphics/icons/intel/…); empty = vanilla's log icon. */
  icon?: string
  /** Intel tab: "Major events" (default), "Colony threats", "Hostilities", "Military", "Exploration", or another tag. */
  tag?: string
  /** An entity or market id shown on the map. */
  at?: EntityRef
  /** Days the item stays in the intel screen. */
  days: number
}

/** One world event: picked by its scheduler like a pool entry; runs durationDays. */
export interface WorldEventPlan {
  id: string
  name: string
  weight: number
  conditions: string[]
  /** Only once per playthrough. */
  once?: boolean
  /** Days before it can be picked again after it started. */
  cooldownDays?: number
  /** At most this many times (0/empty = no limit). */
  max?: number
  /** Days it counts as running ($global.<id>_active); 0 = it starts and ends at once. */
  durationDays: number
  /** May start while it already runs (each run with its own news item and end). Default: one at a time, a new run's news replaces the old one. */
  stack?: boolean
  news?: EventNews
  /** Actions when it starts and when it ends (the quest Action vocabulary). */
  start: ActionOp[]
  end: ActionOp[]
  notes?: string
  /** #60: only picked with / without these mods (exported as SF_HasMod conditions). */
  mods?: ModsCondition
}

/** An event scheduler: keeps between min and max of its events running, checking every intervalDays. */
export interface EventSchedulerPlan {
  id: string
  name: string
  min: number
  max: number
  intervalDays: number
  /** Days before the first check after the mod is in the game (0 = one interval). */
  firstAfterDays?: number
  events: WorldEventPlan[]
  notes?: string
  /** #60: only runs with / without these mods (SagaLib 1.3). */
  mods?: ModsCondition
  /** #64: versions by installed mods (PLAN.md §10.6): per combination of optional mods, the fields that differ. */
  versions?: ItemVersion[]
}

// ---------------------------------------------------------------- progress events (Phase 8d-3, RC-R12 b)

/** A stage of a progress event: reached at a progress; runs actions (or one outcome's, picked at random). */
export interface ProgressStagePlan {
  id: string
  progress: number
  title: string
  text: string
  icon?: string
  actions: ActionOp[]
  outcomes?: { id: string; label: string; weight: number; actions: ActionOp[] }[]
}

/** Points each month while its conditions hold. */
export interface ProgressFactorPlan { id: string; desc: string; points: number; conditions: string[] }

/** The mod's own progress event (a bar in the intel screen, like vanilla's colony crises). */
export interface ProgressEventPlan {
  id: string
  name: string
  icon?: string
  /** Extra intel tab (it is always under "Major events"). */
  tag?: string
  max: number
  /** Progress is bad for the player (red bar). */
  negative?: boolean
  startConditions: string[]
  /** After the last stage: progress goes back to this (repeats); empty = the event ends. */
  restartAt?: number
  stages: ProgressStagePlan[]
  factors: ProgressFactorPlan[]
  notes?: string
  /** #60: only starts with / without these mods (SagaLib 1.3). */
  mods?: ModsCondition
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
