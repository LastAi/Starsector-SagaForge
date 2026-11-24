/**
 * Builds a test mod (Phase 7, 8, tasks #27, #60, #61-#65, #67, #70, #75, #77, #79, #80) (test/fixtures/phase7/<name>.ts) into D:\ModTools\mods\<name> with the
 * same save + export code and write guard the app uses. Run: npx jiti scripts/build-test-mod.ts
 * seven_a [<mods folder>]. Never writes outside the mods folder.
 */
import fs from 'node:fs'
import path from 'node:path'
import { testModFiles, type TestModDef } from '../test/fixtures/testmod'
import { writeFiles } from '../src/main/modproject'
import { hashText } from '../src/main/install'
import { SEVEN_A } from '../test/fixtures/phase7/seven_a'
import { SEVEN_B } from '../test/fixtures/phase7/seven_b'
import { SEVEN_C } from '../test/fixtures/phase7/seven_c'
import { SEVEN_D } from '../test/fixtures/phase7/seven_d'
import { SEVEN_E } from '../test/fixtures/phase7/seven_e'
import { GRID_TEST } from '../test/fixtures/gridtest'
import { DROP_MERGE_TEST } from '../test/fixtures/dropmerge'
import { EIGHT_A, EIGHT_A_TWIN } from '../test/fixtures/phase8/eight_a'
import { EIGHT_C, EIGHT_C_XX } from '../test/fixtures/phase8/eight_c'
import { EIGHT_D } from '../test/fixtures/phase8/eight_d'
import { SIXTY_A } from '../test/fixtures/sixty'
import { SIXTYFOUR_A, SIXTYFOUR_B } from '../test/fixtures/sixtyfour'
import { TWENTYSEVEN_A } from '../test/fixtures/twentyseven'
import { SIXTYONE_A } from '../test/fixtures/sixtyone'
import { SEVENTY_A } from '../test/fixtures/seventy'
import { SIXTYTWO_A } from '../test/fixtures/sixtytwo'
import { SIXTYTHREE_A } from '../test/fixtures/sixtythree'
import { SIXTYFIVE_A } from '../test/fixtures/sixtyfive'
import { SEVENTYFIVE_A } from '../test/fixtures/seventyfive'
import { SEVENTYSEVEN_A } from '../test/fixtures/seventyseven'
import { SEVENTYNINE_A } from '../test/fixtures/seventynine'
import { EIGHTY_A } from '../test/fixtures/eighty'
import { SCRATCH67 } from '../test/fixtures/scratch67'

const MODS: Record<string, TestModDef> = { seven_a: SEVEN_A, seven_b: SEVEN_B, seven_c: SEVEN_C, seven_d: SEVEN_D, seven_e: SEVEN_E, grid_test: GRID_TEST, drop_merge_test: DROP_MERGE_TEST, eight_a: EIGHT_A, eight_a_twin: EIGHT_A_TWIN, eight_c: EIGHT_C, eight_c_xx: EIGHT_C_XX, eight_d: EIGHT_D, sixty_a: SIXTY_A, sixtyfour_a: SIXTYFOUR_A, sixtyfour_b: SIXTYFOUR_B, twentyseven_a: TWENTYSEVEN_A, sixtyone_a: SIXTYONE_A, seventy_a: SEVENTY_A, sixtytwo_a: SIXTYTWO_A, sixtythree_a: SIXTYTHREE_A, sixtyfive_a: SIXTYFIVE_A, seventyfive_a: SEVENTYFIVE_A, seventyseven_a: SEVENTYSEVEN_A, seventynine_a: SEVENTYNINE_A, eighty_a: EIGHTY_A, EditorScratchpadMod: SCRATCH67 }

async function main() {
  const name = process.argv[2]
  const def = MODS[name]
  if (!def) throw new Error(`usage: build-test-mod.ts <${Object.keys(MODS).join('|')}> [<mods folder>]`)
  const modsRoot = path.resolve(process.argv[3] ?? path.join(__dirname, '..', '..', '..', 'mods'))
  const modDir = path.join(modsRoot, def.id)
  const rules = { modsRoot, gameRoot: process.env.STARSECTOR_DIR ?? 'D:/Starsector', gameMods: false }
  const files = testModFiles(def)
  const writes = Object.entries(files).map(([p, text]) => {
    const abs = path.join(modDir, ...p.split('/'))
    const old = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
    return { path: p, text, expectedHash: old == null ? null : hashText(old) }
  })
  // throwaway test mods, rebuilt from code: no backups (they would end up in git)
  const r = await writeFiles(modDir, { writes, backup: false }, rules)
  if (r.conflicts.length) throw new Error(`conflicts: ${r.conflicts.join(', ')}`)
  console.log(`wrote ${r.written.length} files into ${modDir}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
