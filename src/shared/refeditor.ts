/**
 * #67 U34 (user, 2026-11-22): reference pages for the editor's own lists (node types, random target
 * criteria, quest starts, dialog visuals, encounter spawns) and the short game lists the editor
 * offers (raid danger, survey levels, intel tabs, Nexerelin and MagicLib values, item presets,
 * music and sound ids). Game facts are from the game's code (starfarer.api.zip), SagaLib's code or
 * the mods' own documentation (MagicLib's magicBounty_data_example.json, Nexerelin's config).
 */
import type { GameDefinitions } from './defs/types'
import type { RefSection } from './reference'
import { CRITERIA, RUINS_SIZES } from './targets'
import { NEX_ALIGNMENTS, NEX_START_FLEETS } from './nexconfig'
import { ACHIEVEMENT_RARITIES } from './model'

const NODE_TYPES: [string, string, string][] = [
  ['Dialog', 'A text the player reads, with its speaker, picture and options. Each option leads on to another node.', 'Rules in rules.csv (one per text, one per option).'],
  ['Branch', 'Goes one way or another without showing anything: by conditions (the first case that holds), or at random by weight, or from a pool.', 'Conditions on the next rules.'],
  ['Action', 'Does things in order (set a flag, give credits or items, change reputation, start an encounter or a quest…) and goes on.', 'Script lines on a rule.'],
  ['Stage', 'A step of the quest: its intel entry text, map marker and what the player is told to do. The quest stays at a stage until something moves it on.', 'The quest\'s stages (SagaLib JSON) and $global.<quest>_stage.'],
  ['Encounter', 'Spawns one of the mod\'s encounters (Encounters page) and goes on by how it ends: won, lost, or the fleet talked to.', 'SF_Spawn and the encounter\'s outcome rules (SagaLib).'],
  ['Wait / Arrive', 'Waits until the player arrives at a place (then shows its text there), a number of days pass, or a flag is set.', 'SagaLib\'s waits; Arrive adds an option or a dialog at the place.'],
  ['Wait for a MagicLib bounty', 'Waits for one of the mod\'s MagicLib bounties to end and goes on by how it ended (succeeded, failed, expired).', 'SagaLib 1.3 watches the bounty.'],
  ['Raid', 'A ground raid on the place in this dialog: a briefing, then vanilla\'s raid menu with this one objective.', 'Vanilla\'s raid (no SagaLib).'],
  ['Fight', 'A battle right here against defenders SagaLib builds (like the automated defenses at ruins): Engage or Leave.', 'SF_Fight (SagaLib 1.4).'],
  ['Plugin', 'Runs a class from the mod\'s own jar for what data can\'t do, then goes on by the result it returns.', 'SF_RunPlugin (SagaLib 1.4).'],
  ['End', 'Ends the quest with an outcome (success, failure, …) and its reward.', 'The quest\'s end in SagaLib, the reward\'s script lines.'],
  ['Link', 'Leads into existing dialog (vanilla\'s or another mod\'s) without changing it: fires a trigger or picks an option id.', 'FireAll / FireBest or the option id.']
]

const START_KINDS: [string, string][] = [
  ['offered by a contact', 'A contact offers it as a mission (person_missions.csv), like vanilla\'s contact missions: the contact\'s tags, faction and your relationship decide who offers it and how often.'],
  ['a bar event', 'A bar visitor offers it (bar_events.csv), like vanilla\'s bar missions: shown at bars of the markets that fit, with a frequency.'],
  ['an option added to a menu', 'An option appears in a menu (a market, a planet, a station…) when its conditions hold; picking it opens the quest\'s first dialog.'],
  ['a dialog that opens on a trigger', 'The first dialog opens on a rules trigger, e.g. OpenInteractionDialog when the player clicks a place, or OpenCommLink when they hail a fleet.'],
  ['started by another quest', 'Only another quest (a "Start another quest" action) or an event starts it.'],
  ['an interjection before an existing option', 'Cuts into an existing option (e.g. salExplore on a derelict): its text shows first, then it hands back to that option.'],
  ['a bar scene', 'A conversation at the bar with no mission: just dialog, once or every visit.']
]

