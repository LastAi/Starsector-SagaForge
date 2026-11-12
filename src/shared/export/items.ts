/**
 * Items and descriptions → CSV rows (PLAN.md §4.7; docs/FORMATS.md "Items"). Rows only for the
 * mod's own ids (a row with an existing id would replace vanilla's whole row).
 */
import type { Descriptions, ItemDef } from '../model'
import type { GameDefinitions } from '../defs/types'

/** 0.98a headers, used when the mod has no such file yet (the file's own header wins when it exists). */
export const COMMODITIES_HEADER = ['name', 'id', 'demand class', 'base price', 'export value', 'price variability', 'utility', 'origin', 'tags', 'stack size', 'cargo space', 'icon', 'sound id', 'sound id drop', 'order', 'economyTier', 'econUnitOrigUnused', 'econUnit', 'baseRaidDanger', 'eU * base value', 'iconWidthMult', 'plugin', 'desc']
export const SPECIAL_HEADER = ['name', 'id', 'tags', 'tech/manufacturer', 'rarity', 'base price', 'stack size', 'cargo space', 'baseRaidDanger', 'icon', 'sound id', 'sound id drop', 'plugin', 'plugin params', 'desc', 'order']
export const DESCRIPTIONS_HEADER = ['id', 'type', 'text1', 'text2', 'text3', 'text4', 'text5', 'notes']

export const GENERIC_SPECIAL_PLUGIN = 'com.fs.starfarer.api.campaign.impl.items.GenericSpecialItemPlugin'

/** Whether an item id is a commodity or a special item: the mod's own items first, then the game's. */
export function itemKindLookup(items: ItemDef[], indexItems: { id: string; kind: 'commodity' | 'special' }[] = []): (id: string) => 'commodity' | 'special' | undefined {
  return (id) => items.find((i) => i.id === id)?.kind ?? indexItems.find((i) => i.id === id)?.kind
}

/** A new item from a preset (PLAN.md §4.7). */
export function newItem(id: string, name: string, presetId: string, defs: GameDefinitions): ItemDef {
  const preset = defs.itemPresets.find((p) => p.id === presetId) ?? defs.itemPresets[0]
  const kind = preset?.kind ?? 'commodity'
  const cols = { ...(preset?.columns ?? {}) }
  const num = (k: string, d: number) => { const n = Number(cols[k]); delete cols[k]; return Number.isFinite(n) && cols[k] !== '' ? n : d }
  const tags = (cols.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  delete cols.tags
  const item: ItemDef = {
    kind, id, name, icon: kind === 'special' ? 'graphics/icons/cargo/special_tech.png' : 'graphics/icons/cargo/survey_data.png',
    basePrice: num('base price', 0), stackSize: num('stack size', 1000), cargoSpace: num('cargo space', 1), tags, description: '',
    otherColumns: cols, preset: preset?.id
  }
  if (kind === 'special') item.special = { rarity: Number(cols.rarity) || 0, plugin: cols.plugin || GENERIC_SPECIAL_PLUGIN, pluginParams: cols['plugin params'] ?? '' }
  if (kind === 'special') { delete cols.rarity; delete cols.plugin; delete cols['plugin params'] }
  return item
}

/** The CSV row (column → value) of an item. */
export function itemRow(it: ItemDef): Record<string, string> {
  const row: Record<string, string> = { ...it.otherColumns }
  row.name = it.name
  row.id = it.id
  row.icon = it.icon
  row['base price'] = String(it.basePrice)
  row['stack size'] = String(it.stackSize)
  row['cargo space'] = String(it.cargoSpace)
  row.tags = it.tags.join(', ')
  if (it.kind === 'commodity') {
    // a standalone commodity prices itself: demand class = its own id (FORMATS.md, Items)
    if (!row['demand class']) row['demand class'] = it.id
    if (!row['price variability']) row['price variability'] = '0'
    if (!row.order) row.order = '200'
    if (!row['sound id']) row['sound id'] = 'ui_cargo_default'
    if (!row['sound id drop']) row['sound id drop'] = 'ui_cargo_default_drop'
  } else {
    row.rarity = String(it.special?.rarity ?? 0)
    row.plugin = it.special?.plugin || GENERIC_SPECIAL_PLUGIN
    row['plugin params'] = it.special?.pluginParams ?? ''
    if (it.special?.manufacturer) row['tech/manufacturer'] = it.special.manufacturer
    row.desc = it.description
    if (!row.order) row.order = '200'
  }
  return row
}

/** descriptions.csv rows: the mod's descriptions (FACTION, PLANET, CUSTOM, ...) plus commodities' (RESOURCE). */
export function descriptionRows(descriptions: Descriptions, items: ItemDef[]): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  for (const [k, d] of Object.entries(descriptions)) {
    const i = k.indexOf(':')
    const type = k.slice(0, i)
    const id = k.slice(i + 1)
    if (!d.text1?.trim()) continue
    rows.push({ id, type, text1: d.text1, text2: d.text2 ?? '', text3: d.text3 ?? '', notes: d.notes ?? '' })
  }
  for (const it of items) if (it.kind === 'commodity' && it.description.trim()) rows.push({ id: it.id, type: 'RESOURCE', text1: it.description })
  return rows.sort((a, b) => (a.type + a.id).localeCompare(b.type + b.id))
}
