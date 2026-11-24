<script lang="ts">
  /**
   * #67 U45 (user, 2026-11-24): condition lines, each read back in plain words, with whether it holds
   * for the Test context (a plain flag can be switched there), a warning when it can't work where it
   * is (outside a dialog only $global and $player exist), "+ add…" templates and a flag picker that
   * suggests the keys the mod already sets or reads. The raw line stays editable.
   */
  import { conditionScopeProblem, describeCondition, type CondScope } from '../../../shared/conditions'
  import { condNames, flagOf, flagRegistry, holdsNow, toggleTestFlag } from '../state/conditions.svelte'
  import { testCtx } from '../state/testctx.svelte'
  import RefButton from '../ui/RefButton.svelte'

  interface Props {
    lines: string[]
    onChange: (lines: string[]) => void
    templates?: { label: string; line: string }[]
    placeholder?: string
    /** global: outside any dialog (progress events, world events). */
    scope?: CondScope
    /** One-line rows (no "holds now" column), for tight places. */
    compact?: boolean
  }
  let { lines, onChange, templates = [], placeholder = '', scope = 'dialog', compact = false }: Props = $props()

  const names = $derived(condNames())
  const usable = $derived(templates.filter((t) => !conditionScopeProblem(t.line, scope)))
  // re-read "holds now" when the Test context changes
  const tick = $derived(JSON.stringify(testCtx.memory) + testCtx.playerGender + testCtx.credits + JSON.stringify(testCtx.rep) + testCtx.commission)
  let newLine = $state('')
  const listId = `cond-${Math.random().toString(36).slice(2)}`
  let keys = $state<string[]>([])
  const loadKeys = () => { keys = [...flagRegistry().keys()].filter((k) => scope === 'dialog' || /^\$(global|player)\./.test(k)).sort() }
  function setLine(i: number, v: string) {
    const t = v.trim()
    const next = [...lines]
    if (t) next[i] = t; else next.splice(i, 1)
    onChange(next)
  }
  function add(v: string) {
    const t = v.trim()
    if (!t) return
    onChange([...lines, t])
    newLine = ''
  }
  function usesOf(line: string): string {
    const k = flagOf(line)
    if (!k) return ''
    const e = flagRegistry().get(k)
    if (!e) return 'Nothing in the mod sets or reads it yet.'
    const set = e.setting ? [`setting "${e.setting}"`] : e.external ? [e.external] : e.setBy.map((u) => u.where)
    return `Set by: ${set.length ? [...new Set(set)].slice(0, 4).join('; ') : 'nothing yet'}. Read by: ${[...new Set(e.readBy.map((u) => u.where))].slice(0, 4).join('; ') || 'nothing'}.`
  }
</script>

<div class="ce">
  {#each lines as l, i (i + l)}
    {@const why = conditionScopeProblem(l, scope)}
    {@const h = (void tick, holdsNow(l))}
    {@const fk = flagOf(l)}
    <div class="row" class:bad={!!why}>
      <div class="top">
        {#if !compact}
          {#if fk && !why}
            <button class="h {h}" title={`With the Test context: ${h === 'yes' ? 'true' : 'false'}. Click to ${testCtx.memory[fk] === 'true' ? 'unset' : 'set'} ${fk} there.`} onclick={() => toggleTestFlag(fk)}>{h === 'yes' ? '✓' : '✗'}</button>
          {:else}
            <span class="h {why ? 'no' : h === '?' ? 'unk' : h}" title={why ? 'Never true here' : h === '?' ? "The editor can't tell (it depends on the game); Play mode asks" : `With the Test context: ${h === 'yes' ? 'true' : 'false'}`}>{why ? '✗' : h === 'yes' ? '✓' : h === 'no' ? '✗' : '?'}</span>
          {/if}
        {/if}
        <span class="desc" title={usesOf(l)}>{describeCondition(l, names)}</span>
        <button class="x" title="Remove" onclick={() => setLine(i, '')}>✕</button>
      </div>
      <input class="raw mono" type="text" value={l} spellcheck="false" onchange={(e) => setLine(i, e.currentTarget.value)} />
      {#if why}<div class="why">{why}</div>{/if}
    </div>
  {/each}
  {#if !lines.length}<div class="none muted">{placeholder || 'No conditions: always true.'}</div>{/if}
  <div class="add">
    {#if usable.length}
      <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) add(v) }}>
        <option value="">+ add…</option>
        {#each usable as t (t.label + t.line)}<option value={t.line}>{t.label}</option>{/each}
      </select>
    {/if}
    <input class="mono newl" type="text" list={listId} placeholder={scope === 'global' ? 'or type: $global.my_flag, !$global.x, …' : 'or type a condition, e.g. $global.my_flag'} bind:value={newLine} onfocus={loadKeys}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(newLine) } }} />
    <datalist id={listId}>{#each keys as k (k)}<option value={k}></option>{/each}</datalist>
    <button class="mini" disabled={!newLine.trim()} onclick={() => add(newLine)}>Add</button>
    <RefButton ref="rules-conditions" title="How conditions work: opens the reference" />
  </div>
</div>

<style>
  .ce { display: flex; flex-direction: column; gap: 3px; }
  .row { border: 1px solid var(--border); border-radius: 4px; padding: 3px 5px; }
  .row.bad { border-color: var(--warn); }
  .top { display: flex; gap: 6px; align-items: center; }
  .h { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; font-size: 11px; flex: none; padding: 0; border: 1px solid var(--border); background: none; }
  .h.yes { color: var(--good); border-color: var(--good); }
  .h.no { color: var(--bad); border-color: var(--bad); }
  .h.unk { color: var(--muted); }
  button.h { cursor: pointer; }
  .desc { flex: 1; font-size: 12px; }
  .x { border: none; background: none; padding: 0 4px; color: var(--muted); }
  .raw { width: 100%; font-size: 11px; padding: 1px 5px; margin-top: 2px; color: var(--muted); }
  .raw:focus { color: var(--text); }
  .why { font-size: 11px; color: var(--warn); margin-top: 2px; }
  .none { font-size: 11px; padding: 2px 0; }
  .add { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .add select { font-size: 11px; padding: 1px 4px; max-width: 45%; }
  .newl { flex: 1; min-width: 140px; font-size: 11px; padding: 1px 5px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .muted { color: var(--muted); } .mono { font-family: var(--mono); }
</style>
