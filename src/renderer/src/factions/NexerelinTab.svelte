<script lang="ts">
  /**
   * #63 (PLAN.md §10.3): Factions › Nexerelin, the faction's Nexerelin config (data only, optional).
   * Fields and facts: shared/nexconfig.ts. Starting relations come from the Relations tab; Export
   * writes them as startRelationships. Keys without a field are kept ("Other keys").
   */
  import RefButton from '../ui/RefButton.svelte'
  import {
    NEX_ALIGNMENTS, NEX_GROUPS, NEX_START_FLEETS, NEX_TRAITS, nexBool, nexConfigJson, nexConfigPath, nexOtherKeys,
    startFleets, type NexConfig, type NexField
  } from '../../../shared/nexconfig'
  import { isObj } from '../../../shared/faction'
  import { parseLoose } from '../../../shared/loosejson'
  import IdInput from '../ui/IdInput.svelte'

  interface Props {
    factionId: string
    /** The config as in the model (null: none yet). */
    config: NexConfig | null
    /** The relations that go into the config, and those that stay SagaLib's (mod conditions). */
    relations: Record<string, number>
    stay: string[]
    factionOptions: { id: string; name?: string; definedBy?: string }[]
    /** Apply an edit to the config (through the undo history). */
    onEdit: (fn: (c: NexConfig) => void) => void
    onCreate: () => void
    onRemove: () => void
    onRelations: () => void
    /** Open the faction's ready-made fleets (Fleets › New-game fleets). */
    onFleets: () => void
  }
  let { factionId, config, relations, stay, factionOptions, onEdit, onCreate, onRemove, onRelations, onFleets }: Props = $props()

  const preview = $derived(config ? JSON.stringify(nexConfigJson(config, relations), null, 2) : '')
  const fleets = $derived(config ? startFleets(config) : {})
  const others = $derived(config ? nexOtherKeys(config) : [])
  const factionName = (id: string) => factionOptions.find((o) => o.id === id)?.name ?? ''
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

  function set(key: string, v: unknown) { onEdit((c) => { if (v === undefined) delete c[key]; else c[key] = v }) }
  function toggleTrait(id: string, on: boolean) {
    onEdit((c) => {
      const l = asList(c.diplomacyTraits).filter((t) => t !== id)
      if (on) l.push(id)
      if (l.length) c.diplomacyTraits = l
      else delete c.diplomacyTraits
    })
  }
  function setAlignment(a: string, v: number | undefined) {
    onEdit((c) => {
      const m = isObj(c.alignments) ? { ...(c.alignments as Record<string, unknown>) } : {}
      if (v === undefined) delete m[a]
      else m[a] = Math.max(-1, Math.min(1, v))
      if (Object.keys(m).length) c.alignments = m
      else delete c.alignments
    })
  }
  function editList(key: string, fn: (l: string[]) => string[]) {
    onEdit((c) => { const l = fn(asList(c[key])); if (l.length) c[key] = l; else delete c[key] })
  }
  function setName3(key: string, i: number, text: string) {
    onEdit((c) => {
      const l = asList(c[key])
      while (l.length < 3) l.push('')
      l[i] = text
      if (l.every((x) => !x.trim())) delete c[key]
      else c[key] = l
    })
  }
  let otherError = $state<string | null>(null)
  function setOther(key: string, text: string) {
    otherError = null
    try { const v = parseLoose(text).value; onEdit((c) => { c[key] = v }) } catch (err) { otherError = `${key}: ${(err as Error).message}` }
  }
  const defText = (f: NexField) => f.defaultText ?? (f.default === undefined || f.default === '' ? '' : typeof f.default === 'boolean' ? (f.default ? 'on' : 'off') : f.optionLabels?.[String(f.default)] ?? String(f.default))
</script>

