// Analyses vanilla rules.csv: triggers, command names, memory keys in conditions, tokens in text.
const fs = require('fs')
const src = fs.readFileSync(process.argv[2], 'utf8')
function parseCsv(s) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++ } else q = false }
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}
const rows = parseCsv(src)
const h = rows[0].map(x => x.trim())
const ix = n => h.indexOf(n)
const T = {}, SC = {}, CC = {}, MK = {}, TK = {}, OPS = {}
const inc = (o, k) => { o[k] = (o[k] || 0) + 1 }
for (const r of rows.slice(1)) {
  const id = (r[ix('id')] || '').trim()
  if (!id || id.startsWith('#')) continue
  const trig = (r[ix('trigger')] || '').trim()
  if (trig) inc(T, trig)
  for (const line of (r[ix('conditions')] || '').split('\n')) {
    const l = line.trim(); if (!l || l.startsWith('#')) continue
    const first = l.replace(/^!\s*/, '').split(/\s+/)[0]
    if (/^[A-Za-z]/.test(first)) inc(CC, first)
    for (const m of l.matchAll(/\$[A-Za-z_][\w.:]*/g)) inc(MK, m[0].replace(/\.$/, ''))
    for (const m of l.matchAll(/\s(==|!=|>=|<=|>|<|=)\s/g)) inc(OPS, m[1])
  }
  for (const line of (r[ix('script')] || '').split('\n')) {
    const l = line.trim(); if (!l || l.startsWith('#')) continue
    const first = l.split(/\s+/)[0]
    if (/^[A-Za-z]/.test(first)) inc(SC, first)
    else inc(SC, '<' + first.slice(0, 1) + '>')
  }
  for (const col of ['text', 'options']) for (const m of (r[ix(col)] || '').matchAll(/\$[A-Za-z][\w.]*/g)) inc(TK, m[0].replace(/\.$/, ''))
}
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ':' + v).join(' ')
const mode = process.argv[3]
if (mode === 'json') { fs.writeFileSync(process.argv[4], JSON.stringify({ T, SC, CC, MK, TK, OPS })); }
else {
  console.log('HEADER', h.join('|'))
  console.log('TRIGGERS', Object.keys(T).length, top(T, 500))
  console.log('\nSCRIPTCMDS', top(SC, 400))
  console.log('\nCONDCMDS', top(CC, 200))
  console.log('\nOPS', top(OPS, 20))
  console.log('\nMEMKEYS', Object.keys(MK).length, top(MK, 150))
  console.log('\nTOKENS', top(TK, 150))
}
