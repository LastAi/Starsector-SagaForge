<script lang="ts">
  /** One phrase (PLAN.md §4.3): cases with conditions, first match or random, and an otherwise text. */
  import type { Phrase } from '../../../shared/model'
  import LinesInput from './LinesInput.svelte'

  interface Props { phrase: Phrase; templates: { label: string; line: string }[]; onChange: (p: Phrase) => void; onRemove?: () => void; tokenEditable?: boolean }
  let { phrase, templates, onChange, onRemove, tokenEditable = false }: Props = $props()
  const clone = (): Phrase => JSON.parse(JSON.stringify(phrase))
  const up = (fn: (p: Phrase) => void) => { const p = clone(); fn(p); onChange(p) }
</script>

<div class="ph">
  <div class="head">
    {#if tokenEditable}
      <input type="text" class="mono tok" value={phrase.token} onchange={(e) => { const v = e.currentTarget.value.trim(); up((p) => { p.token = v.startsWith('$') ? v : `$${v}` }) }} />
    {:else}<span class="mono chip">{phrase.token}</span>{/if}
    <select value={phrase.mode} onchange={(e) => { const v = e.currentTarget.value as Phrase['mode']; up((p) => { p.mode = v }) }}>
      <option value="first-match">first case that matches</option><option value="random">random</option>
    </select>
    {#if onRemove}<button class="mini" onclick={onRemove} title="Remove">✕</button>{/if}
  </div>
  {#each phrase.cases as c, i (i)}
    <div class="case">
      {#if phrase.mode === 'first-match'}
        <div class="when"><span class="muted">if</span><LinesInput lines={c.when} {templates} rows={1} onChange={(l) => up((p) => { p.cases[i].when = l })} /></div>
      {/if}
      <div class="txt"><input type="text" value={c.text} placeholder="text for this case" onchange={(e) => { const v = e.currentTarget.value; up((p) => { p.cases[i].text = v }) }} />
        <button class="mini" onclick={() => up((p) => { p.cases.splice(i, 1) })}>✕</button></div>
    </div>
  {/each}
  <div class="row"><button class="mini" onclick={() => up((p) => { p.cases.push({ when: [], text: '' }) })}>+ case</button></div>
  <div class="txt"><span class="muted">{phrase.mode === 'random' ? 'or' : 'otherwise'}</span><input type="text" value={phrase.otherwise ?? ''} placeholder="(empty)" onchange={(e) => { const v = e.currentTarget.value; up((p) => { p.otherwise = v }) }} /></div>
</div>

<style>
  .ph { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin: 6px 0; background: #161a20; font-size: 12px; }
  .head { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
  .head select { font-size: 11px; padding: 1px 4px; }
  .chip { font-size: 11px; padding: 1px 7px; border-radius: 10px; background: #102233; border: 1px solid var(--accent-2); color: var(--accent); }
  .tok { flex: 1; font-size: 11px; padding: 2px 6px; }
  .case { border-left: 2px solid var(--border); padding-left: 6px; margin: 4px 0; }
  .when { display: grid; grid-template-columns: 20px 1fr; gap: 4px; align-items: start; }
  .txt { display: flex; gap: 4px; align-items: center; margin-top: 2px; }
  .txt input { flex: 1; padding: 2px 6px; }
  .mini { padding: 0 6px; font-size: 11px; }
  .row { margin-top: 2px; }
</style>
