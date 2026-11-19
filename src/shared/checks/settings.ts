/**
 * #62 (PLAN.md §10.4): the mod's settings page (Saga › Settings) and what uses it:
 *  - ids: missing, not a plain id, without the prefix, twice;
 *  - a default SagaLib can't read (it skips the setting), a choice list, the number range;
 *  - a condition testing a choice the setting doesn't have;
 *  - multipliers (credit rewards, encounter fleet size) naming no setting, a text setting, or
 *    leaving every factor at 1; a fleet scale on a fleet not sized by points.
 */
import type { Problem } from '../api'
import type { CheckContext } from './index'
import { ID_PATTERN, prefixProblem } from './index'
import type { SettingDef, SettingScale } from '../model'
import { DEFAULT_MAX, DEFAULT_MIN, defaultOf, isValueSetting } from '../settings'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function settingProblems(ctx: CheckContext): Problem[] {
  const m = ctx.model
  const defs = m.project.settings ?? []
  const out: Problem[] = []
  const ref = (id: string) => ({ page: 'saga' as const, id: 'settings', sub: id })
  const seen = new Set<string>()
  for (const s of defs) {
    const name = s.label || s.id || '(no label)'
    if (!s.id) { out.push({ level: 'error', area: 'Settings', message: `Setting "${name}" has no id: LunaLib skips a row without one.`, ref: ref(s.id), key: `settingnoid:${name}` }); continue }
    if (!ID_PATTERN.test(s.id)) out.push({ level: 'error', area: 'Settings', message: `Setting id "${s.id}" may only have lowercase letters, digits and _ (it is a memory key, $global.${s.id}).`, ref: ref(s.id), key: `settingidchars:${s.id}` })
    const pp = prefixProblem(m.project.prefix, s.id, 'Setting', ref(s.id))
    if (pp) out.push({ ...pp, message: `${pp.message} LunaLib keeps every mod's values by id, and SagaLib's $global keys are shared by all mods.` })
    if (seen.has(s.id)) out.push({ level: 'error', area: 'Settings', message: `Two settings have the id "${s.id}"; only the first is used.`, ref: ref(s.id), key: `settingdup:${s.id}` })
    seen.add(s.id)
    if (!s.label.trim()) out.push({ level: 'warning', area: 'Settings', message: `Setting ${s.id} has no ${s.type === 'Text' ? 'text' : 'label'}: the page shows an empty line.`, ref: ref(s.id), key: `settingnolabel:${s.id}` })
    if (!isValueSetting(s)) continue
    if (s.type === 'Radio') {
      if (!s.choices?.length) out.push({ level: 'error', area: 'Settings', message: `Setting "${name}" is a choice without choices.`, ref: ref(s.id), key: `settingnochoices:${s.id}` })
      else if (!s.choices.includes(s.default)) out.push({ level: 'warning', area: 'Settings', message: `Setting "${name}": the default "${s.default}" isn't one of its choices (${s.choices.join(', ')}).`, ref: ref(s.id), key: `settingdefchoice:${s.id}` })
    }
    if (defaultOf(s) === undefined) {
      out.push({ level: 'error', area: 'Settings', message: `Setting "${name}": the default "${s.default}" isn't ${s.type === 'Boolean' ? 'true or false' : s.type === 'Int' ? 'a whole number' : 'a number'}. LunaLib can't read it and SagaLib skips the setting.`, ref: ref(s.id), key: `settingdefault:${s.id}` })
    }
    if (s.type === 'Int' || s.type === 'Double') {
      const lo = s.min ?? DEFAULT_MIN, hi = s.max ?? DEFAULT_MAX
      if (lo > hi) out.push({ level: 'error', area: 'Settings', message: `Setting "${name}": the minimum ${lo} is above the maximum ${hi}.`, ref: ref(s.id), key: `settingrange:${s.id}` })
      const d = Number(s.default)
      if (Number.isFinite(d) && lo <= hi && (d < lo || d > hi)) out.push({ level: 'warning', area: 'Settings', message: `Setting "${name}": the default ${s.default} is outside its range ${lo}–${hi}; LunaLib's slider can't show it.`, ref: ref(s.id), key: `settingdefrange:${s.id}` })
      if (s.type === 'Int' && (!Number.isInteger(lo) || !Number.isInteger(hi))) out.push({ level: 'warning', area: 'Settings', message: `Setting "${name}" is a whole number but its range ${lo}–${hi} isn't.`, ref: ref(s.id), key: `settingintrange:${s.id}` })
    }
  }

  // a condition testing a choice the setting doesn't have (a typo never matches)
  const radios = defs.filter((s) => s.type === 'Radio' && s.id && s.choices?.length)
  if (radios.length) {
    const texts: { where: string; text: string; ref: Problem['ref'] }[] = [
      ...m.quests.map((q) => ({ where: `quest ${q.title || q.id}`, text: JSON.stringify({ s: q.start, r: q.requires, n: q.nodes }), ref: { page: 'quests' as const, id: q.id } })),
      { where: 'mod-wide phrases', text: JSON.stringify(m.phrases), ref: { page: 'saga' as const, id: 'phrases' } },
      ...m.people.map((p) => ({ where: `${`${p.name.first} ${p.name.last}`.trim() || p.id}'s phrases`, text: JSON.stringify(p.phrases), ref: { page: 'people' as const, id: p.id } })),
      ...(m.events ?? []).map((e) => ({ where: `event scheduler ${e.name || e.id}`, text: JSON.stringify(e), ref: { page: 'saga' as const, id: 'events', sub: e.id } })),
      ...(m.progress ?? []).map((e) => ({ where: `progress event ${e.name || e.id}`, text: JSON.stringify(e), ref: { page: 'saga' as const, id: 'progress', sub: e.id } }))
    ]
    for (const s of radios) {
      const re = new RegExp(`\\$global\\.${esc(s.id)}\\s*(?:==|!=)\\s*([^\\s"\\\\,]+)`, 'g')
      for (const t of texts) {
        for (const mm of t.text.matchAll(re)) {
          const v = mm[1]
          if (v.startsWith('$') || s.choices!.includes(v)) continue
          out.push({ level: 'warning', area: 'Settings', message: `${t.where} tests $global.${s.id} == ${v}, but "${s.label || s.id}" has the choices ${s.choices!.join(', ')}: it never matches.`, ref: t.ref, key: `settingchoice:${s.id}:${v}:${t.where}` })
        }
      }
    }
  }

  // a whole-number setting shown in text reads "100.0": memory numbers are decimals (found in game, 2026-11-18)
  const ints = defs.filter((s) => s.type === 'Int' && s.id)
  if (ints.length) {
    const texts: { where: string; text: string; ref: Problem['ref'] }[] = []
    for (const q of m.quests) {
      const ref = { page: 'quests' as const, id: q.id }
      const st = q.start as { offerText?: string; optionText?: string; blurb?: string }
      texts.push({ where: `quest ${q.title || q.id}`, text: [st.offerText, st.optionText, st.blurb].join('\n'), ref })
      for (const n of q.nodes) {
        const parts = n.type === 'dialog' ? [n.text, ...n.options.map((o) => `${o.text}\n${o.tooltip ?? ''}`), ...n.phrases.flatMap((p) => [...p.cases.map((c) => c.text), p.otherwise ?? ''])]
          : n.type === 'wait' ? [n.arriveText ?? '', n.optionText ?? ''] : n.type === 'raid' ? [n.text, n.raidText ?? ''] : []
        if (parts.length) texts.push({ where: `quest ${q.title || q.id}, node ${n.id}`, text: parts.join('\n'), ref: { ...ref, sub: n.id } })
      }
      for (const s of q.stages) texts.push({ where: `quest ${q.title || q.id}, stage ${s.id}`, text: `${s.journal}\n${s.nextStep ?? ''}`, ref })
    }
    for (const p of [...m.phrases, ...m.people.flatMap((x) => x.phrases)]) texts.push({ where: `phrase ${p.token}`, text: [...p.cases.map((c) => c.text), p.otherwise ?? ''].join('\n'), ref: { page: 'saga', id: 'phrases' } })
    for (const s of ints) {
      const re = new RegExp(`\\$global\\.${esc(s.id)}(?![A-Za-z0-9_])`)
      for (const t of texts) if (re.test(t.text)) out.push({ level: 'warning', area: 'Settings', message: `${t.where} shows $global.${s.id} in its text: the game prints a whole-number setting with a decimal ("100.0"), because memory keeps numbers as decimals. Say it in words, or use a Branch or phrase on the value.`, ref: t.ref, key: `settingintext:${s.id}:${t.where}` })
    }
  }

  // multipliers
  const scale = (sc: SettingScale | undefined, what: string, r: Problem['ref'], key: string) => {
    if (!sc) return
    const d: SettingDef | undefined = defs.find((x) => x.id === sc.setting)
    if (!d) { out.push({ level: 'error', area: 'Settings', message: `${what} is scaled by "${sc.setting}", which isn't one of the mod's settings (Saga › Settings); SagaLib counts it as × 1.`, ref: r, key: `scalenone:${key}` }); return }
    if (d.type === 'String' || !isValueSetting(d)) { out.push({ level: 'warning', area: 'Settings', message: `${what} is scaled by "${d.label || d.id}", a ${d.type === 'String' ? 'text' : 'layout'} setting: it stays × 1. Use an on/off, a number or a choice.`, ref: r, key: `scaletype:${key}` }); return }
    if ((d.type === 'Boolean' || d.type === 'Radio') && Object.values(sc.factors ?? {}).every((f) => f === 1)) out.push({ level: 'warning', area: 'Settings', message: `${what} is scaled by "${d.label || d.id}", but every factor is 1: nothing changes.`, ref: r, key: `scaleones:${key}` })
  }
  for (const q of m.quests) for (const rw of q.rewards) scale(rw.creditsScale, `Quest "${q.title || q.id}", reward ${rw.id} (credits)`, { page: 'quests', id: q.id }, `${q.id}/${rw.id}`)
  for (const e of m.encounters) {
    if (!e.fleet.sizeScale) continue
    if (e.fleet.size !== 'fp') { out.push({ level: 'warning', area: 'Settings', message: `Encounter "${e.name || e.id}" has a size scale, but its fleet isn't sized by fleet points (exact ships or a named fleet): the scale is ignored.`, ref: { page: 'encounters', id: e.id }, key: `scalefleetsize:${e.id}` }); continue }
    scale(e.fleet.sizeScale, `Encounter "${e.name || e.id}" (fleet size)`, { page: 'encounters', id: e.id }, `enc:${e.id}`)
  }
  return out
}
