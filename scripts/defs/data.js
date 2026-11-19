// Vanilla data scan: star types (isStar), commodity/special item tags + sample rows, faction keys.
const fs = require('fs'), path = require('path')
const D = process.argv[2]
function parseCsv(s) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}
// stars: find "id":{ ... "isStar":true within planets.json via naive block scan
const pj = fs.readFileSync(path.join(D, 'config/planets.json'), 'utf8')
const stars = []
for (const m of pj.matchAll(/^\s*"([\w-]+)"\s*:\s*\{([\s\S]*?)^\s*\},?/gm)) if (/"isStar"\s*:\s*true/.test(m[2])) stars.push(m[1])
console.log('STARS', stars.join(' '))
for (const file of ['campaign/commodities.csv', 'campaign/special_items.csv']) {
  const rows = parseCsv(fs.readFileSync(path.join(D, file), 'utf8'))
  const h = rows[0], ti = h.indexOf('tags'), ii = h.indexOf('id')
  const tags = {}
  for (const r of rows.slice(1)) if (r[ii]) for (const t of (r[ti] || '').split(',').map(x => x.trim()).filter(Boolean)) (tags[t] = tags[t] || []).push(r[ii])
  console.log('\n' + file, 'TAGS')
  for (const [t, ids] of Object.entries(tags)) console.log('  ' + t + ' (' + ids.length + '): ' + ids.slice(0, 8).join(' '))
  const want = process.argv.slice(3)
  for (const r of rows.slice(1)) if (want.includes(r[ii])) console.log('  ROW ' + JSON.stringify(Object.fromEntries(h.map((k, i) => [k, r[i] || '']).filter(([k]) => k))))
}
// faction keys
const fdir = path.join(D, 'world/factions')
const keys = {}
for (const f of fs.readdirSync(fdir).filter(f => f.endsWith('.faction'))) {
  const s = fs.readFileSync(path.join(fdir, f), 'utf8').replace(/#.*$/gm, '')
  // top-level keys: depth 1
  let depth = 0, inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
    if (c === '"') {
      if (depth === 1) {
        const m = s.slice(i).match(/^"([^"]+)"\s*:\s*(.)/)
        if (m) { keys[m[1]] = keys[m[1]] || { n: 0, first: m[2] }; keys[m[1]].n++; i += m[0].length - 2; continue }
      }
      inStr = true; continue
    }
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') depth--
  }
}
console.log('\nFACTIONKEYS', Object.entries(keys).map(([k, v]) => k + '(' + v.n + v.first + ')').join(' '))
