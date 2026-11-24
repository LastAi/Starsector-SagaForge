/**
 * #62 (PLAN.md §10.4; FORMATS.md "LunaLib 2.0.5"): the mod's settings page. Exported as the mod's
 * data/config/LunaSettings.csv, which LunaLib shows as a page in its menu. SagaLib reads the same
 * file itself (the game's loadCSV, no LunaLib needed) and sets each value field as $global.<id> on
 * every load: the default, or the player's value through its LunaLib bridge. Settings scale
 * encounter fleet size and credit rewards (SagaLib core.Settings, the same rules as here; the
 * golden case settings.json keeps the two in line).
 */
import type { ModModel } from './serialize'
import type { SettingDef, SettingScale, SettingType } from './model'
import { parseSettingToken, settingToken } from './itemversions'

export const LUNA_SETTINGS_CSV = 'data/config/LunaSettings.csv'
export const LUNA_SETTINGS_CONFIG = 'data/config/LunaSettingsConfig.json'
export const LUNA_HEADER = ['fieldID', 'fieldName', 'fieldType', 'defaultValue', 'secondaryValue', 'fieldDescription', 'minValue', 'maxValue', 'tab']
export const LUNALIB_ID = 'lunalib'

/** Types that hold a value (a memory key); Header and Text are layout only. */
export const VALUE_TYPES = new Set<SettingType>(['Boolean', 'Int', 'Double', 'Radio', 'String'])
export const isValueSetting = (s: Pick<SettingDef, 'type'>): boolean => VALUE_TYPES.has(s.type)

export const TYPE_LABEL: Record<SettingType, string> = {
  Boolean: 'On/off', Int: 'Whole number', Double: 'Number', Radio: 'Choice', String: 'Text value', Header: 'Header (layout)', Text: 'Text line (layout)'
}

export const settingKey = (id: string): string => `$global.${id}`
export const valueSettings = (m: Pick<ModModel, 'project'>): SettingDef[] => (m.project.settings ?? []).filter(isValueSetting)

/** LunaLib's default range for Int and Double fields. */
export const DEFAULT_MIN = 0
export const DEFAULT_MAX = 100

/**
 * A raw value (a CSV cell, a Test context entry, LunaLib's value) as the field's type, the way
 * SagaLib stores it: Boolean, a number (Int: whole), or a text; undefined when it doesn't read.
 */
export function settingValue(type: SettingType, raw: unknown): boolean | number | string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (type === 'Boolean') {
    if (typeof raw === 'boolean') return raw
    const t = String(raw).trim().toLowerCase()
    return t === 'true' ? true : t === 'false' ? false : undefined
  }
  if (type === 'Int' || type === 'Double') {
    if (typeof raw === 'boolean') return undefined
    const t = String(raw).trim()
    if (t === '') return undefined
    const n = Number(t)
    if (!Number.isFinite(n)) return undefined
    if (type === 'Int') return Number.isInteger(n) ? n : undefined
    return Math.fround(n)
  }
  if (type === 'Radio' || type === 'String') return String(raw)
  return undefined
}

/** The default as its type (undefined: it doesn't read; a Problem). */
export const defaultOf = (s: SettingDef): boolean | number | string | undefined => settingValue(s.type, s.default)

/** The memory a game load gives: every value field's player value (if it reads) or its default. */
export function settingsMemory(defs: SettingDef[], player: Record<string, unknown> = {}): Map<string, boolean | number | string> {
  const out = new Map<string, boolean | number | string>()
  for (const s of defs) {
    if (!isValueSetting(s) || !s.id) continue
    let pv = settingValue(s.type, player[s.id])
    // as SagaLib: a choice the field doesn't have falls back to the default
    if (s.type === 'Radio' && pv !== undefined && s.choices?.length && !s.choices.includes(String(pv))) pv = undefined
    const v = pv ?? defaultOf(s)
    if (v !== undefined && !out.has(settingKey(s.id))) out.set(settingKey(s.id), v)
  }
  return out
}

/** The text of a value the way SagaLib writes it (Values.str): numbers without ".0". */
export function valueText(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)
  return String(v)
}

// ---------------------------------------------------------------- #67 U18: versions by a setting fixed at new game

/** Types a version may depend on. */
export const VERSION_TYPES = new Set<SettingType>(['Boolean', 'Radio'])
/**
 * #67 U37 (user, 2026-11-22): the player's gender, which versions may depend on like a setting
 * marked for versions: SagaLib records it once when the game starts (never changed after). Built
 * in: not one of the mod's settings, never written to LunaSettings.csv.
 */
