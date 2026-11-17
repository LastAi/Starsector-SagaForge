/**
 * #47 P5 (TARGET-VERSION-ASSESSMENT.md §7): what a mod made for an older game version must change,
 * should check, and could use, once it targets a newer one. Pure: the page shows it, fixes go
 * through the undo history.
 */
import type { GameIndex, Problem, ProblemRef } from './api'
import type { ModModel } from './serialize'
import type { GameDefinitions } from './defs/types'
import type { ModInfo } from './project'
import { diffDefs, type VersionDiff } from './versiondiff'
import { versionProblems } from './versionrefs'
import { cmpGameVersions, sameFamily, versionFamily } from './version'
import { getPath } from './faction'
import { questsSendingTo } from './patterns'

export type MigrationGroup = 'must' | 'check' | 'new'
export interface MigrationItem {
  key: string
  group: MigrationGroup
  title: string
  detail: string
  ref?: ProblemRef
  /** A one-click fix (safe = mechanical, part of "Apply all safe fixes"). */
  fix?: { label: string; action: string; arg?: unknown; safe: boolean }
  /** For Version problems: their own fixes (pick a replacement, remove). */
  problem?: Problem
}

/** True when the mod was made for an older game version than the one targeted. */
export function needsMigration(modGameVersion: string | null | undefined, target: string | null | undefined): boolean {
  return !!modGameVersion && !!target && !sameFamily(modGameVersion, target) && cmpGameVersions(modGameVersion, target) < 0
}

/**
 * With a single install (§7.5) only the two built-in definitions files can be compared; the game
 * data part stays empty (removed ids show through the usual unknown-id checks).
 */
export function defsOnlyDiff(from: GameDefinitions, to: GameDefinitions, fromVersion: string, toVersion: string): VersionDiff {
  return { older: fromVersion, newer: toVersion, ...diffDefs(from, to), hasRules: false }
}

/** Behaviour that changed, shown only when the mod uses the area (§7.3 group 2). Hand-written per release. */
const NOTES: { since: string; key: string; title: string; detail: string; applies: (m: ModModel) => boolean }[] = [
  {
    since: '0.98.5a', key: 'note:commission', title: 'Commission pay changed',
    detail: 'A commission now pays 15,000 + 3,500 per active officer a month (was 20,000 + 5,000 per player level), bounties 500 per frigate-equivalent, and only a tenth of that in Survival Mode. Factions with custom.noBountyForDefeating pay no bounty for them.',
    applies: (m) => m.factions.some((f) => getPath(f.kind === 'addition' ? f.raw : f.patch.set, 'custom.offersCommissions') === true)
  },
  {
    since: '0.98.5a', key: 'note:survival', title: 'Survival Mode changes rewards and wrecks',
    detail: 'In Survival Mode saves, prices and salaries scale, derelicts left to vanilla\'s random condition are in worse shape, and vanilla\'s mission rewards grow with distance. Fixed SagaLib credit rewards are not scaled, so they feel larger there.',
    applies: (m) => m.quests.some((q) => q.rewards.some((r) => (r.credits ?? 0) > 0)) || m.systems.some((s) => s.entities.some((e) => e.kind === 'derelict'))
  },
  {
    since: '0.98.5a', key: 'note:askonia', title: 'Askonia has a new storyline',
    detail: 'Sindria can end the Diktat storyline devastated, and the Sindrian Reformers (diktat_achilles) can take it over: a quest that places people or targets at Askonia\'s markets can find the owner or the market changed mid-save.',
    applies: (m) => m.people.some((p) => p.placement.at === 'market' && /sindria|volturn|cruor|askonia/.test(p.placement.market)) || m.systems.some((s) => s.id === 'askonia') ||
      m.quests.some((q) => q.stages.some((st) => /sindria|volturn|askonia/.test(st.marker ?? '')))
  },
  {
    since: '0.98.5a', key: 'note:patrols', title: 'Ambush fleets and patrols',
    detail: 'IsSoughtByPatrols now skips fleets that ignore other fleets. SagaLib sets that flag on encounter fleets, so an ambush fleet no longer makes the player count as sought by patrols (what quests want).',
    applies: (m) => m.encounters.length > 0
  }
]

export interface MigrationInput {
  model: ModModel
  modInfo: ModInfo
  /** The mod's rules.csv text (hand-written rows are checked against removed vanilla rule ids). */
  rulesText?: string
  handRuleIds: string[]
  diff: VersionDiff
  target: string
  targetDefs: GameDefinitions
  targetIndex: GameIndex
}

