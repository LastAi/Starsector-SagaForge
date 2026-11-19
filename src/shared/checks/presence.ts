/**
 * #70 (SagaLib 1.3): people present only while their market's owner gets on with a faction
 * (People › Presence), and SF_FactionRep lines:
 *  - a presence rule on someone not placed at a market, an unknown faction or "elsewhere" market;
 *  - a quest whose contact has a presence rule: what happens to the active quest when they leave?
 *  - SF_FactionRep with too few arguments or an unknown level.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { marketOf } from '../nexerelin'
import { REP_LEVELS } from '../model'
import { factionRepLines, repLevelOf } from '../replevels'

export function presenceProblems(ctx: CheckContext): Problem[] {
  const { model: m, index } = ctx
  const out: Problem[] = []
  const name = (p: { id: string; name: { first: string; last: string } }) => `${p.name.first} ${p.name.last}`.trim() || p.id
  const isMarket = (id: string) => !!marketOf(id, m, index) || m.systems.some((s) => s.entities.some((e) => e.market?.id === id))
  const isFaction = (id: string) => m.factions.some((f) => f.id === id) || !!index.factions?.some((f) => f.id === id)

  for (const p of m.people) {
    const pr = p.presence
    if (!pr || p.inactive) continue
    const ref = { page: 'people' as const, id: p.id }
    if (p.placement.at !== 'market' || !p.placement.market) {
      out.push({ level: 'warning', area: 'People', message: `${name(p)} has a presence rule but isn't placed at a market (People › Placement), so it is ignored: presence depends on who owns their market.`, ref, key: `presencenomarket:${p.id}` })
      continue
    }
    if (!repLevelOf(pr.atLeast)) out.push({ level: 'error', area: 'People', message: `${name(p)}: the presence level "${pr.atLeast}" isn't one of ${REP_LEVELS.join(', ')} or "not hostile".`, ref, key: `presencelevel:${p.id}` })
    if (pr.faction && !isFaction(pr.faction)) out.push({ level: 'error', area: 'People', message: `${name(p)}: the presence faction "${pr.faction}" isn't a faction of this mod or the game.`, ref, key: `presencefaction:${p.id}` })
    if (pr.elsewhere) {
      if (pr.elsewhere === p.placement.market) out.push({ level: 'warning', area: 'People', message: `${name(p)}: "Where they go instead" is their own market, so they'd stay listed there while away. Pick another market, or "nowhere".`, ref, key: `presencesame:${p.id}` })
      else if (!isMarket(pr.elsewhere)) out.push({ level: 'warning', area: 'People', message: `${name(p)}: "Where they go instead" is "${pr.elsewhere}", which isn't a market of this mod or the game. SagaLib logs it and they go nowhere.`, ref, key: `presenceelsewhere:${p.id}` })
    }
  }

  // ---- quests whose contact can leave
  for (const q of m.quests) {
    const s = q.start
    if ((s.kind !== 'contact' && s.kind !== 'bar') || !s.person || q.ownerChange) continue
    const p = m.people.find((x) => x.id === s.person)
    if (!p?.presence || p.placement.at !== 'market') continue
    out.push({
      level: 'info', area: 'Quest',
      message: `${name(p)}, the contact of "${q.title}", is only present while their market's owner gets on with ${p.presence.faction || p.faction}. While they're away the quest isn't offered, but what happens to an active quest when they leave? Set "If a market of this quest changes owner" (Quest settings) to fail it or move it to a stage, or test $global.sagaforge_away_${p.id} in its dialog.`,
      ref: { page: 'quests', id: q.id }, key: `presencequest:${q.id}`
    })
  }

  // ---- SF_FactionRep lines (dialog conditions, Branch cases, phrases)
  for (const line of factionRepLines([m.quests, m.phrases, m.people.map((p) => p.phrases)])) {
    const args = line.replace(/^!?SF_FactionRep\b/, '').trim().split(/\s+/).filter(Boolean)
    if (args.length < 3) out.push({ level: 'error', area: 'Quest', message: `"${line}": SF_FactionRep needs <faction A> <faction B> <level> (e.g. "SF_FactionRep $faction.id hegemony NEUTRAL"). SagaLib counts it as false.`, key: `factionrepargs:${line}` })
    else if (!repLevelOf(args[2])) out.push({ level: 'error', area: 'Quest', message: `"${line}": "${args[2]}" isn't a level (${REP_LEVELS.join(', ')} or notHostile). SagaLib counts it as false.`, key: `factionreplevel:${line}` })
  }
  return out
}
