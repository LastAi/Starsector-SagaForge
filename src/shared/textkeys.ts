/**
 * Translation keys and fingerprints (Phase 8c, R31), the same as SagaLib's core/TextKeys.java (the
 * shared cases are SagaLib's test/textkeys.json). Every text of a runtime file has a key: the
 * content id and its path, with ids instead of positions where an array's objects have one
 * (`vgc_lost_convoy/stages[search].journal`). A translation line carries the fingerprint of the
 * original it was made for, so a changed original shows as stale (and falls back to itself in game).
 */

/** FNV-1a (32 bit) over the UTF-16 code units, as 8 lowercase hex digits. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** An array element's segment: its "id", else its "token", else its position. */
function segment(v: unknown, i: number): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    if (typeof o.id === 'string' && o.id) return o.id
    if (typeof o.token === 'string' && o.token) return o.token
  }
  return String(i)
}

/** Every text of a runtime file: key → text (keys starting with "_" are skipped). */
export function textLeaves(contentId: string, json: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (o: unknown, path: string) => {
    if (Array.isArray(o)) {
      o.forEach((v, i) => {
        const p = `${path}[${segment(v, i)}]`
        if (typeof v === 'string') out[p] = v
        else walk(v, p)
      })
    } else if (o && typeof o === 'object') {
      const root = path.endsWith('/')
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k.startsWith('_')) continue
        const p = root ? path + k : `${path}.${k}`
        if (typeof v === 'string') out[p] = v
        else walk(v, p)
      }
    }
  }
  walk(json, `${contentId}/`)
  return out
}

/** The token Saga Forge writes into rules.csv for a rule's text part (SagaLib's TextTokens). */
export const textToken = (rule: string, part: string) => `$sft-${rule}-${part}-`
