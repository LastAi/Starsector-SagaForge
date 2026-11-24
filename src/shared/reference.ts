/**
 * Reference pages for the editor's lists (R8; docs/DESIGN-PHASE1.md §4): one HTML document, a
 * section per list with a table of its options. Built from the game definitions in use, plus
 * descriptions only where they are known from the game's code or files, and facts counted from
 * the game (e.g. how many vanilla rules test a voice). An option without a description shows its
 * id and in-game name, never a guess.
 */
import type { GameDefinitions } from './defs/types'
import type { ConditionInfo, FactionKeyUsage } from './api'
import { FACTION_KEY_DOCS, factionKeyDoc } from './factionkeys'
import { defsSections, indexSections, type IndexFacts } from './refsections'
import { editorSections } from './refeditor'

export interface ReferenceFacts {
  gameVersion: string
  /** Vanilla rules that test `$voice == <voice>`, by voice. */
  voiceRules?: Record<string, number>
  /** Faction keys vanilla's factions use (the game index's survey). */
  factionKeyUsage?: FactionKeyUsage[]
  /** Default fleet names by fleet type (default_fleet_type_names.json). */
  fleetTypeNames?: Record<string, string>
  /**
   * #67 (user, 2026-11-22): the colony conditions of vanilla, the active mod and its listed mods (filtered
   * by the caller), with each icon as a file URL and the name of the mod that adds it.
   */
  conditions?: (ConditionInfo & { iconUrl?: string; source?: string })[]
  /** Planet type id → its name (the conditions' "Can appear on"). */
  planetTypeName?: (id: string) => string
  /** #67 U34: the game index the active mod sees, for the type, market, loot, blueprint and skill pages. */
  index?: IndexFacts | null
}

/** `icons`: per row, an image URL drawn before the text of the second column (#67: the conditions). */
export interface RefSection { id: string; group: string; title: string; intro: string; columns: string[]; rows: string[][]; icons?: (string | undefined)[] }

/** Known descriptions (from the game's code and data). */
const PERSONALITY: Record<string, string> = {
  timid: 'Avoids fights where it can and pulls back early when the battle turns.',
  cautious: 'Fights carefully, keeping its distance and backing off when it takes damage.',
  steady: 'Balanced between caution and aggression.',
  aggressive: 'Closes in and presses the attack.',
  reckless: 'Charges in and keeps fighting regardless of danger.'
}
/** #67 U34: PersonImportance (0 to 1) and what vanilla's code does with it (BaseHubMission, ContactIntel, CoreCampaignPluginImpl). */
const IMPORTANCE: Record<string, string> = {
  VERY_LOW: 'Value 0. Missions they offer are the easiest and pay least. A very low contact never moves to another market when theirs is lost.',
  LOW: 'Value 0.25. $importanceAtMostLow is true in rules.',
  MEDIUM: 'Value 0.5.',
  HIGH: 'Value 0.75. $importanceAtLeastHigh is true in rules.',
  VERY_HIGH: 'Value 1. Missions they offer can be the hardest and pay most.'
}
const CONTACT_TYPE: Record<string, string> = {
  military: 'A military contact. The type is one of the contact\'s tags, which mission specs match against (tagsAll / tagsAny), so it decides which missions they can offer.',
  trade: 'A trade contact (the type is a person tag that missions match against).',
  underworld: 'An underworld contact: smugglers, criminals (a person tag that missions match against).',
  science: 'A science contact (a person tag that missions match against).',
  pather: 'A Luddic Path contact (a person tag that missions match against).'
}

