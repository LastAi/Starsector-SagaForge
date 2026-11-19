/**
 * Phase 7 test mods (mods\seven_a, seven_b, ...): one small mod per step with its in-game test
 * content near a "test range" and a dev-mode test profile that takes the player there (SagaLib 1.2
 * startAt from the Ctrl+F9 dev menu). Built by scripts/build-test-mod.ts with the same save and
 * export code the app uses, like the example mod.
 */
import { planExport } from '../../src/shared/export'
import { modelToWrites, type ModModel } from '../../src/shared/serialize'
import { hashText } from '../../src/main/install'
import { newQuest } from '../../src/shared/quest'
import type { ProjectState } from '../../src/shared/project'
import type { BranchCase, BranchNode, DialogNode, QEdge, QNode, QuestPlan } from '../../src/shared/model'

export const TEST_GAME = '0.98.5a-RC5'

export interface TestModDef {
  id: string
  name: string
  prefix: string
  version: string
  description: string
  model(): ModModel
  /** Hand-written files the editor would not make (a test of something outside Saga Forge), path → text. */
  extraFiles?: Record<string, string>
  /** mod_info.json dependencies written by hand (a translation mod needs the mod it translates). */
  dependencies?: { id: string; name: string; version?: string }[]
  /** The game version it is for (default TEST_GAME); #60's test mod needs the 0.98a install, where the other mods are. */
  gameVersion?: string
  /** Index entries the export needs to know (#60: another mod's faction, for the automatic "Only with"). */
  indexStub?: Record<string, unknown>
  /** Warnings the mod has on purpose (#27: a criterion MagicLib can't use, to show its note). */
  expectedWarnings?: RegExp[]
}

function modInfoText(d: TestModDef): string {
  return `{\n\t"id": "${d.id}",\n\t"name": "${d.name}",\n\t"author": "LastAi",\n\t"version": "${d.version}",\n\t"description": "${d.description}",\n\t"gameVersion": "${d.gameVersion ?? TEST_GAME}",\n${d.dependencies ? `\t"dependencies": ${JSON.stringify(d.dependencies)},\n` : ''}}\n`
}

export function testModState(d: TestModDef, m: ModModel, files: Record<string, string>): ProjectState {
  return {
    sourceId: d.id, modDir: '/x', isNew: false,
    modInfo: { id: d.id, name: d.name, version: d.version, gameVersion: d.gameVersion ?? TEST_GAME, dependencies: [] },
    project: m.project, quests: [], people: [], items: [], systems: [], encounters: [], phrases: [], testProfiles: [], factionsRuntime: { relations: {}, scripted: {} },
    descriptions: {}, factions: [], releases: [],
    files: Object.fromEntries(Object.entries(files).map(([p, t]) => [p, { text: t, hash: hashText(t) }])), errors: []
  }
}

/** Every file of a test mod: plan files and the export (with the SagaLib dependency). */
export function testModFiles(d: TestModDef): Record<string, string> {
  const m = d.model()
  m.project.target = d.gameVersion ?? TEST_GAME
  const base: Record<string, string> = { 'mod_info.json': modInfoText(d) }
  const saved = { ...base }
  for (const w of modelToWrites(m, testModState(d, m, base))) if (!w.remove) saved[w.path] = w.text
  const plan = planExport(m, testModState(d, m, saved), { factions: [], items: [], people: [], markets: [], sources: [], ...(d.indexStub ?? {}) } as never, null, { addDependency: true, addRequired: true })
  const errors = plan.problems.filter((p) => p.level === 'error')
  if (errors.length) throw new Error(`${d.id}: export errors: ${errors.map((p) => p.message).join('; ')}`)
  const out = { ...saved, ...(d.extraFiles ?? {}) }
  for (const w of plan.writes) { if (w.remove) delete out[w.path]; else out[w.path] = w.text }
  return out
}

// ---------------------------------------------------------------- helpers for test conversations

/** A dialog node with plain options. */
export function dlg(id: string, x: number, y: number, text: string, options: { id: string; text: string; shortcut?: string }[], title = ''): DialogNode {
  return { id, type: 'dialog', x, y, title, visual: { kind: 'keep' }, displays: [], highlights: [], conditions: [], script: [], phrases: [], text, options }
}

/**
 * A test conversation: an option in a place's menu ("Test 7a-1: ...") that opens an intro with
 * "Roll"/"Leave", a Random branch, and one result dialog per case (and "nothing") with "Roll
 * again" and "Leave". Leave goes back to the place's menu.
 */
export function rollConversation(o: {
  id: string; title: string; at: string; optionText: string; intro: string
  cases: BranchCase[]; random: NonNullable<BranchNode['random']>; resultText: (label: string) => string
}): QuestPlan {
  const q = newQuest(o.id, o.title, 'dialog')
  q.start = { kind: 'option', trigger: 'PopulateOptions', conditions: [`$id == ${o.at}`], optionText: o.optionText }
  const offer = q.nodes.find((n) => n.id === 'offer') as DialogNode
  offer.title = o.title
  offer.text = o.intro
  offer.options = [{ id: 'roll', text: 'Roll' }, { id: 'leave', text: 'Leave', shortcut: 'ESC' }]
  const nodes: QNode[] = [
    { id: 'roll', type: 'branch', x: 520, y: 40, title: 'Roll', cases: o.cases, random: o.random },
    { id: 'menu', type: 'link', x: 1100, y: 40, mode: 'menu', target: '' }
  ]
  const edges: QEdge[] = [{ id: 'e_roll', from: 'offer', handle: 'roll', to: 'roll' }, { id: 'e_leave', from: 'offer', handle: 'leave', to: 'menu' }]
  const results = [...o.cases.map((c) => ({ handle: c.id, label: c.label })), { handle: 'else', label: 'Nothing' }]
  results.forEach((r, i) => {
    const id = `r_${r.handle}`
    nodes.push(dlg(id, 800, i * 140, o.resultText(r.label), [{ id: `again_${r.handle}`, text: 'Roll again' }, { id: `leave_${r.handle}`, text: 'Leave', shortcut: 'ESC' }], r.label))
    edges.push({ id: `e_${id}`, from: 'roll', handle: r.handle, to: id }, { id: `e_again_${r.handle}`, from: id, handle: `again_${r.handle}`, to: 'roll' }, { id: `e_leave_${r.handle}`, from: id, handle: `leave_${r.handle}`, to: 'menu' })
  })
  q.nodes.push(...nodes)
  q.edges.push(...edges)
  return q
}
