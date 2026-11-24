/**
 * Test mod for task #79 (a quest node that runs the mod's own Java; SagaLib 1.4 SF_RunPlugin):
 * mods\seventynine_a (prefix pga_), for the 0.98a install (D:\Starsector). The mod has its own jar,
 * jars/pga_plugins.jar, built by the mod's build.sh from src/pga/plugins (hand-written, outside this
 * fixture): two classes that implement lastai.sagalib.api.SagaPlugin:
 *   pga.plugins.CoinFlip  adds lines to the dialog (its "text" argument, then what it got and what it
 *                         flipped) and returns "ok" (heads) or "odd" (tails); "chance" = the chance
 *                         of heads (default 0.5)
 *   pga.plugins.Broken    adds a line, then throws on purpose
 * In "Test Range 79", Waypoint 79 (an independent station) has the option "Test 79 - plugins": a
 * conversation whose options run Plugin nodes (result branching, an argument read from memory, a
 * two-headed coin, the broken plugin, a class that isn't in the jar) and an Action's "Run a plugin",
 * then Branches that read the kept results.
 * One-name characters (#79, second part): Tyger (one name, Waypoint 79's comm directory) has the option
 * "Test 79 - one name", a line with every name token in brackets and "make a potential contact" (the
 * intel screen); Mousey (one name) commands "Mousey's Patrol", a neutral fleet guarding Waypoint 79
 * (fleet tooltip, its comm reply with the same line).
 * In dev mode, Ctrl+F9 › "79: go to Test Range 79".
 */
import { emptyModel } from '../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../src/shared/locations'
import { newQuest } from '../../src/shared/quest'
import { newCommDialog, newEncounter } from '../../src/shared/encounters'
import type { DialogNode, EncounterDef, PersonDef, QEdge, QNode, QuestPlan } from '../../src/shared/model'
import type { JarInfo } from '../../src/shared/project'
import { dlg, type TestModDef } from './testmod'

export const SEVENTYNINE_GAME = '0.98a-RC8'
export const PGA_JAR = 'jars/pga_plugins.jar'
export const COIN = 'pga.plugins.CoinFlip'
export const BROKEN = 'pga.plugins.Broken'
export const MISSING = 'pga.plugins.NoSuchPlugin'
/** What the mod's jar holds (build.sh builds it; the editor reads it from the jar). */
export const SEVENTYNINE_JARS: JarInfo[] = [{ path: PGA_JAR, found: true, classes: [{ name: BROKEN, plugin: true }, { name: COIN, plugin: true }] }]

/** A dialog with one "Back" option to the menu of the test. */
const back = (id: string, y: number, text: string): { node: QNode; edge: QEdge } => ({
  node: dlg(id, 1000, y, text, [{ id: `b_${id}`, text: 'Back' }]),
  edge: { id: `e_b_${id}`, from: id, handle: `b_${id}`, to: 'offer' }
})