export const PLAYER_GENDER_ID = 'player_gender'
export const PLAYER_GENDER: SettingDef = { id: PLAYER_GENDER_ID, label: 'Player', type: 'Radio', default: 'MALE', choices: ['MALE', 'FEMALE'], versions: true }
/** The mod's settings plus the built-in ones versions may depend on. */
const withBuiltins = (defs: SettingDef[] | undefined): SettingDef[] => [...(defs ?? []).filter((s) => s.id !== PLAYER_GENDER_ID), PLAYER_GENDER]
/** The settings marked for versions (Boolean and Radio only), then the player's gender. */
export const versionSettings = (defs: SettingDef[] | undefined): SettingDef[] => withBuiltins(defs).filter((s) => !!s.versions && VERSION_TYPES.has(s.type) && !!s.id)
/** The values a version can ask of a setting: Boolean true/false, a Radio's choices (one holding "+" can't be a version's: comboKey joins with it). */
export const versionValues = (s: SettingDef): string[] => (s.type === 'Boolean' ? ['true', 'false'] : s.type === 'Radio' ? (s.choices ?? []).filter((c) => !c.includes('+')) : [])
/** "on" / "off" for a Boolean, the choice for a Radio. */
export const valueLabel = (s: Pick<SettingDef, 'type'> | undefined, value: string): string => (s?.type === 'Boolean' ? (value === 'true' ? 'on' : value === 'false' ? 'off' : value) : s === PLAYER_GENDER ? value.toLowerCase() : value)

/** Why a setting token can't be used in a version (null: it can). */
export function tokenProblem(token: string, defs: SettingDef[] | undefined): string | null {
  const t = parseSettingToken(token)
  if (!t) return `"${token}" isn't a setting value (setting:<id>=<value>)`
  const s = withBuiltins(defs).find((x) => x.id === t.id)
  if (!s) return `the setting ${t.id} doesn't exist (Saga › Settings)`
  if (!VERSION_TYPES.has(s.type)) return `the setting "${s.label || s.id}" is ${TYPE_LABEL[s.type].toLowerCase()}; only on/off and choice settings can pick versions`
  if (!s.versions) return `the setting "${s.label || s.id}" isn't marked "Versions may depend on it" (Saga › Settings)`
  if (t.value.includes('+')) return `the value "${t.value}" holds a "+", which a version's key can't`
  if (!versionValues(s).includes(t.value)) return `the setting "${s.label || s.id}" can't be "${t.value}" (${s.type === 'Boolean' ? 'true or false' : `one of ${(s.choices ?? []).join(', ')}`})`
  return null
}
export const tokenValid = (token: string, defs: SettingDef[] | undefined): boolean => tokenProblem(token, defs) === null

/** "Difficulty = Hard", "Ironman = on" (an unknown setting by its id). */
export function tokenLabel(token: string, defs: SettingDef[] | undefined): string {
  const t = parseSettingToken(token)
  if (!t) return token
  const s = withBuiltins(defs).find((x) => x.id === t.id)
  return `${s?.label || t.id} = ${valueLabel(s, t.value)}`
}

/**
 * The tokens that count for these values (the Test context's: id → value text, missing = the
 * default): one per setting marked for versions, as SagaLib records it at new game.
 */
export function settingTokensOn(defs: SettingDef[] | undefined, values: Record<string, unknown> = {}, playerGender?: string): string[] {
  const marked = versionSettings(defs).filter((s) => s !== PLAYER_GENDER)
  const mem = settingsMemory(marked, values)
  const out: string[] = []
  for (const s of marked) { const v = mem.get(settingKey(s.id)); if (v !== undefined) out.push(settingToken(s.id, valueText(v))) }
  // #67 U37: the Test context's player gender, as SagaLib records the player's at new game
  if (playerGender) out.push(settingToken(PLAYER_GENDER_ID, playerGender))
  return out
}

// ---------------------------------------------------------------- multipliers

/** A scale as SagaLib reads it: Int settings are percent (per 100). */
export interface RuntimeScale { setting: string; per?: number; factors?: Record<string, number> }

/** The scale for SagaLib: `per: 100` for an Int setting (percent); factors only for Boolean, Radio and String. */
export function runtimeScale(sc: SettingScale | RuntimeScale | undefined, defs: SettingDef[]): RuntimeScale | undefined {
  if (!sc?.setting) return undefined
  if ('per' in sc && sc.per !== undefined) return { ...sc }
  const d = defs.find((x) => x.id === sc.setting)
  if (d && (d.type === 'Int' || d.type === 'Double')) return { setting: sc.setting, ...(d.type === 'Int' ? { per: 100 } : {}) }
  return { setting: sc.setting, ...(sc.factors && Object.keys(sc.factors).length ? { factors: { ...sc.factors } } : {}) }
}

