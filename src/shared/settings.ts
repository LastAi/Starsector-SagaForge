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
  return out
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
