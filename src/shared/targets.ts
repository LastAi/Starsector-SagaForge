/**
 * Phase 7c (RC-R1, RANDOM-CONTENT-ASSESSMENT.md §5): random targets. A quest variable of type
 * "target" names what to pick (a system, planet, entity or market) and the criteria, each one of
 * vanilla's HubMissionWithSearch methods (require… / prefer…), so SagaLib runs exactly vanilla's
 * search when the quest is offered: requires all hold, prefers are applied in order and each is
 * dropped if it would leave nothing. No match: the quest isn't offered.
 *
 * The catalog is shared with SagaLib (test/golden/target-criteria.json lists the same ids); its
 * method names were read from the 0.98.5a API source.
 */
import type { Criterion, QuestPlan, QuestVar, TargetDef } from './model'
export type { Criterion, TargetDef }

export type TargetPick = TargetDef['pick']
export type ReqMode = 'ALL' | 'ANY' | 'NOT_ALL' | 'NOT_ANY'
/** An argument's kind: a ReqMode, a list of ids, one id, a number, or "giver"/"player" (where from). */
export type ArgKind = 'mode' | 'list' | 'id' | 'number' | 'from'

export interface CriterionSpec {
  id: string
  /** Which picks it narrows: system criteria narrow the system of planets and entities too. */
  group: 'system' | 'planet' | 'entity' | 'market'
  label: string
  help: string
  args: { kind: ArgKind; label: string }[]
  /** The vanilla method names (null when vanilla has no such variant). */
  req: string | null
  pref: string | null
}

const c = (id: string, group: CriterionSpec['group'], label: string, help: string, req: string | null, pref: string | null, args: CriterionSpec['args'] = []): CriterionSpec => ({ id, group, label, help, args, req, pref })
const MODE = { kind: 'mode' as const, label: 'Match' }