const VISUALS: [string, string, string][] = [
  ['Keep the current visual', 'Leaves whatever the dialog shows.', '(nothing)'],
  ['Person (speaker)', 'The speaker\'s portrait panel, with their faction and relationship.', 'ShowPersonVisual'],
  ['Illustration', 'A picture from settings.json\'s graphics (illustrations), e.g. a scene.', 'ShowImageVisual'],
  ['Large planet / planet info', 'The dialog’s planet large, or a planet info panel.', 'ShowLargePlanet / SF_ShowPlanetInfo (SagaLib)'],
  ['Map marker', 'The sector map centred on a place.', 'ShowMapMarker'],
  ['Both fleets', 'The player\'s and an encounter\'s fleet side by side, as before a battle.', 'SF_ShowFleets (SagaLib)'],
  ['One ship', 'One ship variant\'s picture.', 'SF_ShowShip (SagaLib)'],
  ['Save the visual', 'Remembers what is shown, to bring it back later.', 'SaveCurrentVisual'],
  ['Restore the saved visual', 'Shows the saved visual again.', 'RestoreSavedVisual'],
  ['Hide the visual', 'Clears the visual panel.', 'HideVisual']
]

const SPAWN_WHEN: [string, string][] = [
  ['when something spawns it (quest, event, etc.)', 'A quest\'s Encounter node or Spawn action, a world event, a progress stage or another encounter\'s outcome spawns it (the usual case; the page lists them under Spawned by), or a quest\'s stage when you pick one. It stays until it is beaten or the quest moves on (if "Leaves" is ticked).'],
  ['once, on a new game', 'Spawned once per game, when SagaLib first runs in it.'],
  ['kept alive, respawning', 'SagaLib keeps it in the sector; "Respawn after" days after it is destroyed a new one appears.'],
  ['when the player comes near', 'Spawned when the player\'s fleet comes within the range of its place (checked four times a day); optionally only while a quest is at a stage.'],
  ['roaming between two places', 'Leaves its place every few days on vanilla\'s routes, travels to another place, stays, then leaves the sector or goes back. A real fleet only near the player.']
]
const BEHAVIOURS: [string, string, string][] = [
  ['patrol', 'Patrols the system around its place.', 'PATROL_SYSTEM'],
  ['guard', 'Stays at its place and defends it.', 'DEFEND_LOCATION'],
  ['intercept-player', 'Comes for the player at once (for up to 30 days), then circles its place.', 'INTERCEPT, then ORBIT_AGGRESSIVE; pursues the player'],
  ['travel', 'Flies to "Travels to" and disappears there (patrols instead if that place isn\'t found).', 'GO_TO_LOCATION_AND_DESPAWN'],
  ['ambush', 'Waits at its place with its transponder off; when the player comes within 1600 units it attacks.', 'ORBIT_AGGRESSIVE, then INTERCEPT the player']
]

/** MarketCMD.RaidDangerLevel: marine losses multiplier, disruption days, marine tokens. */
const RAID_DANGER: [string, string, number, number, number][] = [
  ['NONE', 'None', 0, 60, 1], ['MINIMAL', 'Minimal', 0.02, 50, 1], ['LOW', 'Light', 0.04, 40, 2],
  ['MEDIUM', 'Moderate', 0.08, 30, 3], ['HIGH', 'Heavy', 0.16, 20, 5], ['EXTREME', 'Extreme', 0.32, 10, 7]
]

const SURVEY: [string, string][] = [
  ['game default', 'Whatever the game gives a new planet (the editor sets nothing).'],
  ['none', 'Nothing known: the planet\'s conditions are hidden until the player surveys it.'],
  ['preliminary', 'Preliminary survey data: the planet is known but not fully surveyed.'],
  ['full', 'Fully surveyed: everything shows and it can be colonised.']
]

const INTEL_TABS: [string, string][] = [
  ['Major events', 'Big happenings in the sector (Tags.INTEL_MAJOR_EVENT).'],
  ['Colony threats', 'Threats to the player\'s colonies (Tags.INTEL_COLONIES).'],
  ['Hostilities', 'Hostilities between factions (Tags.INTEL_HOSTILITIES).'],
  ['Military', 'Military operations (Tags.INTEL_MILITARY).'],
  ['Exploration', 'Finds and things to explore (Tags.INTEL_EXPLORATION).'],
  ['Story', 'Story missions (Tags.INTEL_STORY).']
]

