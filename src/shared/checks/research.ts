/**
 * #77 (PLAN.md §10.8, "Vaults of Knowledge: research"): the mod's techs (Saga › Research), its
 * factions' research stances (Factions › Research) and what quests do with research. Whether VoK is
 * in the mod's list is checked with the other used mods (checks/mods.ts). Facts: FORMATS.md
 * "AoTD - Vaults of Knowledge 5.0.7".
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { ID_PATTERN, prefixProblem } from './index'
import { handRows, isIconPath, researchOf, unlockMemKey, VOK_FACTIONS_CSV, VOK_STANCES, VOK_TECHS_CSV, type ResearchTech } from '../research'

export function researchProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const out: Problem[] = []
  const techs = m.research?.techs ?? []
  const own = ctx.loaded?.sourceId ?? ''
  const ref = (id: string): Problem['ref'] => ({ page: 'saga', id: 'research', sub: id })
  const files = ctx.loaded?.files ?? {}
  const handTechs = handRows(files[VOK_TECHS_CSV]?.text, 'id')
  const handFactions = handRows(files[VOK_FACTIONS_CSV]?.text, 'factionId')
  const handTechIds = new Set(handTechs.map((r) => r.key))
  // other mods' techs (the index; this mod's own file is read from its rows)
  const others = new Map((ctx.index.researchTechs ?? []).filter((t) => t.definedBy !== own).map((t) => [t.id, t]))
  const known = (id: string) => techs.some((t) => t.id === id) || handTechIds.has(id) || others.has(id)
  // icon ids the installed mods list under settings.json graphics.ui_icons_tech_tree (empty: unknown)
  const icons = new Set(ctx.index.researchIcons ?? [])
  const items = new Set([...m.items.map((i) => i.id), ...(ctx.index.items ?? []).map((i) => i.id)])
  const rewardKnown: Record<string, Set<string> | null> = {
    industry: new Set((ctx.index.industries ?? []).map((x) => x.id)),
    ship: new Set((ctx.index.hulls ?? []).map((x) => x.id)),
    weapon: new Set((ctx.index.weapons ?? []).map((x) => x.id)),
    hullmod: new Set((ctx.index.hullmods ?? []).map((x) => x.id)),
    special_ability: null, modifier: null
  }
  // what quests do with each tech
  const unlockedBy = new Map<string, string[]>()
  for (const q of m.quests) if (!q.inactive) for (const id of researchOf(q).unlocks) unlockedBy.set(id, [...(unlockedBy.get(id) ?? []), q.title || q.id])

  const seen = new Set<string>()
  const spots = new Map<string, string>()
  for (const t of techs) {
    const name = t.name || t.id || '(no name)'
    if (!t.id) { out.push({ level: 'error', area: 'Research', message: `Tech "${name}" has no id.`, ref: ref(t.id), key: `technoid:${name}` }); continue }
    if (!ID_PATTERN.test(t.id)) out.push({ level: 'error', area: 'Research', message: `Tech id "${t.id}" may only have lowercase letters, digits and _.`, ref: ref(t.id), key: `techidchars:${t.id}` })
    const pp = prefixProblem(m.project.prefix, t.id, 'Tech', ref(t.id))
    if (pp) out.push({ ...pp, message: `${pp.message} Vaults of Knowledge merges every mod's techs by id.` })
    if (seen.has(t.id)) out.push({ level: 'error', area: 'Research', message: `Two techs have the id "${t.id}": Vaults of Knowledge keeps only one.`, ref: ref(t.id), key: `techdup:${t.id}` })
    seen.add(t.id)
    const o = others.get(t.id)
    if (o) out.push({ level: 'error', area: 'Research', message: `Tech id "${t.id}" is also ${o.definedBy === 'aotd_vok' ? "one of Vaults of Knowledge's own" : `in ${o.definedBy}'s aotd_tech_options.csv`}: the files are merged by id, so one replaces the other.`, ref: ref(t.id), key: `techother:${t.id}` })
    if (handTechIds.has(t.id)) out.push({ level: 'info', area: 'Research', message: `Tech "${name}" was written by hand in aotd_tech_options.csv: the next export takes that row over (removes it and writes the tech in Saga Forge's block).`, ref: ref(t.id), key: `techhand:${t.id}` })
    if (!t.name.trim()) out.push({ level: 'error', area: 'Research', message: `Tech ${t.id} has no name.`, ref: ref(t.id), key: `technoname:${t.id}` })
    if (!(t.tier >= 0 && t.tier <= 5)) out.push({ level: 'error', area: 'Research', message: `Tech "${name}": tier ${t.tier} isn't one of VoK's (0 to 5).`, ref: ref(t.id), key: `techtier:${t.id}` })
    if (!(t.days > 0)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" takes ${t.days} days to research.`, ref: ref(t.id), key: `techdays:${t.id}` })
    for (const r of t.requires) {
      if (r === t.id) out.push({ level: 'error', area: 'Research', message: `Tech "${name}" needs itself first: it can never be researched.`, ref: ref(t.id), key: `techself:${t.id}` })
      else if (!known(r)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" needs "${r}" first, which no installed mod has (a typo, or a mod that isn't installed). Without it the tech can never be researched.`, ref: ref(t.id), key: `techreq:${t.id}:${r}` })
    }
    for (const it of t.items) {
      if (!it.id) continue
      if (!items.has(it.id)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" costs "${it.id}", which isn't an item of the game, this mod or an installed mod.`, ref: ref(t.id), key: `techitem:${t.id}:${it.id}` })
      if (!(it.qty > 0)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}": the cost "${it.id}" has quantity ${it.qty}; VoK skips it.`, ref: ref(t.id), key: `techqty:${t.id}:${it.id}` })
    }
    const values = new Set<string>()
    for (const rw of t.rewards) {
      const k = rewardKnown[rw.type]
      if (values.has(rw.value.trim())) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" lists "${rw.value}" twice: VoK keeps one (it keys the rewards by value).`, ref: ref(t.id), key: `techrwdup:${t.id}:${rw.value}` })
      values.add(rw.value.trim())
      if (rw.value.includes(':') && rw.type !== 'modifier') out.push({ level: 'error', area: 'Research', message: `Tech "${name}": the reward "${rw.value}" has a ":" (VoK splits its reward lines there).`, ref: ref(t.id), key: `techrwcolon:${t.id}:${rw.value}` })
      else if (k && rw.value && !k.has(rw.value)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" unlocks the ${rw.type} "${rw.value}", which the game and the installed mods don't have.`, ref: ref(t.id), key: `techrw:${t.id}:${rw.value}` })
    }
    if (!t.rewards.some((r) => r.value.trim())) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" unlocks nothing. VoK can't load a tech without a rewards line, so Export writes its name as a modifier line; add what it unlocks, or a modifier text.`, ref: ref(t.id), key: `technorw:${t.id}` })
    if (!t.icon) out.push({ level: 'error', area: 'Research', message: `Tech "${name}" has no icon: Vaults of Knowledge looks every tech's icon up in settings.json (ui_icons_tech_tree), and the game fails on one that isn't there.`, ref: ref(t.id), key: `technoicon:${t.id}` })
    else if (!isIconPath(t.icon) && icons.size && !icons.has(t.icon)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}": no installed mod lists the icon "${t.icon}" under ui_icons_tech_tree in its settings.json (VoK's are basic, farming1, …). The game fails on an icon that isn't there.`, ref: ref(t.id), key: `techicon:${t.id}` })
    const spot = `${t.tier}:${t.column}:${t.row}`
    const at = spots.get(spot)
    if (at) out.push({ level: 'warning', area: 'Research', message: `Techs "${at}" and "${name}" are at the same place in the tree (tier ${t.tier}, column ${t.column}, row ${t.row}): one hides the other.`, ref: ref(t.id), key: `techspot:${t.id}` })
    else spots.set(spot, name)
    // seen in game (2026-11-20): on every load VoK marks the player's techs up to its "highest tier
    // enabled" setting researched (default: tier 0), whatever isResearchedFromStart says
    if (t.tier === 0 && !t.fromStart && (t.quest || t.items.length || t.requires.length)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" is tier 0: with VoK's default settings every tier-0 tech is researched when the game loads, so its ${t.quest ? '"unlocked by a quest"' : t.requires.length ? 'prerequisites' : 'costs'} never matter. Use tier 1 or higher.`, ref: ref(t.id), key: `techtier0:${t.id}` })
    if (t.quest) {
      if (t.fromStart) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" is researched from the start, so "unlocked by a quest" never matters.`, ref: ref(t.id), key: `techstartq:${t.id}` })
      if (!unlockedBy.has(t.id)) out.push({ level: 'warning', area: 'Research', message: `Tech "${name}" is unlocked by a quest, but no quest's "Unlock research" names it: it can never be researched.`, ref: ref(t.id), key: `techneverq:${t.id}` })
    }
  }
  // prerequisite loops among the mod's own techs (none of them can be researched)
  const byId = new Map(techs.map((t) => [t.id, t]))
  const loop = (start: ResearchTech): boolean => {
    const seenL = new Set<string>()
    const walk = (id: string): boolean => {
      if (id === start.id && seenL.size) return true
      if (seenL.has(id)) return false
      seenL.add(id)
      return (byId.get(id)?.requires ?? []).some((r) => r !== id && walk(r))
    }
    return start.requires.some((r) => r !== start.id && walk(r))
  }
  for (const t of techs) if (t.id && loop(t)) out.push({ level: 'error', area: 'Research', message: `Tech "${t.name || t.id}" needs itself through its prerequisites (a loop): none of them can be researched.`, ref: ref(t.id), key: `techloop:${t.id}` })

  // hand-written rows the game would read wrongly
  for (const r of handTechs) {
    if (techs.some((t) => t.id === r.key)) continue
    const rw = (r.row.rewards ?? '').trim()
    if (!rw || rw.split('\n').some((l) => !l.includes(':'))) out.push({ level: 'error', area: 'Research', message: `Hand-written tech ${r.key} in aotd_tech_options.csv has ${rw ? 'a rewards line without "value:type"' : 'no rewards'}: VoK's reader fails on it while the game loads.`, ref: ref(r.key), key: `handrw:${r.key}` })
    if (!(r.row.reqToResearchFirst ?? '').trim()) out.push({ level: 'warning', area: 'Research', message: `Hand-written tech ${r.key} in aotd_tech_options.csv has an empty reqToResearchFirst: VoK then needs a tech with no id first. Write "none".`, ref: ref(r.key), key: `handreq:${r.key}` })
    for (const x of (r.row.itemReqToResearch ?? '').split(',').map((s) => s.trim()).filter(Boolean)) if (x.split(':').length !== 2) out.push({ level: 'warning', area: 'Research', message: `Hand-written tech ${r.key} in aotd_tech_options.csv: the cost "${x}" isn't item:quantity, so VoK skips it.`, ref: ref(r.key), key: `handitem:${r.key}:${x}` })
    for (const col of ['tier', 'timeToResearch', 'columnNumber', 'rowNumber']) if (!/^-?\d+$/.test((r.row[col] ?? '').trim())) out.push({ level: 'error', area: 'Research', message: `Hand-written tech ${r.key} in aotd_tech_options.csv: ${col} "${r.row[col] ?? ''}" isn't a whole number (VoK can't read the row).`, ref: ref(r.key), key: `handnum:${r.key}:${col}` })
  }
  for (const r of handFactions) {
    if (m.research?.factions[r.key]) continue
    for (const col of ['db_cash_mult', 'db_rep_mult']) if (!Number.isFinite(Number((r.row[col] ?? '').trim())) || !(r.row[col] ?? '').trim()) out.push({ level: 'error', area: 'Research', message: `Hand-written research stance of ${r.key} in aotd_faction_behaviour.csv: ${col} "${r.row[col] ?? ''}" isn't a number (VoK can't read the row).`, ref: { page: 'factions', id: r.key }, key: `handfac:${r.key}:${col}` })
  }

  // the mod's factions' research stances
  for (const [id, f] of Object.entries(m.research?.factions ?? {})) {
    const fref: Problem['ref'] = { page: 'factions', id }
    if (!m.factions.some((x) => x.kind === 'addition' && x.id === id)) { out.push({ level: 'warning', area: 'Research', message: `A research stance is set for "${id}", which isn't one of the mod's own factions: it isn't exported.`, ref: fref, key: `facres:${id}` }); continue }
    if (!(VOK_STANCES as readonly string[]).includes(f.stance)) out.push({ level: 'warning', area: 'Research', message: `Faction ${id}: research stance "${f.stance}" isn't one VoK's factions use (${VOK_STANCES.join(', ')}).`, ref: fref, key: `facstance:${id}` })
    if (!(f.cashMult >= 0) || !(f.repMult >= 0)) out.push({ level: 'error', area: 'Research', message: `Faction ${id}: the databank multipliers must be 0 or more.`, ref: fref, key: `facmult:${id}` })
    for (const x of f.forbidden) if (x && !known(x)) out.push({ level: 'warning', area: 'Research', message: `Faction ${id} forbids the tech "${x}", which no installed mod has.`, ref: fref, key: `facforb:${id}:${x}` })
  }

  // what quests do with research
  for (const q of m.quests) {
    if (q.inactive) continue
    for (const n of q.nodes) {
      if (n.type !== 'action') continue
      for (const o of n.ops) {
        if (o.op !== 'unlockResearch' && o.op !== 'grantResearch') continue
        const what = o.op === 'unlockResearch' ? 'Unlock research' : 'Grant research'
        const qref: Problem['ref'] = { page: 'quests', id: q.id, sub: n.id }
        if (!o.tech) { out.push({ level: 'error', area: 'Quest', message: `${q.title}: "${what}" in "${n.title || n.id}" has no tech.`, ref: qref, key: `resop:${q.id}:${n.id}` }); continue }
        if (o.op === 'unlockResearch') {
          const t = byId.get(o.tech)
          if (!t && !handTechIds.has(o.tech)) out.push({ level: 'error', area: 'Quest', message: `${q.title}: "Unlock research" names ${o.tech}, which isn't one of the mod's techs (Saga › Research). Only those have the flag it sets.`, ref: qref, key: `resunl:${q.id}:${o.tech}` })
          else if (t && !t.quest) out.push({ level: 'warning', area: 'Quest', message: `${q.title}: "Unlock research" names "${t.name || t.id}", which isn't "unlocked by a quest": the flag it sets changes nothing.`, ref: qref, key: `resunlq:${q.id}:${o.tech}` })
        }
      }
    }
    const r = researchOf(q)
    for (const id of [...r.grants, ...r.tests]) {
      if (!known(id)) out.push({ level: 'info', area: 'Quest', message: `${q.title} grants or tests the tech "${id}", which no installed mod has: with Vaults of Knowledge it must be in an enabled mod's aotd_tech_options.csv, or granting does nothing.`, ref: { page: 'quests', id: q.id }, key: `resother:${q.id}:${id}` })
    }
    // a hand-written otherReq the op can't set
    for (const id of r.unlocks) {
      const h = handTechs.find((x) => x.key === id)
      if (h && !(h.row.otherReq ?? '').trim().startsWith(`${unlockMemKey(id)}:`)) out.push({ level: 'warning', area: 'Quest', message: `${q.title} unlocks ${id}, a hand-written tech whose otherReq isn't "${unlockMemKey(id)}:…": the flag it sets changes nothing.`, ref: { page: 'quests', id: q.id }, key: `resunlh:${q.id}:${id}` })
    }
  }
  return out
}