export function pluginConversation(): QuestPlan {
  const q = newQuest('pga_test', 'Test 79: plugins', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == pga_station'], optionText: 'Test 79 - plugins' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = 'Test 79: each option runs one of the test mod\'s plugin classes (its own Java, jars/pga_plugins.jar) through SagaLib\'s SF_RunPlugin.'
  offer.options = [
    { id: 'flip', text: '(a) Flip a coin - a Plugin node with the results ok and odd' },
    { id: 'sure', text: '(a2) Flip a two-headed coin - chance 1' },
    { id: 'broken', text: '(b) Run the broken plugin - it throws' },
    { id: 'missing', text: '(b2) Run a plugin class that is not in the jar' },
    { id: 'act', text: '(c) Run a plugin from an Action node' },
    { id: 'last', text: '(d) What did the last flip return' },
    { id: 'leave', text: 'Leave', shortcut: 'ESC' }
  ]
  const nodes: QNode[] = [
    // (a) result branching; "owner" is read from memory when it runs (the market's faction)
    { id: 'flip', type: 'plugin', x: 520, y: 0, title: 'Flip a coin', className: COIN, args: [{ key: 'chance', value: '0.5' }, { key: 'text', value: 'Test 79 (a): the coin spins in the air...' }, { key: 'owner', value: '$faction.id' }], results: ['ok', 'odd'] },
    // (a2) an argument decides: always heads
    { id: 'sure', type: 'plugin', x: 520, y: 260, title: 'Two-headed coin', className: COIN, args: [{ key: 'chance', value: '1' }, { key: 'text', value: 'Test 79 (a2): a coin with two heads.' }], results: ['ok', 'odd'] },
    // (b) the failure path: an exception in the plugin
    { id: 'broken', type: 'plugin', x: 520, y: 520, title: 'Broken plugin', className: BROKEN, args: [], results: ['ok'] },
    // (b2) the failure path: no such class (Problems warns about it, on purpose)
    { id: 'missing', type: 'plugin', x: 520, y: 700, title: 'Missing class', className: MISSING, args: [], results: [] },
    // (c) the Action op: chance 0 = always "odd", kept in $global.pga_test_act_result
    { id: 'act', type: 'action', x: 520, y: 860, title: 'Action with a plugin', ops: [{ op: 'plugin', className: COIN, args: [{ key: 'chance', value: '0' }, { key: 'text', value: 'Test 79 (c): the Action\'s plugin runs (chance 0: always tails).' }] }] },
    { id: 'act_br', type: 'branch', x: 760, y: 860, title: 'Kept?', cases: [{ id: 'odd', label: 'odd kept', conditions: ['$global.pga_test_act_result == odd'] }] },
    // (d) the Plugin node's result is kept for later Branches
    { id: 'last_br', type: 'branch', x: 520, y: 1060, title: 'Last flip', cases: [{ id: 'ok', label: 'ok', conditions: ['$global.pga_test_flip_result == ok'] }, { id: 'odd', label: 'odd', conditions: ['$global.pga_test_flip_result == odd'] }] },
    { id: 'menu', type: 'link', x: 520, y: 1300, mode: 'menu', target: '' }
  ]
  const edges: QEdge[] = [
    { id: 'o1', from: 'offer', handle: 'flip', to: 'flip' }, { id: 'o2', from: 'offer', handle: 'sure', to: 'sure' }, { id: 'o3', from: 'offer', handle: 'broken', to: 'broken' },
    { id: 'o4', from: 'offer', handle: 'missing', to: 'missing' }, { id: 'o5', from: 'offer', handle: 'act', to: 'act' }, { id: 'o6', from: 'offer', handle: 'last', to: 'last_br' },
    { id: 'o7', from: 'offer', handle: 'leave', to: 'menu' }, { id: 'a1', from: 'act', handle: 'next', to: 'act_br' }
  ]
  const results: [string, string, string, number][] = [
    ['flip', 'ok', 'Test 79 (a): the plugin returned "ok" (heads), so the quest took the node\'s "ok" output.', 0],
    ['flip', 'odd', 'Test 79 (a): the plugin returned "odd" (tails), so the quest took the node\'s "odd" output.', 80],
    ['flip', 'next', 'Test 79 (a): WRONG - no result. The coin always returns ok or odd.', 160],
    ['sure', 'ok', 'Test 79 (a2): "ok", as chance 1 says: the argument reached the plugin.', 260],
    ['sure', 'odd', 'Test 79 (a2): WRONG - "odd" with chance 1. The argument didn\'t reach the plugin.', 340],
    ['sure', 'next', 'Test 79 (a2): WRONG - no result.', 420],
    ['broken', 'ok', 'Test 79 (b): WRONG - "ok" from a plugin that throws.', 520],
    ['broken', 'next', 'Test 79 (b): the plugin threw, so SagaLib logged one error (with its stack trace) and the quest took the "otherwise" output. The line it added before throwing stays above.', 600],
    ['missing', 'next', 'Test 79 (b2): there is no such class, so SagaLib logged one error line and the conversation went on at the node\'s only output.', 700],
    ['act_br', 'odd', 'Test 79 (c): $global.pga_test_act_result is "odd": the Action\'s plugin ran and its result was kept.', 860],
    ['act_br', 'else', 'Test 79 (c): WRONG - $global.pga_test_act_result isn\'t "odd".', 940],
    ['last_br', 'ok', 'Test 79 (d): the last flip (a) returned "ok": $global.pga_test_flip_result == ok.', 1060],
    ['last_br', 'odd', 'Test 79 (d): the last flip (a) returned "odd": $global.pga_test_flip_result == odd.', 1140],
    ['last_br', 'else', 'Test 79 (d): no flip yet in this save (the key is unset).', 1220]
  ]
  for (const [from, handle, text, y] of results) {
    const b = back(`r_${from}_${handle}`, y, text)
    nodes.push(b.node)
    edges.push({ id: `e_${from}_${handle}`, from, handle, to: b.node.id }, b.edge)
  }
  q.nodes.push(...nodes)
  q.edges.push(...edges)
  return q
}

// ---------------------------------------------------------------- one-name characters (#79, second part)

/** The line every one-name test prints: each token in brackets, so an empty one shows as []. */
const NAME_LINE = (who: string) => `first [$personFirstName], First [$PersonFirstName], full [$personName], last [$personLastName], token [$${who}_firstName], name token [$${who}_name]`

/** Tyger: a one-name cat in Waypoint 79's comm directory. */
export const TYGER: PersonDef = {
  id: 'pga_tyger', name: { first: '', last: 'Tyger' }, oneName: true, gender: 'MALE', faction: 'independent', rank: 'citizen', post: 'agent',
  portrait: 'graphics/portraits/portrait_mercenary02.png', placement: { at: 'market', market: 'pga_station', inCommDirectory: true }, tags: [], phrases: []
}
/** Mousey: a one-name cat commanding the patrol at Waypoint 79 (an encounter's flagship). */
export const MOUSEY: PersonDef = {
  id: 'pga_mousey', name: { first: '', last: 'Mousey' }, oneName: true, gender: 'FEMALE', faction: 'independent', rank: 'spaceCaptain', post: 'fleetCommander',
  portrait: 'graphics/portraits/portrait_mercenary01.png', personality: 'steady', placement: { at: 'none' }, tags: [], phrases: []
}

/** (e) Talking to Tyger: the name tokens, and "make a potential contact" for the intel screen. */
export function namesConversation(): QuestPlan {
  const q = newQuest('pga_names', 'Test 79: one-name characters', 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == pga_tyger'], optionText: 'Test 79 - one name' }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = 'Names'
  offer.text = `Test 79 (e): Tyger is a cat with one name. Every bracket should say Tyger:\n\n${NAME_LINE('pga_tyger')}.\n\n"Hi, $personFirstName." (reads "Hi, Tyger.")`
  offer.options = [{ id: 'contact', text: '(e2) Make Tyger a potential contact' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  q.nodes.push(
    { id: 'make', type: 'action', x: 520, y: 0, title: 'Potential contact', ops: [{ op: 'line', line: 'AddPotentialContact pga_tyger' }] },
    dlg('made', 760, 0, 'Test 79 (e2): Intel › Contacts should list Tyger as a potential contact now (vanilla\'s intel, by the one name).', [{ id: 'made_back', text: 'Back' }]),
    { id: 'menu', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
  )
  q.edges.push(
    { id: 'n1', from: 'offer', handle: 'contact', to: 'make' }, { id: 'n2', from: 'make', handle: 'next', to: 'made' },
    { id: 'n3', from: 'made', handle: 'made_back', to: 'offer' }, { id: 'n4', from: 'offer', handle: 'leave', to: 'menu' }
  )
  return q
}

/** (f) Mousey's patrol: a fleet of the mod whose flagship Mousey commands, with its own comm reply. */
export function catsEncounter(): { enc: EncounterDef; comm: QuestPlan } {
  const enc = newEncounter('pga_cats', "Mousey's patrol", 'independent')
  enc.fleet = { faction: 'independent', type: 'patrolSmall', size: 'fp', points: 20, quality: 0.5, flagshipCommander: 'pga_mousey', name: "Mousey's Patrol" }
  enc.spawn = { at: 'pga_station', when: 'new-game' }
  enc.behavior = 'guard'
  enc.flags = { hostile: false, important: true, allowDisengage: true }
  enc.commDialog = 'pga_cats_comm'
  const comm = newCommDialog(enc)
  const offer = comm.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.text = `Test 79 (f): Mousey's patrol answers; Mousey commands it and has one name. Every bracket should say Mousey:\n\n${NAME_LINE('pga_mousey')}.`
  return { enc, comm }
}

export const SEVENTYNINE_A: TestModDef = {
  id: 'seventynine_a', name: 'Saga Forge test #79: plugins', prefix: 'pga_', version: '1.0.0', gameVersion: SEVENTYNINE_GAME,
  jars: SEVENTYNINE_JARS,
  description: 'Throwaway test mod for Saga Forge task #79: a quest node that runs the mod\'s own Java (SagaLib 1.4 SF_RunPlugin), from its own jar (build.sh). Dev mode: Ctrl+F9, profile 79.',
  // (b2) runs a class that isn't in the jar on purpose; the one-name tests use first-name tokens on purpose
  expectedWarnings: [/pga\.plugins\.NoSuchPlugin isn't in the mod's jars/, /has one name/],
  model() {
    const m = emptyModel('pga_')
    const sys = newSystem('pga_range', 'Test Range 79', 6000, 2000)
    sys.addToExistingSaves = true
    const station = newEntity('station', 'pga_station', 'Waypoint 79', 'star', 2000, 0)
    station.market = { ...newMarket('pga_station', 'Waypoint 79', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'], people: [] }
    sys.entities.push(station, newEntity('jumpPoint', 'pga_jp', 'Test Range 79 Jump-point', 'star', 4500, 60))
    m.systems.push(sys)
    m.quests.push(pluginConversation())
    // one-name characters: Tyger in the comm directory, Mousey commanding the patrol
    m.people.push({ ...TYGER }, { ...MOUSEY })
    const cats = catsEncounter()
    m.encounters.push(cats.enc)
    m.quests.push(namesConversation(), cats.comm)
    m.testProfiles.push({ id: 'pga_go', name: '79: go to Test Range 79', quests: {}, flags: {}, player: { startAt: 'pga_station', credits: 100000, cargo: [{ item: 'supplies', qty: 300 }, { item: 'fuel', qty: 300 }] } })
    return m
  }
}
