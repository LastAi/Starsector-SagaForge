/**
 * Test mods for Phase 8c (translation, R31): mods\eight_c (prefix sec_), a small mod whose texts
 * are translatable, and mods\eight_c_xx, a translation of it into the made-up language "xx": every
 * text gets "[XX] " in front (names: " XX" behind), so a translated text is easy to spot in game.
 * Two lines show the fallback: one made for an older original (stale) and one left empty; both
 * must show the original. Disabling eight_c_xx must bring every text back, names in the save too.
 */
import { emptyModel } from '../../../src/shared/serialize'
import { newSystem, newEntity, newMarket } from '../../../src/shared/locations'
import { newQuest } from '../../../src/shared/quest'
import { newItem } from '../../../src/shared/export/items'
import { defsFor } from '../../../src/shared/defs'
import { parseCsvRecords } from '../../../src/shared/csvedit'
import { fingerprint } from '../../../src/shared/textkeys'
import { translationCsv, translationEntries, type RuntimeText } from '../../../src/shared/translate'
import type { DialogNode } from '../../../src/shared/model'
import { testModFiles, type TestModDef } from '../testmod'

export const EIGHT_C: TestModDef = {
  id: 'eight_c', name: 'Saga Forge test 8c: translation', prefix: 'sec_', version: '1.0.0',
  description: 'Throwaway test mod for Saga Forge Phase 8c: texts a translation mod (eight_c_xx) replaces in game. Dev mode: Ctrl+F9, profile 8c.',
  model() {
    const m = emptyModel('sec_')
    const sys = newSystem('sec_range', 'Test Range 8C', 13000, 8500)
    sys.addToExistingSaves = true
    const planet = newEntity('planet', 'sec_rock', 'Range Rock', 'star', 1400, 120)
    const station = newEntity('station', 'sec_station', 'Range Control 8C', 'star', 2000, 0)
    station.market = { ...newMarket('sec_station', 'Range Control 8C Market', 'independent'), size: 3, conditions: ['population_3'], industries: ['population', 'spaceport'] }
    sys.entities.push(planet, station, newEntity('jumpPoint', 'sec_jp', 'Test Range 8C Jump-point', 'star', 3400, 200))
    m.systems.push(sys)

    // a person with a phrase, at the station
    m.people.push({
      id: 'sec_chief', name: { first: 'Ada', last: 'Lindqvist' }, gender: 'FEMALE', faction: 'independent', rank: 'citizen', post: 'stationCommander',
      portrait: 'graphics/portraits/portrait_mercenary02.png', voice: '', placement: { at: 'market', market: 'sec_station', inCommDirectory: true },
      tags: [], phrases: [{ token: '$sec_chief_title', owner: 'sec_chief', mode: 'first-match', cases: [{ when: ['$player.credits >= 1000000'], text: 'rich Captain $playerLastName' }], otherwise: 'Captain $playerLastName' }]
    })

    // an item with a description (in the profile's cargo)
    const box = newItem('sec_box', 'Test box', 'quest_item', defsFor('0.98a'))
    box.description = 'A plain box for test 8c. Its name and this text are translated.'
    m.items.push(box)

    // a conversation with every kind of dialog text
    const q = newQuest('sec_talk', 'Test 8c-1: a translated conversation', 'quest')
    q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: ['$id == sec_station'], optionText: 'Test 8c-1, talk to the range chief' }
    q.stages = [{ id: 'talked', title: 'Talked to the chief', journal: 'You talked to the range chief of Test Range 8C.', nextStep: 'Nothing more to do', kind: 'normal', renamedFrom: [] }]
    const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
    offer.text = '"Hello, $sec_chief_title," says Ada Lindqvist. "This is test 8c. Every text here should start with [XX] when eight_c_xx is enabled."\n\nThe words Test Range should be highlighted.'
    offer.highlights = ['Test Range']
    offer.displays = [{ kind: 'text', text: 'An added line of text (AddText).' }]
    const accept = offer.options.find((o) => o.id === 'accept')
    if (accept) { accept.text = 'Agree'; accept.tooltip = 'A tooltip on the option.' }
    const decline = offer.options.find((o) => o.id === 'decline')
    if (decline) decline.text = 'Leave'
    q.nodes.push(
      // the quest stays at this stage, so its journal entry (title, text, next step) stays in Intel › Missions
      { id: 'st', type: 'stage', x: 520, y: 40, stage: 'talked' },
      { id: 'menu', type: 'link', x: 760, y: 40, mode: 'menu', target: '' },
      { id: 'no', type: 'link', x: 520, y: 200, mode: 'menu', target: '' }
    )
    q.edges.push({ id: 'a', from: 'offer', handle: 'accept', to: 'st' }, { id: 'b', from: 'offer', handle: 'decline', to: 'no' }, { id: 'c', from: 'st', handle: 'next', to: 'menu' })
    m.quests.push(q)
    m.project.ignores.push({ key: 'noend:sec_talk', reason: 'Test 8c: the quest stays at its stage so its journal entry stays visible.' })

    m.testProfiles.push({ id: 'sec_go', name: '8c: go to Test Range 8C (with a test box)', quests: {}, flags: {}, player: { startAt: 'sec_station', cargo: [{ item: 'sec_box', qty: 1 }] } })
    return m
  }
}

/** eight_c's runtime files as SagaLib reads them (its content.csv rows). */
export function runtimeTexts(files: Record<string, string>, mod: string): RuntimeText[] {
  const recs = parseCsvRecords(files['data/config/sagaforge/content.csv'] ?? '')
  const out: RuntimeText[] = []
  for (const r of recs.slice(1)) {
    const [id, type, path, m] = r.fields.map((f) => f.trim())
    if (m === mod && files[path] && type !== 'profiles') out.push({ id, type, json: JSON.parse(files[path]) })
  }
  return out
}

/** The "xx" translation of eight_c: "[XX] " in front, names with " XX"; one stale line, one empty. */
export function xxTranslation(): string {
  const entries = translationEntries(runtimeTexts(testModFiles(EIGHT_C), 'eight_c'))
  return translationCsv(entries.map((e) => {
    const isName = /› (name|market › name|name › first|name › last)$|› name$/.test(e.context) || /^Item .* › name$/.test(e.context)
    const translation = isName ? `${e.original} XX` : `[XX] ${e.original}`
    if (e.key.endsWith('stages[talked].title')) return { ...e, translation: '[XX] made for an older text', source: fingerprint('Talked to the boss') }
    if (e.key.endsWith('stages[talked].nextStep')) return { ...e, translation: '' }
    // a highlight must stay words of the translated text (the text keeps 'Test Range')
    if (/\.h\d+$/.test(e.key)) return { ...e, translation: e.original }
    return { ...e, translation }
  }))
}

export const EIGHT_C_XX: TestModDef = {
  id: 'eight_c_xx', name: 'Saga Forge test 8c: translation (XX)', prefix: 'secx_', version: '1.0.0',
  description: 'Throwaway translation of eight_c into the made-up language XX, for Saga Forge Phase 8c. Enable it with eight_c to see every text with [XX].',
  dependencies: [{ id: 'eight_c', name: 'Saga Forge test 8c: translation' }, { id: 'lastai_sagalib', name: 'SagaLib', version: '1.2.0' }],
  model() { return emptyModel('secx_') },
  get extraFiles() {
    return {
      'data/config/sagaforge/content.csv': 'id,type,path,mod\neight_c/xx,translation,data/sagaforge/translations/eight_c.xx.csv,eight_c_xx\n',
      'data/sagaforge/translations/eight_c.xx.csv': xxTranslation()
    }
  }
}