export const CRITERIA: CriterionSpec[] = [
  // ---- system
  c('sysTags', 'system', 'System tags', 'Tags of the star system (theme_ruins, theme_derelict, theme_remnant_main, theme_misc, …).', 'requireSystemTags', 'preferSystemTags', [MODE, { kind: 'list', label: 'Tags' }]),
  c('sysInteresting', 'system', 'An interesting system', 'Vanilla: a system with something to find, not in the core worlds (require also leaves out unsafe ones).', 'requireSystemInterestingAndNotUnsafeOrCore', 'preferSystemInteresting'),
  c('sysUnexplored', 'system', 'Unexplored', 'The player has never been there.', 'requireSystemUnexplored', 'preferSystemUnexplored'),
  c('sysExplored', 'system', 'Explored', 'The player has been there.', 'requireSystemExplored', 'preferSystemExplored'),
  c('sysNotEnteredFor', 'system', 'Not visited for N days', 'The player hasn\'t been there for at least this many days.', 'requireSystemNotEnteredByPlayerFor', 'preferSystemNotEnteredByPlayerFor', [{ kind: 'number', label: 'Days' }]),
  c('sysInner', 'system', 'Inner sector', 'In the inner part of the sector.', 'requireSystemInInnerSector', 'preferSystemInInnerSector'),
  c('sysFringe', 'system', 'Fringe', 'On the fringe of the sector.', 'requireSystemOnFringeOfSector', 'preferSystemOnFringeOfSector'),
  c('sysWithin', 'system', 'Within N light-years', 'Close to the quest giver (or the player).', 'requireSystemWithinRangeOf', 'preferSystemWithinRangeOf', [{ kind: 'from', label: 'Of' }, { kind: 'number', label: 'Light-years' }]),
  c('sysOutside', 'system', 'Farther than N light-years', 'Far from the quest giver (or the player).', 'requireSystemOutsideRangeOf', 'preferSystemOutsideRangeOf', [{ kind: 'from', label: 'Of' }, { kind: 'number', label: 'Light-years' }]),
  c('sysBlackHole', 'system', 'Has a black hole', 'The system\'s star is a black hole.', 'requireSystemBlackHole', 'preferSystemBlackHole'),
  c('sysPulsar', 'system', 'Has a pulsar', 'The system has a pulsar.', 'requireSystemHasPulsar', 'preferSystemHasPulsar'),
  c('sysNebula', 'system', 'In a nebula', 'A nebula system.', 'requireSystemNebula', 'preferSystemNebula'),
  c('sysNotBlackHole', 'system', 'No black hole', '', 'requireSystemNotBlackHole', 'preferSystemNotBlackHole'),
  c('sysNotPulsar', 'system', 'No pulsar', '', 'requireSystemNotHasPulsar', 'preferSystemNotPulsar'),
  c('sysNotNebula', 'system', 'Not a nebula', '', 'requireSystemNotNebula', 'preferSystemNotNebula'),
  c('sysSafeStars', 'system', 'Safe stars', 'No dangerous stars (vanilla\'s list).', 'requireSystemHasSafeStars', null),
  c('sysNotUsedForStory', 'system', 'Not used by another story', 'Leaves out systems another mission claimed for its story.', 'requireSystemNotAlreadyUsedForStory', null),
  c('sysHasColony', 'system', 'Has a colony of a faction', 'A colony of this faction, at least this size, in the system.', 'requireSystemHasColony', 'preferSystemHasColony', [{ kind: 'id', label: 'Faction' }, { kind: 'number', label: 'Min. size' }]),
  c('sysHasBase', 'system', 'Has a base of a faction', 'A base (e.g. a pirate base) of this faction in the system.', 'requireSystemHasBase', 'preferSystemHasBase', [{ kind: 'id', label: 'Faction' }]),
  c('sysJumpPoints', 'system', 'At least N jump points', '', 'requireSystemHasAtLeastNumJumpPoints', 'preferSystemHasAtLeastNumJumpPoints', [{ kind: 'number', label: 'Jump points' }]),
  c('sysPlanets', 'system', 'At least N planets', '', 'requireSystemHasNumPlanets', 'preferSystemHasNumPlanets', [{ kind: 'number', label: 'Planets' }]),
  // ---- planet
  c('plGasGiant', 'planet', 'Gas giant', '', 'requirePlanetIsGasGiant', 'preferPlanetIsGasGiant'),
  c('plNotGasGiant', 'planet', 'Not a gas giant', '', 'requirePlanetNotGasGiant', 'preferPlanetNonGasGiant'),
  c('plPopulated', 'planet', 'Colonised', 'Has a colony.', 'requirePlanetPopulated', 'preferPlanetPopulated'),
  c('plUnpopulated', 'planet', 'Uncolonised', 'No colony.', 'requirePlanetUnpopulated', 'preferPlanetUnpopulated'),
  c('plTags', 'planet', 'Planet tags', 'The planet\'s tags.', 'requirePlanetTags', 'preferPlanetTags', [MODE, { kind: 'list', label: 'Tags' }]),
  c('plConditions', 'planet', 'Planet conditions', 'Conditions such as decivilized, ruins_vast, habitable.', 'requirePlanetConditions', 'preferPlanetConditions', [MODE, { kind: 'list', label: 'Conditions' }]),
  c('plUnsurveyed', 'planet', 'Unsurveyed', 'No survey data at all.', 'requirePlanetUnsurveyed', 'preferPlanetUnsurveyed'),
  c('plNotFullySurveyed', 'planet', 'Not fully surveyed', '', 'requirePlanetNotFullySurveyed', 'preferPlanetNotFullySurveyed'),
  c('plFullySurveyed', 'planet', 'Fully surveyed', '', 'requirePlanetFullySurveyed', 'preferPlanetFullySurveyed'),
  c('plRuins', 'planet', 'Has ruins', 'Any size of ruins.', 'requirePlanetWithRuins', 'preferPlanetWithRuins'),
  c('plNoRuins', 'planet', 'No ruins', '', 'requirePlanetWithoutRuins', 'preferPlanetWithoutRuins'),
  c('plUnexploredRuins', 'planet', 'Ruins not yet explored', '', 'requirePlanetUnexploredRuins', 'preferPlanetUnexploredRuins'),
  c('plNotNearJump', 'planet', 'Away from jump points', 'At least this far (in map units) from a jump point.', 'requirePlanetNotNearJumpPoint', 'preferPlanetNotNearJumpPoint', [{ kind: 'number', label: 'Distance' }]),
  // ---- entity
  c('enType', 'entity', 'Entity type', 'custom_entities.json types: derelict_probe, station_research, wreck, …', 'requireEntityType', 'preferEntityType', [{ kind: 'list', label: 'Types' }]),
  c('enTags', 'entity', 'Entity tags', '', 'requireEntityTags', 'preferEntityTags', [MODE, { kind: 'list', label: 'Tags' }]),
  c('enFlags', 'entity', 'Memory flags', 'Memory flags set on the entity.', 'requireEntityMemoryFlags', 'preferEntityMemoryFlags', [{ kind: 'list', label: 'Flags' }]),
  c('enUndiscovered', 'entity', 'Undiscovered', 'The player hasn\'t found it yet.', 'requireEntityUndiscovered', 'preferEntityUndiscovered'),
  // ---- market (vanilla's market search ignores system criteria)
  c('mkFaction', 'market', 'Faction is', '', 'requireMarketFaction', 'preferMarketFaction', [{ kind: 'list', label: 'Factions' }]),
  c('mkFactionNot', 'market', 'Faction is not', '', 'requireMarketFactionNot', 'preferMarketFactionNot', [{ kind: 'list', label: 'Factions' }]),
  c('mkNotPlayer', 'market', 'Not the player\'s', '', 'requireMarketFactionNotPlayer', null),
  c('mkHostileTo', 'market', 'Hostile to a faction', '', 'requireMarketFactionHostileTo', 'preferMarketFactionHostileTo', [{ kind: 'id', label: 'Faction' }]),
  c('mkNotHostileTo', 'market', 'Not hostile to a faction', '', 'requireMarketFactionNotHostileTo', 'preferMarketFactionNotHostileTo', [{ kind: 'id', label: 'Faction' }]),
  c('mkFactionCustom', 'market', 'Faction custom flags', 'The faction\'s "custom" flags (e.g. offersCommissions).', 'requireMarketFactionCustom', 'preferMarketFactionCustom', [MODE, { kind: 'list', label: 'Flags' }]),
  c('mkSizeAtLeast', 'market', 'Size at least', '', 'requireMarketSizeAtLeast', 'preferMarketSizeAtLeast', [{ kind: 'number', label: 'Size' }]),
  c('mkSizeAtMost', 'market', 'Size at most', '', 'requireMarketSizeAtMost', 'preferMarketSizeAtMost', [{ kind: 'number', label: 'Size' }]),
  c('mkStabilityAtLeast', 'market', 'Stability at least', '', 'requireMarketStabilityAtLeast', 'preferMarketStabilityAtLeast', [{ kind: 'number', label: 'Stability' }]),
  c('mkStabilityAtMost', 'market', 'Stability at most', '', 'requireMarketStabilityAtMost', 'preferMarketStabilityAtMost', [{ kind: 'number', label: 'Stability' }]),
  c('mkMilitary', 'market', 'Has a military base', '', 'requireMarketIsMilitary', 'preferMarketIsMilitary'),
  c('mkNotMilitary', 'market', 'No military base', '', 'requireMarketNotMilitary', 'preferMarketNotMilitary'),
  c('mkSpaceport', 'market', 'Has a spaceport', '', 'requireMarketHasSpaceport', 'preferMarketHasSpaceport'),
  c('mkNotSpaceport', 'market', 'No spaceport', '', 'requireMarketNotHasSpaceport', 'preferMarketNotHasSpaceport'),
  c('mkHidden', 'market', 'Hidden', 'A hidden market (a pirate or Pather base).', 'requireMarketHidden', 'preferMarketHidden'),
  c('mkNotHidden', 'market', 'Not hidden', '', 'requireMarketNotHidden', 'preferMarketNotHidden'),
  c('mkConditions', 'market', 'Market conditions', '', 'requireMarketConditions', 'preferMarketConditions', [MODE, { kind: 'list', label: 'Conditions' }]),
  c('mkIndustries', 'market', 'Industries', '', 'requireMarketIndustries', 'preferMarketIndustries', [MODE, { kind: 'list', label: 'Industries' }])
]

