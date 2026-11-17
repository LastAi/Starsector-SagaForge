/** Compare version strings like "1.0.0", "1.10.2", "0.98a-RC8" (numeric parts numerically). */
export function cmpVersionStrings(a: string, b: string): number {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? ''
    const nx = Number(x), ny = Number(y)
    const c = x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y)
    if (c) return c
  }
  return 0
}

/**
 * A Starsector version string → its parts: "0.98.5a-RC5" → { nums: [0, 98, 5], rc: 5 }. The letter
 * ("a" for alpha) is dropped; a missing RC is null. Null if it doesn't look like a game version.
 */
export function parseGameVersion(v: string | null | undefined): { nums: number[]; rc: number | null } | null {
  const m = /^\s*(?:Starsector\s+)?(\d+(?:\.\d+)*)[a-z]?(?:-RC(\d+))?\s*$/i.exec(v ?? '')
  if (!m) return null
  return { nums: m[1].split('.').map(Number), rc: m[2] == null ? null : Number(m[2]) }
}

/**
 * Compare two Starsector versions, release first, then RC ("0.98a-RC8" < "0.98.5a-RC5" <
 * "0.98.5a-RC6"). Missing parts count as 0; a version without an RC ranks as the release itself
 * (equal to any of its RCs, so "0.98.5a" works as a minimum). Unparseable versions sort first.
 */
export function cmpGameVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseGameVersion(a), pb = parseGameVersion(b)
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0)
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const c = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (c) return c
  }
  return pa.rc == null || pb.rc == null ? 0 : pa.rc - pb.rc
}

/** The release a version belongs to, without its RC: "0.98.5a-RC5" → "0.98.5a" (#47: compare by family). */
export function versionFamily(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/^Starsector\s+/i, '').replace(/-RC\d+$/i, '')
}

/** Same release (ignoring RC and hotfix builds). */
export const sameFamily = (a: string | null | undefined, b: string | null | undefined): boolean => !!versionFamily(a) && versionFamily(a) === versionFamily(b)

/**
 * The two installs of #47 by age: which is older and which newer (the slot doesn't decide), or
 * null when there aren't two with known versions.
 */
export function installAges(main: string | null | undefined, migration: string | null | undefined): { older: 'main' | 'migration'; newer: 'main' | 'migration' } | null {
  if (!parseGameVersion(main) || !parseGameVersion(migration)) return null
  return cmpGameVersions(main, migration) <= 0 ? { older: 'main', newer: 'migration' } : { older: 'migration', newer: 'main' }
}

/** True if `v` is the game version `min` or later (see cmpGameVersions). */
export const gameVersionAtLeast = (v: string | null | undefined, min: string): boolean => !!parseGameVersion(v) && cmpGameVersions(v, min) >= 0
