<script lang="ts">
  /** The Test context form: sample values the previews and Play mode fill tokens and conditions from. */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { testCtx, saveTestCtx } from '../state/testctx.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import { mods } from '../state/mods.svelte'
  import { PLACE_PRESETS, type PlacePreset } from '../../../shared/rules/context'
  import { isValueSetting, settingKey } from '../../../shared/settings'

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
  const places = $derived((project.m?.systems ?? []).flatMap((x) => x.entities.map((e) => ({ id: e.id, name: e.name }))))
  const preset = $derived(PLACE_PRESETS.find((p) => p.id === (testCtx.place ?? 'none')) ?? PLACE_PRESETS[0])
  const upd = (fn: () => void) => { fn(); saveTestCtx() }
  // #62: the mod's settings; a value equal to the default is not stored
  const settingDefs = $derived((project.m?.project.settings ?? []).filter(isValueSetting))
  const setS = (id: string, v: string, def: string) => upd(() => { const o = { ...(testCtx.settings ?? {}) }; if (v === def || v === '') delete o[id]; else o[id] = v; testCtx.settings = o })
  const presencePeople = $derived((project.m?.people ?? []).filter((p) => !!p.presence).map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}`.trim() || p.id })))
</script>

<div class="ctx">
  <div class="h">Test context</div>
  <div class="f-help top">Sample values the preview fills tokens ($playerName, $credits…) and conditions with: who the player is, who they talk to, and where. Editor only; nothing here is exported.</div>
  <div class="g">
    <label for="tc-pf">Player</label>
    <span class="row"><input id="tc-pf" type="text" value={testCtx.playerFirst} onchange={(e) => upd(() => (testCtx.playerFirst = e.currentTarget.value))} /><input type="text" value={testCtx.playerLast} aria-label="Player last name" onchange={(e) => upd(() => (testCtx.playerLast = e.currentTarget.value))} /></span>
    <label for="tc-g">Player is</label>
    <select id="tc-g" value={testCtx.playerGender} onchange={(e) => upd(() => (testCtx.playerGender = e.currentTarget.value as 'MALE' | 'FEMALE'))}><option value="FEMALE">female (her / she)</option><option value="MALE">male (him / he)</option></select>
    <span class="lbl">Speaker</span><IdInput value={testCtx.person} options={people} onCommit={(v) => upd(() => (testCtx.person = v))} placeholder="person id" />
    <span class="lbl">Faction</span><IdInput value={testCtx.faction} options={factions} onCommit={(v) => upd(() => (testCtx.faction = v))} placeholder="(the speaker's)" />
    <label for="tc-pl">Place</label>
    <select id="tc-pl" value={testCtx.place ?? 'none'} onchange={(e) => upd(() => (testCtx.place = e.currentTarget.value as PlacePreset))}>{#each PLACE_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}</select>
    <span></span><span class="f-help">{preset.help}{Object.keys(preset.memory).length ? ` Sets ${Object.keys(preset.memory).join(', ')}.` : ''}</span>
    <span class="lbl">Place id</span><IdInput value={testCtx.entity ?? ''} options={places} onCommit={(v) => upd(() => (testCtx.entity = v || undefined))} placeholder="($id when no speaker)" />
    <span class="lbl">Market</span><IdInput value={testCtx.market} options={markets} onCommit={(v) => upd(() => (testCtx.market = v))} placeholder="market id" />
    <label for="tc-cr">Credits</label><input id="tc-cr" type="number" value={testCtx.credits} onchange={(e) => upd(() => (testCtx.credits = Number(e.currentTarget.value)))} />
    <label for="tc-sp">Story points</label><input id="tc-sp" type="number" value={testCtx.storyPoints} onchange={(e) => upd(() => (testCtx.storyPoints = Number(e.currentTarget.value)))} />
    <span class="lbl">Commission</span><IdInput value={testCtx.commission} options={factions} onCommit={(v) => upd(() => (testCtx.commission = v))} placeholder="(none)" />
  </div>
  {#if mods.optional().length}
    <!-- #60: a switch per optional mod (Saga › Mods); default: whether it is enabled in your game -->
    <div class="h2">Optional mods and versions</div>
    <div class="f-help">Which of the mod's optional mods count here (in game: enabled when the save started, and still enabled). Content outside this setting is skipped, as SagaLib skips it, and every item with versions shows the version for these mods (names, portraits, places; Play mode uses it too).</div>
    {#each mods.optional() as x (x.id)}
      <label class="chk"><input type="checkbox" checked={mods.playMods().has(x.id)} onchange={(e) => (mods.playOn[x.id] = e.currentTarget.checked)} /> {x.name} <span class="mono muted">{x.id}</span></label>
    {/each}
  {/if}
  {#if presencePeople.length}
    <!-- #70: people present only while their market's owner gets on with a faction -->
    <div class="h2">People away</div>
    <div class="f-help">People with a presence rule (People › Presence). In game SagaLib sets $global.sagaforge_away_&lt;id&gt; once a day; while it is true they're hidden from the comm directory and their quests aren't offered.</div>
    {#each presencePeople as p (p.id)}
      <label class="chk"><input type="checkbox" checked={testCtx.away?.includes(p.id) ?? false} onchange={(e) => { const v = e.currentTarget.checked; upd(() => { const s = new Set(testCtx.away ?? []); if (v) s.add(p.id); else s.delete(p.id); testCtx.away = [...s] }) }} /> {p.name} is away <span class="mono muted">{p.id}</span></label>
    {/each}
  {/if}
  {#if settingDefs.length}
    <!-- #62: the mod's settings (Saga › Settings) as the player set them in LunaLib's menu -->
    <div class="h2">Mod settings</div>
    <div class="f-help">The values SagaLib sets as $global.&lt;id&gt; on load: the player's in LunaLib's menu, the defaults without LunaLib. Shared by every save.</div>
    <div class="g">
      {#each settingDefs as s (s.id)}
        {@const v = testCtx.settings?.[s.id] ?? s.default}
        <span class="lbl" title={settingKey(s.id)}>{s.label || s.id}</span>
        {#if s.type === 'Boolean'}<label class="chk"><input type="checkbox" checked={v === 'true'} onchange={(e) => setS(s.id, String(e.currentTarget.checked), s.default)} /> {v === s.default ? '(default)' : ''}</label>
        {:else if s.type === 'Radio'}<select value={v} onchange={(e) => setS(s.id, e.currentTarget.value, s.default)}>{#each s.choices ?? [] as c (c)}<option value={c}>{c}{c === s.default ? ' (default)' : ''}</option>{/each}</select>
        {:else}<input type={s.type === 'String' ? 'text' : 'number'} value={v} placeholder={s.default} onchange={(e) => setS(s.id, e.currentTarget.value, s.default)} />{/if}
      {/each}
    </div>
  {/if}
  {#if memoryKeys.length}
    <div class="h2">Memory read here</div>
    <div class="f-help">Memory keys this text's conditions test; set them to see each case.</div>
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
  .top { margin-bottom: 6px; }
  .g { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 4px 8px; align-items: center; }
  .g label, .lbl { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g input, .g select { width: 100%; padding: 3px 6px; }
  .row { display: flex; gap: 4px; }
  .chk { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
  .small { font-size: 11px; }
</style>
