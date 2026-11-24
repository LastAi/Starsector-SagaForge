/**
 * Release packaging (R32, Phase 8b): what goes into a release zip, its name, the Version Checker
 * file and the forum post draft. Pure; the main process reads the files and writes the zip.
 */
import type { ModInfo } from './project'
import type { ProjectFile, ReleaseDetails } from './model'
import { versionFamily } from './version'
import { parseCsvRecords } from './csvedit'

/** Characters Windows doesn't allow in file names. */
const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')

/** "[0.98a] Vanguard Compact 1.1.0", as the forum's title rule (game version first). */
export function releaseName(info: Pick<ModInfo, 'name' | 'id' | 'gameVersion'>, version: string): string {
  const gv = versionFamily(info.gameVersion)
  return safeName(`${gv ? `[${gv}] ` : ''}${info.name || info.id} ${version}`)
}

/** The one folder inside the zip, named after the mod (players unzip it into Starsector/mods). */
export const releaseFolder = (info: Pick<ModInfo, 'name' | 'id'>): string => safeName(info.name || info.id) || info.id

/** Files that stay out of a release: the editor's plans, dev-mode test profiles, hidden and junk files. */
export function leftOutOfRelease(rel: string, opts: { originals?: boolean } = {}): string | null {
  const p = rel.replace(/\\/g, '/')
  const parts = p.split('/')
  // #67 U38 (user, 2026-11-22): the original images go in only when asked (Export › "with the original images")
  if (p.startsWith('sagaforge/originals/')) return opts.originals ? null : 'original images'
  if (parts[0] === 'sagaforge') return 'Saga Forge plans'
  if (p.startsWith('data/sagaforge/dev/')) return 'test profiles (dev mode only)'
  if (parts.some((s) => s.startsWith('.'))) return 'hidden files'
  const base = parts[parts.length - 1].toLowerCase()
  if (base === 'thumbs.db' || base === 'desktop.ini' || base.endsWith('.bak') || base.endsWith('.tmp') || base.endsWith('~')) return 'temporary files'
  return null
}

/** A file's text as it goes into the release (content.csv loses its rows for left-out files). */
export function releaseText(rel: string, text: string): string {
  if (rel !== 'data/config/sagaforge/content.csv') return text
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const recs = parseCsvRecords(text)
  const header = recs[0]?.fields.map((f) => f.trim()) ?? []
  const pi = header.indexOf('path')
  if (pi < 0) return text
  const lines = text.split(/\r?\n/)
  // content.csv rows are one line each (the exporter writes no quoted line breaks)
  return lines.filter((l, i) => i === 0 || !(parseCsvRecords(l)[0]?.fields[pi] ?? '').trim().startsWith('data/sagaforge/dev/')).join(eol)
}

/** Version Checker's file name in the mod's root. */
export const versionFileName = (modId: string) => `${modId}.version`
export const VERSION_FILES_CSV = 'data/config/version/version_files.csv'

/** "1.2.3" → Version Checker's {major, minor, patch}; a patch with letters stays text ("3a"). */
export function vcVersion(v: string): { major: number; minor: number; patch: number | string } {
  const [a, b, ...rest] = v.trim().split('.')
  const num = (x: string | undefined) => (Number.isFinite(Number(x)) && x !== '' && x != null ? Number(x) : 0)
  const p = rest.join('.')
  return { major: num(a), minor: num(b), patch: p === '' ? 0 : /^\d+$/.test(p) ? Number(p) : p }
}

/** The .version file (Version Checker), or null without a master version file URL. */
export function versionFileText(info: Pick<ModInfo, 'name' | 'id'>, version: string, d: ReleaseDetails | undefined): string | null {
  const master = d?.masterVersionUrl?.trim()
  if (!master) return null
  const o: Record<string, unknown> = { masterVersionFile: master, modName: info.name || info.id }
  if (d?.downloadUrl?.trim()) o.directDownloadURL = d.downloadUrl.trim()
  const tid = String(d?.threadId ?? '').trim().replace(/^.*topic=(\d+).*$/, '$1')
  if (/^\d+$/.test(tid)) o.modThreadId = Number(tid)
  o.modVersion = vcVersion(version)
  return JSON.stringify(o, null, 4) + '\n'
}

