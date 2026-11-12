// Copied from Ship Editor (src/shared/csvedit.ts); may drift, see docs/PLAN.md §2.
/**
 * Change one row of a CSV file (e.g. ship_data.csv) while keeping everything else exactly
 * as it was: other rows, comment lines, blank lines, quoting style, line endings.
 *
 * updateCsvRow(text, id, values) finds the row whose `id` column matches (the last one, as
 * the game would use), and rewrites only the cells whose value changed. Unchanged cells keep
 * their original text. If there is no such row, a new one is appended. The result is parsed
 * again and checked; on a mismatch it throws rather than return something wrong.
 */

export interface CsvRecord {
  /** Offset of the first character of the record. */
  start: number
  /** Offset just past the record's last character (before its line break). */
  end: number
  fields: string[]
  /** The exact text of each field, including quotes. */
  raw: string[]
}

/** Parse into records with positions. Mirrors parseCsv() in csv.ts. */
export function parseCsvRecords(text: string): CsvRecord[] {
  const out: CsvRecord[] = []
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  while (i <= text.length) {
    if (i === text.length) break
    const rec: CsvRecord = { start: i, end: i, fields: [], raw: [] }
    for (;;) {
      const fStart = i
      let value = ''
      if (text[i] === '"') {
        i++
        for (;;) {
          if (i >= text.length) break
          if (text[i] === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue }
            i++
            break
          }
          value += text[i++]
        }
        // text after a closing quote (malformed, but keep it) up to the next separator
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') value += text[i++]
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') value += text[i++]
      }
      rec.fields.push(value)
      rec.raw.push(text.slice(fStart, i))
      if (text[i] === ',') { i++; continue }
      rec.end = i
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2
      else if (i < text.length) i++
      break
    }
    out.push(rec)
  }
  return out
}

const blank = (r: CsvRecord) => r.fields.every((f) => f.trim() === '')

/** Quote a cell if needed. */
export function csvCell(v: string): string {
  return /[",\r\n]/.test(v) || v !== v.trim() ? '"' + v.replace(/"/g, '""') + '"' : v
}

/**
 * A row key: an id (matched against idColumn), or several columns that must all match, e.g.
 * {id: 'wolf', type: 'SHIP'} for descriptions.csv.
 */
export type RowKey = string | Record<string, string>

function keyOf(id: RowKey, idColumn: string): Record<string, string> {
  return typeof id === 'string' ? { [idColumn]: id } : id
}

function matcher(columns: string[], key: Record<string, string>): (r: CsvRecord) => boolean {
  const cols = Object.entries(key).map(([c, v]) => [columns.indexOf(c), v] as const)
  return (r) => cols.every(([c, v]) => c >= 0 && (r.fields[c] ?? '').trim() === v)
}

export function updateCsvRow(text: string, id: RowKey, values: Record<string, string>, idColumn = 'id'): string {
  const key = keyOf(id, idColumn)
  const records = parseCsvRecords(text)
  const headerIdx = records.findIndex((r) => !blank(r))
  if (headerIdx < 0) throw new Error('The CSV file has no header row.')
  const header = records[headerIdx]
  const columns = header.fields.map((h) => h.trim())
  for (const c of Object.keys(key)) if (!columns.includes(c)) throw new Error(`The CSV file has no "${c}" column.`)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const edits: { start: number; end: number; text: string }[] = []

  // Columns we have values for but the file doesn't: add them to the end of the header.
  const extra = Object.keys(values).filter((k) => k && !columns.includes(k) && values[k] !== '')
  if (extra.length) {
    edits.push({ start: header.end, end: header.end, text: extra.map((c) => ',' + csvCell(c)).join('') })
    columns.push(...extra)
  }

  const isRow = matcher(columns, key)
  let row: CsvRecord | undefined
  for (let k = records.length - 1; k > headerIdx; k--) {
    if (isRow(records[k])) { row = records[k]; break }
  }

  if (row) {
    const n = Math.max(row.fields.length, columns.length)
    const cells: string[] = []
    for (let c = 0; c < n; c++) {
      const col = columns[c]
      const old = row.fields[c]
      const want = col !== undefined && col in values ? values[col] : old ?? ''
      cells.push(old !== undefined && want === old ? row.raw[c] : csvCell(want))
    }
    // drop trailing empty cells we added beyond the original row length
    while (cells.length > row.fields.length && cells[cells.length - 1] === '') cells.pop()
    edits.push({ start: row.start, end: row.end, text: cells.join(',') })
  } else {
    const cells = columns.map((col) => csvCell(col in key ? key[col] : values[col] ?? ''))
    const needsBreak = text.length > 0 && !text.endsWith('\n')
    edits.push({ start: text.length, end: text.length, text: (needsBreak ? eol : '') + cells.join(',') + eol })
  }

  let out = text
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

  // Verify: the row reads back with the requested values.
  const back = parseCsvRecords(out)
  const bh = back.find((r) => !blank(r))!.fields.map((h) => h.trim())
  const isBack = matcher(bh, key)
  const bHeader = back.find((r) => !blank(r))
  let got: CsvRecord | undefined
  for (let k = back.length - 1; k >= 0; k--) if (back[k] !== bHeader && isBack(back[k])) { got = back[k]; break }
  if (!got) throw new Error('Internal error: the edited CSV row could not be found again, so the file was not written')
  for (const [col, v] of Object.entries(values)) {
    const c = bh.indexOf(col)
    if (c >= 0 && (got.fields[c] ?? '') !== v) throw new Error(`Internal error: column "${col}" did not read back as expected, so the file was not written`)
  }
  return out
}

/** The values of the row with this id (last match), keyed by column; null if none. */
export function readCsvRow(text: string, id: RowKey, idColumn = 'id'): Record<string, string> | null {
  const records = parseCsvRecords(text)
  const hi = records.findIndex((r) => !blank(r))
  if (hi < 0) return null
  const columns = records[hi].fields.map((h) => h.trim())
  const isRow = matcher(columns, keyOf(id, idColumn))
  for (let k = records.length - 1; k > hi; k--) {
    if (isRow(records[k])) {
      const row: Record<string, string> = {}
      columns.forEach((c, j) => { if (c) row[c] = records[k].fields[j] ?? '' })
      return row
    }
  }
  return null
}
