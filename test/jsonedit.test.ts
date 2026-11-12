import { describe, expect, it } from 'vitest'
import { updateLooseText, detectFormat } from '../src/shared/jsonedit'
import { parseLoose } from '../src/shared/loosejson'

const upd = (src: string, f: (v: any) => void) => {
  const v = structuredClone(parseLoose(src).value) as any
  f(v)
  return updateLooseText(src, v)
}

describe('updateLooseText', () => {
  it('returns the identical text when nothing changed', () => {
    const src = '{ # comment\n\t"a":.8, b: BARE,\n\t"c": [1,2,], # trailing\n}\n junk'
    expect(updateLooseText(src, parseLoose(src).value)).toBe(src)
  })

  it('replaces only the changed scalar', () => {
    const src = '{\n    "x": 1, # keep me\n    "y": .5\n}'
    expect(upd(src, (v) => { v.x = 2 })).toBe('{\n    "x": 2, # keep me\n    "y": .5\n}')
  })

  it('writes a changed bare word as a quoted string', () => {
    expect(upd('{type:SYNERGY}', (v) => { v.type = 'ENERGY' })).toBe('{type:"ENERGY"}')
  })

  it('adds a key after the last one, matching indentation', () => {
    expect(upd('{\n    "a": 1\n}', (v) => { v.b = [1, 2] })).toBe('{\n    "a": 1,\n    "b": [1, 2]\n}')
    expect(upd('{\n\t"a": 1, # c\n}', (v) => { v.b = 2 })).toBe('{\n\t"a": 1, # c\n\t"b": 2,\n}')
    expect(upd('{"a": 1}', (v) => { v.b = 2 })).toBe('{"a": 1, "b": 2}')
  })

  it('removes keys with their separators and lines', () => {
    expect(upd('{\n    "a": 1,\n    "b": 2,\n    "c": 3\n}', (v) => { delete v.b })).toBe('{\n    "a": 1,\n    "c": 3\n}')
    expect(upd('{\n    "a": 1,\n    "b": 2\n}', (v) => { delete v.b })).toBe('{\n    "a": 1\n}')
    expect(upd('{"a":1,"b":2}', (v) => { delete v.a })).toBe('{"b":2}')
  })

  it('removes and adds in the same object', () => {
    const out = upd('{\n  "a": 1,\n  "b": 2\n}', (v) => { delete v.b; v.c = 3 })
    expect(parseLoose(out).value).toEqual({ a: 1, c: 3 })
    expect(out).toBe('{\n  "a": 1,\n  "c": 3\n}')
  })

  it('grows and shrinks arrays in place', () => {
    const src = '{\n    "bounds": [\n        1,\n        2,\n        3,\n        4\n    ]\n}'
    expect(upd(src, (v) => { v.bounds.push(5, 6) })).toBe('{\n    "bounds": [\n        1,\n        2,\n        3,\n        4,\n        5,\n        6\n    ]\n}')
    expect(upd(src, (v) => { v.bounds.length = 2 })).toBe('{\n    "bounds": [\n        1,\n        2\n    ]\n}')
    expect(upd('{"l":[1, 2]}', (v) => { v.l.push(3) })).toBe('{"l":[1, 2, 3]}')
  })

  it('edits inside nested objects in arrays', () => {
    const src = '{"weaponSlots": [\n  {"id": "WS 001", "angle": 0},\n  {"id": "WS 002", "angle": 90}\n]}'
    const out = upd(src, (v) => { v.weaponSlots[1].angle = -90; v.weaponSlots.push({ id: 'WS 003', angle: 5 }) })
    expect(parseLoose(out).value).toEqual({ weaponSlots: [{ id: 'WS 001', angle: 0 }, { id: 'WS 002', angle: -90 }, { id: 'WS 003', angle: 5 }] })
    expect(out.startsWith('{"weaponSlots": [\n  {"id": "WS 001", "angle": 0},\n  {"id": "WS 002", "angle": -90},')).toBe(true)
  })

  it('handles emptying and filling containers', () => {
    expect(parseLoose(upd('{"a":[1,2]}', (v) => { v.a = [] })).value).toEqual({ a: [] })
    expect(parseLoose(upd('{"a":[]}', (v) => { v.a = [1] })).value).toEqual({ a: [1] })
    expect(parseLoose(upd('{"a":{}}', (v) => { v.a.b = 1 })).value).toEqual({ a: { b: 1 } })
  })

  it('removes every copy of a duplicated key', () => {
    expect(parseLoose(upd('{"a":1,"b":2,"a":3}', (v) => { delete v.a })).value).toEqual({ b: 2 })
  })

  it('keeps ; separators and CRLF', () => {
    const out = upd('{\r\n  "a": 1;\r\n  "b": 2\r\n}', (v) => { v.c = 3 })
    expect(out).toBe('{\r\n  "a": 1;\r\n  "b": 2,\r\n  "c": 3\r\n}')
  })

  it('detects indentation', () => {
    expect(detectFormat('{\n\t"a":1,\n\t"b":2,\n\t"c":3\n}').unit).toBe('\t')
    expect(detectFormat('{\n  "a": {\n    "b": 1\n  }\n}').unit).toBe('  ')
  })
})
