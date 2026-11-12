import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseCondition, parseOptions, parseScriptLine, textVariants, tokenize, ruleScore, parseConditions } from '../src/shared/rules/parse'
import { compileRules, Engine, newContext, compare } from '../src/shared/rules/engine'
import { buildChain, searchRules } from '../src/shared/rules/graph'
import { buildTokens, defaultTestContext } from '../src/shared/rules/context'
import { parseFnt, measure, wrap, highlightRanges } from '../src/shared/bmfont'
import { parseRulesCsv } from '../src/main/gameindex'
import { defsFor } from '../src/shared/defs'
import type { RuleRow } from '../src/shared/rules/types'
import { realDir } from './realdir'

const row = (id: string, trigger: string, conditions = '', script = '', text = '', options = ''): RuleRow =>
  ({ id, trigger, conditions, script, text, options, notes: '', sourceId: 'test', file: 'rules.csv', line: 1 })

describe('parsing rules.csv cells', () => {
  it('reads conditions: memory, negation, commands, score', () => {
    expect(parseCondition('$option == gaData_start')).toMatchObject({ kind: 'memory', key: '$option', op: '==', value: 'gaData_start', negate: false })
    expect(parseCondition('!$askedCommission')).toMatchObject({ kind: 'memory', key: '$askedCommission', negate: true })
    expect(parseCondition('!Commission hasFactionCommission')).toMatchObject({ kind: 'command', name: 'Commission', args: ['hasFactionCommission'], negate: true })
    expect(parseCondition('score:1000')).toMatchObject({ kind: 'score', score: 1000 })
    expect(ruleScore(parseConditions('$id == rao\nscore:1000\n$isPerson'))).toBe(1002)
  })

  it('reads script lines, options and OR variants', () => {
    expect(parseScriptLine('$askedCommission = true 0')).toMatchObject({ kind: 'set', key: '$askedCommission', value: 'true', expire: 0 })
    expect(parseScriptLine('$global.x = 3')).toMatchObject({ kind: 'set', value: '3', expire: undefined })
    expect(parseScriptLine('AddText "Hello there" textGrayColor')).toMatchObject({ kind: 'command', name: 'AddText', args: ['Hello there', 'textGrayColor'] })
    expect(parseOptions('20:rao_ask:"I\'d like: a commission"\nleave:Leave')).toEqual([
      { order: 20, id: 'rao_ask', text: "I'd like: a commission", raw: '20:rao_ask:"I\'d like: a commission"' },
      { id: 'leave', text: 'Leave', raw: 'leave:Leave' }
    ])
    expect(textVariants('A\nOR\nB')).toEqual(['A', 'B'])
    expect(tokenize('SetTooltip opt "two words" x')).toEqual(['SetTooltip', 'opt', 'two words', 'x'])
  })

  it('compares like memory values', () => {
    expect(compare(3, '>=', '2')).toBe(true)
    expect(compare('DECIV', '==', 'DECIV')).toBe(true)
    expect(compare(undefined, '==', false)).toBe(true)
  })
})

describe('the rules engine', () => {
  const rules = compileRules([
    row('greet', 'OpenCommLink', '', 'FireAll PopulateOptions', '"Hello, $playerName."'),
    row('greetVip', 'OpenCommLink', '$global.vip', 'FireAll PopulateOptions', 'Welcome back.'),
    row('optAsk', 'PopulateOptions', '!$asked', '', '', '10:ask:Ask about the cargo'),
    row('optLeave', 'PopulateOptions', '', 'SetShortcut leave "ESCAPE"', '', '99:leave:Leave'),
    row('ask', 'DialogOptionSelected', '$option == ask', '$asked = true 0\nAddCredits 500\nFireAll PopulateOptions', 'They shrug.\nOR\nThey sigh.'),
    row('leave', 'DialogOptionSelected', '$option == leave', 'EndConversation', '')
  ])

  it('runs FireBest by score, FireAll, options, show-once and endings', () => {
    const ctx = newContext()
    ctx.tokens.$playerName = 'Varga'
    ctx.random = () => 0
    const e = new Engine(rules, ctx)
    e.fireBest('OpenCommLink')
    expect(e.view.paragraphs.map((p) => p.text)).toEqual(['"Hello, Varga."'])
    expect(e.view.options.map((o) => o.id)).toEqual(['ask', 'leave'])
    expect(e.view.options[1].shortcut).toBe('ESCAPE')
    e.select('ask')
    expect(e.view.paragraphs.filter((p) => !p.previous).map((p) => p.text)).toEqual(['Ask about the cargo', 'They shrug.', 'Gained 500¢'])
    expect(ctx.player.credits).toBe(120500)
    expect(e.view.options.map((o) => o.id)).toEqual(['leave'])
    e.select('leave')
    expect(e.view.ended).toBe(true)

    const vip = new Engine(rules, Object.assign(newContext(), { memory: new Map([['$global.vip', true]]) }))
    expect(vip.fireBest('OpenCommLink')?.row.id).toBe('greetVip')
  })
})

