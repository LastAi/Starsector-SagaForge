// Screenshot mode: launches the built app with its own settings folder (.userdata/smoke), points it
// at a Starsector install and a mods workspace, opens a page and writes a PNG, then quits.
//   npm run build && node scripts/smoke.mjs <page>[:<arg>] [--game D:/Starsector] [--ws <dir>] [--mod <dir>] [--out <file>] [--exe <packaged exe>]
// The workspace defaults to a copy-free fixture folder in .userdata/smoke/ws (mods are only read
// unless --mod points at a mod there). Nothing in the game folder is ever written.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const page = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'factions'
const game = opt('game', process.env.STARSECTOR_DIR ?? 'D:/Starsector')
const dataDir = path.join(root, '.userdata', 'smoke')
const ws = path.resolve(opt('ws', path.join(dataDir, 'ws')))
const mod = opt('mod', null)
fs.mkdirSync(ws, { recursive: true })
fs.rmSync(path.join(dataDir, 'config.json'), { force: true })
fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ starsectorDir: game, workspaceDir: ws, activeModDir: mod ? path.resolve(mod) : null }, null, 2))
for (const k of ['sf.page']) void k

const exe = opt('exe', null)
const r = spawnSync(exe ? path.resolve(exe) : electron, exe ? [] : ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SF_USERDATA: dataDir, SF_SMOKE: page }
})
const png = path.join(dataDir, `smoke-${page.replace(/[^\w.-]/g, '_')}.png`)
const out = opt('out', null)
if (out && fs.existsSync(png)) fs.copyFileSync(png, out)
console.log(r.status === 0 ? `smoke ok: ${out ?? png}` : `smoke FAILED (exit ${r.status})`)
process.exit(r.status ?? 1)
