/**
 * #67 U44 (user, 2026-11-23): the token lookup in the editor. Text fields that take tokens use the
 * `tokenField` action: the last one focused is where the token window's Insert goes, and typing "$"
 * in one opens the autocomplete. The catalog (shared/tokens.ts) is worked out here and sent to the
 * token window (a child window, see main/index.ts) whenever it changes.
 */
import { buildTokens } from '../../../shared/rules/context'
import { NO_CONTEXT, completeTokens, tokenCatalog, tokenContext, type TokenContext, type TokenEntry } from '../../../shared/tokens'
import type { DialogNode } from '../../../shared/model'
import { app } from './app.svelte'
import { project } from './project.svelte'
import { factionLook, lookup, personLook, testCtx } from './testctx.svelte'
import { pushRecent } from '../tokens/recent'

export interface TokenPayload { context: TokenContext; entries: TokenEntry[]; target: string | null; sourceId?: string }
export interface TokenFieldOpts {
  /** The conversation the field belongs to (default: the quest open on the Quests page). */
  quest?: string | null
  /** What the field is, for the token window's "Insert into …". */
  label?: string
}

type Field = HTMLInputElement | HTMLTextAreaElement

class TokenHub {
  /** The last token field focused (Insert goes there). */
  target = $state.raw<{ el: Field; label: string; quest: string | null } | null>(null)
  /** The autocomplete: the field, where the "$…" starts, the choices and the one marked. */
  ac = $state.raw<{ el: Field; start: number; items: TokenEntry[]; index: number } | null>(null)
  /** Screenshot mode: the lookup shown inside the editor (a child window can't be captured). */
  inline = $state(false)
  opened = $state(false)

  /** The conversation for a field: its own quest, else the one open on the Quests page. */
  questId(): string | null {
    return this.target?.quest ?? (app.page === 'quests' ? app.selected.quests ?? null : null)
  }

  payload(): TokenPayload {
    const m = project.m
    if (!m) return { context: NO_CONTEXT, entries: [], target: null }
    const q = m.quests.find((x) => x.id === this.questId()) ?? undefined
    const nodeId = q && app.page === 'quests' ? app.selected.questNode : null
    const node = q?.nodes.find((n) => n.id === nodeId && n.type === 'dialog') as DialogNode | undefined
    const ctx = tokenContext(m, q)
    const values = buildTokens({ ...$state.snapshot(testCtx), person: ctx.personId ?? (ctx.person === 'yes' ? '' : testCtx.person), faction: ctx.faction ?? testCtx.faction }, app.defs, lookup)
    const entries = tokenCatalog({
      m, defs: app.defs, values, ctx, quest: q, node,
      portrait: (id) => personLook(id)?.portrait || undefined,
      crest: (id) => factionLook(id)?.crest || undefined
    })
    return { context: ctx, entries, target: this.target?.label ?? null, sourceId: project.loaded?.sourceId }
  }

  async open(): Promise<void> {
    this.opened = true
    this.publish()
    // screenshot mode can't capture a second window: show the lookup inside the editor
    if (app.smoke) { this.inline = true; return }
    await window.api.openTokenWindow()
  }

  private timer: ReturnType<typeof setTimeout> | null = null
  /** Send the catalog to the token window (debounced; only once it has been opened). */
  publish(): void {
    if (!this.opened) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      try { window.api.tokensPublish(JSON.parse(JSON.stringify(this.payload()))) } catch { /* a model mid-edit: the next change sends it */ }
    }, 150)
  }

  /** Put a token where the cursor is in a field (or replace from..to), and tell the field it changed. */
  insert(token: string, el: Field | null = this.target?.el ?? null, from?: number): boolean {
    if (!el || !el.isConnected) { app.flash(`Click into a text field first, then Insert (${token} is copied instead).`); void navigator.clipboard.writeText(token); return false }
    el.focus()
    const a = from ?? el.selectionStart ?? el.value.length
    const b = el.selectionEnd ?? a
    el.setRangeText(token, a, Math.max(a, b), 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    pushRecent(token)
    return true
  }

  // ---- the "$" autocomplete
  update(el: Field): void {
    const pos = el.selectionStart ?? 0
    const before = el.value.slice(0, pos)
    const m = /\$[\w.]*$/.exec(before)
    if (!m) { if (this.ac?.el === el) this.ac = null; return }
    const items = completeTokens(this.payload().entries, m[0])
    this.ac = items.length ? { el, start: pos - m[0].length, items, index: 0 } : null
  }
  choose(i: number, capital = false): void {
    const ac = this.ac
    if (!ac) return
    const e = ac.items[i]
    this.ac = null
    if (e) this.insert(capital && e.cap ? e.cap : e.token, ac.el, ac.start)
  }
  key(ev: KeyboardEvent): void {
    const ac = this.ac
    if (!ac) return
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      const n = ac.items.length
      this.ac = { ...ac, index: (ac.index + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n }
    } else if (ev.key === 'Enter' || ev.key === 'Tab') {
      ev.preventDefault(); ev.stopPropagation()
      this.choose(ac.index, ev.shiftKey)
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation()
      this.ac = null
    }
  }
}
export const tokenHub = new TokenHub()

// the token window's Insert
if (typeof window !== 'undefined' && window.api?.onTokenInsert) window.api.onTokenInsert((t) => { tokenHub.insert(t) })

/** Svelte action for a text field that takes tokens: Insert target, "$" autocomplete. */
export function tokenField(el: Field, opts: TokenFieldOpts = {}) {
  let o = opts
  const focus = () => { tokenHub.target = { el, label: o.label ?? (el.getAttribute('aria-label') || el.id || 'the text'), quest: o.quest ?? null }; tokenHub.publish() }
  const input = () => tokenHub.update(el)
  const key = (e: Event) => tokenHub.key(e as KeyboardEvent)
  const blur = () => setTimeout(() => { if (tokenHub.ac?.el === el && document.activeElement !== el) tokenHub.ac = null }, 150)
  el.addEventListener('focus', focus)
  el.addEventListener('input', input)
  el.addEventListener('keydown', key)
  el.addEventListener('blur', blur)
  el.setAttribute('data-tokens', '1')
  return {
    update(n: TokenFieldOpts = {}) { o = n },
    destroy() {
      el.removeEventListener('focus', focus); el.removeEventListener('input', input); el.removeEventListener('keydown', key); el.removeEventListener('blur', blur)
      if (tokenHub.target?.el === el) tokenHub.target = null
      if (tokenHub.ac?.el === el) tokenHub.ac = null
    }
  }
}
