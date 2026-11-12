/**
 * A quest plan → the rules.csv rows the game will run (PLAN.md §4.3, §4.4, §4.9; docs/FORMATS.md).
 * Play mode runs exactly these rows, so it tests what the game will see.
 *
 * How nodes become rules:
 *  - Every node that does something is one rule, id "<quest>_<node>". Option ids are "<quest>_<option>".
 *  - A node reached by exactly one Dialog option fires on DialogOptionSelected with
 *    "$option == <that option>". Any other node gets its own trigger "<quest>_<node>", and whatever
 *    leads there jumps with "FireBest <quest>_<node>" (an option gets a small "_go" rule for it).
 *  - Options with conditions (show if, show once) are added by their own FireAll rules, the way
 *    vanilla adds conditional options; then all of that node's options come from those rules.
 *  - A rule's script runs after its text (FORMATS.md), so displays placed between paragraphs make
 *    the text after them AddText lines.
 */
import type { RuleRow } from '../rules/types'
import type { BranchNode, DialogNode, Display, OptionDef, Phrase, QEdge, QNode, QuestPlan, Visual } from '../model'
import type { Problem } from '../api'
import { paragraphs, parseCondition } from '../rules/parse'

export interface CompileOptions {
  /** The mod uses SagaLib (quests always do; dialog-only content may not). */
  sagalib: boolean
  /** Mod-wide and people's phrases (named tokens). */
  phrases: Phrase[]
  /** Item names, for the readable text of "Gained" lines in comments; optional. */
  sourceId?: string
  /** Commodity or special item (special items need AddRemoveAnyItem SPECIAL); unknown = commodity. */
  itemKind?: (id: string) => "commodity" | "special" | undefined
}

export interface CompiledQuest {
  rows: RuleRow[]
  /** Which plan node each rule came from. */
  nodeOf: Record<string, string>
  problems: Problem[]
  /** Flags this export generates (show-once). */
  generatedFlags: { key: string; node: string; option: string; scope: 'conversation' | 'ever' }[]
  /** Uses SagaLib commands (SF_…), so the mod needs the dependency. */
  usesSagaLib: boolean
  /** Option ids → node they belong to. */
  optionNode: Record<string, string>
  /** The trigger that enters each node. */
  entry: Record<string, Entry>
}

export interface Entry { trigger: string; conds: string[] }

