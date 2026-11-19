const fs = require('fs')
const s = fs.readFileSync(process.argv[2], 'utf8')
const c = {}
for (const m of s.matchAll(/\$[\w.:]+ +([^\w\s$"'#]{1,3}) /g)) c[m[1]] = (c[m[1]] || 0) + 1
console.log(c)
console.log('neg', (s.match(/(^|\n|")\s*!\s*\$/g) || []).length, 'negcmd', (s.match(/(^|\n|")\s*!\s*[A-Z]/g) || []).length, 'not', (s.match(/\bnot\s+\$/g) || []).length)