export function referenceSections(defs: GameDefinitions, facts: ReferenceFacts): RefSection[] {
  const voice = facts.voiceRules ?? {}
  return [
    {
      id: 'people-rank', group: 'People', title: 'Rank',
      intro: 'A person\'s rank, shown with their name ("Commander Ilse Reyes"). A faction can rename a rank in its Names & ranks tab (Rank titles).',
      columns: ['Id', 'Shown in game as'], rows: defs.ranks.map((r) => [r.id, r.name])
    },
    {
      id: 'people-post', group: 'People', title: 'Post',
      intro: 'A person\'s job, shown as their title in a market\'s comm directory. Staff posts (station, base and outpost commander, portmaster, supply officer, administrator) take over that post from the person vanilla generates at the market; station, base and outpost commanders and administrators offer commissions when their faction does.',
      columns: ['Id', 'Shown in game as', 'Note'],
      rows: defs.posts.map((p) => [p.id, p.name, ['baseCommander', 'stationCommander', 'outpostCommander', 'administrator'].includes(p.id) ? 'Staff post; offers commissions' : ['portmaster', 'supplyOfficer'].includes(p.id) ? 'Staff post' : ''])
    },
    {
      id: 'people-voice', group: 'People', title: 'Voice',
      intro: 'A tag on the person ($voice in rules). Not a sound: vanilla\'s rules pick some of their wording by it. The count is how many vanilla rules test it.',
      columns: ['Voice', 'Vanilla rules that test it'], rows: defs.voices.map((v) => [v, voice[v] != null ? String(voice[v]) : ''])
    },
    {
      id: 'people-personality', group: 'People', title: 'Personality',
      intro: 'How the person fights when they command a ship. It only matters in battle.',
      columns: ['Personality', 'In battle'], rows: defs.personalities.map((p) => [p, PERSONALITY[p] ?? ''])
    },
    {
      id: 'people-contact-type', group: 'People', title: 'Contact types',
      intro: 'The kinds of contact a person is (shown in the Contacts list). Each type is also a tag on the person.',
      columns: ['Type', 'What it means'], rows: defs.contactTypes.map((t) => [t, CONTACT_TYPE[t] ?? ''])
    },
    {
      id: 'people-importance', group: 'People', title: 'Importance',
      intro: 'How important a contact is, shown in the Contacts list. It sets the quality of the missions they offer: quality is the lower of your relationship with them and their importance, plus a little when the relationship is higher (BaseHubMission). Rules read it as $importance.',
      columns: ['Importance', 'Note'], rows: defs.importance.map((i) => [i, IMPORTANCE[i] ?? ''])
    },
    {
      id: 'factions-fleet-types', group: 'Factions', title: 'Fleet types',
      intro: 'The fleet types vanilla\'s code uses, with the name a fleet of that type gets when its faction doesn\'t name it (Names & ranks › Fleet type names). A mod may use its own fleet types; they need a name in the faction.',
      columns: ['Fleet type', 'Default name'],
      rows: [...new Set([...defs.fleetTypes.map((t) => t.id), ...Object.keys(facts.fleetTypeNames ?? {})])].sort().map((id) => [id, facts.fleetTypeNames?.[id] ?? ''])
    },
    {
      id: 'factions-other-keys', group: 'Factions', title: 'Other keys',
      intro: 'Faction keys the form has no field for, with how many of vanilla\'s factions set each. Keys inside "custom" are written custom.<key>. Descriptions come from the game\'s code; a key without one has no checked description yet.',
      columns: ['Key', 'Vanilla factions', 'What it does'],
      rows: otherKeyRows(facts.factionKeyUsage ?? [])
    },
    ...conditionSections(facts),
    // #67 U34
    ...indexSections(facts.index ?? null),
    ...defsSections(defs),
    ...editorSections(defs, facts.index?.ix.music, facts.index?.ix.sounds)
  ]
}

/** #67: the colony conditions, planet conditions (rolled on planets) first, then the colony ones. */
function conditionSections(facts: ReferenceFacts): RefSection[] {
  const list = facts.conditions ?? []
  // always there (a form links to it), even before the game index is read
  const name = facts.planetTypeName ?? ((x: string) => x)
  // rolled planet conditions by group (ore, farmland, …), then world types (a planet's own type: Jungle World), then colony ones
  const rank = (c: ConditionInfo) => (c.planetary ? (c.group ? 0 : 1) : 2)
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name))
  const hazard = (h?: number) => (h ? `${h > 0 ? '+' : ''}${Math.round(h * 100)}%` : '')
  const kind = (c: ConditionInfo) => (c.planetary ? (c.group ? `planet · ${c.group}` : 'planet · world type') : 'colony')
  // the game's descriptions name the market with a token
  const desc = (s?: string) => (s ?? '').replace(/\$market/gi, 'the planet')
  return [{
    id: 'locations-conditions', group: 'Locations', title: 'Colony conditions',
    intro: 'The conditions a market or planet can have, from vanilla and the mods this mod lists (Saga › Mods). Planet conditions (resources, climate, hazards) are rolled on planets when the sector is made, on the planet types listed; colony conditions come from what happens to a colony (its size, events). Hazard adds to the colony\'s hazard rating. Descriptions are the game\'s own.',
    columns: ['Id', 'Condition', 'Kind', 'Hazard', 'Can appear on', 'What it is', 'From'],
    icons: sorted.map((c) => c.iconUrl),
    rows: sorted.map((c) => [c.id, c.name, kind(c), hazard(c.hazard), [...new Set((c.onPlanets ?? []).map(name))].join(', '), desc(c.desc), c.source ?? ''])
  }]
}

function otherKeyRows(usage: FactionKeyUsage[]): string[][] {
  const keys = [...new Set([...usage.map((u) => u.key), ...Object.keys(FACTION_KEY_DOCS)])]
  const count = (k: string) => usage.find((u) => u.key === k)?.count ?? 0
  return keys.sort((a, b) => count(b) - count(a) || a.localeCompare(b)).map((k) => [k, count(k) ? String(count(k)) : '', factionKeyDoc(k)])
}