export const criterion = (id: string): CriterionSpec | undefined => CRITERIA.find((x) => x.id === id)

/** Criteria that narrow a pick: market targets ignore system criteria (vanilla's pickMarket). */
export function criteriaFor(pick: TargetPick): CriterionSpec[] {
  const groups: Record<TargetPick, CriterionSpec['group'][]> = { system: ['system'], planet: ['system', 'planet'], entity: ['system', 'entity'], market: ['market'] }
  return CRITERIA.filter((x) => groups[pick].includes(x.group))
}

/** Default args for a criterion. */
export function defaultArgs(spec: CriterionSpec): Criterion['args'] {
  return spec.args.map((a) => (a.kind === 'mode' ? 'ANY' : a.kind === 'list' ? [] : a.kind === 'number' ? 0 : a.kind === 'from' ? 'giver' : ''))
}

/** The facts SagaLib stores for every target: $global.<quest>_<var>_<fact>. */
export const TARGET_FACTS = ['name', 'system', 'dist', 'faction', 'factionId'] as const

/** Phase 7d (RC-R3): what the pick is like, for Branch conditions and phrases (SagaLib Targets.DETAILS). */
export const TARGET_DETAILS: { id: string; kind: 'bool' | 'ruins' | 'text'; label: string }[] = [
  { id: 'deciv', kind: 'bool', label: 'decivilised' },
  { id: 'hasRuins', kind: 'bool', label: 'has ruins' },
  { id: 'ruins', kind: 'ruins', label: 'ruins size' },
  { id: 'unexploredRuins', kind: 'bool', label: 'ruins not yet explored' },
  { id: 'populated', kind: 'bool', label: 'has a colony' },
  { id: 'gasGiant', kind: 'bool', label: 'a gas giant' },
  { id: 'theme', kind: 'text', label: 'system themes (theme_* tags, comma-separated; for texts)' },
  { id: 'ruinsTheme', kind: 'bool', label: 'a ruins system (theme_ruins…)' },
  { id: 'derelictTheme', kind: 'bool', label: 'a derelict system (theme_derelict…)' },
  { id: 'remnantTheme', kind: 'bool', label: 'a Remnant system (theme_remnant…)' },
  { id: 'miscTheme', kind: 'bool', label: 'a misc-theme system (theme_misc…)' },
  { id: 'blackHole', kind: 'bool', label: 'system has a black hole' },
  { id: 'pulsar', kind: 'bool', label: 'system has a pulsar' },
  { id: 'nebula', kind: 'bool', label: 'a nebula system' },
  { id: 'hostile', kind: 'bool', label: 'its faction is hostile to the player' },
  { id: 'unexplored', kind: 'bool', label: 'the player never entered its system' }
]
export const RUINS_SIZES = ['scattered', 'widespread', 'extensive', 'vast'] as const

