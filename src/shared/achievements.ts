/**
 * #65 (PLAN.md §10, "MagicLib achievements"): the mod's MagicLib achievements (Saga › Achievements),
 * exported as rows of data/config/magic_achievements.csv in an owned block (hand-written rows stay).
 * MagicLib reads the file for every enabled mod (FORMATS.md "MagicLib 1.5.6 achievements"); the
 * generic MagicAchievement class does for achievements code completes, and quests complete them with
 * SF_Achievement through SagaLib's MagicLib bridge. Pure.
 */
import type { ModModel } from './serialize'
import type { AchievementDef, QuestPlan } from './model'
import { parseCsvRecords } from './csvedit'
import { findBlocks } from './export/blocks'

export const MAGICLIB_ID = 'MagicLib'
export const MAGIC_ACHIEVEMENTS_CSV = 'data/config/magic_achievements.csv'
/** MagicLib's column order; `tooltip` must be a column (MagicLib reads it with getString, a missing one skips the row). */
export const MAGIC_ACHIEVEMENTS_HEADER = ['id', 'name', 'description', 'tooltip', 'script', 'image', 'spoilerLevel', 'rarity']
/** MagicLib's generic class: an achievement completed by code (Nexerelin's quest achievements use it too). */
export const GENERIC_ACHIEVEMENT = 'org.magiclib.achievements.MagicAchievement'

export function achievementRow(a: AchievementDef): Record<string, string> {
  return { id: a.id, name: a.name, description: a.description, tooltip: a.tooltip ?? '', script: GENERIC_ACHIEVEMENT, image: a.image ?? '', spoilerLevel: a.spoiler, rarity: a.rarity }
}

/** The achievements a quest unlocks: End nodes, "Unlock a MagicLib achievement" and SF_Achievement script lines. */
export function achievementsOf(q: QuestPlan): { id: string; node: string }[] {
  const out: { id: string; node: string }[] = []
  const line = (l: string, node: string) => { const mm = /^\s*SF_Achievement\s+(\S+)/.exec(l); if (mm) out.push({ id: mm[1], node }) }
  for (const n of q.nodes) {
    if (n.type === 'end' && n.achievement) out.push({ id: n.achievement, node: n.id })
    if (n.type === 'action') for (const o of n.ops) { if (o.op === 'achievement' && o.achievement) out.push({ id: o.achievement, node: n.id }); else if (o.op === 'line') line(o.line, n.id) }
    if (n.type === 'dialog') for (const l of n.script) line(l, n.id)
  }
  return out
}

/** The mod has achievements, or its quests unlock some (SagaLib 1.3's SF_Achievement). */
export function usesAchievements(m: Pick<ModModel, 'project' | 'quests'>): boolean {
  return !!m.project.achievements?.length || m.quests.some((q) => achievementsOf(q).length > 0 || q.nodes.some((n) => n.type === 'action' && n.ops.some((o) => o.op === 'achievement')))
}

/** Rows of the mod's magic_achievements.csv outside Saga Forge's block (written by hand): their ids. */
export function handAchievementIds(text: string | undefined): string[] {
  if (!text) return []
  let kept = text
  for (const b of [...findBlocks(text)].sort((x, y) => y.start - x.start)) kept = kept.slice(0, b.start) + kept.slice(b.end)
  const recs = parseCsvRecords(kept).map((r) => r.fields)
  const head = recs.findIndex((f) => f.some((x) => x.trim()))
  if (head < 0) return []
  const col = recs[head].map((x) => x.trim()).indexOf('id')
  if (col < 0) return []
  return recs.slice(head + 1).map((f) => (f[col] ?? '').trim()).filter((id) => id && !id.startsWith('#'))
}

/** #65: the settings.json "graphics" category of the mod's images other mods draw ("<prefix>images"). */
export const preloadCategory = (prefix: string): string => `${prefix || 'sagaforge_'}images`

/**
 * #65: images only another mod draws, which it doesn't load itself: achievement images (MagicLib's
 * list) and quest chain images (Nexerelin's new-game screen); key → path. Vanilla's own images
 * ("graphics/icons/…" of the game) are listed too: loading one twice does no harm.
 */
export function preloadImages(m: Pick<ModModel, 'project'>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of m.project.achievements ?? []) if (a.id && a.image?.trim()) out[a.id] = a.image.trim()
  for (const c of m.project.questSkip ?? []) if (c.id && c.image?.trim() && c.quests.length) out[c.id] = c.image.trim()
  return out
}
