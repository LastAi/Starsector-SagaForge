/**
 * #60 (audit, cause 1): the pickers' option builders keep each index entry's definedBy, so IdInput
 * shows only vanilla, the mod and its listed mods and offers "Add as optional / required" for the rest.
 */
import { describe, expect, it } from 'vitest'
import { dropGroupChoices } from '../src/shared/pools'
import { techChoices } from '../src/shared/research'
import { isVisible, visibleSources } from '../src/shared/modlist'
import type { ModModel } from '../src/shared/serialize'

describe('picker options keep their source', () => {
  it('drop groups: vanilla when vanilla has rows, else the first row\'s mod; the mod\'s own tables have none', () => {
    const index = {
      dropGroups: [
        { group: 'ai_cores1', item: 'gamma_core', definedBy: 'starsector-core' }, { group: 'ai_cores1', item: 'alpha_core', definedBy: 'other_mod' },
        { group: 'mod_group', item: 'metals', definedBy: 'other_mod' }, { group: 'mod_group', item: 'food', definedBy: 'third_mod' }
      ]
    }
    const ch = dropGroupChoices([{ id: 'my_loot', name: 'Mine', draw: 'pickOne', use: 'loot', entries: [] }], index)
    expect(ch.map((c) => [c.id, c.definedBy])).toEqual([['my_loot', undefined], ['ai_cores1', 'starsector-core'], ['mod_group', 'other_mod']])
    const visible = visibleSources({ mods: [] }, 'my_mod')
    expect(ch.filter((c) => isVisible(c.definedBy, visible)).map((c) => c.id)).toEqual(['my_loot', 'ai_cores1'])
  })
  it('techs: the installed mods\' keep definedBy, the mod\'s own have none', () => {
    const m = { research: { techs: [{ id: 'my_tech', name: 'Mine', tier: 1 }], factions: {} } } as unknown as Pick<ModModel, 'research'>
    const index = { researchTechs: [{ id: 'aotd_tech_a', name: 'A', modId: 'aotd_vok', definedBy: 'aotd_vok', tier: 1 }, { id: 'x_tech', name: 'X', modId: 'x', definedBy: 'x_mod', tier: 2 }] }
    const c = techChoices(m, index)
    expect(c.map((x) => [x.id, x.definedBy])).toEqual([['my_tech', undefined], ['aotd_tech_a', 'aotd_vok'], ['x_tech', 'x_mod']])
    const visible = visibleSources({ mods: [{ id: 'aotd_vok', name: 'VoK', use: 'optional' }] }, 'my_mod')
    expect(c.filter((x) => isVisible(x.definedBy, visible)).map((x) => x.id)).toEqual(['my_tech', 'aotd_tech_a'])
  })
})
