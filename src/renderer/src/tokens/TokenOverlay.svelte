<script lang="ts">
  /**
   * #67 U44: drawn once by the Shell: the "$" autocomplete under the field being typed in, the
   * lookup inside the editor in screenshot mode, and the catalog sent to the token window on changes.
   */
  import { tokenHub } from '../state/tokens.svelte'
  import { project } from '../state/project.svelte'
  import { app, images } from '../state/app.svelte'
  import { testCtx } from '../state/testctx.svelte'
  import TokenLookup from './TokenLookup.svelte'

  // the token window follows the model, the open quest and node, and the Test context
  $effect(() => {
    if (!tokenHub.opened) return
    void JSON.stringify(project.m)
    void app.selected.quests; void app.selected.questNode; void app.page
    void JSON.stringify(testCtx)
    void tokenHub.target
    tokenHub.publish()
  })
  const ac = $derived(tokenHub.ac)
  const pos = $derived.by(() => {
    if (!ac) return null
    const r = ac.el.getBoundingClientRect()
    const below = r.bottom + 260 < window.innerHeight
    return { left: Math.min(r.left, window.innerWidth - 420), top: below ? r.bottom + 2 : Math.max(4, r.top - 262) }
  })
</script>

{#if ac && pos}
  <div class="ac" style="left:{pos.left}px;top:{pos.top}px" role="listbox">
    {#each ac.items as e, i (e.token)}
      <button class="it" class:on={i === ac.index} class:no={e.works === 'no'} onmousedown={(ev) => { ev.preventDefault(); tokenHub.choose(i) }} title={e.why ?? e.label}>
        <span class="tok mono">{e.token}</span>
        <span class="val" class:ex={e.example}>{e.owner ? e.owner.name : e.value ? (e.example ? `e.g. ${e.value}` : e.value) : ''}</span>
        <span class="lbl">{e.label}</span>
      </button>
    {/each}
    <div class="hint">↑↓ choose · Enter or Tab insert · Shift+Enter capitalised · Esc close · <button class="link" onmousedown={(ev) => { ev.preventDefault(); tokenHub.ac = null; void tokenHub.open() }}>all tokens…</button></div>
  </div>
{/if}

{#if tokenHub.inline}
  <div class="inline">
    <div class="ih"><span>Tokens</span><button class="mini" onclick={() => (tokenHub.inline = false)}>✕</button></div>
    <TokenLookup payload={tokenHub.payload()} onInsert={(t) => tokenHub.insert(t)} imageUrl={(p) => images.url(p, project.loaded?.sourceId)} />
  </div>
{/if}

<style>
  .ac { position: fixed; z-index: 200; width: 410px; max-height: 260px; overflow: auto; background: var(--panel); border: 1px solid var(--accent-2); border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,.6); font-size: 12px; }
  .it { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; width: 100%; text-align: left; border: none; background: none; padding: 3px 8px; border-radius: 0; }
  .it.on { background: var(--accent-2); color: #fff; }
  .it.no { opacity: .5; }
  .tok { color: var(--accent); }
  .it.on .tok { color: #fff; }
  .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .val.ex { color: var(--muted); font-style: italic; }
  .lbl { grid-column: 1 / 3; font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .it.on .lbl { color: #dde; }
  .hint { position: sticky; bottom: 0; background: var(--panel); border-top: 1px solid var(--border); padding: 3px 8px; font-size: 10px; color: var(--muted); }
  .link { border: none; background: none; color: var(--accent); padding: 0; font-size: 10px; cursor: pointer; }
  .inline { position: fixed; z-index: 150; right: 16px; top: 90px; width: 440px; height: min(760px, calc(100vh - 120px)); background: var(--bg); border: 1px solid var(--accent-2); border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.6); display: flex; flex-direction: column; }
  .ih { display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--border); font-weight: 600; }
  .mini { padding: 0 6px; font-size: 11px; }
  .mono { font-family: var(--mono); }
</style>
