/** #67 U44: recently used tokens (shared by the editor and the token window: same page origin). */
const KEY = 'sf.tokens.recent'
const MAX = 12

export function recentTokens(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}

export function pushRecent(token: string): void {
  // the capitalised form counts as its token
  const list = [token, ...recentTokens().filter((t) => t.toLowerCase() !== token.toLowerCase())].slice(0, MAX)
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full or blocked: no recent list */ }
}
