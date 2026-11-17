/** Item and quest icons: defaults that exist in vanilla, and Check mod's missing-file check (task #42). */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { newItem, DEFAULT_SPECIAL_ICON, DEFAULT_COMMODITY_ICON } from '../src/shared/export/items'
import { DEFAULT_QUEST_ICON, questRuntime } from '../src/shared/export/runtime'
import { imagePaths, missingImageProblems } from '../src/shared/checks/items'
import { emptyModel } from '../src/shared/serialize'
import { newQuest } from '../src/shared/quest'
import { defsFor } from '../src/shared/defs'
import type { CheckContext } from '../src/shared/checks'
import type { CompiledQuest } from '../src/shared/export/questrules'
import { realDir } from './realdir'

describe('icons', () => {
  it('gives new items a default icon by kind', () => {
    const defs = defsFor('0.98a')
    const special = defs.itemPresets.find((p) => p.kind === 'special')!
    const commodity = defs.itemPresets.find((p) => p.kind === 'commodity')!
    expect(newItem('x_a', 'A', special.id, defs).icon).toBe(DEFAULT_SPECIAL_ICON)
    expect(newItem('x_b', 'B', commodity.id, defs).icon).toBe(DEFAULT_COMMODITY_ICON)
  })

  it.skipIf(!realDir)('default icons exist in the real game', () => {
    for (const p of [DEFAULT_SPECIAL_ICON, DEFAULT_COMMODITY_ICON, DEFAULT_QUEST_ICON]) {
      expect(fs.existsSync(path.join(realDir!, 'starsector-core', p)), p).toBe(true)
    }
  })

  it('exports the quest icon, or vanilla\'s when none is set', () => {
    const q = newQuest('x_q', 'Q', 'quest')
    const c = { rows: [], generatedFlags: [] } as unknown as CompiledQuest
    expect(questRuntime(q, c).icon).toBe(DEFAULT_QUEST_ICON)
    q.icon = 'graphics/icons/missions/x_q.png'
    expect(questRuntime(q, c).icon).toBe('graphics/icons/missions/x_q.png')
  })

  it('reports item and quest icons whose file is missing (Check mod only)', () => {
    const m = emptyModel('x_')
    const defs = defsFor('0.98a')
    const item = newItem('x_box', 'Box', 'quest_item', defs)
    item.icon = 'graphics/icons/cargo/special_tech.png'
    const ok = newItem('x_ok', 'Ok', 'quest_item', defs)
    const q = newQuest('x_q', 'Quest', 'quest')
    q.icon = 'graphics/icons/missions/x_q.png'
    m.items = [item, ok]
    m.quests = [q]
    expect(imagePaths(m).sort()).toEqual(['graphics/icons/cargo/special_tech.png', 'graphics/icons/missions/x_q.png', DEFAULT_SPECIAL_ICON].sort())
    const ctx = (files: Record<string, boolean> | null) => ({ model: m, files }) as unknown as CheckContext
    expect(missingImageProblems(ctx(null))).toEqual([])
    const p = missingImageProblems(ctx({ 'graphics/icons/cargo/special_tech.png': false, 'graphics/icons/missions/x_q.png': false, [DEFAULT_SPECIAL_ICON]: true }))
    expect(p.map((x) => [x.area, x.ref?.id])).toEqual([['Item', 'x_box'], ['Quest', 'x_q']])
    expect(p.every((x) => x.level === 'error')).toBe(true)
  })
})
