/** Items › Plugin (INGAME-CHECKS R13): the game's classes, a short name, and a class typed by hand. */
import { describe, expect, it } from 'vitest'
import { itemProblems } from '../src/shared/checks/items'
import { ITEM_PLUGINS, pluginInfo, VANILLA_PLUGIN_PACKAGE } from '../src/shared/itemplugins'
import { newItem, GENERIC_SPECIAL_PLUGIN } from '../src/shared/export/items'
import { emptyModel } from '../src/shared/serialize'
import { defsFor } from '../src/shared/defs'
import type { CheckContext } from '../src/shared/checks'

const ctx = (plugin: string) => {
  const m = emptyModel('t_')
  const it = newItem('t_box', 'Box', 'rare_valuable', defsFor('0.98a'))
  it.description = 'x'
  it.icon = 'graphics/icons/cargo/chip1.png'
  it.special = { rarity: 0, plugin }
  m.items.push(it)
  return { model: m, index: { items: [] }, loaded: { sourceId: 't' } } as unknown as CheckContext
}
const pluginProblems = (plugin: string) => itemProblems(ctx(plugin)).filter((p) => p.message.includes('plugin'))

describe('item plugin classes (R13)', () => {
  it('lists the 13 classes vanilla 0.98a uses, the generic one among them', () => {
    expect(ITEM_PLUGINS).toHaveLength(13)
    expect(ITEM_PLUGINS.every((x) => x.id.startsWith(`${VANILLA_PLUGIN_PACKAGE}.`) && x.summary && x.params)).toBe(true)
    expect(pluginInfo(GENERIC_SPECIAL_PLUGIN)?.name).toBe('GenericSpecialItemPlugin')
  })

  it('a game class is fine, a short name is an error, a class of your own a warning', () => {
    expect(pluginProblems(GENERIC_SPECIAL_PLUGIN)).toEqual([])
    const short = pluginProblems('MultiBlueprintItemPlugin')
    expect(short.map((p) => p.level)).toEqual(['error'])
    expect(short[0].message).toContain(`${VANILLA_PLUGIN_PACKAGE}.MultiBlueprintItemPlugin`)
    expect(pluginProblems('my.mod.items.CatCharmPlugin').map((p) => p.level)).toEqual(['warning'])
    expect(itemProblems(ctx('')).some((p) => p.level === 'error' && p.message.includes('needs a plugin'))).toBe(true)
  })
})
