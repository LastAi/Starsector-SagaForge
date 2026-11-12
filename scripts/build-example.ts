/**
 * Builds the Vanguard Compact example mod (PLAN.md §1, §8) into D:\ModTools\mods\VanguardCompact
 * (in the published repo: example/VanguardCompact)
 * with the same save + export code and write guard the app uses, plus placeholder art from
 * scripts/make-test-art.mjs (our own). Run: npx jiti scripts/build-example.ts [<mods folder>]
 * It never writes outside the mods folder; existing files are only replaced through the write
 * guard (with backups in sagaforge/backups).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { exampleFiles } from '../test/fixtures/vanguard-files'
import { writeFiles } from '../src/main/modproject'
import { hashText } from '../src/main/install'

// Default target: the published repo's example/ folder when it exists, else the workspace's mods.
const repoExample = path.join(__dirname, '..', 'example')
const modsRoot = path.resolve(process.argv[2] ?? (fs.existsSync(repoExample) ? repoExample : path.join(__dirname, '..', '..', '..', 'mods')))
const modDir = path.join(modsRoot, 'VanguardCompact')
const rules = { modsRoot, gameRoot: process.env.STARSECTOR_DIR ?? 'D:/Starsector', gameMods: false }

async function main() {
  const files = exampleFiles()
  const writes = Object.entries(files).map(([p, text]) => {
    const abs = path.join(modDir, ...p.split('/'))
    const old = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
    return { path: p, text, expectedHash: old == null ? null : hashText(old) }
  })
  const r = await writeFiles(modDir, { writes, backup: true }, rules)
  if (r.conflicts.length) throw new Error(`conflicts: ${r.conflicts.join(', ')}`)
  console.log(`wrote ${r.written.length} files into ${modDir}`)

  // placeholder art (our own), only where the mod has none yet
  const art = path.join(modsRoot, '..', '.cache', 'vgc-art')
  execFileSync(process.execPath, [path.join(__dirname, 'make-test-art.mjs'), art, '#3fa7a0', '#e0d08a'], { stdio: 'ignore' })
  const copies = [
    ['flag.png', 'graphics/factions/vgc_vanguard_flag.png'], ['crest.png', 'graphics/factions/vgc_vanguard_crest.png'],
    ['icon_box.png', 'graphics/icons/cargo/vgc_black_box.png'], ['illustration.png', 'graphics/illustrations/vgc_wreck.png'],
    ['portrait.png', 'graphics/portraits/vgc_reyes.png']
  ].map(([from, to]) => ({ from: path.join(art, from), to }))
  const c = await writeFiles(modDir, { writes: [], backup: false, copies }, rules)
  console.log(`copied ${c.written.length} images`)
}

main().catch((e) => { console.error(e); process.exit(1) })