/** Phase 7d: a target place's parts: the target itself, its person (RC-R4), what was spawned there (RC-R2). */
export type TargetPart = '' | 'person' | 'spawned'
/** Every key SagaLib may set for a target var. */
export function targetKeys(q: string, v: string): string[] {
  return [targetKey(q, v), ...TARGET_FACTS.map((f) => targetFactKey(q, v, f)), ...TARGET_DETAILS.map((d) => targetFactKey(q, v, d.id)), targetFactKey(q, v, 'person'), targetFactKey(q, v, 'personName'), targetFactKey(q, v, 'spawned')]
}
/** The memory key a place ref stands for: the pick, its person or its spawn. */
export const targetPartKey = (q: string, v: string, part: TargetPart) => (part ? targetFactKey(q, v, part) : targetKey(q, v))

export const targetKey = (q: string, v: string) => `$global.${q}_${v}`
export const targetFactKey = (q: string, v: string, f: string) => `$global.${q}_${v}_${f}`
/** A stage marker or Arrive place that names a target: "target:<var>". */
export const TARGET_REF = 'target:'
export const targetRef = (v: string, part: TargetPart = '') => `${TARGET_REF}${v}${part ? `.${part}` : ''}`
export const targetVarOf = (ref: string | undefined): string | null => (ref?.startsWith(TARGET_REF) ? ref.slice(TARGET_REF.length).split('.')[0] : null)
export const targetPartOf = (ref: string | undefined): TargetPart => { const p = ref?.startsWith(TARGET_REF) ? ref.split('.')[1] ?? '' : ''; return p === 'person' || p === 'spawned' ? p : '' }