/** Problems with the release details (shown in the Export dialog). */
export function releaseDetailProblems(d: ReleaseDetails | undefined): string[] {
  const out: string[] = []
  const url = (s: string | undefined) => !s?.trim() || /^https?:\/\/\S+$/.test(s.trim())
  if (!url(d?.masterVersionUrl)) out.push('The master version file must be a web address (https://…).')
  else if (d?.masterVersionUrl?.trim() && !/\.version$/i.test(d.masterVersionUrl.trim())) out.push('The master version file address should end in .version (the raw file, e.g. raw.githubusercontent.com/…).')
  if (d?.masterVersionUrl?.trim() && /github\.com\/[^/]+\/[^/]+\/blob\//.test(d.masterVersionUrl)) out.push('That is GitHub\'s page for the file, not the file itself: use the "Raw" address (raw.githubusercontent.com/…).')
  if (!url(d?.downloadUrl)) out.push('The download link must be a web address (https://…).')
  if (!url(d?.projectUrl)) out.push('The project page must be a web address (https://…).')
  if (String(d?.threadId ?? '').trim() && !/^\d+$/.test(String(d?.threadId).trim().replace(/^.*topic=(\d+).*$/, '$1'))) out.push('The forum thread is its number (topic=12345) or the thread\'s address.')
  return out
}

/** Known library mods, for the forum post's requirements (name → link). */
const KNOWN_MODS: Record<string, { name: string; url: string }> = {
  lastai_sagalib: { name: 'SagaLib', url: 'https://github.com/LastAi/Starsector-SagaLib' },
  lw_lazylib: { name: 'LazyLib', url: 'https://fractalsoftworks.com/forum/index.php?topic=5444.0' },
  MagicLib: { name: 'MagicLib', url: 'https://fractalsoftworks.com/forum/index.php?topic=13718.0' },
  lunalib: { name: 'LunaLib', url: 'https://fractalsoftworks.com/forum/index.php?topic=25658.0' }
}

export interface ForumPostInput {
  info: ModInfo
  version: string
  details: ReleaseDetails | undefined
  /** What the mod adds, e.g. ["2 factions", "3 quests"]. */
  contents: string[]
  /** #60: the mod's list of other mods (Works with, Known conflicts). */
  project?: Pick<ProjectFile, 'mods'>
}

/**
 * A forum post draft in BBCode, in the order of Forum Posts/FORUM_POST_RULES.md: title with the
 * game version, catch line, links, requirements, author note, AI use disclaimer, how it works.
 * Parts the modder must write are left as [WRITE: …] markers.
 */
export function forumPost(i: ForumPostInput): string {
  const d = i.details ?? {}
  const gv = versionFamily(i.info.gameVersion)
  const status = d.status ? ` [${d.status}]` : ''
  const h = (t: string) => `[size=12pt][b]${t}[/b][/size]`
  const todo = (t: string) => `[WRITE: ${t}]`
  const link = (url: string | undefined, text: string) => (url?.trim() ? `[url=${url.trim()}]${text}[/url]` : todo(`${text} link`))
  const deps = i.info.dependencies.map((x) => {
    const k = KNOWN_MODS[x.id]
    const name = k?.name ?? x.name ?? x.id
    return `[*][size=8pt]${k ? `[url=${k.url}]${name}[/url]` : `${name} ${todo('link')}`} (required)[/size]`
  })
  const ai = d.aiUse?.trim() || ['Some or all [assets / code / text] in this mod were created using AI tools:', todo('one line per kind (Code:, Text:, Art:), naming the AI tool and what it did, or "none"'), todo('the workflow: who designed it, how the AI was directed, that the results were reviewed and tested')].join('\n')
  const out = [
    `[size=18pt][b]${gv ? `[${gv}] ` : ''}${i.info.name || i.info.id} ${i.version}${status}[/b][/size]`,
    '',
    d.catchLine?.trim() || todo('one short sentence on what the mod is'),
    '',
    `${link(d.projectUrl, 'Project page (source)')} · ${link(d.downloadUrl, `Download ${i.version}`)}`,
    '',
    h('Requirements'),
    deps.length ? `[list]${deps.join('')}[/list]` : '[size=8pt]None.[/size]',
    // #60: optional and incompatible mods from Saga › Mods
    ...(i.project && (i.project.mods ?? []).some((x) => x.use !== 'required') ? ['', modListNotes({ mods: (i.project.mods ?? []).filter((x) => x.use !== 'required') }, [], true).trim()] : []),
    '',
    h('Note from the author'),
    d.authorNote?.trim() || todo('your own words'),
    '',
    h('AI use disclaimer'),
    ai,
    '',
    h('How it works'),
    i.contents.length ? `Adds ${joinAnd(i.contents)}.` : todo('what the mod adds'),
    todo('features, how to start the content in game, known limits'),
    '',
    h('Install'),
    `Unzip into [font=courier]Starsector/mods[/font], enable [b]${i.info.name || i.info.id}[/b]${deps.length ? ' and its requirements' : ''} in the launcher.`,
    '',
    h('Problems'),
    `Post here with your [font=courier]starsector.log[/font] (in [font=courier]Starsector/starsector-core[/font]).`,
    '',
    h('License'),
    d.license?.trim() || todo('the license of the mod'),
    ''
  ]
  return out.join('\n')
}


function joinAnd(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * #60 (PLAN.md §10.1, §10.2): the release notes' mod section: Requires (the required mods and
 * SagaLib), Works with (the optional mods, with the new-game rule), Known conflicts (incompatible
 * mods with their reasons). Plain text, or BBCode list items for the forum post.
 */
export function modListNotes(p: Pick<ProjectFile, 'mods'>, deps: { id: string; name?: string; version?: string }[] = [], bb = false): string {
  const name = (id: string, n?: string) => KNOWN_MODS[id]?.name ?? n ?? id
  const req = [...new Map([...deps.map((d) => [d.id, `${name(d.id, d.name)}${d.version ? ` ${d.version}` : ''}`] as [string, string]),
    ...(p.mods ?? []).filter((m) => m.use === 'required').map((m) => [m.id, `${m.name}${m.minVersion ? ` ${m.minVersion}` : ''}`] as [string, string])]).values()]
  const opt = (p.mods ?? []).filter((m) => m.use === 'optional').map((m) => m.name)
  const bad = (p.mods ?? []).filter((m) => m.use === 'incompatible').map((m) => `${m.name}${m.reason?.trim() ? `: ${m.reason.trim()}` : ''}`)
  if (!req.length && !opt.length && !bad.length) return ''
  const sect = (title: string, items: string[], after?: string) => items.length
    ? (bb ? `[b]${title}[/b]\n[list]${items.map((x) => `[*][size=8pt]${x}[/size]`).join('')}[/list]${after ? `\n${after}` : ''}` : `${title}:\n${items.map((x) => `- ${x}`).join('\n')}${after ? `\n${after}` : ''}`)
    : ''
  return [
    sect('Requires', req),
    sect('Works with (optional)', opt, 'Add or remove these mods only before starting a new game.'),
    sect('Known conflicts', bad)
  ].filter(Boolean).join('\n\n') + '\n'
}
