import { describe, expect, it } from 'vitest'
import { parseLoose, LooseJsonError, stringToValue } from '../src/shared/loosejson'
import { parseCsv, csvRowsById } from '../src/shared/csv'

const v = (t: string) => parseLoose(t).value

describe('loose JSON (org.json rules)', () => {
  it('parses plain JSON', () => {
    expect(v('{"a": [1, 2.5, "x", true, null]}')).toEqual({ a: [1, 2.5, 'x', true, null] })
  })

  it('skips # // and /* */ comments', () => {
    expect(v('{ # hi\n "a":1, // there\n /* block\n */ "b":2 }')).toEqual({ a: 1, b: 2 })
  })

  it('allows trailing commas and ; separators', () => {
    expect(v('{"a":[1,2,],"b":3;"c":4,}')).toEqual({ a: [1, 2], b: 3, c: 4 })
  })

  it('reads unquoted keys and values, trimming but keeping inner spaces', () => {
    expect(v('{type:SYNERGY, hints:[CIVILIAN, NO AUTOFIT], x = 1, y => 2}')).toEqual({
      type: 'SYNERGY', hints: ['CIVILIAN', 'NO AUTOFIT'], x: 1, y: 2
    })
  })

  it('reads game-style numbers', () => {
    expect(v('[.8, -.5, +3, 1., 10.0f, 2e3, 0x1F, 007]')).toEqual([0.8, -0.5, 3, 1, 10, 2000, 31, 7])
    expect(stringToValue('1.2.3')).toBe('1.2.3')
    expect(stringToValue('TRUE')).toBe(true)
  })

  it('handles single quotes and escapes', () => {
    expect(v(`{'a':'it\\'s', "b":"\\u0041\\n"}`)).toEqual({ a: "it's", b: 'A\n' })
  })

  it('turns empty array slots into null', () => {
    expect(v('[1,,2]')).toEqual([1, null, 2])
  })

  it('ignores trailing text after the root, with a warning', () => {
    const r = parseLoose('{"a":1}\n  },  \n}')
    expect(r.value).toEqual({ a: 1 })
    expect(r.warnings).toHaveLength(1)
  })

  it('warns on duplicate keys and keeps the last value', () => {
    const r = parseLoose('{"a":1,"a":2}')
    expect(r.value).toEqual({ a: 2 })
    expect(r.warnings[0]).toMatch(/Duplicate key "a"/)
  })

  it('stores __proto__ as data', () => {
    const o = v('{"__proto__": {"x": 1}}') as Record<string, unknown>
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype)
    expect(o.__proto__).toEqual({ x: 1 })
  })

  it('reports line and column for errors', () => {
    try {
      parseLoose('{\n  "a": 1\n  "b": 2\n}')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LooseJsonError)
      expect((e as LooseJsonError).line).toBe(3)
    }
    expect(() => parseLoose('{"a": "never closed}')).toThrow(/never closed/)
    expect(() => parseLoose('{"a": [1, 2}')).toThrow(LooseJsonError)
  })
})

describe('csv', () => {
  it('handles quotes, commas and newlines inside fields', () => {
    const t = parseCsv('﻿name,id,hints\r\n"Big, Ship",big,"STATION, UNBOARDABLE"\n"multi\nline",m,\n,,\n')
    expect(t.header).toEqual(['name', 'id', 'hints'])
    expect(t.rows).toHaveLength(2)
    const byId = csvRowsById(t)
    expect(byId.get('big')?.hints).toBe('STATION, UNBOARDABLE')
    expect(byId.get('m')?.name).toBe('multi\nline')
  })
})