export const targetVars = (q: QuestPlan): (QuestVar & { target: TargetDef })[] => q.variables.filter((v): v is QuestVar & { target: TargetDef } => v.type === 'target' && !!v.target)

/** The runtime form (quest JSON "targets", SagaLib 1.2). */
export function runtimeTargets(q: QuestPlan): Record<string, unknown>[] {
  return targetVars(q).map((v) => {
    const t = v.target
    const crit = (l: Criterion[]) => l.map((x) => ({ c: x.id, args: x.args }))
    return { var: v.name, pick: t.pick, require: crit(t.require), prefer: crit(t.prefer), ...(t.systemFirst ? { systemFirst: true } : {}), ...(t.person?.posts.length ? { person: { posts: t.person.posts, rank: t.person.rank || 'citizen', faction: t.person.faction ?? '' } } : {}) }
  })
}

export const newTarget = (): TargetDef => ({ pick: 'planet', require: [], prefer: [], mock: { name: 'Mock target', system: 'Mock system', dist: 8, faction: '' } })

/** Phase 7d: the places a quest's targets offer to markers and Arrive nodes: each target, its person, what was spawned there. */
export function targetPlaces(q: QuestPlan): { id: string; name: string }[] {
  const spawned = new Set(q.nodes.flatMap((n) => (n.type === 'action' ? n.ops.filter((o) => o.op === 'spawnAtTarget').map((o) => (o as { target: string }).target) : [])))
  return targetVars(q).flatMap((v) => [
    { id: targetRef(v.name), name: `random target ${v.name} (${v.target.pick})` },
    ...(v.target.person?.posts.length ? [{ id: targetRef(v.name, 'person'), name: `the person at random target ${v.name}` }] : []),
    ...(spawned.has(v.name) ? [{ id: targetRef(v.name, 'spawned'), name: `what was spawned at random target ${v.name}` }] : [])
  ])
}

/**
 * Whether an Arrive at this place takes over by default (user decision, 2026-11-16): what was spawned
 * at a target and an entity pick (caches, probes, research stations) have vanilla's salvage dialog,
 * which never shows menu options, so an option there would never appear.
 */
export function defaultTakeover(q: QuestPlan, entity: string | undefined): boolean {
  const v = targetVarOf(entity)
  if (!v) return false
  const part = targetPartOf(entity)
  return part === 'spawned' || (part === '' && targetVars(q).find((x) => x.name === v)?.target.pick === 'entity')
}

/** An Arrive's takeover: set by the modder, else the place's default. */
export const arriveTakesOver = (q: QuestPlan, n: { entity?: string; takeover?: boolean }): boolean => n.takeover ?? defaultTakeover(q, n.entity)
