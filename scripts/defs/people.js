// Parses ids/People.java: person id, name, faction, market (sequential scan).
// Usage: node people.js <People.java> <Factions.java>
const fs = require('fs')
const src = fs.readFileSync(process.argv[2], 'utf8')
const fsrc = fs.readFileSync(process.argv[3], 'utf8')
const consts = {}, fac = {}
for (const m of src.matchAll(/String\s+([A-Z0-9_]+)\s*=\s*"([^"]*)"/g)) consts[m[1]] = m[2]
for (const m of fsrc.matchAll(/String\s+([A-Z0-9_]+)\s*=\s*"([^"]*)"/g)) fac[m[1]] = m[2]
let market = '', cur = null
const out = {}
for (const l of src.split(/\r?\n/)) {
  let m
  if ((m = l.match(/getMarket\("([^"]+)"\)/))) market = m[1]
  if (/createPerson\(\)|createRandomPerson\(/.test(l)) {
    const fm = l.match(/getFaction\(Factions\.([A-Z0-9_]+)\)/)
    cur = { id: '', first: '', last: '', faction: fm ? fac[fm[1]] : '', market, random: !!fm }
  }
  if (/^\s*\{\s*$/.test(l)) market = ''
  if (!cur) continue
  if ((m = l.match(/\.setId\((?:People\.)?([A-Z0-9_]+)\)/))) cur.id = consts[m[1]] || ''
  if ((m = l.match(/\.setId\("([^"]+)"\)/))) cur.id = m[1]
  if ((m = l.match(/\.setFaction\(Factions\.([A-Z0-9_]+)\)/))) cur.faction = fac[m[1]] || m[1]
  if ((m = l.match(/\.setFaction\("([^"]+)"\)/))) cur.faction = m[1]
  if ((m = l.match(/getName\(\)\.setFirst\("([^"]*)"\)/))) cur.first = m[1]
  if ((m = l.match(/getName\(\)\.setLast\("([^"]*)"\)/))) cur.last = m[1]
  if (cur.id && !out[cur.id]) out[cur.id] = cur
}
const res = Object.values(consts).filter(id => id).map(id => {
  const v = out[id]
  return v ? { id, name: (v.first + ' ' + v.last).trim(), faction: v.faction, market: v.market } : { id, name: '', faction: '', market: '' }
})
console.log(JSON.stringify(res, null, 0).replace(/\},\{/g, '},\n{'))