{#if !config}
  <div class="group">
    <div class="gt"><span>Nexerelin</span><span class="badge">only read by Nexerelin</span></div>
    <p class="small">This faction has no Nexerelin config, so with Nexerelin it gets Nexerelin's neutral defaults: it can't be picked at the start, has no diplomatic personality, and its starting relations follow Nexerelin's modes.</p>
    <p class="muted small">A config makes it a full Nexerelin faction: in the new-game list, in its wars, invasions and diplomacy. Export writes <span class="mono">{nexConfigPath(factionId)}</span> and a row in <span class="mono">mod_factions.csv</span>. Without Nexerelin nothing reads them, so Nexerelin stays optional.</p>
    <button class="primary" onclick={onCreate}>Add a Nexerelin config</button>
  </div>
{:else}
  <div class="head">
    <span class="muted small">Exported as <span class="mono">{nexConfigPath(factionId)}</span> + a row in <span class="mono">mod_factions.csv</span>. Only Nexerelin reads them.</span>
    <span class="spacer"></span>
    <button class="mini danger" onclick={onRemove} title="Remove the config (Export then removes the file it wrote)">Remove config</button>
  </div>

  {#each NEX_GROUPS as g (g.id)}
    <div class="group">
      <div class="gt"><span>{g.label}</span></div>
      {#if g.help}<div class="help top">{g.help}</div>{/if}
      {#each g.fields as f (f.key)}
        {@const v = config[f.key]}
        {#if f.kind === 'fleets'}
          {@const types = NEX_START_FLEETS.filter((t) => fleets[t.key]?.length)}
          {@const n = types.reduce((a, t) => a + fleets[t.key].length, 0)}
          <div class="row">
            <label for={`nx-fleets`}>{f.label} <RefButton ref="factions-nex-start-fleets" /></label>
            <div class="ctl">
              <span class="small">{n ? `${n} fleet${n === 1 ? '' : 's'}: ${types.map((t) => `${t.label} ${fleets[t.key].length}`).join(', ')}` : 'none (players who join it only get Custom)'}</span>
              <button id="nx-fleets" class="mini" onclick={onFleets}>Edit on Fleets › New-game fleets</button>
            </div>
            <div class="help span">{f.help}</div>
          </div>
        {:else if f.kind === 'traits'}
          {@const on = asList(v)}
          <div class="sub">
            <div class="sublabel">{f.label}</div>
            <div class="traits">
              {#each NEX_TRAITS as t (t.id)}<label class="trait" title={t.desc}><input type="checkbox" checked={on.includes(t.id)} onchange={(e) => toggleTrait(t.id, e.currentTarget.checked)} /> {t.name}</label>{/each}
            </div>
            {#each on.filter((t) => !NEX_TRAITS.some((x) => x.id === t)) as t (t)}<span class="chip mono bad">{t}<button class="x" onclick={() => toggleTrait(t, false)}>✕</button></span>{/each}
            <div class="help">{f.help} Hover a trait for what it does.</div>
          </div>
        {:else if f.kind === 'alignments'}
          {@const map = isObj(v) ? (v as Record<string, unknown>) : {}}
          <div class="sub">
            <div class="sublabel">{f.label}<RefButton ref="factions-nex-alignments" /></div>
            <table class="t al">
              <tbody>
                {#each NEX_ALIGNMENTS as a (a)}
                  {@const val = typeof map[a] === 'number' ? (map[a] as number) : undefined}
                  <tr><td>{a}</td>
                    <td><input type="range" min="-1" max="1" step="0.05" value={val ?? 0} oninput={(e) => setAlignment(a, Number(e.currentTarget.value))} /></td>
                    <td><input type="number" class="mono" min="-1" max="1" step="0.05" value={val ?? ''} placeholder="0" onchange={(e) => setAlignment(a, num(e.currentTarget.value))} /></td>
                    <td>{#if val !== undefined}<button class="mini" onclick={() => setAlignment(a, undefined)}>✕</button>{/if}</td></tr>
                {/each}
              </tbody>
            </table>
            <div class="help">{f.help}</div>
          </div>
        {:else if f.kind === 'factions'}
          {@const l = asList(v)}
          <div class="row">
            <label for={`nx-${f.key}`}>{f.label}</label>
            <div class="chips">
              {#each l as id (id)}<span class="chip">{factionName(id) || id} <span class="mono muted">{factionName(id) ? id : ''}</span><button class="x" onclick={() => editList(f.key, (x) => x.filter((y) => y !== id))}>✕</button></span>{/each}
              <span class="addchip"><IdInput value="" options={factionOptions.filter((o) => o.id !== factionId && !l.includes(o.id))} placeholder="+ faction…" width="170px" clearOnCommit onCommit={(id) => { if (id) editList(f.key, (x) => (x.includes(id) ? x : [...x, id])) }} /></span>
            </div>
            <div class="help span">{f.help}</div>
          </div>
        {:else if f.kind === 'names3'}
          {@const l = asList(v)}
          <div class="row">
            <label for={`nx-${f.key}-0`}>{f.label}</label>
            <div class="ctl">{#each [0, 1, 2] as i (i)}<input id={`nx-${f.key}-${i}`} type="text" value={l[i] ?? ''} placeholder={`level ${i + 1}`} onchange={(e) => setName3(f.key, i, e.currentTarget.value)} />{/each}</div>
            <div class="help span">{f.help}</div>
          </div>
        {:else}
          <div class="row">
            <label for={`nx-${f.key}`}>{f.label}</label>
            <div class="ctl">
              {#if f.kind === 'bool'}
                <input id={`nx-${f.key}`} type="checkbox" checked={nexBool(config, f.key)} onchange={(e) => set(f.key, e.currentTarget.checked)} />
                {#if v === undefined}<span class="muted small">default ({defText(f)})</span>{/if}
              {:else if f.kind === 'text'}
                <input id={`nx-${f.key}`} type="text" value={typeof v === 'string' ? v : ''} placeholder={defText(f)} onchange={(e) => { const t = e.currentTarget.value; set(f.key, t === '' ? undefined : t) }} />
              {:else if f.kind === 'longtext'}
                <textarea id={`nx-${f.key}`} rows="3" value={typeof v === 'string' ? v : ''} onchange={(e) => { const t = e.currentTarget.value; set(f.key, t === '' ? undefined : t) }}></textarea>
              {:else if f.kind === 'number'}
                <input id={`nx-${f.key}`} type="number" min={f.min} max={f.max} step={f.step ?? 1} value={typeof v === 'number' ? v : ''} placeholder={defText(f)} onchange={(e) => set(f.key, num(e.currentTarget.value))} />
              {:else if f.kind === 'select'}
                <select id={`nx-${f.key}`} value={v === undefined ? '' : String(v)} onchange={(e) => { const t = e.currentTarget.value; set(f.key, t === '' ? undefined : f.key === 'hostileToAll' ? Number(t) : t) }}>
                  <option value="">default ({defText(f)})</option>
                  {#each f.options ?? [] as o (o)}<option value={o}>{f.optionLabels?.[o] ?? o}</option>{/each}
                </select>
              {/if}
              {#if v !== undefined && f.kind !== 'bool'}<button class="mini" title="Back to Nexerelin's default" onclick={() => set(f.key, undefined)}>✕</button>{/if}
              {#if v !== undefined && f.kind === 'bool'}<button class="mini" title="Back to Nexerelin's default" onclick={() => set(f.key, undefined)}>✕</button>{/if}
            </div>
            <div class="help span">{f.help}</div>
          </div>
        {/if}
      {/each}
    </div>
  {/each}

  <div class="group">
    <div class="gt"><span>Starting relations</span><button class="mini" onclick={onRelations}>Edit on the Relations tab</button></div>
    {#if Object.keys(relations).length}
      <div class="chips">{#each Object.entries(relations) as [o, val] (o)}<span class="chip">{factionName(o) || o} <span class="mono">{val}</span></span>{/each}</div>
    {:else}<div class="muted small">None designed: everyone starts as Nexerelin decides.</div>{/if}
    <div class="help">The faction's starting relations are written here as <span class="mono">startRelationships</span>, with <span class="mono">useConfigRelationshipsInNonRandomSector</span>, so Nexerelin applies them in the hand-made and the random sector and randomizes them only when the player picks random relations (unless <b>Keep relations when randomized</b> is on). With Nexerelin, SagaLib then leaves them to it; without Nexerelin, SagaLib sets them as before.</div>
    {#if stay.length}<div class="help warnt">{stay.join(', ')}: these depend on other mods, so they stay SagaLib's (set after Nexerelin, never randomized).</div>{/if}
  </div>

  <div class="group">
    <div class="gt"><span>Other keys ({others.length})</span><span>kept as they are</span></div>
    {#each others as k (k)}
      {@const val = config[k]}
      <div class="sub">
        <div class="sublabel mono">{k} <button class="mini" onclick={() => set(k, undefined)}>✕</button></div>
        <textarea class="mono" rows={Math.min(10, JSON.stringify(val, null, 2).split('\n').length)} value={JSON.stringify(val, null, 2)} onchange={(e) => setOther(k, e.currentTarget.value)}></textarea>
      </div>
    {:else}<div class="muted small">None. Keys this tab has no field for (e.g. a random sector's industrySeeds or customStations) are kept here when a config file is read in.</div>{/each}
    {#if otherError}<div class="bad small">{otherError}</div>{/if}
  </div>

  <div class="group">
    <div class="gt"><span>File preview</span><span class="mono">{nexConfigPath(factionId)}</span></div>
    <pre class="files">{preview}</pre>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .spacer { flex: 1; }
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; background: #161a20; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
  .badge { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--accent-2); color: var(--accent); text-transform: none; letter-spacing: 0; }
  .row { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 2px 10px; align-items: center; padding: 3px 0; }
  .row label { color: var(--muted); font-size: 12px; }
  .ctl { display: flex; gap: 6px; align-items: center; }
  .ctl input[type='text'], .ctl textarea { flex: 1; min-width: 0; }
  .ctl input[type='number'] { width: 110px; }
  .help { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .help.span { grid-column: 2; margin-top: 0; }
  .help.top { margin: -2px 0 6px; }
  .warnt { color: var(--warn); }
  .sub { padding: 4px 0 6px; border-top: 1px solid #1e242c; }
  .sub:first-of-type { border-top: none; }
  .sublabel { font-size: 12px; color: var(--muted); margin-bottom: 4px; display: flex; gap: 6px; align-items: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { font-size: 11px; padding: 1px 4px 1px 8px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 4px; }
  .chip.bad { border-color: var(--bad); color: var(--bad); }
  .chip .x { border: none; background: none; padding: 0 3px; font-size: 10px; color: var(--muted); }
  .chip .x:hover { color: var(--bad); }
  .addchip :global(input) { font-size: 11px; padding: 1px 6px; border-radius: 10px; }
  .traits { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px 10px; }
  .trait { font-size: 12px; display: flex; gap: 4px; align-items: center; }
  table.t { border-collapse: collapse; font-size: 12px; }
  table.t td { padding: 2px 6px; border-bottom: 1px solid #1e242c; }
  table.al td:first-child { width: 110px; }
  table.al input[type='range'] { width: 180px; vertical-align: middle; }
  table.al input[type='number'] { width: 70px; }
  .mini { padding: 0 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  textarea { width: 100%; resize: vertical; font-size: 12px; }
  .files { font-family: var(--mono); font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; white-space: pre; overflow: auto; max-height: 40vh; margin: 0; }
  .small { font-size: 12px; }
  .bad { color: var(--bad); }
</style>