/** SagaLib's factor: the setting's value in memory → a factor (unset or unreadable = 1; clamped to 0–100). */
export function scaleFactor(sc: RuntimeScale | undefined, get: (key: string) => unknown): number {
  if (!sc?.setting) return 1
  const v = get(settingKey(sc.setting))
  if (v === undefined || v === null) return 1
  let f: number
  if (sc.factors) {
    const k = typeof v === 'number' ? valueText(v) : String(v)
    f = k in sc.factors ? Number(sc.factors[k]) : 1
  } else if (typeof v === 'number') f = v / (sc.per || 1)
  else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) f = Number(v) / (sc.per || 1)
  else f = 1
  if (!Number.isFinite(f)) return 1
  return Math.min(100, Math.max(0, f))
}

/** Credits after the scale (rounded half up, as Java's Math.round). */
export const scaledCredits = (credits: number, factor: number): number => Math.floor(credits * factor + 0.5)

/** Fleet points after the scale (float), at least 1 when the base is above 0. */
export function scaledPoints(points: number, factor: number): number {
  const p = Math.fround(Math.fround(points) * Math.fround(factor))
  return points > 0 && p < 1 ? 1 : p
}

/** What a scale does, for the editor ("× 0.5 / 1 / 2 by Difficulty"). */
export function scaleText(sc: SettingScale | undefined, defs: SettingDef[]): string {
  if (!sc?.setting) return ''
  const d = defs.find((x) => x.id === sc.setting)
  const name = d?.label || sc.setting
  if (!d) return `scaled by ${sc.setting} (not a setting of this mod)`
  if (d.type === 'Int') return `× ${name} ÷ 100 (percent; default ${d.default}%)`
  if (d.type === 'Double') return `× ${name} (default ${d.default})`
  const f = sc.factors ?? {}
  const keys = d.type === 'Boolean' ? ['true', 'false'] : d.type === 'Radio' ? d.choices ?? [] : Object.keys(f)
  return `by ${name}: ${keys.map((k) => `${k} × ${f[k] ?? 1}`).join(', ') || 'no factors (× 1)'}`
}

// ---------------------------------------------------------------- export

/** One LunaSettings.csv row (cells by LUNA_HEADER). */
export function settingRow(s: SettingDef): Record<string, string> {
  const num = s.type === 'Int' || s.type === 'Double'
  return {
    fieldID: s.id,
    fieldName: s.label,
    fieldType: s.type,
    // LunaLib draws a Header's heading and a Text line's text from defaultValue (found in game, 2026-11-18)
    defaultValue: isValueSetting(s) ? s.default : s.label,
    secondaryValue: s.type === 'Radio' ? (s.choices ?? []).join(',') : '',
    fieldDescription: s.tooltip ?? '',
    minValue: num ? String(s.min ?? DEFAULT_MIN) : '',
    maxValue: num ? String(s.max ?? DEFAULT_MAX) : '',
    tab: s.tab ?? ''
  }
}

/** The mod's LunaSettingsConfig.json entry (its icon in LunaLib's menu). */
export const settingsConfig = (modId: string, icon: string | undefined): Record<string, unknown> => (icon ? { [modId]: { iconPath: icon } } : {})