/** #67 U34: columns of running text get room; short ones wrap. */
const LONG = /^(Description|What it does|What it is|What it means|What it holds|When it fires|Quote|Can give|In battle|Becomes|Note)/
const MID = /^(Salvage|Tags|Parameters|Can appear on|Conditions it can roll|Examples)/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The whole reference as one page (tests; the app opens it a group at a time: referencePages). */
export function referenceHtml(defs: GameDefinitions, facts: ReferenceFacts): string {
  return pageHtml(referenceSections(defs, facts), null, facts.gameVersion)
}

/** #67 U34 (user, 2026-11-22): a group's page file ("reference-rules.html"). */
export const referenceFile = (group: string): string => `reference-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`

/**
 * #67 U34 (user, 2026-11-22): the reference as one page per group (Rules alone was 6,000 rows of the
 * 8,000), each with the whole list of groups and sections in its sidebar; a section of another group
 * links to that group's page. `fileOf` gives the page of a section.
 */
export function referencePages(defs: GameDefinitions, facts: ReferenceFacts): { pages: { file: string; html: string }[]; fileOf: (sectionId: string) => string } {
  const sections = referenceSections(defs, facts)
  const groups = [...new Set(sections.map((s) => s.group))]
  const pages = groups.map((g) => ({ file: referenceFile(g), html: pageHtml(sections, g, facts.gameVersion) }))
  return { pages, fileOf: (id) => referenceFile(sections.find((s) => s.id === id)?.group ?? groups[0] ?? 'people') }
}

/** One page: every section (group null) or one group's, with the full sidebar. */
function pageHtml(sections: RefSection[], group: string | null, gameVersion: string): string {
  const groups = [...new Set(sections.map((s) => s.group))]
  const shown = group ? sections.filter((s) => s.group === group) : sections
  const href = (s: RefSection) => (group && s.group !== group ? `${referenceFile(s.group)}#${s.id}` : `#${s.id}`)
  const facts = { gameVersion }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Saga Forge reference (Starsector ${esc(facts.gameVersion)})</title>
<style>
  body { margin: 0; background: #12151a; color: #d8dee8; font: 14px/1.55 system-ui, 'Segoe UI', sans-serif; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
  /* #67 (user, 2026-11-22): the padding inside the window's height (the list ran past the bottom), and wide tables scroll in main, not the whole page */
  html, body { height: 100%; overflow-x: hidden; }
  nav { box-sizing: border-box; position: sticky; top: 0; height: 100vh; overflow: auto; background: #1a1f26; border-right: 1px solid #2e3642; padding: 14px; font-size: 13px; }
  nav b { display: block; margin: 10px 0 4px; color: #8a94a6; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
  nav a { display: block; color: #d8dee8; text-decoration: none; padding: 2px 6px; border-radius: 4px; } nav a:hover { background: #1f2a38; }
  nav b.cur { color: #4fb3ff; } nav a.other { color: #aab4c4; }
  main { padding: 20px 32px 60px; max-width: 1500px; min-width: 0; overflow-x: auto; }
  td.long { min-width: 260px; } td.mid { min-width: 120px; } td { overflow-wrap: break-word; } td:nth-child(2) { min-width: 120px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 32px 0 6px; padding-top: 8px; border-top: 1px solid #2e3642; }
  :target { scroll-margin-top: 10px; } h2:target { color: #4fb3ff; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; } th, td { border: 1px solid #2e3642; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #1a1f26; color: #8a94a6; font-weight: 600; } td:first-child { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
  .muted { color: #8a94a6; }
  img.ic { width: 24px; height: 24px; vertical-align: middle; margin-right: 6px; }
</style></head><body>
<nav><div style="font-weight:600">Saga Forge reference</div><div class="muted">Starsector ${esc(facts.gameVersion)}</div>
${groups.map((g) => `<b${g === group ? ' class="cur"' : ''}>${esc(g)}</b>${sections.filter((s) => s.group === g).map((s) => `<a href="${href(s)}"${group && g !== group ? ' class="other"' : ''}>${esc(s.title)}</a>`).join('')}`).join('\n')}</nav>
<main><h1>${group ? `Reference: ${esc(group)}` : 'Reference: the editor\'s lists'}</h1>
<p class="muted">What each option in Saga Forge's lists is and where it shows in game. Generated from the game definitions for Starsector ${esc(facts.gameVersion)}; descriptions are only given where they are known from the game's code or files. More lists are added as the editor grows.</p>
${shown.map((s) => `<h2 id="${s.id}">${esc(s.group)} › ${esc(s.title)}</h2><p>${esc(s.intro)}</p>
<table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r, ri) => `<tr>${r.map((c, ci) => `<td${LONG.test(s.columns[ci] ?? '') ? ' class="long"' : MID.test(s.columns[ci] ?? '') ? ' class="mid"' : ''}>${ci === 1 && s.icons?.[ri] ? `<img class="ic" src="${esc(s.icons[ri]!)}" alt="">` : ''}${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('\n')}
</main></body></html>
`
}
