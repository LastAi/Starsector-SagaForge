// Builds src/shared/defs/0.98.5a.json: a definitions PATCH on top of 0.98a.json (merged by
// src/shared/defs/index.ts, mergeDefs). Inputs: starfarer.api.zip of both versions, unzipped
// (<api-old> = 0.98a, <api-new> = 0.98.5a), and the 0.98.5a game data (read only). The new
// commands' forms and summaries are written by hand below, from the 0.98.5a sources.
// Usage (from tools/saga-forge):
//   node scripts/build-defs-0985a.cjs <api-old> <api-new> <0.98.5a starsector-core> src/shared/defs/0.98a.json src/shared/defs/0.98.5a.json
const fs = require('fs'), path = require('path')
const [OLD, NEW, CORE, DEFS, OUT] = process.argv.slice(2)
const defs = JSON.parse(fs.readFileSync(DEFS, 'utf8'))
const IDS = 'com/fs/starfarer/api/impl/campaign/ids'
const RCP = 'com.fs.starfarer.api.impl.campaign.rulecmd.'
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// ---------- multi-purpose commands: new actions in the "action" enum ----------
function actions(src) {
  const set = new Set()
  for (const m of src.matchAll(/\b(?:command|action)\.equals\("([^"]+)"\)/g)) set.add(m[1])
  for (const m of src.matchAll(/"([^"]+)"\.equals\((?:command|action)\)/g)) set.add(m[1])
  for (const m of src.matchAll(/case\s+"([^"]+)"\s*:/g)) set.add(m[1])
  return [...set]
}
const ruleCommands = []
for (const c of defs.ruleCommands) {
  if (c.provider !== 'vanilla') continue
  const rel = c.className.replace(/\./g, '/') + '.java'
  const sa = read(OLD, rel), sb = read(NEW, rel)
  if (sa === sb) continue
  const oa = actions(sa), na = actions(sb)
  const add = na.filter((x) => !oa.includes(x)), rem = oa.filter((x) => !na.includes(x))
  if (!add.length && !rem.length) continue
  if (!c.forms.flat().some((p) => p.type === 'enum' && p.name === 'action')) continue
  const forms = c.forms.map((f) => f.map((p) => (p.type === 'enum' && p.name === 'action' ? { ...p, values: p.values.filter((v) => !rem.includes(v)).concat(add) } : p)))
  ruleCommands.push({ name: c.name, forms })
}

// ---------- changed parameters (read from the 0.98.5a sources by hand) ----------
const P = (name, type, extra = {}) => ({ name, type, ...extra })
const repForms = [[P('faction', 'faction'), P('level', 'repLevel')], [P('person', 'person'), P('level', 'repLevel')], [P('level', 'repLevel')]]
ruleCommands.push(
  { name: 'RepIsAtWorst', forms: repForms, summary: 'True if the player\'s standing is at least the level: with a faction, or (0.98.5a) with a person id, or with one argument the active person (else the entity\'s faction).' },
  { name: 'RepIsAtBest', forms: repForms, summary: 'True if the player\'s standing is at most the level: with a faction, or (0.98.5a) with a person id, or with one argument the active person (else the entity\'s faction).' },
  { name: 'RepGTE', forms: repForms, summary: 'Same as RepIsAtWorst (a subclass): standing at least the level.' },
  { name: 'RepLTE', forms: repForms, summary: 'Same as RepIsAtBest (a subclass): standing at most the level.' },
  { name: 'SetPersonHidden', forms: [[P('person', 'person'), P('hidden', 'bool')], [P('hidden', 'bool')]], summary: 'Hides or shows a person in their market\'s comm directory; with only the true/false argument (0.98.5a), the active person.' },
  { name: 'MovePersonToMarket', forms: [[P('person', 'person'), P('market', 'market', { optional: true }), P('forceAddToComms', 'bool', { optional: true })]], summary: 'Moves a person to a market (default: current); 0.98.5a: a third argument true also lists them in the comm directory.' },
)

// ---------- new commands ----------
const cmd = (name, use, display, forms, summary, pkg = '') => ({ name, use, className: RCP + pkg + name, provider: 'vanilla', forms, display, summary })
for (const n of ['FinishVisualFadeFast', 'HasContactFromFaction', 'MarketHasIndustry', 'PersonCMD', 'PersonIsDefaultMarketPost', 'SDR_CMD', 'ShowPlayerPerson']) {
  if (!fs.existsSync(path.join(NEW, 'com/fs/starfarer/api/impl/campaign/rulecmd', n + '.java'))) throw new Error('missing class ' + n)
}
const sdrActions = actions(read(NEW, 'com/fs/starfarer/api/impl/campaign/rulecmd/SDR_CMD.java'))
ruleCommands.push(
  cmd('PersonCMD', 'both', 'none', [[P('action', 'enum', { values: ['makeImportant', 'makeUnimportant'] }), P('person', 'person', { optional: true }), P('reason', 'string', { optional: true })], [P('action', 'enum', { values: ['isContact'] }), P('person', 'person', { optional: true })]],
    'Marks a person important or unimportant (the quest-giver marker; the reason defaults to "generic"), or (isContact) true if the person is a contact. Without a person id: the active person. With two or more arguments the second one is always read as a person id.'),
  cmd('HasContactFromFaction', 'condition', 'none', [[P('faction', 'faction'), P('vipBlacklist', 'bool', { optional: true })]],
    'True if the player has an active contact from the faction. vipBlacklist true ignores major story characters (Reynard Hannan, Horus Yaribay, Arroyo, Faro Inesis, Rao, Glamor Rotanev).'),
  cmd('MarketHasIndustry', 'condition', 'none', [[P('industry', 'string', { rest: true })]],
    'True if the interaction target\'s market has any of the listed industries (ids from industries.csv).'),
  cmd('PersonIsDefaultMarketPost', 'condition', 'none', [[P('person', 'person', { optional: true })]],
    'True if the person (default: active person) holds a standard market post: administrator, supply officer, base or station commander, portmaster.'),
  cmd('ShowPlayerPerson', 'script', 'visual', [[]], 'Shows the player character in the visual panel.'),
  cmd('FinishVisualFadeFast', 'script', 'visual', [[]], 'Ends a running fade of the visual panel at once.'),
  cmd('SellToFleet', 'both', 'options', [[P('action', 'enum', { values: ['willBuyStuff', 'selectStuff'] })]],
    'Selling salvage to a fleet that buys it (scavengers): willBuyStuff = true if the fleet will buy, selectStuff = open the selection.', 'salvage.'),
  cmd('SDR_CMD', 'both', 'text', [[P('action', 'enum', { values: sdrActions }), P('args', 'any', { rest: true })]],
    'Sindrian Diktat storyline helper (multi-purpose; vanilla story only).'),
)

// ---------- ranks and posts (ids/Ranks.java), as build.js reads them ----------
const consts = (root, file) => [...read(root, `${IDS}/${file}`).split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')
  .matchAll(/public static (?:final )?String ([A-Z0-9_]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]])
const readable = (s) => s.toLowerCase().split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
const ranks = [], posts = []
const haveR = new Set(defs.ranks.map((r) => r.id)), haveP = new Set(defs.posts.map((r) => r.id))
const RN = { artificialIntelligence: 'Artificial Intelligence' }
for (const [k, v] of consts(NEW, 'Ranks.java')) {
  if (!v) continue
  if (k.startsWith('POST_')) { if (!haveP.has(v)) { haveP.add(v); posts.push({ id: v, name: readable(k.slice(5)) }) } }
  else if (!haveR.has(v)) { haveR.add(v); ranks.push({ id: v, name: RN[v] ?? readable(k.replace(/^(SPACE|GROUND)_/, '')) }) }
}

// ---------- other id lists: report changes so they can be added by hand ----------
for (const f of ['Voices.java', 'Personalities.java', 'FleetTypes.java']) {
  const a = new Set(consts(OLD, f).map((x) => x[1])), b = consts(NEW, f).map((x) => x[1])
  const add = b.filter((x) => !a.has(x))
  if (add.length) console.log(`NOTE ${f}: new ${add.join(', ')} (not added)`)
}

// ---------- code people (ids/People.java + where vanilla creates them) ----------
const codePeople = [
  { id: 'bellamy_kanta', name: 'Bellamy Kanta', faction: 'persean', market: 'salamanca' },
  { id: 'ko_jove', name: 'K-O Jove', faction: 'pirates', market: 'qaras' },
  { id: 'faro_inesis', name: 'Faro Inesis', faction: 'tritachyon', market: 'tibicena' },
  { id: 'gallu_blanc', name: 'Gallu Blanc', faction: 'independent', market: 'nomios' },
  // created by the Seven Sons mission (missions/askonia/SDSevenSons), not at game start
  { id: 'achilles_andrada', name: 'Achilles Kalian', faction: 'persean', market: 'yesod' },
  { id: 'hector_andrada', name: 'Hector Palatin', faction: 'independent', market: 'sindria' },
  { id: 'hercules_andrada', name: 'Hercules Cyrino', faction: 'independent' },
  { id: 'benoit', name: 'Erdene Benoit', faction: 'independent' },
  { id: 'lott', name: 'Marcellus Lott', faction: 'independent' },
  { id: 'maeus_moroz', name: 'Maeus Moroz', faction: 'independent', market: 'orthrus' },
  { id: 'crasis', name: 'Crasis', faction: 'independent' },
  { id: 'aureolin', name: 'Aureolin', faction: 'independent' },
]
const peopleIds = new Set(consts(NEW, 'People.java').map((x) => x[1]))
const known = new Set(defs.codePeople.map((p) => p.id))
for (const p of codePeople) if (!peopleIds.has(p.id)) throw new Error('not in People.java: ' + p.id)
for (const id of peopleIds) if (!known.has(id) && !codePeople.some((p) => p.id === id) && id !== 'izel_hannan') console.log('NOTE person not covered: ' + id)

// ---------- triggers: content triggers in the 0.98.5a rule files that 0.98a didn't have ----------
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
const settings = read(CORE, 'data/config/settings.json')
const ruleFiles = [...(/"rules"\s*:\s*\[([^\]]*)\]/.exec(settings)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
const T = {}
const TK = new Set()
for (const rf of ruleFiles) {
  const rows = parseCsv(read(CORE, rf))
  const h = rows[0].map((x) => x.trim())
  const ix = (n) => h.indexOf(n)
  for (const r of rows.slice(1)) {
    const id = (r[ix('id')] || '').trim()
    if (!id || id.startsWith('#')) continue
    const t = (r[ix('trigger')] || '').trim()
    if (/^[A-Za-z_]\w*$/.test(t)) T[t] = (T[t] || 0) + 1
    for (const col of ['text', 'options']) for (const m of (r[ix(col)] || '').matchAll(/\$[A-Za-z][\w.]*/g)) TK.add(m[0].replace(/\.$/, ''))
  }
}
const haveT = new Set(defs.triggers.map((t) => t.name))
const triggers = Object.entries(T).filter(([t]) => !haveT.has(t)).sort((a, b) => a[0].localeCompare(b[0]))
  .map(([t, n]) => ({ name: t, summary: `Content trigger fired from other rules with FireBest/FireAll (${n} vanilla rule${n > 1 ? 's' : ''}).` }))

// ---------- tokens ----------
const tk = (token, group, sample, summary) => ({ token, summary, sample, group })
const tokens = [
  tk('$PersonFirstName', 'person', 'Baikal', 'Active person\'s first name (case variant of $personFirstName, new in 0.98.5a; hub missions also store it in memory).'),
  tk('$PersonLastName', 'person', 'Daud', 'Active person\'s last name (case variant of $personLastName, new in 0.98.5a; hub missions also store it in memory).'),
]
const tokSrc = read(NEW, 'com/fs/starfarer/api/impl/campaign/CoreRuleTokenReplacementGeneratorImpl.java')
for (const t of tokens) if (!tokSrc.includes(`"${t.token}"`)) throw new Error('token not in CoreRuleTokenReplacementGeneratorImpl: ' + t.token)

// ---------- faction keys (player.faction portraits for the new-game picker) ----------
const factionKeys = [
  { key: 'portraits', type: 'object', summary: 'Portrait lists (standard_male, standard_female). On the player faction, 0.98.5a adds player_male / player_female: the new-game portrait picker.', group: 'Names & ranks' },
]

const patch = {
  gameVersion: '0.98.5a-RC5',
  extends: defs.gameVersion,
  _about: 'Changes from 0.98a to 0.98.5a, merged onto 0.98a.json. Built by scripts/build-defs-0985a.cjs from the 0.98.5a API sources and game data; see docs/GAME-0.98.5a-ASSESSMENT.md (R3).',
  ruleCommands, triggers, tokens, ranks, posts, codePeople, factionKeys,
}
fs.writeFileSync(OUT, JSON.stringify(patch, null, 1) + '\n')
console.log(`commands ${ruleCommands.length}, triggers +${triggers.length}, ranks +${ranks.length} (${ranks.map((r) => r.id)}), posts +${posts.length} (${posts.map((r) => r.id)}), people +${codePeople.length}`)