describe('tokens', () => {
  it('fills player and person tokens from the Test context', () => {
    const t = buildTokens({ ...defaultTestContext(), person: 'reyes' }, defsFor('0.98a'), {
      person: () => ({ first: 'Ilse', last: 'Reyes', gender: 'FEMALE', rank: 'Commodore', post: 'Station commander', faction: 'vgc_vanguard' }),
      faction: () => ({ name: 'Vanguard Compact', withArticle: 'the Vanguard Compact', long: '' }),
      market: () => null
    })
    expect(t.$playerLastName).toBe('Varga')
    expect(t.$PlayerSirOrMadam).toBe("Ma'am")
    expect(t.$personLastName).toBe('Reyes')
    expect(t.$heOrShe).toBe('she')
    expect(t.$theFaction).toBe('the Vanguard Compact')
  })
})

describe.skipIf(!realDir)('vanilla dialog', () => {
  const rows: RuleRow[] = []
  if (realDir) parseRulesCsv(fs.readFileSync(`${realDir}/starsector-core/data/campaign/rules.csv`, 'utf8'), 'starsector-core', 'rules.csv', rows)
  const rs = compileRules(rows)

  it('plays Rao\'s show-once commission question like the game', () => {
    const ctx = newContext()
    ctx.memory.set('$id', 'rao')
    ctx.memory.set('$isPerson', true)
    ctx.assume['Commission hasFactionCommission'] = false
    const e = new Engine(rs, ctx)
    e.fireAll('PopulateOptions')
    expect(e.view.options.some((o) => o.id === 'rao_askCommission')).toBe(true)
    e.select('rao_askCommission')
    expect(e.fired[0]).toBe('defaultRaoCommission2')
    expect(ctx.memory.get('$askedCommission')).toBe(true)
    expect(e.view.options.some((o) => o.id === 'rao_askCommission')).toBe(false)
  })

  it('draws the chain of a conversation', () => {
    const c = buildChain(rs, ['defaultRaoCommission'])
    expect(c.edges.some((e) => e.from === 'defaultRaoCommission' && e.to === 'defaultRaoCommission2')).toBe(true)
    expect(searchRules(rs, 'gaData').length).toBeGreaterThan(5)
  })

  it('reads the game font and wraps text', () => {
    const f = parseFnt(fs.readFileSync(`${realDir}/starsector-core/graphics/fonts/insignia15LTaa.fnt`, 'utf8'))
    expect(f.lineHeight).toBe(15)
    expect(f.chars.size).toBeGreaterThan(200)
    expect(measure(f, 'Hello')).toBeGreaterThan(20)
    const lines = wrap(f, 'The quick brown fox jumps over the lazy dog again and again.', 120)
    expect(lines.length).toBeGreaterThan(2)
    for (const l of lines) expect(measure(f, l)).toBeLessThanOrEqual(120)
    expect(lines.join(' ')).toBe('The quick brown fox jumps over the lazy dog again and again.')
    expect(highlightRanges('Pay 60,000 credits now', ['60,000'])).toEqual([[4, 10]])
  })
})
