/**
 * Task #64 (PLAN.md §10.6): which version of each item the editors show (the versions strip), the
 * item as it looks in that version, and edits routed into that version's fields.
 */
import { comboKey, comboOf, editInVersion, resolveItem, subsets, type Versioned } from '../../../shared/itemversions'
import { findVersionable, type VKind } from '../../../shared/modelversions'
import type { ModModel } from '../../../shared/serialize'
import { project } from './project.svelte'
import { mods } from './mods.svelte'

/** Layout fields (a node's place on the chart) always change the base, whatever version is open. */
const LAYOUT = /^nodes\[[^\]]+\]\.(x|y|w|h)$/

class ItemVersionState {
  /** "kind:id" → the open cell's key ("base", "mod1", "mod1+mod2"). */
  open = $state<Record<string, string>>({})

  /** The optional mods' combinations (2 mods → Base, Mod1, Mod2, both), at most 4 mods. */
  cells(): string[][] {
    return subsets(mods.optional().map((x) => x.id), 4)
  }

  /** The mods of the open cell (empty = base); a cell whose mods are no longer optional falls back to base. */
  combo(kind: VKind, id: string | null | undefined): string[] {
    if (!id) return []
    const k = this.open[`${kind}:${id}`]
    if (!k || k === 'base') return []
    const opt = new Set(mods.optional().map((x) => x.id))
    const c = comboOf(k)
    return c.every((x) => opt.has(x)) ? c : []
  }

  select(kind: VKind, id: string, mods: string[]): void {
    this.open = { ...this.open, [`${kind}:${id}`]: comboKey(mods) }
  }

  /** The item as it is in the open version (the item itself for Base). */
  view<T extends Versioned>(kind: VKind, id: string | null | undefined, item: T | null | undefined): T | null {
    if (!item || !id) return item ?? null
    const c = this.combo(kind, id)
    if (!c.length) return item
    return resolveItem(item, c).value
  }

  /**
   * Runs an edit of an item through the undo history: on Base it changes the item; in a version,
   * every field it changes becomes that version's value (the chart's layout stays on the base).
   */
  edit<T extends Versioned>(kind: VKind, id: string, fn: (x: T, m: ModModel) => void, baseOnly?: (path: string) => boolean): void {
    const c = this.combo(kind, id)
    project.change((m) => {
      const item = findVersionable(m, kind, id) as T | null
      if (!item) return
      if (!c.length) { fn(item, m); return }
      editInVersion(item, c, (x) => fn(x, m), (p) => LAYOUT.test(p) || !!baseOnly?.(p))
    })
  }
}

export const itemVer = new ItemVersionState()

/**
 * #64: sets a description's text (descriptions.csv; key "<TYPE>:<id>") in the open version, keeping
 * its versions; an empty base text removes it (with its versions).
 */
export function setDescription(key: string, text: string): void {
  const c = itemVer.combo('description', key)
  if (c.length && project.m?.descriptions[key]) { itemVer.edit<{ text1: string } & Versioned>('description', key, (d) => { d.text1 = text }); return }
  project.change((mm) => {
    const d = mm.descriptions[key]
    if (!text.trim()) { delete mm.descriptions[key]; return }
    if (d) d.text1 = text
    else mm.descriptions[key] = { text1: text }
  })
}

/** The description's text in the open version. */
export function descriptionText(key: string): string {
  const d = project.m?.descriptions[key]
  return itemVer.view('description', key, d ?? null)?.text1 ?? ''
}
