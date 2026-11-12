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
