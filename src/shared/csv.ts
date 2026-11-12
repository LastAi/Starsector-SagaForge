// Copied from Ship Editor (src/shared/csv.ts); may drift, see docs/PLAN.md §2.
/**
 * CSV reader for Starsector tables (ship_data.csv, weapon_data.csv, ...).
 * Standard RFC 4180: quoted fields may contain commas, newlines and "" escapes.
 */

export interface CsvTable {
  header: string[]
  rows: string[][]
}

export function parseCsv(text: string): CsvTable {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0

  for (; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    records.push(row)
  }

  const nonEmpty = records.filter((r) => r.some((f) => f.trim() !== ''))
  const header = (nonEmpty.shift() ?? []).map((h) => h.trim())
  return { header, rows: nonEmpty }
}

/** Rows as objects keyed by header name. Rows without an id, or whose id starts with '#', are skipped. */
export function csvRowsById(table: CsvTable, idColumn = 'id'): Map<string, Record<string, string>> {
  const idIdx = table.header.indexOf(idColumn)
  const out = new Map<string, Record<string, string>>()
  if (idIdx < 0) return out
  for (const r of table.rows) {
    const id = (r[idIdx] ?? '').trim()
    if (!id || id.startsWith('#')) continue
    const obj: Record<string, string> = {}
    table.header.forEach((h, k) => {
      if (h) obj[h] = r[k] ?? ''
    })
    out.set(id, obj)
  }
  return out
}

/** Every row as an object keyed by header name, in file order. */
export function csvObjects(table: CsvTable): Record<string, string>[] {
  return table.rows.map((r) => {
    const obj: Record<string, string> = {}
    table.header.forEach((h, k) => { if (h) obj[h] = r[k] ?? '' })
    return obj
  })
}
