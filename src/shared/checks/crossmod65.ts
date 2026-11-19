/**
 * #65 (PLAN.md §10, the deferred cross-mod items): MagicLib achievements (Saga › Achievements, what
 * quests unlock) and Nexerelin's quest skip (Saga › Quest skip). Whether MagicLib or Nexerelin is in
 * the mod's list is checked with the other used mods (checks/mods.ts).
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { ID_PATTERN, prefixProblem } from './index'
import { achievementsOf, handAchievementIds, MAGIC_ACHIEVEMENTS_CSV } from '../achievements'
import { needsInChain, skipEndings, skipPath, SKIP_NAME_MAX, skipEffects } from '../questskip'

export function achievementProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const defs = m.project.achievements ?? []
  const ref = (id: string): Problem['ref'] => ({ page: 'saga', id: 'achievements', sub: id })
  const seen = new Set<string>()
  const hand = new Set(handAchievementIds(ctx.loaded?.files?.[MAGIC_ACHIEVEMENTS_CSV]?.text))
  const unlocked = new Map<string, string[]>()
  for (const q of m.quests) for (const a of achievementsOf(q)) unlocked.set(a.id, [...(unlocked.get(a.id) ?? []), q.title || q.id])
  for (const a of defs) {
    const name = a.name || a.id || '(no name)'
    if (!a.id) { out.push({ level: 'error', area: 'Achievements', message: `Achievement "${name}" has no id.`, ref: ref(a.id), key: `achnoid:${name}` }); continue }
    if (!ID_PATTERN.test(a.id)) out.push({ level: 'error', area: 'Achievements', message: `Achievement id "${a.id}" may only have lowercase letters, digits and _.`, ref: ref(a.id), key: `achidchars:${a.id}` })
    const pp = prefixProblem(m.project.prefix, a.id, 'Achievement', ref(a.id))
    if (pp) out.push({ ...pp, message: `${pp.message} MagicLib keeps every mod's achievements in one list and skips a second one with the same id.` })
    if (seen.has(a.id) || hand.has(a.id)) out.push({ level: 'error', area: 'Achievements', message: `Two achievements have the id "${a.id}"${hand.has(a.id) ? ' (one written by hand in magic_achievements.csv)' : ''}: MagicLib skips the second.`, ref: ref(a.id), key: `achdup:${a.id}` })
    seen.add(a.id)
    if (!a.name.trim()) out.push({ level: 'error', area: 'Achievements', message: `Achievement ${a.id} has no name.`, ref: ref(a.id), key: `achnoname:${a.id}` })
    if (!a.description.trim()) out.push({ level: 'warning', area: 'Achievements', message: `Achievement "${name}" has no description (MagicLib's list shows it under the name; past tense: "Found the lost convoy.").`, ref: ref(a.id), key: `achnodesc:${a.id}` })
    if (!unlocked.has(a.id)) out.push({ level: 'warning', area: 'Achievements', message: `Achievement "${name}" is never unlocked: no quest's End node or "Unlock a MagicLib achievement" names it.`, ref: ref(a.id), key: `achunused:${a.id}` })
  }
  for (const q of m.quests) {
    if (q.inactive) continue
    for (const n of q.nodes) if (n.type === 'action') for (const o of n.ops) if (o.op === 'achievement' && !o.achievement) out.push({ level: 'error', area: 'Quest', message: `${q.title}: "Unlock a MagicLib achievement" in "${n.title || n.id}" has no achievement.`, ref: { page: 'quests', id: q.id, sub: n.id }, key: `achop:${q.id}:${n.id}` })
    for (const a of achievementsOf(q)) {
      if (seen.has(a.id) || hand.has(a.id)) continue
      out.push({ level: 'info', area: 'Quest', message: `${q.title} unlocks the MagicLib achievement "${a.id}", which isn't one of this mod's (Saga › Achievements): it must be in another enabled mod's magic_achievements.csv, or nothing happens.`, ref: { page: 'quests', id: q.id, sub: a.node }, key: `achother:${q.id}:${a.id}` })
    }
  }
  return out
}

export function questSkipProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const chains = m.project.questSkip ?? []
  const ref = (id: string, sub?: string): Problem['ref'] => ({ page: 'saga', id: 'questskip', sub: sub ? `${id}:${sub}` : id })
  const ids = new Set<string>()
  const where = new Map<string, string>()
  for (const c of chains) {
    const cn = c.name || c.id || '(no name)'
    if (!c.id) { out.push({ level: 'error', area: 'Quest skip', message: `Quest chain "${cn}" has no id.`, ref: ref(c.id), key: `skipnoid:${cn}` }); continue }
    if (!ID_PATTERN.test(c.id)) out.push({ level: 'error', area: 'Quest skip', message: `Quest chain id "${c.id}" may only have lowercase letters, digits and _.`, ref: ref(c.id), key: `skipidchars:${c.id}` })
    const pp = prefixProblem(m.project.prefix, c.id, 'Quest chain', ref(c.id))
    if (pp) out.push({ ...pp, message: `${pp.message} Every mod's chains are merged into one questSkip.json by id.` })
    if (ids.has(c.id)) out.push({ level: 'error', area: 'Quest skip', message: `Two quest chains have the id "${c.id}"; the second replaces the first.`, ref: ref(c.id), key: `skipdup:${c.id}` })
    ids.add(c.id)
    if (!c.name.trim()) out.push({ level: 'warning', area: 'Quest skip', message: `Quest chain ${c.id} has no name; the id is shown.`, ref: ref(c.id), key: `skipnoname:${c.id}` })
    if (!c.image.trim()) out.push({ level: 'error', area: 'Quest skip', message: `Quest chain "${cn}" has no image. Nexerelin needs one: without it the chains after it don't load either (its loader stops at the first error).`, ref: ref(c.id), key: `skipnoimage:${c.id}` })
    if (!c.quests.length) out.push({ level: 'warning', area: 'Quest skip', message: `Quest chain "${cn}" has no quests: it isn't exported.`, ref: ref(c.id), key: `skipempty:${c.id}` })
    for (const x of c.quests) {
      const q = m.quests.find((y) => y.id === x.quest)
      const r = ref(c.id, x.quest)
      if (!q) { out.push({ level: 'error', area: 'Quest skip', message: `Quest chain "${cn}": there is no quest "${x.quest}".`, ref: r, key: `skipnoquest:${c.id}:${x.quest}` }); continue }
      const qn = q.title || q.id
      if (where.has(q.id)) out.push({ level: 'error', area: 'Quest skip', message: `"${qn}" is in two quest chains ("${where.get(q.id)}" and "${cn}"): Nexerelin has one entry per quest id.`, ref: r, key: `skiptwice:${q.id}` })
      where.set(q.id, cn)
      if (q.kind !== 'quest') { out.push({ level: 'error', area: 'Quest skip', message: `"${qn}" is a conversation, not a quest: it has no ending to skip to.`, ref: r, key: `skipdialog:${q.id}` }); continue }
      if (q.inactive) out.push({ level: 'warning', area: 'Quest skip', message: `"${qn}" is inactive, so it isn't in the exported chain "${cn}".`, ref: r, key: `skipinactive:${q.id}` })
      const name = x.name?.trim() || q.title
      if (name.length > SKIP_NAME_MAX) out.push({ level: 'info', area: 'Quest skip', message: `"${name}" is ${name.length} characters; Nexerelin's buttons fit about ${SKIP_NAME_MAX} ("Extract Researcher"). Give it a short name on the skip screen.`, ref: r, key: `skiplong:${q.id}` })
      const end = skipEndings(q).find((e) => e.node === x.ending)
      if (!end) { out.push({ level: 'error', area: 'Quest skip', message: `"${qn}": the skip's ending "${x.ending || '(none)'}" isn't a success or fail End node or Stage node of the quest. Pick the ending a skip means.`, ref: r, key: `skipending:${q.id}` }); continue }
      if (!skipPath(q, x.ending)) out.push({ level: 'error', area: 'Quest skip', message: `"${qn}": the skip's ending can't be reached from the Start node, so its flags can't be worked out.`, ref: r, key: `skipunreachable:${q.id}` })
      if (q.repeatable) out.push({ level: 'info', area: 'Quest skip', message: `"${qn}" is repeatable: a skip ends it once, and it is offered again later.`, ref: r, key: `skiprepeat:${q.id}` })
      // a quest of the chain needs another one ended in a way its skip doesn't set
      for (const p of q.requires) {
        if (!('quest' in p)) continue
        const other = c.quests.find((y) => y.quest === p.quest)
        const oq = m.quests.find((y) => y.id === p.quest)
        if (!other || !oq) continue
        const oe = skipEndings(oq).find((e) => e.node === other.ending)
        if (oe && p.ended !== 'any' && p.ended !== oe.outcome) out.push({ level: 'warning', area: 'Quest skip', message: `"${qn}" needs "${oq.title}" to end in ${p.ended}, but skipping "${oq.title}" means ${oe.outcome}: after a skip "${qn}" is never offered.`, ref: r, key: `skipmismatch:${q.id}:${p.quest}` })
      }
      // skipping it makes it done; a prerequisite quest outside the chain isn't
      const outside = q.requires.filter((p): p is { quest: string; ended: 'success' | 'fail' | 'any' } => 'quest' in p && !c.quests.some((y) => y.quest === p.quest) && m.quests.some((y) => y.id === p.quest))
      for (const p of outside) out.push({ level: 'info', area: 'Quest skip', message: `"${qn}" needs "${m.quests.find((y) => y.id === p.quest)?.title ?? p.quest}", which isn't in the chain "${cn}": skipping "${qn}" doesn't end it.`, ref: r, key: `skipoutside:${q.id}:${p.quest}` })
      // an earlier entry that needs a later one: Nexerelin forces it on anyway, but the screen reads oddly
      const need = needsInChain(m, c, q.id)
      const at = c.quests.indexOf(x)
      for (const id of need) if (c.quests.findIndex((y) => y.quest === id) > at) out.push({ level: 'info', area: 'Quest skip', message: `Quest chain "${cn}": "${qn}" comes before "${m.quests.find((y) => y.id === id)?.title ?? id}", which it needs. List the quests in the order they are played.`, ref: r, key: `skiporder:${q.id}:${id}` })
      for (const k of x.extra ?? []) if (k.key.trim() && !/^\$(global|player)\.\w/.test(k.key.trim())) out.push({ level: 'error', area: 'Quest skip', message: `"${qn}": "${k.key}" under "More keys" must be a $global. or $player. key (Nexerelin sets only those).`, ref: r, key: `skipextra:${q.id}:${k.key}` })
      if (x.rewards !== false && skipEffects(q, x.ending).rewards.some((rw) => rw.ships?.length)) out.push({ level: 'info', area: 'Quest skip', message: `"${qn}": skipping it gives ships; they join the starting fleet.`, ref: r, key: `skipships:${q.id}` })
    }
  }
  return out
}