const SHOW_FLEET: [string, string][] = [
  ['none', 'Shows nothing about the fleet.'],
  ['text', '"The intel assessment notes the target fleet may contain upwards of N ships."'],
  ['flagship', 'Only a picture of the flagship.'],
  ['flagshipText', 'The flagship\'s picture and a text with the number of other ships.'],
  ['preset', 'The flagship and the preset ships.'],
  ['presetText', 'The flagship and the preset ships, plus a text with the number of other ships.'],
  ['vanilla', 'The flagship and the 9 biggest ships, plus a text with the number of others (MagicLib\'s default).'],
  ['all', 'Pictures of every ship in the fleet.']
]
const SHOW_DISTANCE: [string, string][] = [
  ['none', 'Doesn\'t say where.'],
  ['vague', '"The target is located somewhere in the vicinity of the core worlds."'],
  ['distance', '"It is located roughly N LY away from your current position."'],
  ['system', '"The target is located in the <system> system."'],
  ['vanilla', 'Vanilla\'s description ("near a giant in a system with a yellow primary star, in the Nebulon constellation") and a map in the bar dialog.'],
  ['vanillaDistance', 'The same, plus the distance (MagicLib\'s default).'],
  ['exact', '"The target is located near X in the Y system", with a map.']
]

const VARIABLE_TYPES: [string, string][] = [
  ['number', 'A number (pay, a count, days).'],
  ['string', 'A word or text.'],
  ['bool', 'true or false.'],
  ['entity', 'A place in the sector (its id): usable as a map marker or an Arrive place.'],
  ['person', 'A person (their id): usable as a speaker or a contact.'],
  ['random target', 'A place SagaLib picks with vanilla\'s mission search when the quest is offered (see Random target criteria).']
]

const NEX_ALIGNMENT_DOC: Record<string, string> = {
  corporate: 'Trade and profit. Alliances of these factions are named Consortium, Conglomerate, Guild…',
  technocratic: 'Science and technology (Research, Academy, Institute…).',
  militarist: 'Military strength (Pact, Alliance, Axis…).',
  diplomatic: 'Peace and diplomacy (League, Federation, Union…).',
  ideological: 'Deprecated by Nexerelin (it no longer uses it).',
  hierarchical: 'Order and rank (Order, Empire, Dominion…).'
}

