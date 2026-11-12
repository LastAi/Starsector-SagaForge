import { describe, expect, it } from 'vitest'
import { parseCsvRecords, readCsvRow, updateCsvRow } from '../src/shared/csvedit'
import { parseCsv, csvRowsById } from '../src/shared/csv'

const SRC = 'name,id,hints,max speed\r\n#comment,line,,\r\nWolf,wolf,"COMBAT, CIVILIAN",160\r\n,,,\r\nLasher,lasher,,120\r\n'

describe('csv records', () => {
  it('parses with exact raw text and positions', () => {
    const r = parseCsvRecords(SRC)
    expect(r).toHaveLength(5)
    expect(r[2].fields).toEqual(['Wolf', 'wolf', 'COMBAT, CIVILIAN', '160'])
    expect(r[2].raw[2]).toBe('"COMBAT, CIVILIAN"')
    expect(SRC.slice(r[2].start, r[2].end)).toBe('Wolf,wolf,"COMBAT, CIVILIAN",160')
  })

  it('agrees with parseCsv on values', () => {
    const t = 'a,b\n"x,""y""\nz",2\n'
    expect(parseCsvRecords(t).map((r) => r.fields)).toEqual([['a', 'b'], ['x,"y"\nz', '2']])
    expect(parseCsv(t).rows).toEqual([['x,"y"\nz', '2']])
  })
})

describe('updateCsvRow', () => {
  it('changes only the edited cell', () => {
    const out = updateCsvRow(SRC, 'wolf', { name: 'Wolf', id: 'wolf', hints: 'COMBAT, CIVILIAN', 'max speed': '170' })
    expect(out).toBe(SRC.replace('",160', '",170'))
  })

  it('keeps identical text when nothing changed', () => {
    expect(updateCsvRow(SRC, 'lasher', { name: 'Lasher', 'max speed': '120' })).toBe(SRC)
  })

  it('quotes values that need it', () => {
    const out = updateCsvRow(SRC, 'lasher', { hints: 'CARRIER, COMBAT', name: 'Lasher "Mk2"' })
    expect(readCsvRow(out, 'lasher')).toMatchObject({ hints: 'CARRIER, COMBAT', name: 'Lasher "Mk2"', 'max speed': '120' })
    expect(out).toContain('"Lasher ""Mk2""",lasher,"CARRIER, COMBAT",120')
  })

  it('appends a new row in header order, keeping the line ending', () => {
    const out = updateCsvRow(SRC, 'hound', { name: 'Hound', 'max speed': '180' })
    expect(out).toBe(SRC + 'Hound,hound,,180\r\n')
    expect(updateCsvRow('id,name', 'x', { name: 'X' })).toBe('id,name\nx,X\n')
  })

  it('adds missing columns to the header', () => {
    const out = updateCsvRow(SRC, 'wolf', { rarity: '0.5' })
    expect(csvRowsById(parseCsv(out)).get('wolf')).toMatchObject({ rarity: '0.5', 'max speed': '160' })
    expect(csvRowsById(parseCsv(out)).get('lasher')?.rarity).toBe('')
  })

  it('edits the last row when an id appears twice (the one the game uses)', () => {
    const out = updateCsvRow('id,v\na,1\na,2\n', 'a', { v: '3' })
    expect(out).toBe('id,v\na,1\na,3\n')
  })
})
