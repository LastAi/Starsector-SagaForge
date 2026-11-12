// Copied from Ship Editor (src/main/datadir.ts); may drift, see docs/PLAN.md §2.
/**
 * Where the app keeps its settings, definition files and Chromium cache.
 *
 *  - From source: tools/saga-forge/.userdata (SF_USERDATA may pick a folder inside it, for tests).
 *  - Packaged: portable. A "data" folder next to the program, so the whole app can live in one
 *    folder (or on a USB stick) and be moved or deleted as a unit:
 *      zip / tar.gz:        <folder with the exe>/data
 *      single-file .exe:    <folder the .exe is in>/data      (PORTABLE_EXECUTABLE_DIR)
 *      AppImage:            <folder the .AppImage is in>/data (APPIMAGE)
 *    SF_USERDATA overrides it. If the folder can't be written (e.g. the program sits in
 *    Program Files), the OS profile folder is used instead (returns null).
 */
import fs from 'node:fs'
import path from 'node:path'

export interface DataDirInput {
  isPackaged: boolean
  appPath: string
  execPath: string
  env: Record<string, string | undefined>
}

export function programDir(i: DataDirInput): string {
  if (i.env.PORTABLE_EXECUTABLE_DIR) return path.resolve(i.env.PORTABLE_EXECUTABLE_DIR)
  if (i.env.APPIMAGE) return path.dirname(path.resolve(i.env.APPIMAGE))
  return path.dirname(i.execPath)
}

function writable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, '')
    fs.rmSync(probe)
    return true
  } catch {
    return false
  }
}

/** The data folder to use, or null for Electron's default (the OS profile folder). */
export function resolveDataDir(i: DataDirInput, canWrite: (dir: string) => boolean = writable): string | null {
  const override = i.env.SF_USERDATA ? path.resolve(i.env.SF_USERDATA) : null
  if (!i.isPackaged) {
    const base = path.join(i.appPath, '.userdata')
    const rel = override ? path.relative(base, override) : ''
    return override && rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? override : base
  }
  if (override) return override
  const dir = path.join(programDir(i), 'data')
  return canWrite(dir) ? dir : null
}