// ---------------------------------------------------------------- where settings are read

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Settings read anywhere in the plans: conditions, texts, scales (a key followed by a non-word character). */
export function settingsRead(m: ModModel): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const defs = valueSettings(m)
  if (!defs.length) return out
  const add = (id: string, where: string) => { const l = out.get(id) ?? []; if (!l.includes(where)) l.push(where); out.set(id, l) }
  const scan = (what: unknown, where: string) => {
    const t = JSON.stringify(what)
    for (const d of defs) if (new RegExp(`\\$global\\.${esc(d.id)}(?![A-Za-z0-9_])`).test(t)) add(d.id, where)
  }
  for (const q of m.quests) {
    scan({ s: q.start, r: q.requires, n: q.nodes }, `quest ${q.title || q.id}`)
    for (const r of q.rewards) if (r.creditsScale?.setting) add(r.creditsScale.setting, `quest ${q.title || q.id}, reward ${r.id}`)
  }
  for (const e of m.encounters) if (e.fleet.sizeScale?.setting) add(e.fleet.sizeScale.setting, `encounter ${e.name || e.id}`)
  scan(m.phrases, 'mod-wide phrases')
  for (const p of m.people) scan(p.phrases, `${`${p.name.first} ${p.name.last}`.trim() || p.id}'s phrases`)
  for (const s of m.events ?? []) scan(s, `event scheduler ${s.name || s.id}`)
  for (const p of m.progress ?? []) scan(p, `progress event ${p.name || p.id}`)
  for (const p of m.pools ?? []) scan(p.entries, `pool ${p.name || p.id}`)
  // #67 (found by the user, 2026-11-21): a version that depends on the setting reads it too (its
  // id stopped following the label only for conditions, so a rename orphaned the versions)
  const versioned: [string, unknown][] = [
    ...m.quests.map((q): [string, unknown] => [`quest ${q.title || q.id}`, q]), ...m.people.map((p): [string, unknown] => [`person ${p.id}`, p]),
    ...m.encounters.map((e): [string, unknown] => [`encounter ${e.name || e.id}`, e]), ...m.systems.map((s): [string, unknown] => [`system ${s.name || s.id}`, s]),
    ...(m.events ?? []).map((s): [string, unknown] => [`event scheduler ${s.name || s.id}`, s]), ...(m.pools ?? []).map((p): [string, unknown] => [`pool ${p.name || p.id}`, p]),
    ...(m.progress ?? []).map((p): [string, unknown] => [`progress event ${p.name || p.id}`, p]), ['starting relations and scripted changes', m.factionsRuntime]
  ]
  for (const [where, x] of versioned) {
    const vs = (x as { versions?: { mods: string[] }[] } | undefined)?.versions ?? []
    for (const v of vs) for (const t of v.mods) {
      const id = /^setting:([^=]+)=/.exec(t)?.[1]
      if (id && defs.some((d) => d.id === id)) add(id, `versions of ${where}`)
    }
  }
  return out
}

/**
 * #67 (found by the user, 2026-11-21): a setting's id changed (it follows its label until something
 * reads it, or set by hand): everything that points at it follows. Its memory key in conditions,
 * texts and keys ($global.<id>), the version tokens (setting:<id>=<value>), test profiles' keys and
 * the scales that name it. Walks the whole model, so nothing that names it is left behind.
 */
export function renameSetting(m: ModModel, from: string, to: string): void {
  if (!from || from === to) return
  const key = new RegExp(`\\$global\\.${esc(from)}(?![A-Za-z0-9_])`, 'g')
  const token = `setting:${from}=`
  const fix = (s: string) => (s.startsWith(token) ? `setting:${to}=${s.slice(token.length)}` : s.replace(key, `$global.${to}`))
  const seen = new Set<object>()
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object' || seen.has(o)) return
    seen.add(o)
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const v = o[i]; if (typeof v === 'string') { const n = fix(v); if (n !== v) o[i] = n } else walk(v) } return }
    const r = o as Record<string, unknown>
    for (const k of Object.keys(r)) {
      const v = r[k]
      if (k === 'setting' && v === from) r[k] = to
      else if (typeof v === 'string') { const n = fix(v); if (n !== v) r[k] = n }
      else walk(v)
      const nk = fix(k)
      if (nk !== k && !(nk in r)) { r[nk] = r[k]; delete r[k] }
    }
  }
  // the setting list itself is left alone (its own id is the caller's)
  if (m.project.settings) seen.add(m.project.settings)
  walk(m)
}

/** The mod uses its settings at runtime (only SagaLib sets their keys): some setting is read or scales something. */
export const usesSettings = (m: ModModel): boolean => settingsRead(m).size > 0

/** Condition lines for the condition pickers ("Setting Difficulty is Hard"). */
export function settingConditionTemplates(defs: SettingDef[]): { label: string; line: string }[] {
  const out: { label: string; line: string }[] = []
  for (const s of defs.filter(isValueSetting)) {
    const k = settingKey(s.id)
    const name = s.label || s.id
    if (s.type === 'Boolean') { out.push({ label: `Setting "${name}" is on`, line: k }); out.push({ label: `Setting "${name}" is off`, line: `!${k}` }) }
    else if (s.type === 'Radio') for (const c of s.choices ?? []) out.push({ label: `Setting "${name}" is ${c}`, line: `${k} == ${c}` })
    else if (s.type === 'Int' || s.type === 'Double') out.push({ label: `Setting "${name}" at least…`, line: `${k} >= ${s.default || 0}` })
    else out.push({ label: `Setting "${name}" is…`, line: `${k} == ${s.default}` })
  }
  return out
}
