// Prints a compact digest of each rule command class: extends + param reads.
const fs = require('fs'), path = require('path')
const root = process.argv[2]
const out = []
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.java')) out.push(p)
  }
}
walk(root)
for (const p of out) {
  const src = fs.readFileSync(p, 'utf8')
  const name = path.basename(p, '.java')
  const m = src.match(new RegExp('class\\s+' + name + '\\b[^{]*'))
  const decl = m ? m[0].replace(/\s+/g, ' ').trim() : '?'
  const abs = /abstract\s+class/.test(src)
  const lines = src.split(/\r?\n/)
  const hits = []
  lines.forEach((l) => {
    if (/params\.(get|size)|params\.subList|getString\(|\.getFloat\(|\.getInt\(|\.getBoolean\(|case "|equals\("|command\s*=|action\s*=/.test(l) && !/^\s*\/\//.test(l)) {
      hits.push(l.trim().slice(0, 140))
    }
  })
  console.log('### ' + path.relative(root, p).replace(/\\/g, '/') + ' | ' + decl + (abs ? ' ABSTRACT' : '') + ' | lines=' + lines.length)
  for (const h of hits.slice(0, 25)) console.log('  ' + h)
  if (hits.length > 25) console.log('  ... +' + (hits.length - 25))
}
