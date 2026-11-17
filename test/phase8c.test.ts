/**
 * Phase 8c (R31): translations as a runtime swap. Keys and fingerprints shared with SagaLib,
 * dialog exported as tokens with its texts in text.json, what a translator gets, the CSV and the
 * state of each line, and a translation mod's files.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fingerprint, textLeaves, textToken } from '../src/shared/textkeys'
import { tokenizeRules } from '../src/shared/export/texttokens'
import { confirmLine, crossProblems, lineProblems, linesToSave, mergeTranslation, parseTranslationCsv, translationCsv, translationEntries, translationOf, TEXT_FILE } from '../src/shared/translate'
import { planExport } from '../src/shared/export'
import { testModFiles, testModState } from './fixtures/testmod'
import { EIGHT_C, EIGHT_C_XX, runtimeTexts } from './fixtures/phase8/eight_c'
import { modTexts, translationModFiles, langCode } from '../src/main/translations'
import type { RuleRow } from '../src/shared/rules/types'
import type { SourceInfo } from '../src/shared/api'

const SHARED = path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'test', 'textkeys.json')

describe.skipIf(!fs.existsSync(SHARED))('keys and fingerprints (shared with SagaLib)', () => {
  const s = fs.existsSync(SHARED) ? JSON.parse(fs.readFileSync(SHARED, 'utf8')) : { fingerprints: {}, cases: [] }
  it('fingerprints match', () => { for (const [t, f] of Object.entries(s.fingerprints)) expect(fingerprint(t)).toBe(f) })
  it('keys match', () => { for (const c of s.cases) expect(textLeaves(c.id, c.json)).toEqual(c.keys) })
})

const row = (o: Partial<RuleRow>): RuleRow => ({ id: 'r', trigger: 'x', conditions: '', script: '', text: '', options: '', notes: '', sourceId: 'plan', file: '', ...o } as RuleRow)

describe('dialog as tokens', () => {
  it('replaces every text the player reads and keeps the rest', () => {
    const { rows, strings } = tokenizeRules([row({
      id: 'q_offer', text: 'Hello.\nOR\nHi there.',
      options: '1:q_yes:Yes\n2:q_no:No',
      script: 'AddText "More."\nSetTextHighlights "Kestrel" "60,000"\nSetTooltip q_yes "Do it."\nSF_Step q find\nShowMapMarker q_wreck "Wreck"\nSF_Show heading "Cargo"\nAddRaidObjective genericIcon "Steal it" LOW 10 q_raid true "Careful."\nSetStoryOption q_yes 1 general ui "Spent it"'
    })])
    const r = rows[0]
    expect(r.text).toBe(`${textToken('q_offer', 't1')}\nOR\n${textToken('q_offer', 't2')}`)
    expect(r.options).toBe(`1:q_yes:${textToken('q_offer', 'o_q_yes')}\n2:q_no:${textToken('q_offer', 'o_q_no')}`)
    expect(r.script).toContain('SF_Step q find')
    expect(r.script).toContain('ShowMapMarker q_wreck "Wreck"') // the game fills no tokens there
    expect(strings.q_offer).toEqual({
      t1: 'Hello.', t2: 'Hi there.', o_q_yes: 'Yes', o_q_no: 'No', a1: 'More.', h1: 'Kestrel', h2: '60,000', tip_q_yes: 'Do it.', a2: 'Cargo',
      raid1: 'Steal it', g_raidtip1: 'Careful.', g_story_q_yes: 'Spent it'
    })
    // tokens are prefix-free: no token is the start of another
    const toks = Object.keys(strings.q_offer).map((p) => textToken('q_offer', p))
    for (const a of toks) for (const b of toks) if (a !== b) expect(b.startsWith(a)).toBe(false)
  })

  it('exports rules.csv with tokens, the texts in text.json, listed in content.csv', () => {
    const files = testModFiles(EIGHT_C)
    expect(files['data/campaign/rules.csv']).not.toContain('This is test 8c')
    expect(files['data/campaign/rules.csv']).toContain('$sft-')
    const text = JSON.parse(files[TEXT_FILE])
    expect(JSON.stringify(text.rules)).toContain('This is test 8c')
    expect(text.items.sec_box.name).toBe('Test box')
    expect(files['data/config/sagaforge/content.csv']).toContain(`eight_c_text,strings,${TEXT_FILE},eight_c`)
    expect(files['mod_info.json']).toContain('"version": "1.2.0"')
  })

  it('can be switched off: plain text, no text.json', () => {
    const def = { ...EIGHT_C, model: () => { const m = EIGHT_C.model(); m.project.options.translatable = false; return m } }
    const files = testModFiles(def)
    expect(files['data/campaign/rules.csv']).toContain('This is test 8c')
    expect(files[TEXT_FILE]).toBeUndefined()
  })

  it('"Export dialog only" also writes text.json and lists it', () => {
    const m = EIGHT_C.model()
    const plan = planExport(m, testModState(EIGHT_C, m, { 'mod_info.json': '{"id":"eight_c"}' }), { factions: [], items: [], people: [], markets: [] } as never, null, { dialogOnly: true })
    expect(plan.writes.map((w) => w.path).sort()).toEqual(['data/campaign/rules.csv', 'data/config/sagaforge/content.csv', TEXT_FILE].sort())
    expect(plan.writes.find((w) => w.path === 'data/config/sagaforge/content.csv')!.text).toBe(`id,type,path,mod\neight_c_text,strings,${TEXT_FILE},eight_c\n`)
  })
})

describe('what a translator gets', () => {
  const entries = translationEntries(runtimeTexts(testModFiles(EIGHT_C), 'eight_c'))
  const orig = entries.map((e) => e.original)
  it('the texts the player reads', () => {
    for (const t of ['Test 8c-1: a translated conversation', 'Talked to the chief', 'You talked to the range chief of Test Range 8C.', 'Nothing more to do', 'Test 8c-1, talk to the range chief',
      'Ada', 'Lindqvist', 'Captain $playerLastName', 'Test Range 8C', 'Range Rock', 'Range Control 8C Market', 'Agree', 'A tooltip on the option.', 'An added line of text (AddText).', 'Test Range', 'Test box']) expect(orig).toContain(t)
  })
  it('and nothing the game uses as an id or condition', () => {
    for (const t of ['sec_talk', 'sec_station', '$player.credits >= 1000000', 'independent', 'stationCommander', 'graphics/portraits/portrait_mercenary02.png']) expect(orig).not.toContain(t)
  })
  it('each with where it shows', () => {
    expect(entries.find((e) => e.original === 'Agree')!.context).toMatch(/^Dialog sec_talk_.* › option "sec_talk_accept"$/)
    expect(entries.find((e) => e.original === 'Test Range')!.context).toMatch(/highlighted words 1/)
    expect(entries.find((e) => e.original === 'Talked to the chief')!.context).toBe('Quest sec_talk › stages talked › title')
  })
})

describe('the translation file', () => {
  const entries = [
    { key: 'a', context: 'A', original: 'Hello $playerName.', source: fingerprint('Hello $playerName.') },
    { key: 'b', context: 'B', original: 'New text', source: fingerprint('New text') },
    { key: 'c', context: 'Dialog r › option "x"', original: 'Go', source: fingerprint('Go') }
  ]
  const lines = parseTranslationCsv(translationCsv([
    { key: 'a', context: 'A', original: 'Hello $playerName.', translation: 'Hallo, "$playerName".\nZweite Zeile', source: fingerprint('Hello $playerName.') },
    { key: 'b', context: 'B', original: 'Old text', translation: 'Alter Text', source: fingerprint('Old text') },
    { key: 'gone', context: 'G', original: 'x', translation: 'y', source: fingerprint('x') }
  ]))
  it('reads back what it writes (quotes, line breaks)', () => expect(lines[0].translation).toBe('Hallo, "$playerName".\nZweite Zeile'))
  it('sorts lines into done, to do, stale and gone', () => {
    const m = mergeTranslation(entries, lines)
    expect(m.map((l) => `${l.key}:${l.state}`)).toEqual(['a:done', 'b:stale', 'c:todo', 'gone:gone'])
    expect(m[1].wasOriginal).toBe('Old text')
    const checked = confirmLine(m[1])
    expect(checked.state).toBe('done')
    const saved = linesToSave([m[0], m[1], checked, m[2], m[3]])
    expect(saved.map((l) => l.key)).toEqual(['a', 'b', 'b', 'c'])
    expect(saved[1].source).toBe(fingerprint('Old text')) // still stale: SagaLib shows the original
    expect(saved[2].source).toBe(fingerprint('New text'))
  })
  it('warns when a highlight is not in its rule\'s translated text', () => {
    const mk = (key: string, original: string, translation: string) => ({ key, context: '', original, translation, source: '', state: 'done' as const })
    const ls = [mk('m_text/rules.r.t', 'The Test Range.', '[XX] Die Testzone.'), mk('m_text/rules.r.h1', 'Test Range', '[XX] Test Range')]
    expect(crossProblems(ls).get('m_text/rules.r.h1')![0]).toMatch(/isn't in this dialog's text/)
    expect(crossProblems([ls[0], mk('m_text/rules.r.h1', 'Test Range', 'Testzone')]).size).toBe(0)
  })
  it('warns about left-out tokens and overlong labels', () => {
    expect(lineProblems({ key: 'a', context: 'A', original: 'Hi $playerName', translation: 'Hallo', source: '' })[0]).toMatch(/\$playerName/)
    expect(lineProblems({ key: 'c', context: 'Dialog r › option "x"', original: 'Go', translation: 'Gehen Sie jetzt bitte sofort los', source: '' }).join()).toMatch(/longer/)
    expect(lineProblems({ key: 'a', context: 'A', original: 'Hi $playerName', translation: 'Hallo $playerName', source: '' })).toEqual([])
  })
})

describe('a translation mod', () => {
  it('eight_c_xx: content.csv names the mod and language; every line has a translation but two', () => {
    const files = testModFiles(EIGHT_C_XX)
    expect(translationOf(files['data/config/sagaforge/content.csv'], 'eight_c_xx')).toEqual({ target: 'eight_c', language: 'xx', path: 'data/sagaforge/translations/eight_c.xx.csv' })
    expect(files['mod_info.json']).toContain('"dependencies": [{"id":"eight_c"')
    const lines = parseTranslationCsv(files['data/sagaforge/translations/eight_c.xx.csv'])
    const merged = mergeTranslation(translationEntries(runtimeTexts(testModFiles(EIGHT_C), 'eight_c')), lines)
    expect(merged.filter((l) => l.state === 'stale').map((l) => l.key)).toEqual(['sec_talk/stages[talked].title'])
    expect(merged.filter((l) => l.state === 'todo').map((l) => l.key)).toEqual(['sec_talk/stages[talked].nextStep'])
    expect(lines.find((l) => l.original === 'Range Rock')!.translation).toBe('Range Rock XX')
    expect(crossProblems(merged).size).toBe(0)
  })

  it('is made from the installed mod\'s files (read only) with every text and an empty translation', () => {
    const dir = path.resolve(__dirname, '..', '.userdata', 'test-translation-tmp', 'eight_c')
    fs.rmSync(path.dirname(dir), { recursive: true, force: true })
    for (const [rel, text] of Object.entries(testModFiles(EIGHT_C))) { const f = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
    const src = { id: 'eight_c', name: 'Test 8c', version: '1.0.0', dir, isCore: false } as SourceInfo
    expect(modTexts(src).map((f) => f.type).sort()).toEqual(['people', 'quest', 'strings', 'system'])
    const { info, files } = translationModFiles(src, langCode(' PT-br '), 'eight_c_pt_br')
    expect(info.dependencies).toEqual([{ id: 'eight_c', name: 'Test 8c' }, { id: 'lastai_sagalib', name: 'SagaLib', version: '1.2.0' }])
    expect(files['data/config/sagaforge/content.csv']).toBe('id,type,path,mod\neight_c/pt_br,translation,data/sagaforge/translations/eight_c.pt_br.csv,eight_c_pt_br\n')
    const lines = parseTranslationCsv(files['data/sagaforge/translations/eight_c.pt_br.csv'])
    expect(lines.length).toBeGreaterThan(20)
    expect(lines.every((l) => l.translation === '' && l.source === fingerprint(l.original))).toBe(true)
    fs.rmSync(path.dirname(dir), { recursive: true, force: true })
  })
})