export const optionId = (q: QuestPlan, o: string) => `${q.id}_${o}`
export const nodeRuleId = (q: QuestPlan, n: string) => `${q.id}_${n}`
export const nodeTrigger = (q: QuestPlan, n: string) => `${q.id}_${n}`
export const startOptionId = (q: QuestPlan) => `${q.id}_start`
export const stepKey = (q: QuestPlan) => `$global.${q.id}_step`
/** Where a conversation branch that shows nothing more goes: back to the person's / place's menu. */
export const BACK_TO_MENU = 'FireAll PopulateOptions'
/** The same with SagaLib: closes the dialog when there's no menu to go back to. */
export const SAGA_BACK_TO_MENU = 'SF_BackToMenu'

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`

export function compileQuest(q: QuestPlan, opts: CompileOptions): CompiledQuest {
  const rows: RuleRow[] = []
  const nodeOf: Record<string, string> = {}
  const problems: Problem[] = []
  const generatedFlags: CompiledQuest['generatedFlags'] = []
  const optionNode: Record<string, string> = {}
  let usesSagaLib = q.kind === 'quest'
  const byId = new Map(q.nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, QEdge[]>()
  for (const e of q.edges) incoming.set(e.to, [...(incoming.get(e.to) ?? []), e])
  const outOf = (n: string, handle: string) => q.edges.find((e) => e.from === n && e.handle === handle)
  const ref = (node: string, sub?: string) => ({ page: 'quests' as const, id: q.id, sub: sub ? `${node}/${sub}` : node })
  let line = 0
  const push = (r: Omit<RuleRow, 'notes' | 'sourceId' | 'file' | 'line'> & { notes?: string }, node: string) => {
    rows.push({ notes: '', ...r, sourceId: opts.sourceId ?? 'plan', file: `quest ${q.id}`, line: ++line })
    nodeOf[r.id] = node
  }

  // Option ids: an option leading to a Link (mode option) uses the linked id itself.
  const optId = (n: DialogNode, o: OptionDef) => {
    const e = outOf(n.id, o.id)
    const t = e && byId.get(e.to)
    if (t?.type === 'link' && t.mode === 'option') return t.target
    return optionId(q, o.id)
  }
  for (const n of q.nodes) if (n.type === 'dialog') for (const o of n.options) optionNode[optId(n, o)] = n.id

  // ---- entries
  const start = q.nodes.find((n) => n.type === 'start')
  const startEdge = start ? outOf(start.id, 'next') : undefined
  const prereqConds = prereqConditions(q)
  const entry: Record<string, Entry> = {}
  const singleOption = (nid: string): { node: DialogNode; opt: OptionDef } | null => {
    const inc = (incoming.get(nid) ?? []).filter((e) => byId.get(e.from)?.type !== 'note')
    if (inc.length !== 1) return null
    const src = byId.get(inc[0].from)
    if (src?.type !== 'dialog') return null
    const opt = src.options.find((o) => o.id === inc[0].handle)
    return opt ? { node: src, opt } : null
  }
  for (const n of q.nodes) {
    if (n.type === 'note' || n.type === 'start' || n.type === 'link') continue
    const inc = (incoming.get(n.id) ?? []).filter((e) => byId.get(e.from)?.type !== 'note')
    if (startEdge?.to === n.id && inc.length === 1) {
      const s = q.start
      if (s.kind === 'trigger') entry[n.id] = { trigger: s.trigger, conds: [...s.conditions, ...prereqConds] }
      else if (s.kind === 'manual') entry[n.id] = { trigger: nodeTrigger(q, n.id), conds: [] }
      else entry[n.id] = { trigger: 'DialogOptionSelected', conds: [`$option == ${startOptionId(q)}`] }
      continue
    }
    const so = singleOption(n.id)
    if (so) entry[n.id] = { trigger: 'DialogOptionSelected', conds: [`$option == ${optId(so.node, so.opt)}`] }
    else entry[n.id] = { trigger: nodeTrigger(q, n.id), conds: [] }
  }

  /** Script that continues to node `to` (for non-option transitions). */
  const jumpTo = (to: string | undefined): string[] => {
    if (!to) return []
    const t = byId.get(to)
    if (!t) return []
    if (t.type === 'link') return linkJump(t)
    // an Arrive node is an event: its rule fires by itself when the player arrives (gated by the step)
    if (t.type === 'wait' && t.mode === 'arrive') return []
    const en = entry[to]
    if (!en) return []
    if (en.trigger === 'DialogOptionSelected') {
      // reached by an option elsewhere and also from here: shouldn't happen (entry would be a custom trigger)
      return [`FireBest ${nodeTrigger(q, to)}`]
    }
    return [`FireBest ${en.trigger}`]
  }
  /**
   * What runs after node `n`: the jump to its next node, or, when nothing comes next (or the next
   * node is an Arrive event), back to the menu. Otherwise the dialog would keep the options of the
   * last Dialog node and the player could pick them again (found in game, 2026-11-11).
   */
  const cont = (n: QNode, script: string[] = [], to = outOf(n.id, 'next')?.to): string[] => {
    const lines = jumpTo(to)
    if (lines.length || script.some((l) => /^(EndConversation|DismissDialog|SF_BackToMenu)\b/.test(l.trim()))) return lines
    const how = opts.sagalib ? 'goes back to the menu, or closes where there is none (a wreck)' : 'goes back to the menu (FireAll PopulateOptions)'
    problems.push({ level: 'info', area: 'Quest', message: `"${(n as { title?: string }).title || n.id}" is the end of a conversation branch: the dialog ${how}. Add a Dialog or a Link to show something else.`, ref: ref(n.id), key: `menuback:${q.id}:${n.id}` })
    // with SagaLib: at a wreck or other entity PopulateOptions adds nothing and the dialog was left open (found in game, 2026-11-11)
    if (opts.sagalib) { usesSagaLib = true; return [SAGA_BACK_TO_MENU] }
    return [BACK_TO_MENU]
  }
  const linkJump = (l: Extract<QNode, { type: 'link' }>): string[] => {
    if (l.mode === 'trigger') return [`${l.fire ?? 'FireAll'} ${l.target}`]
    if (l.mode === 'option') return [`$option = ${l.target} 0`, 'FireBest DialogOptionSelected']
    return [`FireBest ${nodeTrigger(q, l.target)}`]
  }

  // ---- the start
  if (q.start.kind === 'contact' || q.start.kind === 'bar') {
    const s = q.start
    const isBar = s.kind === 'bar'
    if (!startEdge) problems.push({ level: 'error', area: 'Quest', message: 'The Start node leads nowhere.', ref: ref(start?.id ?? 'start') })
    const blurb = (isBar ? s.blurb : s.offerText) ?? ''
    push({ id: `${q.id}_blurb`, trigger: `${q.id}_blurb${isBar ? 'Bar' : ''}`, conditions: '', script: '', text: blurb, options: '' }, start?.id ?? 'start')
    push({ id: `${q.id}_option`, trigger: `${q.id}_option${isBar ? 'Bar' : ''}`, conditions: '', script: '', text: '', options: `${startOptionId(q)}:${s.optionText ?? q.title}` }, start?.id ?? 'start')
  } else if (q.start.kind === 'option') {
    const s = q.start
    push({
      id: `${q.id}_start`, trigger: s.trigger || 'PopulateOptions', conditions: [...s.conditions, ...prereqConds].join('\n'), script: '', text: '',
      options: `${s.order ?? 50}:${startOptionId(q)}:${s.optionText}`
    }, start?.id ?? 'start')
  }

  // ---- when the first node is also re-entered from elsewhere it has its own trigger (or it is a
  // Link into existing dialog): the start jumps to it
  const firstIsLink = !!startEdge && byId.get(startEdge.to)?.type === 'link'
  if (startEdge && (firstIsLink || entry[startEdge.to]?.trigger === nodeTrigger(q, startEdge.to))) {
    const s = q.start
    const first = startEdge.to
    if (s.kind === 'trigger') {
      push({ id: `${q.id}_start_go`, trigger: s.trigger, conditions: [...s.conditions, ...prereqConds].join('\n'), script: jumpTo(first).join('\n'), text: '', options: '' }, start!.id)
    } else if (s.kind !== 'manual') {
      const mission = s.kind === 'contact' || s.kind === 'bar' ? [`$missionId = ${q.id}`] : []
      push({ id: `${q.id}_start_go`, trigger: 'DialogOptionSelected', conditions: `$option == ${startOptionId(q)}`, script: [...mission, ...jumpTo(first)].join('\n'), text: '', options: '' }, start!.id)
    }
  }

  // ---- nodes
  for (const n of q.nodes) {
    const en = entry[n.id]
    switch (n.type) {
      case 'dialog': compileDialog(n, en); break
      case 'branch': compileBranch(n, en); break
      case 'action': {
        const script: string[] = []
        for (const op of n.ops) script.push(...actionLines(op))
        script.push(...cont(n))
        push({ id: nodeRuleId(q, n.id), trigger: en.trigger, conditions: en.conds.join('\n'), script: script.join('\n'), text: '', options: '' }, n.id)
        break
      }
      case 'stage': {
        const st = q.stages.find((s) => s.id === n.stage)
        if (!st) problems.push({ level: 'error', area: 'Quest', message: `Stage node: no stage "${n.stage}" in the outline.`, ref: ref(n.id) })
        usesSagaLib = true
        const script = [`SF_Step ${q.id} ${n.stage}`, ...cont(n)]
        push({ id: nodeRuleId(q, n.id), trigger: en.trigger, conditions: en.conds.join('\n'), script: script.join('\n'), text: '', options: '' }, n.id)
        break
      }
      case 'end': {
        usesSagaLib = true
        const script = [`SF_End ${q.id} ${n.outcome === 'abandon' ? 'fail' : n.outcome}`]
        if (n.reward) script.unshift(`SF_Reward ${q.id} ${n.reward}`)
        script.push(...cont(n))
        push({ id: nodeRuleId(q, n.id), trigger: en.trigger, conditions: en.conds.join('\n'), script: script.join('\n'), text: '', options: '' }, n.id)
        break
      }
      case 'encounter': {
        usesSagaLib = true
        const script = [`SF_Spawn ${n.encounter}`, ...cont(n)]
        push({ id: nodeRuleId(q, n.id), trigger: en.trigger, conditions: en.conds.join('\n'), script: script.join('\n'), text: '', options: '' }, n.id)
        // outcomes: SagaLib fires "<quest>_<node>_defeated" / "_avoided" when the fleet is beaten or leaves
        for (const out of ['defeated', 'avoided'] as const) {
          const e = outOf(n.id, out)
          if (!e) continue
          const script = jumpTo(e.to)
          if (!script.length) continue // nothing to run or show (e.g. it continues at an Arrive node)
          push({ id: `${nodeRuleId(q, n.id)}_${out}`, trigger: `${nodeTrigger(q, n.id)}_${out}`, conditions: '', script: script.join('\n'), text: '', options: '' }, n.id)
        }
        break
      }
      case 'wait': {
        usesSagaLib = true
        const next = outOf(n.id, 'next')?.to
        if (n.mode === 'arrive') {
          // the player arrives: an interaction rule at the place, only while the quest is at this point
          const stepCond = currentStepCondition(q, n.id)
          push({
            id: nodeRuleId(q, n.id), trigger: 'OpenInteractionDialog',
            conditions: [`$id == ${n.entity ?? ''}`, ...(stepCond ? [stepCond] : []), `!$global.${q.id}_${n.id}_done`].join('\n'),
            script: [`$global.${q.id}_${n.id}_done = true`, ...jumpTo(next)].join('\n'), text: n.arriveText ?? '', options: ''
          }, n.id)
        } else {
          // time: SagaLib fires "<quest>_<node>" after the delay (quest JSON timer)
          push({ id: nodeRuleId(q, n.id), trigger: nodeTrigger(q, n.id), conditions: '', script: jumpTo(next).join('\n'), text: '', options: '' }, n.id)
        }
        break
      }
    }
  }

  // ---- jumps for options into nodes entered by their own trigger
  for (const n of q.nodes) {
    if (n.type !== 'dialog') continue
    for (const o of n.options) {
      const e = outOf(n.id, o.id)
      const oid = optId(n, o)
      const t = e && byId.get(e.to)
      if (!e || !t) continue
      if (t.type === 'link') {
        if (t.mode === 'option') continue // the option id is the linked one; the existing rule answers it
        push({ id: `${q.id}_${o.id}_go`, trigger: 'DialogOptionSelected', conditions: `$option == ${oid}`, script: [...pickScript(n, o), ...linkJump(t)].join('\n'), text: '', options: '' }, n.id)
        continue
      }
      const en = entry[t.id]
      // the target answers it itself (not an Arrive node: its rule is the arrival, OpenInteractionDialog)
      const isArrive = t.type === 'wait' && t.mode === 'arrive'
      if (!isArrive && en && en.trigger === 'DialogOptionSelected' && en.conds[0] === `$option == ${oid}`) continue
      // an option into an Arrive node ends the conversation here (the arrival fires by itself later)
      const pick = pickScript(n, o)
      push({ id: `${q.id}_${o.id}_go`, trigger: 'DialogOptionSelected', conditions: `$option == ${oid}`, script: [...pick, ...cont(n, pick, t.id)].join('\n'), text: '', options: '' }, n.id)
    }
  }

  function pickScript(n: DialogNode, o: OptionDef): string[] {
    if (!o.showOnce) return []
    const key = o.showOnce === 'ever' ? `$global.${q.id}_${o.id}_asked` : `$${q.id}_${n.id}_${o.id}_asked`
    generatedFlags.push({ key, node: n.id, option: o.id, scope: o.showOnce })
    return [o.showOnce === 'ever' ? `${key} = true` : `${key} = true 0`]
  }

  function compileDialog(n: DialogNode, en: Entry) {
    // script lines added by picking the option that enters this node (show-once flags)
    const so = singleOption(n.id)
    const enterScript = so && en.trigger === 'DialogOptionSelected' ? pickScript(so.node, so.opt) : []
    // the offer of a contact or bar quest: vanilla's hub needs $missionId to accept it (docs/FORMATS.md, Hub missions)
    if (startEdge?.to === n.id && (q.start.kind === 'contact' || q.start.kind === 'bar')) enterScript.unshift(`$missionId = ${q.id}`)
    const conds = [...en.conds, ...n.conditions]
    const script: string[] = [...enterScript, ...visualLines(n.visual)]
    // text and displays: displays placed before the last paragraph split the text into AddText lines
    const paras = paragraphs(n.text)
    const displays = [...n.displays].sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9))
    const firstSplit = displays.find((d) => d.at !== undefined && d.at < paras.length - 1)
    let text: string
    const after: string[] = []
    if (!firstSplit) {
      text = paras.join('\n\n')
      for (const d of displays) after.push(...displayLines(d, opts.itemKind))
    } else {
      const k = (firstSplit.at ?? -1) + 1
      text = paras.slice(0, Math.max(0, k)).join('\n\n')
      let pi = Math.max(0, k)
      for (const d of displays) {
        const until = d.at === undefined ? paras.length : d.at + 1
        while (pi < until && pi < paras.length) after.push(`AddText ${quote(paras[pi++])}`)
        after.push(...displayLines(d, opts.itemKind))
      }
      while (pi < paras.length) after.push(`AddText ${quote(paras[pi++])}`)
    }
    if (n.highlights.length) script.push(`SetTextHighlights ${n.highlights.map(quote).join(' ')}`)
    script.push(...after)
    // options
    const conditional = n.options.some((o) => o.showIf?.length || o.showOnce)
    let optionsCol = ''
    const optLines: string[] = []
    n.options.forEach((o, i) => {
      const oid = optId(n, o)
      if (!outOf(n.id, o.id)) problems.push({ level: 'error', area: 'Quest', message: `Option "${o.text}" leads nowhere.`, ref: ref(n.id, o.id), key: `deadopt:${q.id}:${n.id}:${o.id}` })
      if (o.tooltip) optLines.push(`SetTooltip ${oid} ${quote(o.tooltip)}`)
      if (o.story) optLines.push(`SetStoryOption ${oid} ${o.story.cost} general ui_char_spent_story_point ${quote(o.text)}`)
      if (o.shortcut) optLines.push(`SetShortcut ${oid} "${o.shortcut === 'ESC' ? 'ESCAPE' : o.shortcut}"`)
      if (o.disabledIf && !o.disabledIf.length) optLines.push(`SetEnabled ${oid} false`)
      void i
    })
    const ordered = n.options.map((o, i) => ({ o, i, oid: optId(n, o) }))
    if (!conditional) {
      optionsCol = ordered.map(({ o, i, oid }) => `${i + 1}:${oid}:${o.text}`).join('\n')
      script.push(...optLines)
    } else if (n.options.length) {
      script.push(`FireAll ${nodeTrigger(q, n.id)}_options`)
      for (const { o, i, oid } of ordered) {
        const c: string[] = [...(o.showIf ?? [])]
        if (o.showOnce) c.push(o.showOnce === 'ever' ? `!$global.${q.id}_${o.id}_asked` : `!$${q.id}_${n.id}_${o.id}_asked`)
        const own = optLines.filter((l) => l.split(' ')[1] === oid)
        push({ id: `${q.id}_${n.id}_o${i + 1}`, trigger: `${nodeTrigger(q, n.id)}_options`, conditions: c.join('\n'), script: own.join('\n'), text: '', options: `${i + 1}:${oid}:${o.text}` }, n.id)
      }
    }
    // options disabled under conditions: their own FireAll rule after the options exist
    const condDisabled = n.options.filter((o) => o.disabledIf?.length)
    if (condDisabled.length) {
      script.push(`FireAll ${nodeTrigger(q, n.id)}_state`)
      condDisabled.forEach((o, i) => push({ id: `${q.id}_${n.id}_d${i + 1}`, trigger: `${nodeTrigger(q, n.id)}_state`, conditions: (o.disabledIf ?? []).join('\n'), script: `SetEnabled ${optId(n, o)} false`, text: '', options: '' }, n.id))
    }
    script.push(...n.script)
    if (!n.options.length) script.push(...cont(n, script))
    if (n.options.length > 10) problems.push({ level: 'warning', area: 'Quest', message: `"${n.title ?? n.id}" has ${n.options.length} options; only the first 10 get a number key.`, ref: ref(n.id) })
    if (n.options.length && n.options.every((o) => o.showOnce) && (incoming.get(n.id)?.length ?? 0) > 1) {
      problems.push({ level: 'warning', area: 'Quest', message: `Every option of "${n.title ?? n.id}" is show-once and the node can be returned to: the player could be left with no options.`, ref: ref(n.id) })
    }
    // phrases without SagaLib: one rule per combination of cases (up to 4)
    const nodePhrases = [...n.phrases, ...opts.phrases].filter((p) => n.text.includes(p.token))
    if (nodePhrases.length && !opts.sagalib) {
      const combos = phraseCombos(nodePhrases)
      if (combos.length > 4) {
        problems.push({ level: 'error', area: 'Quest', message: `"${n.title ?? n.id}" uses phrases with ${combos.length} combinations; without SagaLib at most 4 can be split into rules. Add SagaLib or simplify.`, ref: ref(n.id) })
      } else {
        combos.forEach((cmb, i) => {
          let t = text
          for (const [tok, txt] of cmb.texts) t = t.split(tok).join(txt)
          push({ id: `${nodeRuleId(q, n.id)}${i ? `_v${i + 1}` : ''}`, trigger: en.trigger, conditions: [...conds, ...cmb.conds].join('\n'), script: script.join('\n'), text: t, options: optionsCol }, n.id)
        })
        return
      }
    }
    if (nodePhrases.length || n.displays.some((d) => SAGALIB_DISPLAYS.has(d.kind)) || ['fleets', 'ship'].includes(n.visual.kind) || (n.visual.kind === 'planet' && n.visual.info)) usesSagaLib = true
    push({ id: nodeRuleId(q, n.id), trigger: en.trigger, conditions: conds.join('\n'), script: script.join('\n'), text, options: optionsCol }, n.id)
  }

  function compileBranch(n: BranchNode, en: Entry) {
    for (const c of n.cases) {
      const e = outOf(n.id, c.id)
      if (!e) problems.push({ level: 'error', area: 'Quest', message: `Branch case "${c.label}" leads nowhere.`, ref: ref(n.id, c.id) })
      push({ id: `${nodeRuleId(q, n.id)}_${c.id}`, trigger: en.trigger, conditions: [...en.conds, ...c.conditions].join('\n'), script: jumpTo(e?.to).join('\n'), text: '', options: '' }, n.id)
    }
    const els = outOf(n.id, 'else')
    if (els) push({ id: `${nodeRuleId(q, n.id)}_else`, trigger: en.trigger, conditions: en.conds.join('\n'), script: jumpTo(els.to).join('\n'), text: '', options: '' }, n.id)
    else if (!n.cases.length) problems.push({ level: 'error', area: 'Quest', message: 'Branch has no cases.', ref: ref(n.id) })
    // FireBest picks the most specific case: equal condition counts are ambiguous
    const counts = n.cases.map((c) => c.conditions.length)
    if (new Set(counts).size < counts.length) problems.push({ level: 'warning', area: 'Quest', message: `Branch "${n.title ?? n.id}": cases with the same number of conditions; when several match, the game picks one of them (FireBest), not the first.`, ref: ref(n.id) })
  }

  function actionLines(op: Extract<QNode, { type: 'action' }>['ops'][number]): string[] {
    switch (op.op) {
      case 'credits': return [op.amount >= 0 ? `AddCredits ${op.amount}` : `SubCredits ${-op.amount}`]
      case 'rep': return [op.person ? `AdjustRepActivePerson ${op.amount}` : `AdjustRep ${op.faction} ${op.amount}`]
      case 'item': return [itemLine(op.item, op.qty, opts.itemKind)]
      case 'set': return [`${op.key} = ${op.value}${op.days !== undefined ? ` ${op.days}` : ''}`]
      case 'unset': return [`unset ${op.key}`]
      case 'reward': usesSagaLib = true; return [`SF_Reward ${q.id} ${op.reward}`]
      case 'spawn': usesSagaLib = true; return [`SF_Spawn ${op.encounter}`]
      case 'despawn': usesSagaLib = true; return [`SF_Despawn ${op.encounter}`]
      case 'startQuest': usesSagaLib = true; return [`SF_Start ${op.quest}`]
      case 'storyPoints': return [`AddStoryPoints ${op.amount}`]
      case 'xp': return [`AddXP ${op.amount}`]
      case 'line': if (/^\s*SF_/.test(op.line)) usesSagaLib = true; return [op.line]
    }
  }

  // Rules scoped to this mod's own content on triggers where vanilla's general rules compete must
  // win FireBest: vanilla's own quest dialogs do the same with "score:100" / "score:1000" (found in
  // game, 2026-11-11: the Belt ambush greeting lost to vanilla's pirate greetings).
  for (const r of rows) {
    if (!CONTESTED_TRIGGERS.has(r.trigger)) continue
    const lines = r.conditions.split('\n').filter(Boolean)
    if (lines.some((l) => /score\s*:/.test(l))) continue
    const i = lines.findIndex((l) => isScopedCondition(l, q.id))
    if (i < 0) continue
    // the game only accepts "score:N" at the end of a condition line ("$id == rao score:1000"); a
    // line with only the score crashes its rules parser (found in game, 2026-11-11)
    lines[i] = `${lines[i]} score:${SCOPED_SCORE}`
    r.conditions = lines.join('\n')
  }

  for (const r of rows) {
    if (r.conditions.split('\n').some((l) => /^\s*score\s*:/i.test(l))) {
      problems.push({ level: 'error', area: 'Quest', message: `Rule ${r.id}: a condition line that is only "score:N" makes the game crash while loading rules. Put the score at the end of another condition ("$id == x score:100").`, ref: ref(nodeOf[r.id] ?? '') })
    }
  }

  return { rows, nodeOf, problems, generatedFlags, usesSagaLib, optionNode, entry }
}

/** Triggers the game fires with FireBest where vanilla has general rules (greetings, docking, salvage). */
export const CONTESTED_TRIGGERS = new Set(['OpenCommLink', 'OpenInteractionDialog', 'PickGreeting', 'BeginFleetEncounter', 'TradePanelFlavorText'])
export const SCOPED_SCORE = 1000

/** A condition about one specific thing of the mod: an entity or person id, an encounter fleet, a SagaLib quest state, a quest key. */
export function isScopedCondition(line: string, questId: string): boolean {
  const l = line.trim()
  if (l.startsWith('!')) return false
  return /^\$id\s*==/.test(l) || l.includes('sagaforge_encounter') || /^SF_(AtStep|QuestState|QuestDone)\b/.test(l) || l.includes(`$global.${questId}_`)
}

const SAGALIB_DISPLAYS = new Set(['image', 'faction', 'shipList', 'cargo', 'heading', 'skills', 'ship'])

export function visualLines(v: Visual): string[] {
  switch (v.kind) {
    case 'person': return [`ShowPersonVisual false ${v.person}`, ...(v.second ? [`ShowSecondPerson ${v.second}`] : []), ...(v.third ? [`ShowThirdPerson ${v.third}`] : [])]
    case 'illustration': return [v.category && v.category !== 'illustrations' ? `ShowImageVisual ${v.category} ${v.key}` : `ShowImageVisual ${v.key}`]
    case 'planet': return [v.info ? `SF_ShowPlanetInfo ${v.entity}` : 'ShowLargePlanet']
    case 'mapMarker': return [`ShowMapMarker ${v.entity}${v.title ? ` ${quote(v.title)}` : ''}`]
    case 'fleets': return [`SF_ShowFleets ${v.encounter}`]
    case 'ship': return [`SF_ShowShip ${v.variant}`]
    case 'hide': return ['HideVisual']
    case 'save': return ['SaveCurrentVisual']
    case 'restore': return ['RestoreSavedVisual']
    default: return []
  }
}

/** Give or take an item: commodities with AddRemoveCommodity, special items (quest items) with AddRemoveAnyItem SPECIAL. */
export function itemLine(item: string, qty: number, itemKind?: CompileOptions['itemKind']): string {
  return itemKind?.(item) === 'special' ? `AddRemoveAnyItem SPECIAL ${item} ${qty}` : `AddRemoveCommodity ${item} ${qty}`
}

export function displayLines(d: Display, itemKind?: CompileOptions['itemKind']): string[] {
  switch (d.kind) {
    case 'credits': return [d.amount >= 0 ? `AddCredits ${d.amount}` : `SubCredits ${-d.amount}`]
    case 'commodity': return [itemLine(d.item, d.qty, itemKind)]
    case 'specialItem': return [`AddRemoveAnyItem SPECIAL ${d.item}${d.data ? `,${d.data}` : ''} ${d.qty}`]
    case 'weapon': return [`AddRemoveAnyItem WEAPONS ${d.id} ${d.qty}`]
    case 'fighter': return [`AddRemoveAnyItem FIGHTER_CHIP ${d.id} ${d.qty}`]
    case 'ship': return [d.remove ? `SF_RemoveShip ${d.variant}` : `SF_AddShip ${d.variant}`]
    case 'storyPoints': return [`AddStoryPoints ${d.amount}`]
    case 'xp': return [`AddXP ${d.amount}`]
    case 'rep': return [d.person ? `AdjustRepActivePerson ${d.amount}` : `AdjustRep ${d.faction} ${d.amount}`]
    case 'text': return [`${d.small ? 'AddTextSmall' : 'AddText'} ${quote(d.text)}${d.color ? ` ${d.color}` : ''}`]
    case 'cost': return d.items.map((x) => `ShowResCost ${x.item} ${x.qty} true`)
    case 'capacity': return ['ShowRemainingCapacity']
    case 'image': return [`SF_Show image ${d.category} ${d.key}`]
    case 'faction': return [`SF_Show faction ${d.faction}`]
    case 'shipList': return [`SF_Show ships ${d.variants.join(' ')}`]
    case 'cargo': return [`SF_Show cargo ${d.items.map((x) => `${x.item}:${x.qty}`).join(' ')}`]
    case 'heading': return [`SF_Show heading ${quote(d.text)}`]
    case 'skills': return [`SF_Show skills ${d.person}`]
    case 'sound': return [`PlaySound ${d.id}`]
    case 'music': return [`PlayCustomMusic ${d.id}`]
  }
}

/** Conditions for the quest's prerequisites (PLAN.md §4.8): exported on the start. */
export function prereqConditions(q: QuestPlan): string[] {
  const out: string[] = []
  for (const r of q.requires) {
    if ('quest' in r) out.push(r.ended === 'any' ? `SF_QuestDone ${r.quest}` : `SF_QuestDone ${r.quest} ${r.ended}`)
    else out.push(r.is === undefined || r.is === '' ? r.flag : `${r.flag} == ${r.is}`)
  }
  return out
}

/** "$global.<quest>_step == <stage>" of the stage a node is in (the nearest Stage node before it). */
function currentStepCondition(q: QuestPlan, nodeId: string): string | null {
  const seen = new Set<string>()
  let frontier = [nodeId]
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      for (const e of q.edges.filter((x) => x.to === id)) {
        if (seen.has(e.from)) continue
        seen.add(e.from)
        const n = q.nodes.find((x) => x.id === e.from)
        if (n?.type === 'stage') return `$global.${q.id}_step == ${n.stage}`
        next.push(e.from)
      }
    }
    frontier = next
  }
  return null
}

/** Combinations of phrase cases for splitting a node into rules (no SagaLib). */
export function phraseCombos(ps: Phrase[]): { conds: string[]; texts: [string, string][] }[] {
  let combos: { conds: string[]; texts: [string, string][] }[] = [{ conds: [], texts: [] }]
  for (const p of ps) {
    const choices: { conds: string[]; text: string }[] = p.cases.map((c) => ({ conds: c.when, text: c.text }))
    choices.push({ conds: [], text: p.otherwise ?? '' })
    combos = combos.flatMap((c) => choices.map((ch) => ({ conds: [...c.conds, ...ch.conds], texts: [...c.texts, [p.token, ch.text] as [string, string]] })))
  }
  return combos
}

/** Keys a condition line reads (for the flags registry). */
export function keysOfConditions(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const c = parseCondition(l)
    if (c.kind === 'memory') out.push(c.key)
  }
  return out
}
