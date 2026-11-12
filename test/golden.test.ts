/**
 * Shared golden cases (PLAN.md §8): the same JSON runs here (Play mode's TypeScript copy of
 * SagaLib) and in SagaLib's Java tests (mods/SagaLib/test), so the two can't drift apart.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { compileRule, compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { parseCondition } from '../src/shared/rules/parse'
import { newSimState, sagaHooks, reconcile, type SimWorld } from '../src/shared/play'
import type { Phrase, QuestPlan } from '../src/shared/model'

// In the workspace: SagaLib's own folder. In the published repo: the copy the export puts in
// test/golden. SAGALIB_DIR points at a SagaLib checkout.
const dir = [
  process.env.SAGALIB_DIR && path.join(process.env.SAGALIB_DIR, 'test', 'golden'),
  path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'test', 'golden'),
  path.join(__dirname, 'golden')
].find((d): d is string => !!d && fs.existsSync(d)) ?? ''
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []

interface Step { do?: string; check?: string; is?: unknown; token?: string; reload?: unknown[]; expect?: Record<string, string> }
interface Golden { name: string; quests: unknown[]; phrases: Phrase[]; steps: Step[] }

describe.skipIf(!files.length)('golden cases (shared with SagaLib)', () => {
  for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Golden
    it(`${f}: ${g.name}`, () => {
      let quests = g.quests as QuestPlan[]
      const world: SimWorld = { quests, phrases: new Map(g.phrases.map((p) => [p.token, p])) }
      const ctx = newContext()
      ctx.player.credits = 0
      const e = new Engine(compileRules([]), ctx, sagaHooks(world, newSimState()))
      g.steps.forEach((s, i) => {
        const at = `${f} step ${i + 1}`
        if (s.do) e.runScript(compileRule({ id: `golden_${i}`, trigger: 't', conditions: '', script: s.do, text: '', options: '', notes: '', sourceId: 'g', file: f, line: i }))
        if (s.check) expect(e.evalCondition(parseCondition(s.check)), at).toBe(s.is)
        if (s.token) expect(e.subst(s.token), at).toBe(s.is)
        if (s.reload) {
          quests = s.reload as QuestPlan[]
          world.quests = quests
          reconcile({ get: (k) => e.get(k), set: (k, v) => e.set(k, v) }, (g.quests as QuestPlan[]).map((q) => q.id), quests)
        }
        if (s.expect) for (const [k, v] of Object.entries(s.expect)) {
          const got = k === '@credits' ? ctx.player.credits : e.get(k)
          expect(String(got), `${at}: ${k}`).toBe(v)
        }
      })
    })
  }
})
