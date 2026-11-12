<script lang="ts">
  /** The Test context form: sample values the previews and Play mode fill tokens and conditions from. */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { testCtx, saveTestCtx } from '../state/testctx.svelte'
  import IdInput from '../ui/IdInput.svelte'

  interface Props {
    /** Condition commands the current rule(s) use that the editor can't evaluate. */
    unknownConditions?: string[]
    /** Memory keys the current rule(s) read. */
    memoryKeys?: string[]
  }
  let { unknownConditions = [], memoryKeys = [] }: Props = $props()

  const people = $derived([...(project.m?.people.map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}` })) ?? []), ...(app.index?.people ?? [])])
  const factions = $derived([...(project.m?.factions.filter((f) => f.kind === 'addition').map((f) => ({ id: f.id, name: String((f as { raw: Record<string, unknown> }).raw.displayName ?? f.id) })) ?? []), ...(app.index?.factions ?? [])])
  const markets = $derived(app.index?.markets ?? [])
  const upd = (fn: () => void) => { fn(); saveTestCtx() }
</script>

<div class="ctx">
  <div class="h">Test context</div>
  <div class="g">
    <label for="tc-pf">Player</label>
    <span class="row"><input id="tc-pf" type="text" value={testCtx.playerFirst} onchange={(e) => upd(() => (testCtx.playerFirst = e.currentTarget.value))} /><input type="text" value={testCtx.playerLast} aria-label="Player last name" onchange={(e) => upd(() => (testCtx.playerLast = e.currentTarget.value))} /></span>
    <label for="tc-g">Player is</label>
    <select id="tc-g" value={testCtx.playerGender} onchange={(e) => upd(() => (testCtx.playerGender = e.currentTarget.value as 'MALE' | 'FEMALE'))}><option value="FEMALE">female (her / she)</option><option value="MALE">male (him / he)</option></select>
    <span class="lbl">Speaker</span><IdInput value={testCtx.person} options={people} onCommit={(v) => upd(() => (testCtx.person = v))} placeholder="person id" />
    <span class="lbl">Faction</span><IdInput value={testCtx.faction} options={factions} onCommit={(v) => upd(() => (testCtx.faction = v))} placeholder="(the speaker's)" />
    <span class="lbl">Market</span><IdInput value={testCtx.market} options={markets} onCommit={(v) => upd(() => (testCtx.market = v))} placeholder="market id" />
    <label for="tc-cr">Credits</label><input id="tc-cr" type="number" value={testCtx.credits} onchange={(e) => upd(() => (testCtx.credits = Number(e.currentTarget.value)))} />
    <label for="tc-sp">Story points</label><input id="tc-sp" type="number" value={testCtx.storyPoints} onchange={(e) => upd(() => (testCtx.storyPoints = Number(e.currentTarget.value)))} />
    <span class="lbl">Commission</span><IdInput value={testCtx.commission} options={factions} onCommit={(v) => upd(() => (testCtx.commission = v))} placeholder="(none)" />
  </div>
  {#if memoryKeys.length}
    <div class="h2">Memory read here</div>
    <div class="g">
      {#each memoryKeys as k (k)}
        <span class="lbl mono" title={k}>{k}</span>
        <input type="text" class="mono" value={testCtx.memory[k] ?? ''} placeholder="(not set)" onchange={(e) => { const v = e.currentTarget.value; upd(() => { if (v === '') delete testCtx.memory[k]; else testCtx.memory[k] = v }) }} />
      {/each}
    </div>
  {/if}
  {#if unknownConditions.length}
    <div class="h2">Conditions the editor can't evaluate</div>
    {#each unknownConditions as c (c)}
      <label class="chk"><input type="checkbox" checked={testCtx.assume[c] ?? true} onchange={(e) => { const v = e.currentTarget.checked; upd(() => (testCtx.assume[c] = v)) }} /> <span class="mono">{c}</span></label>
    {/each}
  {/if}
  <p class="muted small">Tokens the preview can't fill are shown as <span class="mono">[$token]</span>, never hidden.</p>
</div>

<style>
  .ctx { padding: 8px 10px; overflow: auto; height: 100%; font-size: 12px; background: var(--panel); }
  .h { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 6px; }
  .h2 { font-size: 11px; color: var(--muted); margin: 10px 0 4px; }
  .g { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 4px 8px; align-items: center; }
  .g label, .lbl { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g input, .g select { width: 100%; padding: 3px 6px; }
  .row { display: flex; gap: 4px; }
  .chk { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
  .small { font-size: 11px; }
</style>
