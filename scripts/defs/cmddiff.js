// Compares rule command classes between two extracted API trees: new/removed actions of the
// multi-purpose commands that 0.98a.json lists with an "action" enum.
// Usage: node cmddiff.js <api-old> <api-new> <0.98a.json>
const fs = require('fs'), path = require('path')
const [OLD, NEW, DEFS] = process.argv.slice(2)
const defs = JSON.parse(fs.readFileSync(DEFS, 'utf8'))
function actions(src) {
  const set = new Set()
  for (const m of src.matchAll(/\b(?:command|action)\.equals\("([^"]+)"\)/g)) set.add(m[1])
  for (const m of src.matchAll(/"([^"]+)"\.equals\((?:command|action)\)/g)) set.add(m[1])
  for (const m of src.matchAll(/case\s+"([^"]+)"\s*:/g)) set.add(m[1])
  return [...set]
}
const rel = (cn) => cn.replace(/\./g, '/') + '.java'
for (const c of defs.ruleCommands) {
  if (c.provider !== 'vanilla') continue
  const a = path.join(OLD, rel(c.className)), b = path.join(NEW, rel(c.className))
  if (!fs.existsSync(b)) { console.log('REMOVED', c.name); continue }
  const sa = fs.readFileSync(a, 'utf8'), sb = fs.readFileSync(b, 'utf8')
  if (sa === sb) continue
  const enumP = c.forms.flat().find((p) => p.type === 'enum' && p.name === 'action')
  const oa = actions(sa), na = actions(sb)
  const add = na.filter((x) => !oa.includes(x)), rem = oa.filter((x) => !na.includes(x))
  console.log(`CHANGED ${c.name}${enumP ? ' (action enum)' : ''}${add.length ? ' +' + add.join(',') : ''}${rem.length ? ' -' + rem.join(',') : ''}`)
  if (enumP && (add.length || rem.length)) console.log('  NEWVALUES ' + JSON.stringify(enumP.values.filter((v) => !rem.includes(v)).concat(add)))
}