export function migrationReport(inp: MigrationInput): MigrationItem[] {
  const { model: m, diff: d, target } = inp
  const fam = versionFamily(target)
  const out: MigrationItem[] = []

  // ---- 1. must change
  for (const p of versionProblems(m, d, true, inp.targetDefs)) out.push({ key: p.key ?? p.message, group: 'must', title: p.message, detail: 'Pick a replacement the new version has, or remove it.', ref: p.ref, problem: p })
  const player = m.factions.find((f) => f.id === 'player')
  if (player && cmpGameVersions(target, '0.98.5a') >= 0) {
    const has = (k: string) => {
      const v = player.kind === 'addition' ? getPath(player.raw, `portraits.${k}`) : player.patch.add[`portraits.${k}`]
      return Array.isArray(v) && v.length > 0
    }
    if (has('standard_male') || has('standard_female')) out.push({
      key: 'must:playerPortraits', group: 'must', title: 'Player portraits are in the old lists',
      detail: `In ${fam} the new-game portrait picker reads player_male / player_female; the portraits this mod adds to standard_male / standard_female no longer show there.`,
      ref: { page: 'factions', id: 'player' }, fix: { label: 'Move them to the new lists', action: 'migPlayerPortraits', safe: true }
    })
  }
  if (!sameFamily(inp.modInfo.gameVersion, target)) out.push({
    key: 'must:gameVersion', group: 'must', title: `mod_info.json says ${inp.modInfo.gameVersion || '(none)'}`,
    detail: `The next Export writes gameVersion ${target}, so the launcher shows the mod for ${fam}.`, ref: { page: 'export' },
    fix: { label: 'Export now…', action: 'migExport', safe: false }
  })
  const sources = new Set(inp.targetIndex.sources.map((s) => s.id))
  for (const dep of inp.modInfo.dependencies) {
    if (sources.has(dep.id)) continue
    out.push({ key: `must:dep:${dep.id}`, group: 'must', title: `Needs ${dep.name ?? dep.id}, not found for ${fam}`, detail: `The mods folder the ${fam} install uses has no mod with id ${dep.id}. Install a version of it for ${fam} before testing.` })
  }
  const removedRules = new Set(d.onlyOlder.rule ?? [])
  for (const id of inp.handRuleIds) if (removedRules.has(id)) out.push({ key: `must:rule:${id}`, group: 'must', title: `Hand-written rule "${id}" replaced a vanilla rule that ${fam} no longer has`, detail: 'It is in the mod\'s rules.csv outside Saga Forge\'s blocks, so the editor leaves it to you: check what the vanilla dialog does now and rewrite the row.' })
  if (!d.hasRules && inp.handRuleIds.length) out.push({ key: 'must:rules-unknown', group: 'must', title: 'Removed vanilla rules can\'t be checked', detail: 'Add the old install as the migration install (Settings) for a full check of the hand-written rules.csv rows.' })

  // ---- 2. check (behaviour notes)
  for (const n of NOTES) {
    if (cmpGameVersions(inp.modInfo.gameVersion, n.since) >= 0 || cmpGameVersions(target, n.since) < 0) continue
    if (n.applies(m)) out.push({ key: n.key, group: 'check', title: n.title, detail: n.detail })
  }
  // a quest wreck: vanilla's derelict roll changed in Survival Mode (only when quests use one)
  for (const s of m.systems) for (const e of s.entities) if (e.kind === 'derelict' && questsSendingTo(m.quests, e.id).length && cmpGameVersions(target, '0.98.5a') >= 0 && cmpGameVersions(inp.modInfo.gameVersion, '0.98.5a') < 0) {
    out.push({ key: `check:wreck:${e.id}`, group: 'check', title: `Quest wreck "${e.name}"`, detail: 'In Survival Mode its condition rolls worse unless it is set explicitly. Play the quest in a Survival save.', ref: { page: 'locations', id: s.id, sub: e.id } })
  }

  // ---- 3. new (never counted as work)
  const NEW: [keyof VersionDiff['onlyNewer'], string][] = [['command', 'rule commands'], ['entityType', 'entity types'], ['music', 'music tracks'], ['portrait', 'portraits'], ['post', 'posts'], ['rank', 'ranks'], ['token', 'tokens'], ['faction', 'factions']]
  for (const [cat, label] of NEW) {
    const ids = d.onlyNewer[cat] ?? []
    if (ids.length) out.push({ key: `new:${cat}`, group: 'new', title: `${ids.length} new ${label}`, detail: ids.slice(0, 12).join(', ') + (ids.length > 12 ? ', …' : '') })
  }
  return out
}

/** Safe fix: move the player faction's added portraits from standard_* to player_* (0.98.5a). */
export function movePlayerPortraits(m: ModModel): number {
  const f = m.factions.find((x) => x.id === 'player')
  if (!f) return 0
  let n = 0
  for (const [from, to] of [['standard_male', 'player_male'], ['standard_female', 'player_female']]) {
    if (f.kind === 'addition') {
      const list = getPath(f.raw, `portraits.${from}`)
      if (!Array.isArray(list) || !list.length) continue
      const dst = (getPath(f.raw, `portraits.${to}`) as unknown[] | undefined) ?? []
      const merged = [...dst, ...list.filter((x) => !dst.includes(x))]
      ;(f.raw.portraits as Record<string, unknown>)[to] = merged
      ;(f.raw.portraits as Record<string, unknown>)[from] = []
      n += list.length
    } else {
      const list = f.patch.add[`portraits.${from}`]
      if (!list?.length) continue
      const dst = f.patch.add[`portraits.${to}`] ?? []
      f.patch.add[`portraits.${to}`] = [...dst, ...list.filter((x) => !dst.includes(x))]
      delete f.patch.add[`portraits.${from}`]
      n += list.length
    }
  }
  return n
}

/** §7.4: the in-game test list for what the migration touched. */
export function migrationTests(items: MigrationItem[], fam: string): string[] {
  const out: string[] = []
  if (items.some((i) => i.key.startsWith('version:'))) out.push(`Play every quest and place where an id was replaced, in ${fam}.`)
  if (items.some((i) => i.key === 'must:playerPortraits')) out.push('Start a new game and check the player portraits in the picker.')
  if (items.some((i) => i.key === 'note:commission')) out.push('Take a commission with the mod\'s faction and check the monthly pay.')
  if (items.some((i) => i.key === 'note:survival' || i.key.startsWith('check:wreck:'))) out.push('Start a Survival Mode game and play a quest with a reward or a wreck.')
  if (items.some((i) => i.key === 'note:askonia')) out.push('Play the quests set in Askonia after the Diktat storyline has moved on.')
  out.push(`Load a save made with the ${fam} version of the mod, and one continued from the old version.`)
  return out
}
