<script lang="ts">
  /** A quest plan node on the chart (PLAN.md §5, "The flow chart"). */
  import { Handle, Position } from '@xyflow/svelte'
  import type { QNode, QuestPlan } from '../../../shared/model'
  import { handlesOf } from '../../../shared/quest'

  interface Props {
    data: { node: QNode; quest: QuestPlan; problems: { level: string; message: string }[]; path?: boolean; faded?: boolean; current?: boolean; label: (n: QNode) => string; personName: (id: string) => string }
    selected?: boolean
  }
  let { data, selected = false }: Props = $props()
  const n = $derived(data.node)
  const handles = $derived(handlesOf(n))
  const COLORS: Record<string, string> = {
    start: '#3c8d5a', dialog: '#2b7fc4', branch: '#b07a2a', action: '#4d8a8a', stage: '#a0558f', encounter: '#b84a4a',
    wait: '#5a6f8f', end: '#555f6e', link: '#3a4452', note: '#6b6440'
  }
  const TITLES: Record<string, string> = { start: 'Start', dialog: 'Dialog', branch: 'Branch', action: 'Action', stage: 'Stage', encounter: 'Encounter', wait: 'Wait / Arrive', end: 'End', link: 'Link', note: 'Note' }
  const errs = $derived(data.problems.filter((p) => p.level === 'error').length)
  const warns = $derived(data.problems.filter((p) => p.level !== 'error').length)
  const opt = (id: string) => (n.type === 'dialog' ? n.options.find((o) => o.id === id) : undefined)
</script>

<div class="node" class:sel={selected} class:ro={n.type === 'link'} class:path={data.path} class:faded={data.faded} class:current={data.current} class:note={n.type === 'note'}
  title={data.problems.map((p) => p.message).join('\n')}>
  {#if n.type !== 'start' && n.type !== 'note'}<Handle type="target" position={Position.Left} />{/if}
  <div class="nh" style="background:{COLORS[n.type]}"><span>{TITLES[n.type]}{data.label(n) ? ` · ${data.label(n)}` : ''}</span><span class="mono id">{n.id}</span></div>
  <div class="nb">
    {#if n.type === 'dialog'}
      {#if n.speaker}<div class="who">{data.personName(n.speaker)}</div>{/if}
      <div class="q">{n.text || '(no text)'}</div>
      {#if n.displays.length}<div class="muted small">{n.displays.length} display{n.displays.length === 1 ? '' : 's'}</div>{/if}
    {:else if n.type === 'start'}
      {@const s = data.quest.start}
      <div>{s.kind === 'contact' ? `contact: ${data.personName(s.person) || '?'}` : s.kind === 'bar' ? 'bar event' : s.kind === 'option' ? `option: ${s.optionText}` : s.kind === 'trigger' ? `trigger: ${s.trigger}` : 'started by another quest'}</div>
      {#if data.quest.requires.length}<div class="muted small">needs {data.quest.requires.length} prerequisite{data.quest.requires.length === 1 ? '' : 's'}</div>{/if}
    {:else if n.type === 'branch'}
      <div class="muted small">first matching case (FireBest)</div>
    {:else if n.type === 'action'}
      {#each n.ops.slice(0, 4) as op, i (i)}<div class="mono small">{op.op === 'set' ? `${op.key} = ${op.value}` : op.op === 'line' ? op.line : `${op.op} ${Object.values(op).slice(1).join(' ')}`}</div>{/each}
      {#if !n.ops.length}<div class="muted small">(nothing yet)</div>{/if}
    {:else if n.type === 'stage'}
      {@const st = data.quest.stages.find((s) => s.id === n.stage)}
      <div>{st ? st.title : '(pick a stage)'}</div>{#if st?.journal}<div class="muted small q">{st.journal}</div>{/if}
    {:else if n.type === 'encounter'}
      <div class="mono">{n.encounter || '(pick an encounter)'}</div>
    {:else if n.type === 'wait'}
      <div>{n.mode === 'arrive' ? `player reaches ${n.entity || '?'}` : `after ${n.days ?? '?'} days`}</div>
    {:else if n.type === 'end'}
      <div class:good={n.outcome === 'success'} class:bad={n.outcome !== 'success'}>{n.outcome}{n.reward ? ` · reward ${n.reward}` : ''}</div>
    {:else if n.type === 'link'}
      <div class="mono small">{n.mode === 'trigger' ? `${n.fire ?? 'FireAll'} ${n.target}` : n.mode === 'option' ? `→ option ${n.target}` : `→ node ${n.target}`}</div>
    {:else if n.type === 'note'}
      <div class="notetext">{n.text || 'Note'}</div>
    {/if}
  </div>
  {#each handles as h (h.id)}
    {@const o = opt(h.id)}
    <div class="opt" class:story={!!o?.story} class:once={!!o?.showOnce} class:cond={!!o?.showIf?.length}>
      <span class="ot">{h.label}</span>
      {#if o?.story}<span class="tag">{o.story.cost} SP</span>{/if}{#if o?.showOnce}<span class="tag">once</span>{/if}{#if o?.showIf?.length}<span class="tag">if</span>{/if}
      <Handle type="source" position={Position.Right} id={h.id} />
    </div>
  {/each}
  {#if errs || warns}<span class="prob" class:w={!errs}>{errs || warns}</span>{/if}
</div>

<style>
  .node { width: 220px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.4); color: var(--text); position: relative; }
  .node.sel { outline: 2px solid var(--accent); }
  .node.ro { border-style: dashed; opacity: .85; }
  .node.path { border-color: var(--good); box-shadow: 0 0 0 1px var(--good), 0 4px 12px rgba(0,0,0,.4); }
  .node.current { box-shadow: 0 0 0 2px var(--good), 0 0 18px rgba(111,208,122,.4); }
  .node.faded { opacity: .35; }
  .node.note { background: #26241a; border-color: #4a4630; }
  .nh { padding: 3px 8px; border-radius: 5px 5px 0 0; font-size: 11px; font-weight: 600; color: #fff; display: flex; justify-content: space-between; gap: 6px; }
  .nh .id { font-weight: normal; opacity: .75; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }
  .nb { padding: 5px 8px; }
  .who { color: var(--accent); font-size: 11px; }
  .q { color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  .notetext { color: #d8d0a0; white-space: pre-wrap; }
  .opt { position: relative; padding: 3px 12px 3px 8px; border-top: 1px solid var(--border); display: flex; gap: 4px; align-items: center; }
  .opt .ot { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opt.story { color: rgb(163,239,128); }
  .tag { font-size: 9px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--border); color: var(--muted); }
  .prob { position: absolute; top: -7px; right: -7px; width: 16px; height: 16px; border-radius: 50%; background: var(--bad); color: #fff; font-size: 10px; display: grid; place-items: center; font-weight: 700; }
  .prob.w { background: var(--warn); color: #000; }
  .small { font-size: 11px; }
  .muted { color: var(--muted); }
  .mono { font-family: var(--mono); }
  .good { color: var(--good); } .bad { color: var(--bad); }
</style>
