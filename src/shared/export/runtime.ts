/**
 * Runtime JSON for SagaLib (PLAN.md §3.1 "What it reads"; format documented in
 * mods/SagaLib/docs/FORMAT.md). Every file has "format": 1 and a "_sagaforge" header with a hash,
 * so a hand edit is noticed. Editor-only data (positions, notes) is left out.
 */
import type { ModModel } from '../serialize'
import type { ProjectState } from '../project'
import type { CompiledQuest } from './questrules'
import { prereqConditions } from './questrules'
import { blockHash } from './blocks'
import type { QuestPlan } from '../model'

export const RUNTIME_FORMAT = 1
export const SAGA_QUEST_CLASS = 'lastai.sagalib.quest.SagaQuest'
export const CONTENT_CSV = 'data/config/sagaforge/content.csv'

export interface RuntimeFile { path: string; text: string; summary: string; type: string; id: string }

function stamp(obj: Record<string, unknown>): string {
  const body = JSON.stringify(obj, null, 2)
  const hash = blockHash(body)
  return JSON.stringify({ _sagaforge: { generated: 'by Saga Forge; edits are overwritten on export', hash }, ...obj }, null, 2) + '\n'
}

/** A quest's runtime definition: what SagaLib needs to run it as a HubMission. */
export function questRuntime(q: QuestPlan, c: CompiledQuest): Record<string, unknown> {
  const timers = q.nodes.filter((n) => n.type === 'wait' && n.mode === 'days').map((n) => ({ node: n.id, trigger: `${q.id}_${n.id}`, days: (n as { days?: number }).days ?? 0 }))
  const encounters = q.nodes.filter((n) => n.type === 'encounter').map((n) => ({ node: n.id, encounter: (n as { encounter: string }).encounter, defeated: `${q.id}_${n.id}_defeated`, avoided: `${q.id}_${n.id}_avoided` }))
  const markers = q.nodes.filter((n) => n.type === 'wait' && n.mode === 'arrive').map((n) => (n as { entity?: string }).entity).filter(Boolean)
  return {
    format: RUNTIME_FORMAT,
    id: q.id,
    title: q.title,
    kind: q.kind,
    icon: q.icon || 'graphics/icons/missions/data_retrieval.png',
    repeatable: q.repeatable,
    timeLimitDays: q.timeLimitDays ?? 0,
    start: q.start,
    requires: prereqConditions(q),
    stages: q.stages.map((s) => ({ id: s.id, title: s.title, journal: s.journal, nextStep: s.nextStep ?? '', marker: s.marker ?? '', kind: s.kind, renamedFrom: s.renamedFrom })),
    variables: q.variables.filter((v) => v.type !== 'target').map((v) => ({ name: v.name, type: v.type, initial: v.initial })),
    // reserved for random targets (PLAN.md §4.4, §11.2): always empty in format 1
    targets: [],
    rewards: q.rewards,
    timers,
    encounters,
    arrivals: markers,
    phrases: q.nodes.flatMap((n) => (n.type === 'dialog' ? n.phrases : [])),
    flags: c.generatedFlags.filter((f) => f.scope === 'ever').map((f) => f.key)
  }
}

