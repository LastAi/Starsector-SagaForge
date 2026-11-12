/**
 * Game definitions: everything Saga Forge knows about a game version that is not read from the
 * game's data files at runtime (rule commands, tokens, memory keys, ids that only exist as Java
 * constants). One JSON file per game version (src/shared/defs/<version>.json), so a new game
 * version is a data update (PLAN.md Q11). Users can add patch files in the app's data folder.
 */

/** Kinds of parameter a rule command takes, used to pick an input widget and to check values. */
export type ParamType =
  | 'string' | 'number' | 'int' | 'bool' | 'text'
  | 'faction' | 'person' | 'market' | 'entity' | 'system'
  | 'commodity' | 'specialItem' | 'weapon' | 'wing' | 'hull' | 'variant' | 'hullmod'
  | 'illustrationCategory' | 'illustration' | 'sound' | 'music'
  | 'option' | 'trigger' | 'memoryKey' | 'repLevel' | 'repAmount' | 'rank' | 'post'
  | 'color' | 'enum' | 'any'

export interface ParamDef {
  name: string
  type: ParamType
  optional?: boolean
  /** Repeats to the end of the line (e.g. a list of option ids). */
  rest?: boolean
  /** For type 'enum'. */
  values?: string[]
  summary?: string
}

/** Where a command's effect shows in the dialog (used by the preview and the displays form). */
export type DisplayArea = 'visual' | 'text' | 'options' | 'sound' | 'flow' | 'none'

export interface RuleCommandDef {
  /** As written in rules.csv, e.g. "AddCredits". */
  name: string
  /** Usable as a script line, a condition, or both (a command returning true/false). */
  use: 'script' | 'condition' | 'both'
  /** Java class (vanilla: com.fs.starfarer.api.impl.campaign.rulecmd.<Name>; SagaLib: lastai.sagalib.rulecmd.<Name>). */
  className: string
  /** Who provides it. 'sagalib' commands make the export add the SagaLib dependency. */
  provider: 'vanilla' | 'sagalib'
  /** Alternative parameter lists (many commands accept several forms). */
  forms: ParamDef[][]
  display: DisplayArea
  summary: string
}

export interface TriggerDef {
  name: string
  summary: string
}

export interface TokenDef {
  /** "$playerName" (case as vanilla writes it; matching is case-insensitive). */
  token: string
  summary: string
  /** Example value for the Test context. */
  sample: string
  /** What the token is about (player, person, faction, market, ...). */
  group: string
}

export interface MemoryKeyDef {
  /** "$global.foo", "$player.foo", "$entity.foo", "$faction.foo", "$person.foo", "$market.foo", or "$foo" (local). */
  key: string
  type: 'bool' | 'number' | 'string' | 'any'
  summary: string
}

export interface NamedId { id: string; name: string }

export interface GameDefinitions {
  gameVersion: string
  ruleCommands: RuleCommandDef[]
  triggers: TriggerDef[]
  tokens: TokenDef[]
  memoryKeys: MemoryKeyDef[]
  /** Condition operators the rules engine understands. */
  conditionOperators: string[]
  /** Reputation levels from RepLevel, worst to best, with their lower bound. */
  repLevels: { id: string; name: string; min: number }[]
  /** com.fs.starfarer.api.impl.campaign.ids.Ranks: rank ids and post ids. */
  ranks: NamedId[]
  posts: NamedId[]
  voices: string[]
  personalities: string[]
  /** FleetTypes constants. */
  fleetTypes: NamedId[]
  /** Contact tags (contact_tag_data.json keys): military, trade, ... */
  contactTypes: string[]
  importance: string[]
  /** Item tags vanilla uses in commodities.csv / special_items.csv. */
  itemTags: { tag: string; summary: string }[]
  /** Commodity / special item presets (PLAN.md §4.7). Values for columns not shown in the form. */
  itemPresets: { id: string; name: string; kind: 'commodity' | 'special'; columns: Record<string, string> }[]
  /** Faction file keys the Factions page knows, with a summary and value type. */
  factionKeys: { key: string; type: 'string' | 'color' | 'number' | 'bool' | 'list' | 'object' | 'any'; summary: string; group: string }[]
  /** People created in vanilla Java (ids.People): id, name, where. Read-only "defined in code". */
  codePeople: { id: string; name: string; faction: string; market?: string }[]
  /** Star types from planets.json that can be a system's star. */
  starTypes: string[]
  /** The dialog window size and layout in pixels at 1x UI scale (for the preview ruler). */
  dialog: { width: number; height: number; visualWidth: number; textWidth: number; maxOptions: number }
}
