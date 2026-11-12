<script lang="ts">
  /** A read-only rules.csv row drawn as a node (Dialog browser, imported dialog, Rules view). */
  import { Handle, Position } from '@xyflow/svelte'
  import type { EngineRule } from '../../../shared/rules/engine'
  import { ruleFires, ruleOptionIds } from '../../../shared/rules/engine'

  interface Props { data: { rule: EngineRule; source: string; truncated: boolean; focus: boolean; path?: boolean; faded?: boolean } }
  let { data }: Props = $props()
  const r = $derived(data.rule)
  const opts = $derived(ruleOptionIds(r))
  const fires = $derived(ruleFires(r))
  const conds = $derived(r.conds.filter((c) => !(c.kind === 'memory' && c.key === '$option')))
  const text = $derived((r.variants[0] ?? '').slice(0, 220))
  const optText = (id: string) => r.options.find((o) => o.id === id)?.text ?? ''
  const color = $derived(r.row.trigger === 'DialogOptionSelected' ? '#2b7fc4' : r.row.trigger === 'PopulateOptions' ? '#6a5acd' : /Open|Greeting|Begin/.test(r.row.trigger) ? '#3c8d5a' : '#4d8a8a')
</script>

<div class="node" class:focus={data.focus} class:path={data.path} class:faded={data.faded}>
  <Handle type="target" position={Position.Left} />
  <div class="nh" style="background:{color}"><span>{r.row.trigger}</span><span class="src">{data.source}</span></div>
  <div class="nb">
    <div class="id mono">{r.row.id}</div>
    {#if conds.length}<div class="conds mono">{#each conds.slice(0, 4) as c (c.raw)}<div>{c.raw}</div>{/each}{#if conds.length > 4}<div>… +{conds.length - 4}</div>{/if}</div>{/if}
    {#if text}<div class="q">{text}</div>{/if}
    {#if r.variants.length > 1}<div class="muted small">{r.variants.length} random variants (OR)</div>{/if}
  </div>
  {#each opts as o (o)}
    <div class="opt"><span class="ot">{optText(o) || o}</span><span class="oid mono">{o}</span>
      <Handle type="source" position={Position.Right} id={`o:${o}`} />
    </div>
  {/each}
  {#if fires.length}
    <div class="opt fire"><span class="mono">{fires.map((f) => `${f.cmd} ${f.trigger}`).join(' · ')}</span>
      <Handle type="source" position={Position.Right} id="fire" />
    </div>
  {/if}
  {#if data.truncated}<div class="trunc">more…</div>{/if}
</div>

<style>
  .node { width: 250px; background: var(--panel); border: 1px dashed #4a5566; border-radius: 6px; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,.4); color: var(--text); }
  .node.focus { outline: 2px solid var(--accent); }
  .node.path { border: 1px solid var(--good); }
  .node.faded { opacity: .35; }
  .nh { padding: 3px 8px; border-radius: 5px 5px 0 0; font-weight: 600; color: #fff; display: flex; justify-content: space-between; gap: 6px; }
  .src { font-weight: normal; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }
  .nb { padding: 4px 8px; }
  .id { color: var(--accent); margin-bottom: 2px; word-break: break-all; }
  .conds { color: var(--warn); font-size: 10px; margin-bottom: 3px; }
  .q { color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  .opt { position: relative; padding: 3px 12px 3px 8px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; gap: 6px; }
  .opt .ot { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opt .oid { color: var(--muted); font-size: 9px; flex: none; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
  .opt.fire { color: #8fd; }
  .trunc { text-align: center; color: var(--muted); border-top: 1px solid var(--border); }
  .small { font-size: 10px; }
  .muted { color: var(--muted); }
  .mono { font-family: var(--mono); }
</style>
