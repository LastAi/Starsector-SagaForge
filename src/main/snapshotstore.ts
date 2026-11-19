/**
 * Task #64: the imported sector snapshot, kept in Saga Forge's data folder per Starsector install
 * (the game's own file in saves/common is only read, never changed).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { SectorSnapshot } from '../shared/api'
import { parseSnapshot, SNAPSHOT_FILE } from '../shared/snapshot'

export interface StoredSnapshot { data: SectorSnapshot; file: string; imported: string }

const keyOf = (installRoot: string) => installRoot.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'install'
const storeFile = (userData: string, installRoot: string) => path.join(userData, 'snapshots', `${keyOf(installRoot)}.json`)

/** Where SagaLib's dev menu writes it: <game>/saves/common/sagaforge_snapshot.json(.data). */
export function defaultSnapshotFile(installRoot: string): string | null {
  for (const name of [`${SNAPSHOT_FILE}.data`, SNAPSHOT_FILE]) {
    const f = path.join(installRoot, 'saves', 'common', name)
    if (fs.existsSync(f)) return f
  }
  return null
}

export function loadStoredSnapshot(userData: string, installRoot: string): StoredSnapshot | null {
  try {
    const v = JSON.parse(fs.readFileSync(storeFile(userData, installRoot), 'utf8')) as StoredSnapshot
    return v?.data ? v : null
  } catch {
    return null
  }
}

/** Reads a snapshot (default: the game's) and keeps a copy for this install. */
export function importSnapshot(userData: string, installRoot: string, file?: string | null): StoredSnapshot {
  const from = file || defaultSnapshotFile(installRoot)
  if (!from) throw new Error(`No sector snapshot found in ${path.join(installRoot, 'saves', 'common')}. In game (dev mode), open SagaLib's dev menu (Ctrl+F9) and pick "Write sector snapshot".`)
  const data = parseSnapshot(fs.readFileSync(from, 'utf8'))
  const stored: StoredSnapshot = { data, file: from, imported: new Date().toISOString() }
  const out = storeFile(userData, installRoot)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(stored))
  return stored
}

export function clearSnapshot(userData: string, installRoot: string): void {
  try { fs.rmSync(storeFile(userData, installRoot)) } catch { /* none */ }
}