export function runtimeFiles(m: ModModel, loaded: ProjectState, compiled: Record<string, CompiledQuest>): RuntimeFile[] {
  const out: RuntimeFile[] = []
  const mod = loaded.modInfo.id
  for (const q of m.quests) {
    if (q.kind !== 'quest' && !q.nodes.some((n) => n.type === 'dialog' && n.phrases.length)) continue
    out.push({ path: `data/sagaforge/quests/${q.id}.json`, text: stamp(questRuntime(q, compiled[q.id])), summary: `quest "${q.title}" for SagaLib`, type: 'quest', id: q.id })
  }
  if (m.people.length || m.phrases.length) {
    out.push({
      path: `data/sagaforge/people/${mod}_people.json`, type: 'people', id: `${mod}_people`,
      text: stamp({ format: RUNTIME_FORMAT, people: m.people.map(({ notes: _n, ...p }) => p), phrases: m.phrases }),
      summary: `${m.people.length} ${m.people.length === 1 ? 'person' : 'people'}, ${m.phrases.length} mod-wide phrase${m.phrases.length === 1 ? '' : 's'}`
    })
  }
  if (Object.keys(m.factionsRuntime.relations).length || Object.keys(m.factionsRuntime.scripted).length) {
    out.push({ path: 'data/sagaforge/factions.json', type: 'factions', id: `${mod}_factions`, text: stamp({ format: RUNTIME_FORMAT, ...m.factionsRuntime }), summary: 'starting relations and scripted faction changes' })
  }
  for (const s of m.systems) out.push({ path: `data/sagaforge/systems/${s.id}.json`, type: 'system', id: s.id, text: stamp({ ...(stripNotes(s) as unknown as Record<string, unknown>), format: RUNTIME_FORMAT }), summary: `system "${s.name}"` })
  for (const e of m.encounters) out.push({ path: `data/sagaforge/encounters/${e.id}.json`, type: 'encounter', id: e.id, text: stamp({ ...(stripNotes(e) as unknown as Record<string, unknown>), format: RUNTIME_FORMAT }), summary: `encounter "${e.name}"` })
  if (m.testProfiles.length) out.push({ path: 'data/sagaforge/dev/test_profiles.json', type: 'profiles', id: `${mod}_profiles`, text: stamp({ format: RUNTIME_FORMAT, profiles: m.testProfiles }), summary: `${m.testProfiles.length} test profile${m.testProfiles.length === 1 ? '' : 's'} (dev mode only)` })

  // content.csv: SagaLib's merged index of every Saga Forge mod's files
  const eol = loaded.files[CONTENT_CSV]?.text.includes('\r\n') ? '\r\n' : '\n'
  const rows = out.map((f) => `${f.id},${f.type},${f.path},${mod}`)
  out.push({ path: CONTENT_CSV, type: 'index', id: 'content', text: ['id,type,path,mod', ...rows].join(eol) + eol, summary: `index of ${rows.length} SagaLib file${rows.length === 1 ? '' : 's'}` })

  // person_missions.csv / bar_events.csv: how vanilla offers the quests
  const contact = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'contact')
  const bar = m.quests.filter((q) => q.kind === 'quest' && q.start.kind === 'bar')
  out.push(...missionCsv(loaded, contact, bar))
  return out
}

function stripNotes<T extends object>(o: T): T {
  const c = JSON.parse(JSON.stringify(o)) as Record<string, unknown>
  delete c.notes
  return c as T
}

import { writeBlock, csvLine } from './blocks'
import { parseCsvRecords } from '../csvedit'

const PM_HEADER = ['mission id', 'person id', 'tagsAll', 'tagsAny', 'tagsNotAny', 'tags', 'freq', 'min timeout', 'max timeout', 'min rep', 'max rep', 'importance', 'reqMissionAny', 'reqMissionAll', 'reqMissionNone', 'icon', 'plugin']
const BAR_HEADER = ['bar event id', 'tags', 'freq', 'prob', 'min dur', 'max dur', 'min timeout', 'max timeout', 'min accepted timeout', 'max accepted timeout', 'plugin']

function missionCsv(loaded: ProjectState, contact: QuestPlan[], bar: QuestPlan[]): RuntimeFile[] {
  const out: RuntimeFile[] = []
  const one = (path: string, header: string[], rows: Record<string, string>[], type: string) => {
    const old = loaded.files[path]?.text
    if (!rows.length && !old) return
    const eol = old?.includes('\r\n') ? '\r\n' : '\n'
    const base = old ?? header.join(',') + eol
    const recs = parseCsvRecords(base)
    const h = recs.find((r) => r.fields.some((f) => f.trim()))?.fields.map((x) => x.trim()) ?? header
    const r = writeBlock(base, 'quests', rows.map((row) => csvLine(h.map((c) => row[c] ?? ''))), h.length, { eol, force: true })
    out.push({ path, text: r.text, summary: `${rows.length} quest row${rows.length === 1 ? '' : 's'} in an owned block`, type, id: type })
  }
  one('data/campaign/person_missions.csv', PM_HEADER, contact.map((q) => {
    const s = q.start as Extract<QuestPlan['start'], { kind: 'contact' }>
    const reqAll = q.requires.filter((r) => 'quest' in r && r.ended !== 'fail').map((r) => (r as { quest: string }).quest).join(', ')
    return { 'mission id': q.id, 'person id': s.person, freq: String(s.freq), 'min timeout': '30', 'max timeout': '60', 'min rep': s.minRep ?? '', 'max rep': s.maxRep ?? '', importance: s.importance ?? '', reqMissionAll: reqAll, icon: q.icon || 'graphics/icons/missions/data_retrieval.png', plugin: SAGA_QUEST_CLASS, tags: s.tags ?? '' }
  }), 'person_missions')
  one('data/campaign/bar_events.csv', BAR_HEADER, bar.map((q) => {
    const s = q.start as Extract<QuestPlan['start'], { kind: 'bar' }>
    return { 'bar event id': q.id, tags: s.tags ?? '', freq: String(s.freq), prob: String(s.prob), 'min dur': '30', 'max dur': '40', 'min timeout': '15', 'max timeout': '20', 'min accepted timeout': '60', 'max accepted timeout': '90', plugin: SAGA_QUEST_CLASS }
  }), 'bar_events')
  return out
}
