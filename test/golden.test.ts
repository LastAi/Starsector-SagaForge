/**
 * Shared golden cases (PLAN.md §8): the same JSON runs here (Play mode's TypeScript copy of
 * SagaLib) and in SagaLib's Java tests (mods/SagaLib/test), so the two can't drift apart.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { compileRule, compileRules, Engine, newContext } from '../src/shared/rules/engine'
import { parseCondition } from '../src/shared/rules/parse'
import { newSimState, sagaHooks, reconcile, checkBountyWaits, modRecord, modGateBlocked, chooseVersions, chosenVersion, versionedId, runtimeNeeds, offerBlocked, missingNeed, checkOwners, checkPresence, awayContact, rewardCredits, fleetPoints, type PresencePerson, type SimWorld, type ModListJson, type VersionedJson, type RuntimeQuestJson, type SimPlaces } from '../src/shared/play'
import { resolveRuntime } from '../src/shared/itemversions'
import type { Phrase, PoolPlan, QuestPlan, Reward, SettingDef } from '../src/shared/model'
import { settingsMemory } from '../src/shared/settings'

// In the workspace: SagaLib's own folder. In the published repo: the copy the export puts in
// test/golden. SAGALIB_DIR points at a SagaLib checkout.
const dir = [
  process.env.SAGALIB_DIR && path.join(process.env.SAGALIB_DIR, 'test', 'golden'),
  path.resolve(__dirname, '..', '..', '..', 'mods', 'SagaLib', 'test', 'golden'),
  path.join(__dirname, 'golden')
].find((d): d is string => !!d && fs.existsSync(d)) ?? ''
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []

interface Step { do?: string; check?: string; is?: unknown; token?: string; reload?: unknown[]; expect?: Record<string, string>; enabled?: string[]; record?: boolean; notices?: string[]; gate?: { modsWith?: string[]; modsWithout?: string[]; modsAny?: string[][] }; owner?: string; newGame?: boolean; choose?: boolean; resolve?: string; on?: string[]; conflicts?: string[]; chosen?: string; world?: { places?: string[]; people?: string[]; owners?: Record<string, string>; factions?: string[]; relations?: Record<string, string> }; presence?: boolean; moves?: string[]; away?: string; needs?: string; offer?: string; missing?: string; day?: boolean; changes?: string[]; settings?: Record<string, string>; credits?: [string, string]; fleetPoints?: string; unset?: string[]; watch?: boolean; fired?: string[] }
interface Golden { name: string; quests: unknown[]; phrases: Phrase[]; steps: Step[] }

describe.skipIf(!files.length)('golden cases (shared with SagaLib)', () => {
  for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Golden
    it(`${f}: ${g.name}`, () => {
      let quests = g.quests as QuestPlan[]
      // pools are in SagaLib's file format: once / cooldownDays / max on the entry
      type RtEntry = { id: string; weight: number; conditions?: string[]; once?: 'playthrough' | 'object'; cooldownDays?: number; max?: number }
      const pools: PoolPlan[] = ((g as { pools?: { id: string; draw?: string; nothing?: number; entries: RtEntry[] }[] }).pools ?? []).map((p) => ({
        id: p.id, name: p.id, draw: 'pickOne', nothing: p.nothing ?? 0,
        entries: p.entries.map((e) => ({ id: e.id, weight: e.weight, conditions: e.conditions ?? [], limit: { once: e.once, cooldownDays: e.cooldownDays, max: e.max } }))
      }))
      // #60 (SagaLib 1.3): the content mods' lists and the mods enabled now
      const gm = g as { modLists?: ModListJson[]; enabled?: string[] }
      const mods = { lists: gm.modLists ?? [], enabled: new Set(gm.enabled ?? []) }
      // #59 (SagaLib 1.3): what MagicLib knows (its bounties and their memory keys)
      const gb = (g as { bounties?: { known?: string[]; memKeys?: Record<string, string> } }).bounties
      const bounties = { known: (id: string) => (gb?.known ?? []).includes(id), memKey: (id: string) => gb?.memKeys?.[id] }
      // #61 (SagaLib 1.3): the sector stand-in (everything exists until a "world" step)
      let sw: { places: Set<string> | null; people: Set<string> | null; owners: Record<string, string>; factions: Set<string> | null; relations: Record<string, string> } = { places: null, people: null, owners: {}, factions: null, relations: {} }
      const places: SimPlaces = { place: (id) => !sw.places || sw.places.has(id) || id in sw.owners, person: (id) => !sw.people || sw.people.has(id), owner: (id) => sw.owners[id] ?? null,
        // #70: relations both ways, unset = Neutral; a faction not in the list does not exist
        relation: (a, b) => (sw.factions && (!sw.factions.has(a) || !sw.factions.has(b)) ? null : sw.relations[`${a}|${b}`] ?? sw.relations[`${b}|${a}`] ?? "NEUTRAL") }
      // #70 (SagaLib 1.3): people in their file format (presence rules)
      const people = ((g as { people?: PresencePerson[] }).people ?? [])
      // #62 (SagaLib 1.3): the mod's LunaSettings.csv rows (as loadCSV gives them) and the encounters' fleets
      const gs = (g as { settings?: { mod: string; rows: Record<string, string>[] } }).settings
      const settingDefs: SettingDef[] = (gs?.rows ?? []).filter((r) => (r.fieldID ?? '') !== '').map((r) => ({ id: r.fieldID, label: r.fieldName ?? '', type: r.fieldType as SettingDef['type'], default: r.fieldDefaultValue ?? r.defaultValue ?? '', choices: (r.secondaryValue ?? '').split(',').map((x) => x.trim()).filter(Boolean) }))
      const encounters = (g as { encounters?: SimWorld['encounters'] }).encounters ?? []
      const world: SimWorld = { quests, phrases: new Map(g.phrases.map((p) => [p.token, p])), pools, mods, bounties, places, settings: settingDefs, encounters }
      const rq = (id: string) => (quests as unknown as RuntimeQuestJson[]).find((q) => q.id === id)!
      const ctx = newContext()
      ctx.player.credits = 0
      const e = new Engine(compileRules([]), ctx, sagaHooks(world, newSimState()))
      // #64 (SagaLib 1.3): versioned items in their file format
      const versioned = ((g as { versioned?: VersionedJson[] }).versioned ?? [])
      const item = (ref: string) => versioned.find((v) => `${v.kind}:${versionedId(v)}` === ref)!
      g.steps.forEach((s, i) => {
        const at = `${f} step ${i + 1}`
        if (s.newGame) ctx.memory = new Map()
        if (s.resolve) {
          const r = resolveRuntime(item(s.resolve).item, s.on ?? [])
          expect(r.value, `${at}: resolved`).toEqual(s.is)
          expect(r.conflicts, `${at}: conflicts`).toEqual(s.conflicts ?? [])
          expect(r.errors, `${at}: errors`).toEqual([])
        }
        if (s.do) e.runScript(compileRule({ id: `golden_${i}`, trigger: 't', conditions: '', script: s.do, text: '', options: '', notes: '', sourceId: 'g', file: f, line: i }))
        if (s.enabled) mods.enabled = new Set(s.enabled)
        if (s.record) { const fresh = modRecord(e, mods).filter((n) => n.fresh).map((n) => n.notice); if (s.notices) expect(fresh, `${at}: notices`).toEqual(s.notices) }
        if (s.gate) expect(modGateBlocked(e, mods, s.owner ?? null, s.gate) === null, `${at}: gate`).toBe(s.is)
        if (s.choose) chooseVersions(e, mods, versioned)
        if (s.chosen) expect(chosenVersion(e, item(s.chosen)), `${at}: chosen`).toEqual(s.is)
        if (s.world) sw = { places: new Set(s.world.places ?? []), people: new Set(s.world.people ?? []), owners: { ...(s.world.owners ?? {}) }, factions: s.world.factions ? new Set(s.world.factions) : null, relations: { ...(s.world.relations ?? {}) } }
        if (s.needs) expect(runtimeNeeds(rq(s.needs)), `${at}: needs`).toEqual(s.is)
        if (s.offer) {
          expect(offerBlocked(e, world, rq(s.offer)) === null, `${at}: offer ${s.offer}`).toBe(s.is)
          if (s.missing) expect(missingNeed(places, rq(s.offer)), `${at}: missing`).toBe(s.missing)
          if (s.away) expect(awayContact(e, rq(s.offer)), `${at}: away`).toBe(s.away)
        }
        if (s.day) {
          const got: string[] = []
          for (const q of quests as unknown as RuntimeQuestJson[]) { const c = checkOwners(e, places, q); if (c) got.push(`${q.id}:${c.market}->${c.owner}:${c.do}${c.stage && c.do === 'stage' ? `:${c.stage}` : ''}${c.trigger && c.do === 'stage' ? `:${c.trigger}` : ''}`) }
          if (s.changes) expect(got, `${at}: owner changes`).toEqual(s.changes)
        }
        // SagaLib 1.3: the campaign script's check of Wait nodes on a MagicLib bounty's end
        if (s.watch) {
          const got = (quests as unknown as RuntimeQuestJson[]).flatMap((q) => checkBountyWaits(e, world, q, s.owner ?? null))
          if (s.fired) expect(got, `${at}: fired`).toEqual(s.fired)
        }
        if (s.presence) {
          const got = checkPresence(e, people, places).map((m) => `${m.person}:${m.away ? "leaves" : "back"}:${m.owner}`)
          if (s.moves) expect(got, `${at}: presence moves`).toEqual(s.moves)
        }
        if (s.check) expect(e.evalCondition(parseCondition(s.check)), at).toBe(s.is)
        if (s.token) expect(e.subst(s.token), at).toBe(s.is)
        if (s.reload) {
          quests = s.reload as QuestPlan[]
          world.quests = quests
          reconcile({ get: (k) => e.get(k), set: (k, v) => e.set(k, v) }, (g.quests as QuestPlan[]).map((q) => q.id), quests)
        }
        // #62: a game load (or a LunaLib menu change): every value field, the player's value or the default
        if (s.settings) for (const [k, v] of settingsMemory(settingDefs, s.settings)) e.set(k, v)
        if (s.credits) { const r = (quests as unknown as RuntimeQuestJson[] as unknown as { id: string; rewards: Reward[] }[]).find((q) => q.id === s.credits![0])?.rewards.find((x) => x.id === s.credits![1]); expect(r, `${at}: reward`).toBeTruthy(); expect(rewardCredits(e, r!, world), `${at}: credits`).toBe(s.is) }
        if (s.fleetPoints) expect(fleetPoints(e, world, s.fleetPoints), `${at}: fleet points`).toBe(s.is)
        if (s.unset) for (const k of s.unset) expect(e.get(k), `${at}: ${k} unset`).toBeUndefined()
        if (s.expect) for (const [k, v] of Object.entries(s.expect)) {
          const got = k === '@credits' ? ctx.player.credits : e.get(k)
          expect(String(got), `${at}: ${k}`).toBe(v)
        }
      })
    })
  }
})
