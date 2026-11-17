<script lang="ts">
  /**
   * The actions of something that has no quest of its own (Phase 8d: world events, progress event
   * stages): flags, reputation, credits, items, encounters, objects, quests, progress, a script line.
   */
  import type { ActionOp } from '../../../shared/model'
  import { EVENT_OPS } from '../../../shared/export/events'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import IdInput from '../ui/IdInput.svelte'

  interface Props {
    ops: ActionOp[]
    /** Change the list in the model (called inside project.change). */
    edit: (fn: (ops: ActionOp[]) => void) => void
    label: string
  }
  let { ops, edit, label }: Props = $props()

  const m = $derived(project.m!)
  const factions = $derived([...m.factions.filter((f) => f.kind === 'addition').map((f) => f.id), ...(app.index?.factions ?? []).map((f) => f.id)])
  const deferred = $derived(m.systems.flatMap((s) => s.entities.filter((e) => !!e.appears)))
  const places = $derived([...m.systems.flatMap((sy) => sy.entities.map((e) => ({ id: e.id, name: `${e.name} (${sy.name})` }))), ...(app.index?.markets ?? []).map((x) => ({ id: x.id, name: `${x.name} market` }))])
  const OPS: Record<string, string> = { set: 'Set a flag', unset: 'Clear a flag', rep: 'Reputation', credits: 'Credits', item: 'Give items', spawn: 'Spawn an encounter', despawn: 'Despawn an encounter', placeEntity: 'Place an object', removeEntity: 'Remove an object', startQuest: 'Start a quest', storyPoints: 'Story points', xp: 'Experience', progress: 'Add progress', line: 'Script line' }

  function fresh(op: ActionOp['op']): ActionOp {
    switch (op) {
      case 'set': return { op, key: '$global.', value: 'true' }
      case 'unset': return { op, key: '' }
      case 'rep': return { op, faction: factions[0] ?? '', amount: 5 }
      case 'credits': return { op, amount: 1000 }
      case 'item': return { op, item: '', qty: 1 }
      case 'spawn': case 'despawn': return { op, encounter: m.encounters[0]?.id ?? '' }
      case 'placeEntity': return { op, entity: deferred[0]?.id ?? '' }
      case 'removeEntity': return { op, entity: '' }
      case 'startQuest': return { op, quest: m.quests[0]?.id ?? '' }
      case 'storyPoints': return { op, amount: 1 }
      case 'xp': return { op, amount: 1000 }
      case 'progress': return { op, event: m.progress?.[0]?.id ?? '', points: 100, text: '' }
      default: return { op: 'line', line: '' }
    }
  }
  const setOp = (i: number, k: string, v: unknown) => edit((o) => { (o[i] as Record<string, unknown>)[k] = v })
</script>

<div class="sect2">{label}
  <select value="" onchange={(e) => { const v = e.currentTarget.value as ActionOp['op']; e.currentTarget.value = ''; if (v) edit((o) => { o.push(fresh(v)) }) }}><option value="">+ add…</option>{#each EVENT_OPS as o (o)}<option value={o}>{OPS[o]}</option>{/each}</select>
</div>
{#each ops as op, i (i)}
  <div class="row op">
    <span class="opl">{OPS[op.op] ?? op.op}</span>
    {#if op.op === 'set'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(i, 'key', e.currentTarget.value)} /><span>=</span><input type="text" class="mono short" value={op.value} title="Value" onchange={(e) => setOp(i, 'value', e.currentTarget.value)} />
    {:else if op.op === 'unset'}<input type="text" class="mono" value={op.key} title="Memory key" onchange={(e) => setOp(i, 'key', e.currentTarget.value)} />
    {:else if op.op === 'credits' || op.op === 'storyPoints' || op.op === 'xp'}<input type="number" value={op.amount} title="Amount" onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
    {:else if op.op === 'rep'}<IdInput value={op.faction ?? ''} options={factions.map((f) => ({ id: f }))} width="140px" placeholder="faction" onCommit={(v) => setOp(i, 'faction', v)} /><input type="number" class="short" value={op.amount} title="points" onchange={(e) => setOp(i, 'amount', Number(e.currentTarget.value))} />
    {:else if op.op === 'item'}<IdInput value={op.item} options={[...m.items.map((x) => ({ id: x.id, name: x.name })), ...(app.index?.items ?? [])]} width="140px" placeholder="item id" onCommit={(v) => setOp(i, 'item', v)} /><input type="number" class="short" value={op.qty} title="Quantity" onchange={(e) => setOp(i, 'qty', Number(e.currentTarget.value))} />
    {:else if op.op === 'spawn' || op.op === 'despawn'}<select value={op.encounter} onchange={(e) => setOp(i, 'encounter', e.currentTarget.value)}><option value="">—</option>{#each m.encounters as en (en.id)}<option value={en.id}>{en.name}</option>{/each}</select>
    {:else if op.op === 'startQuest'}<select value={op.quest} onchange={(e) => setOp(i, 'quest', e.currentTarget.value)}>{#each m.quests as x (x.id)}<option value={x.id}>{x.title}</option>{/each}</select>
    {:else if op.op === 'placeEntity'}<select value={op.entity} onchange={(e) => setOp(i, 'entity', e.currentTarget.value)}><option value="">—</option>{#each deferred as d (d.id)}<option value={d.id}>{d.name} ({d.id})</option>{/each}</select>
    {:else if op.op === 'removeEntity'}<IdInput value={op.entity} options={places} width="170px" placeholder="object id" onCommit={(v) => setOp(i, 'entity', v)} />
    {:else if op.op === 'progress'}<select value={op.event} onchange={(e) => setOp(i, 'event', e.currentTarget.value)}><option value="">—</option>{#each m.progress ?? [] as pe (pe.id)}<option value={pe.id}>{pe.name}</option>{/each}</select><input type="number" class="short" value={op.points} title="Points (negative lowers it)" onchange={(e) => setOp(i, 'points', Number(e.currentTarget.value))} /><input type="text" value={op.text ?? ''} placeholder="text in the event's list" onchange={(e) => setOp(i, 'text', e.currentTarget.value)} />
    {:else if op.op === 'line'}<input type="text" class="mono" value={op.line} onchange={(e) => setOp(i, 'line', e.currentTarget.value)} />{/if}
    <button class="mini" onclick={() => edit((o) => { o.splice(i, 1) })}>✕</button>
  </div>
{/each}

<style>
  .sect2 { display: flex; gap: 10px; align-items: center; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 10px 0 4px; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .op { margin: 3px 0; }
  .opl { min-width: 140px; font-size: 12px; }
  input.short { width: 64px; }
</style>
