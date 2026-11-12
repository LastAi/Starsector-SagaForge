// Build installers with electron-builder, keeping every download and temp file inside the
// workspace's .cache folder (next to this tool's folder in D:\ModTools, or the repo root).
//   node scripts/dist.mjs win     -> dist/*-setup.exe, dist/*-portable.exe, dist/win-unpacked
//   node scripts/dist.mjs linux   -> dist/*.AppImage, dist/*.tar.gz (best built on Linux)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceCache = path.resolve(root, '..', '..', '.cache')
const cache = fs.existsSync(workspaceCache) ? workspaceCache : path.join(root, '.cache')
const target = process.argv[2] ?? (process.platform === 'win32' ? 'win' : 'linux')
if (!['win', 'linux'].includes(target)) {
  console.error('Usage: node scripts/dist.mjs win|linux')
  process.exit(2)
}
const tmp = path.join(cache, 'tmp')
fs.mkdirSync(tmp, { recursive: true })
const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE ?? path.join(cache, 'electron-builder'),
  electron_config_cache: process.env.electron_config_cache ?? path.join(cache, 'electron'),
  npm_config_cache: process.env.npm_config_cache ?? path.join(cache, 'npm'),
  TEMP: tmp,
  TMP: tmp,
  TMPDIR: tmp,
  // no code signing certificate: build unsigned
  CSC_IDENTITY_AUTO_DISCOVERY: 'false'
}
const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
const r = spawnSync(bin, [`--${target}`, '--publish', 'never'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