export function editorSections(defs: GameDefinitions, music: string[] = [], sounds: string[] = []): RefSection[] {
  const preset = (c: Record<string, string>) => Object.entries(c).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join('; ')
  return [{
    id: 'quests-node-types', group: 'Quests', title: 'Node types',
    intro: 'The nodes of a quest\'s chart ("+ Node", or double-click the chart). Each does one thing and leads on to the next.',
    columns: ['Node', 'What it does', 'Exported as'], rows: NODE_TYPES.map((n) => [...n])
  }, {
    id: 'quests-start-kinds', group: 'Quests', title: 'How a quest starts',
    intro: 'Quest settings › Start: where the player first meets the quest.',
    columns: ['Start', 'What it means'], rows: START_KINDS.map((s) => [...s])
  }, {
    id: 'quests-variables', group: 'Quests', title: 'Variable types',
    intro: 'Values a quest remembers in the save ($global.<quest>_<name> in rules).',
    columns: ['Type', 'Holds'], rows: VARIABLE_TYPES.map((s) => [...s])
  }, {
    id: 'quests-target-criteria', group: 'Quests', title: 'Random target criteria',
    intro: 'What a random target (or a scatter) can require or prefer. They are vanilla\'s own mission search (HubMissionWithSearch): "Require" must hold; "Prefer" is tried in order and dropped when it would leave nothing. Lists are ids, comma-separated.',
    columns: ['Criterion', 'Picks', 'What it means', 'Vanilla method'],
    rows: CRITERIA.map((c) => [c.label, c.group, c.help, [c.req, c.pref].filter(Boolean).join(' / ')])
  }, {
    id: 'quests-ruins-sizes', group: 'Quests', title: 'Ruins sizes',
    intro: 'A target planet\'s ruins, by the condition vanilla gives it.',
    columns: ['Size', 'Condition'], rows: RUINS_SIZES.map((s) => [s, `ruins_${s}`])
  }, {
    id: 'quests-visuals', group: 'Dialog', title: 'Visuals',
    intro: 'What a Dialog node shows on the left of the dialog window.',
    columns: ['Visual', 'Shows', 'Exported as'], rows: VISUALS.map((v) => [...v])
  }, {
    id: 'quests-raid-danger', group: 'Quests', title: 'Raid danger',
    intro: 'A Raid node\'s danger (vanilla\'s RaidDangerLevel): how many marines a raid loses and how long the target is disrupted.',
    columns: ['Danger', 'Losses shown as', 'Marine losses ×', 'Disruption (days)', 'Marine tokens'],
    rows: RAID_DANGER.map(([id, n, m, d, t]) => [id, n, String(m), String(d), String(t)])
  }, {
    id: 'encounters-spawn', group: 'Encounters', title: 'When it spawns',
    intro: 'Encounters › Spawn › When (SagaLib).',
    columns: ['When', 'What happens'], rows: SPAWN_WHEN.map((s) => [...s])
  }, {
    id: 'encounters-behaviour', group: 'Encounters', title: 'Behaviour',
    intro: 'Encounters › Spawn › Behavior: what the fleet does once spawned (SagaLib gives it vanilla\'s fleet assignments).',
    columns: ['Behaviour', 'What it does', 'Vanilla assignment'], rows: BEHAVIOURS.map((b) => [...b])
  }, {
    id: 'locations-surveyed', group: 'Locations', title: 'Survey levels',
    intro: 'A planet\'s survey level (MarketAPI.SurveyLevel): what the player knows about it at the start.',
    columns: ['Level', 'What the player sees'], rows: SURVEY.map((s) => [...s])
  }, {
    id: 'items-presets', group: 'Items', title: 'Item presets',
    intro: 'What a new item starts with (Items › Preset). The values go into the item\'s commodities.csv or special_items.csv row; the form shows the ones you usually change.',
    columns: ['Preset', 'Kind', 'Sets'], rows: defs.itemPresets.map((p) => [p.name, p.kind === 'special' ? 'special item' : 'commodity', preset(p.columns)])
  }, {
    id: 'saga-intel-tabs', group: 'Saga', title: 'Intel tabs',
    intro: 'The intel screen\'s tabs an event or progress entry can be listed under (its tag).',
    columns: ['Tab', 'What it holds'], rows: INTEL_TABS.map((s) => [...s])
  }, {
    id: 'saga-achievement-rarity', group: 'Saga', title: 'Achievement rarity',
    intro: 'MagicLib achievements: the rarity sets the frame colour, and the default picture when the achievement has none.',
    columns: ['Rarity'], rows: ACHIEVEMENT_RARITIES.map((r) => [r])
  }, {
    id: 'quests-bounty-board', group: 'Quests', title: 'MagicLib bounty board',
    intro: 'What the bounty board shows about a MagicLib bounty (job_show_fleet and job_show_distance; MagicLib\'s own descriptions).',
    columns: ['Value', 'Shows'],
    rows: [...SHOW_FLEET.map(([v, d]) => [`fleet: ${v}`, d]), ...SHOW_DISTANCE.map(([v, d]) => [`where: ${v}`, d])]
  }, {
    id: 'factions-nex-alignments', group: 'Factions', title: 'Nexerelin alignments',
    intro: 'How much a faction leans to each alliance type in Nexerelin (−1 to 1). Nexerelin\'s alliances form between factions that lean the same way and are named by it (allianceNames.json); its strategic AI weighs economy, military and diplomacy by it.',
    columns: ['Alignment', 'Means'], rows: NEX_ALIGNMENTS.map((a) => [a, NEX_ALIGNMENT_DOC[a] ?? ''])
  }, {
    id: 'factions-nex-start-fleets', group: 'Factions', title: 'Nexerelin new-game fleets',
    intro: 'The ships Nexerelin offers when the player starts a game with this faction and picks that kind of fleet on its new-game screen. Each kind is a list of fleets; one is picked.',
    columns: ['Fleet', 'Key in the faction config'], rows: NEX_START_FLEETS.map((f) => [f.label, f.key])
  }, {
    id: 'general-music', group: 'General', title: 'Music and sounds',
    intro: 'Music and sound ids (sounds.json) of the game and every installed mod. Music plays in systems, at markets and in encounters; sounds play once (dialog Displays › Sound).',
    columns: ['Id', 'Kind'], rows: [...music.map((m) => [m, 'music']), ...sounds.map((s) => [s, 'sound'])]
  }]
}
