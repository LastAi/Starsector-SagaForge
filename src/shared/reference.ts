/**
 * Reference pages for the editor's lists (R8; docs/DESIGN-PHASE1.md §4): one HTML document, a
 * section per list with a table of its options. Built from the game definitions in use, plus
 * descriptions only where they are known from the game's code or files, and facts counted from
 * the game (e.g. how many vanilla rules test a voice). An option without a description shows its
 * id and in-game name, never a guess.
 */
import type { GameDefinitions } from './defs/types'
import type { FactionKeyUsage } from './api'
import { FACTION_KEY_DOCS, factionKeyDoc } from './factionkeys'

export interface ReferenceFacts {
  gameVersion: string
  /** Vanilla rules that test `$voice == <voice>`, by voice. */
  voiceRules?: Record<string, number>
  /** Faction keys vanilla's factions use (the game index's survey). */
  factionKeyUsage?: FactionKeyUsage[]
  /** Default fleet names by fleet type (default_fleet_type_names.json). */
  fleetTypeNames?: Record<string, string>
}

export interface RefSection { id: string; group: string; title: string; intro: string; columns: string[]; rows: string[][] }

/** Known descriptions (from the game's code and data). */
const PERSONALITY: Record<string, string> = {
  timid: 'Avoids fights where it can and pulls back early when the battle turns.',
  cautious: 'Fights carefully, keeping its distance and backing off when it takes damage.',
  steady: 'Balanced between caution and aggression.',
  aggressive: 'Closes in and presses the attack.',
  reckless: 'Charges in and keeps fighting regardless of danger.'
}
const IMPORTANCE: Record<string, string> = {}
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
      intro: 'How important a contact is, shown in the Contacts list.',
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
    }
  ]
}

function otherKeyRows(usage: FactionKeyUsage[]): string[][] {
  const keys = [...new Set([...usage.map((u) => u.key), ...Object.keys(FACTION_KEY_DOCS)])]
  const count = (k: string) => usage.find((u) => u.key === k)?.count ?? 0
  return keys.sort((a, b) => count(b) - count(a) || a.localeCompare(b)).map((k) => [k, count(k) ? String(count(k)) : '', factionKeyDoc(k)])
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function referenceHtml(defs: GameDefinitions, facts: ReferenceFacts): string {
  const sections = referenceSections(defs, facts)
  const groups = [...new Set(sections.map((s) => s.group))]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Saga Forge reference (Starsector ${esc(facts.gameVersion)})</title>
<style>
  body { margin: 0; background: #12151a; color: #d8dee8; font: 14px/1.55 system-ui, 'Segoe UI', sans-serif; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
  nav { position: sticky; top: 0; height: 100vh; overflow: auto; background: #1a1f26; border-right: 1px solid #2e3642; padding: 14px; font-size: 13px; }
  nav b { display: block; margin: 10px 0 4px; color: #8a94a6; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
  nav a { display: block; color: #d8dee8; text-decoration: none; padding: 2px 6px; border-radius: 4px; } nav a:hover { background: #1f2a38; }
  main { padding: 20px 32px 60px; max-width: 1000px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 32px 0 6px; padding-top: 8px; border-top: 1px solid #2e3642; }
  :target { scroll-margin-top: 10px; } h2:target { color: #4fb3ff; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; } th, td { border: 1px solid #2e3642; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #1a1f26; color: #8a94a6; font-weight: 600; } td:first-child { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
  .muted { color: #8a94a6; }
</style></head><body>
<nav><div style="font-weight:600">Saga Forge reference</div><div class="muted">Starsector ${esc(facts.gameVersion)}</div>
${groups.map((g) => `<b>${esc(g)}</b>${sections.filter((s) => s.group === g).map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}`).join('\n')}</nav>
<main><h1>Reference: the editor's lists</h1>
<p class="muted">What each option in Saga Forge's lists is and where it shows in game. Generated from the game definitions for Starsector ${esc(facts.gameVersion)}; descriptions are only given where they are known from the game's code or files. More lists are added as the editor grows.</p>
${sections.map((s) => `<h2 id="${s.id}">${esc(s.group)} › ${esc(s.title)}</h2><p>${esc(s.intro)}</p>
<table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('\n')}
</main></body></html>
`
}
