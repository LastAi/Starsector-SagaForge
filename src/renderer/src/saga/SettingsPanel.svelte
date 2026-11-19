<script lang="ts">
  /**
   * #62 (PLAN.md §10.4): Saga › Settings, the mod's page in LunaLib's settings menu. Exported as
   * data/config/LunaSettings.csv (+ LunaSettingsConfig.json with an icon). LunaLib shows the page;
   * SagaLib sets each value as $global.<id> on every load (the defaults without LunaLib), so quests,
   * Branch cases, phrases and prerequisites can test it, and a setting can scale encounter fleet
   * size and credit rewards. LunaLib stays optional unless Saga › Mods makes it required.
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { useOf } from '../../../shared/modlist'
  import { slug, uniqueId } from '../../../shared/quest'
  import { SETTING_TYPES, type SettingDef, type SettingType } from '../../../shared/model'
  import { DEFAULT_MAX, DEFAULT_MIN, isValueSetting, LUNALIB_ID, settingKey, settingsRead, TYPE_LABEL } from '../../../shared/settings'
  import Field from '../ui/Field.svelte'

  const m = $derived(project.m!)
  const list = $derived(m.project.settings ?? [])
  const sel = $derived(app.selected.setting ?? list[0]?.id ?? null)
  const idx = $derived(list.findIndex((s) => s.id === sel))
  const cur = $derived(idx >= 0 ? list[idx] : null)
  const reads = $derived(settingsRead(m))
  const luna = $derived(useOf(m.project, LUNALIB_ID))
  const lunaInstalled = $derived(!!app.index?.sources.some((s) => s.id === LUNALIB_ID))
  const tabs = $derived([...new Set(list.map((s) => s.tab ?? ''))])

  const ed = (fn: (s: SettingDef) => void) => { const id = sel; project.change((mm) => { const s = mm.project.settings?.find((x) => x.id === id); if (s) fn(s) }) }

  const DEFAULTS: Record<SettingType, Partial<SettingDef>> = {
    Boolean: { default: 'true' }, Int: { default: '100', min: 0, max: 300 }, Double: { default: '1', min: 0, max: 5 },
    Radio: { default: 'Normal', choices: ['Easy', 'Normal', 'Hard'] }, String: { default: '' }, Header: { default: '' }, Text: { default: '' }
  }
  const LABEL: Record<SettingType, string> = { Boolean: 'New option', Int: 'New number', Double: 'New number', Radio: 'New choice', String: 'New text', Header: 'New section', Text: 'A line of text on the page.' }

  function add(type: SettingType) {
    const p = m.project.prefix
    const id = uniqueId(`${p}${type === 'Header' ? 'header' : type === 'Text' ? 'text' : 'setting'}`, list.map((s) => s.id))
    const tab = cur?.tab
    project.change((mm) => { (mm.project.settings ??= []).splice(idx >= 0 ? idx + 1 : list.length, 0, { id, label: LABEL[type], type, tooltip: '', ...DEFAULTS[type], ...(tab ? { tab } : {}) } as SettingDef) })
    app.selected.setting = id
  }
  /** Until something reads it, a setting's id follows its label. */
  function rename(v: string) {
    const s = cur
    if (!s) return
    const p = m.project.prefix
    const used = reads.has(s.id)
    const nid = used ? s.id : uniqueId(`${p}${slug(v).replace(new RegExp(`^${p}`), '') || 'setting'}`.slice(0, 48), list.filter((x) => x.id !== s.id).map((x) => x.id))
    ed((x) => { x.label = v; x.id = nid })
    app.selected.setting = nid
  }
  function setId(v: string) {
    const s = cur
    if (!s) return
    const p = m.project.prefix
    const nid = v.trim().startsWith(p) ? slug(v.trim()) : `${p}${slug(v.trim())}`
    if (!nid || nid === s.id) return
    if (list.some((x) => x.id === nid)) { app.error = `Another setting already has the id ${nid}.`; return }
    if (reads.has(s.id) && !confirm(`${settingKey(s.id)} is read by ${reads.get(s.id)!.join(', ')}. Those stay as they are (Problems lists them). Change the id anyway?`)) return
    ed((x) => { x.id = nid })
    app.selected.setting = nid
  }
  function setType(t: SettingType) {
    ed((x) => {
      const d = DEFAULTS[t]
      x.type = t
      x.default = d.default ?? ''
      if (t === 'Int' || t === 'Double') { x.min = d.min; x.max = d.max } else { delete x.min; delete x.max }
      if (t === 'Radio') x.choices = [...(d.choices ?? [])]
      else delete x.choices
    })
  }
  function move(d: -1 | 1) {
    const i = idx
    if (i < 0 || i + d < 0 || i + d >= list.length) return
    project.change((mm) => { const a = mm.project.settings!; [a[i], a[i + d]] = [a[i + d], a[i]] })
  }
  function remove() {
    const s = cur
    if (!s) return
    const r = reads.get(s.id)
    if (r?.length && !confirm(`${settingKey(s.id)} is read by ${r.join(', ')}. Delete the setting anyway? (Problems will list what still reads it.)`)) return
    project.change((mm) => { mm.project.settings = (mm.project.settings ?? []).filter((x) => x.id !== s.id) })
    app.selected.setting = null
  }
  async function pickIcon() {
    const [p] = await chooseImages('modIcon', { current: m.project.settingsIcon, title: "The mod's icon in LunaLib's menu" })
    if (p) project.change((mm) => { mm.project.settingsIcon = p })
  }
  const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v))
</script>

<div class="split">
  <div class="side">
    <div class="sect">Settings
      <select value="" title="Add a row to the page (after the selected one)" onchange={(e) => { const v = e.currentTarget.value as SettingType; e.currentTarget.value = ''; if (v) add(v) }}>
        <option value="">+ Add…</option>{#each SETTING_TYPES as t (t)}<option value={t}>{TYPE_LABEL[t]}</option>{/each}
      </select>
    </div>
    <ul class="list">
      {#each list as s (s.id)}
        <li class:on={s.id === sel} class:lay={!isValueSetting(s)}><button class="li" onclick={() => (app.selected.setting = s.id)}>
          <span class="nm">{s.type === 'Header' ? `▸ ${s.label}` : s.label || s.id}</span>
          <span class="sub">{TYPE_LABEL[s.type]}{s.tab ? ` · tab ${s.tab}` : ''}{isValueSetting(s) && !reads.has(s.id) ? ' · not read' : ''}</span>
        </button></li>
      {:else}<li class="muted small pad">No settings yet. Add a header first, then the options.</li>{/each}
    </ul>
    {#if cur}<div class="pad row"><button class="mini" disabled={idx <= 0} onclick={() => move(-1)} title="Move up on the page">▲</button><button class="mini" disabled={idx >= list.length - 1} onclick={() => move(1)} title="Move down on the page">▼</button><span class="muted small">Order on the page</span></div>{/if}
  </div>

  <div class="scroll pad">
    <p class="muted small intro">The mod's own page in <b>LunaLib</b>'s settings menu, where players expect a mod's options. Export writes <span class="mono">data/config/LunaSettings.csv</span>. SagaLib reads the same file and sets each value as <span class="mono">$global.&lt;id&gt;</span> every time a game loads: the player's value with LunaLib, the default without it. A change in LunaLib's menu applies at once. Use them in conditions (quest prerequisites, Branch cases, phrases, option conditions) and to scale encounter fleet size and credit rewards.</p>
    <div class="note"><b>Shared by every save.</b> LunaLib keeps the player's values in <span class="mono">saves/common</span>, not in a save, so changing one changes it for every playthrough. Quests read a setting when they decide (when offered, at a Branch), so a change doesn't break a quest that is already running.</div>
    <div class="row status">
      <span>LunaLib: <b class:good={luna === 'required' || luna === 'optional'}>{luna === 'required' ? 'required' : luna === 'incompatible' ? 'marked incompatible' : 'optional'}</b></span>
      <span class="muted small">{luna === 'required' ? 'In mod_info.json dependencies (Saga › Mods): the launcher won\'t enable this mod without it.' : 'Not in mod_info.json: without LunaLib the page isn\'t shown and the defaults apply. To make LunaLib required, set it to Required in Saga › Mods.'}{luna === 'none' ? ' It isn\'t in the mod\'s list yet (Problems asks for it).' : ''}{lunaInstalled ? '' : ' LunaLib is not installed in your game.'}</span>
      {#if luna === 'none' && list.length}<button class="mini" title="List LunaLib in Saga › Mods as optional (nothing goes into mod_info.json)" onclick={() => project.change((mm) => { (mm.project.mods ??= []).push({ id: LUNALIB_ID, name: 'LunaLib', use: 'optional' }) })}>Add as optional</button>{/if}
      <button class="mini" onclick={() => (app.selected.sagaOpen = 'mods')}>Saga › Mods</button>
    </div>
    <div class="row status">
      <span>Icon in LunaLib's menu:</span>
      {#if m.project.settingsIcon}<span class="mono">{m.project.settingsIcon}</span><button class="mini" onclick={() => project.change((mm) => { delete mm.project.settingsIcon })}>✕</button>{:else}<span class="muted">none (LunaLib's default)</span>{/if}
      <button class="mini" onclick={pickIcon}>Choose…</button>
      <span class="muted small">Square, 40×40 shows unscaled. Exported as data/config/LunaSettingsConfig.json.</span>
    </div>

    {#if cur}
      {@const value = isValueSetting(cur)}
      {@const r = reads.get(cur.id) ?? []}
      <div class="grid2">
        <Field label="Type" for="st-t" help="On/off, a whole number or a number (a slider from minimum to maximum), a choice of a few words, or a text. Header and Text line only lay out the page.">
          <select id="st-t" value={cur.type} onchange={(e) => setType(e.currentTarget.value as SettingType)}>{#each SETTING_TYPES as t (t)}<option value={t}>{TYPE_LABEL[t]}</option>{/each}</select>
        </Field>
        <Field label={cur.type === 'Text' ? 'Text' : cur.type === 'Header' ? 'Heading' : 'Label'} for="st-l" help={value ? 'What the player sees next to the control.' : cur.type === 'Header' ? 'A heading that starts a section of the page.' : 'A line of explanation on the page.'}>
          {#if cur.type === 'Text'}<textarea id="st-l" rows="3" value={cur.label} onchange={(e) => rename(e.currentTarget.value)}></textarea>
          {:else}<input id="st-l" type="text" value={cur.label} onchange={(e) => rename(e.currentTarget.value)} />{/if}
        </Field>
        <Field label="Id" for="st-id" help={value ? `The memory key is ${settingKey(cur.id)}. It follows the label until something reads it; after a release never change it (players' saved values are kept by id).` : 'LunaLib needs an id for every row.'}>
          <input id="st-id" type="text" class="mono" value={cur.id} onchange={(e) => setId(e.currentTarget.value)} />
        </Field>
        {#if value}
          <Field label="Description" for="st-tt" help="LunaLib prints it under the label. Say what it changes in game.">
            <textarea id="st-tt" rows="2" value={cur.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.tooltip = v }) }}></textarea>
          </Field>
          {#if cur.type === 'Radio'}
            <Field label="Choices" for="st-ch" help="The words the player picks from, separated by commas (a choice can't contain a comma). Conditions test the word: $global.{cur.id} == Hard.">
              <input id="st-ch" type="text" value={(cur.choices ?? []).join(', ')} onchange={(e) => { const v = e.currentTarget.value.split(',').map((x) => x.trim()).filter(Boolean); ed((x) => { x.choices = v; if (!v.includes(x.default)) x.default = v[0] ?? '' }) }} />
            </Field>
          {/if}
          <Field label="Default" for="st-d" help="The value until the player changes it, and always without LunaLib.">
            {#if cur.type === 'Boolean'}<select id="st-d" value={cur.default} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.default = v }) }}><option value="true">on</option><option value="false">off</option></select>
            {:else if cur.type === 'Radio'}<select id="st-d" value={cur.default} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.default = v }) }}>{#each cur.choices ?? [] as c (c)}<option value={c}>{c}</option>{/each}</select>
            {:else if cur.type === 'Int' || cur.type === 'Double'}<input id="st-d" type="number" step={cur.type === 'Int' ? 1 : 0.05} value={cur.default} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.default = v }) }} />
            {:else}<input id="st-d" type="text" value={cur.default} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.default = v }) }} />{/if}
          </Field>
          {#if cur.type === 'Int' || cur.type === 'Double'}
            <Field label="Range" help="The slider's minimum and maximum (LunaLib's default 0–100). As a multiplier, a whole number is a percent (100 = as made) and a number is times (1 = as made).">
              <span class="row"><input type="number" class="short" value={cur.min ?? DEFAULT_MIN} aria-label="Minimum" onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.min = v }) }} /> to <input type="number" class="short" value={cur.max ?? DEFAULT_MAX} aria-label="Maximum" onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.max = v }) }} /></span>
            </Field>
          {/if}
        {/if}
        <Field label="Tab" for="st-tab" help="A tab of the mod's page; empty = the main tab. Rows with the same tab are shown together, in this order.">
          <input id="st-tab" type="text" list="st-tabs" value={cur.tab ?? ''} placeholder="(main)" onchange={(e) => { const v = e.currentTarget.value.trim(); ed((x) => { if (v) x.tab = v; else delete x.tab }) }} />
          <datalist id="st-tabs">{#each tabs.filter(Boolean) as t (t)}<option value={t}></option>{/each}</datalist>
        </Field>
        <Field label="Notes" for="st-n" help="For you only; not exported.">
          <input id="st-n" type="text" value={cur.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { if (v) x.notes = v; else delete x.notes }) }} />
        </Field>
        {#if value}
          <Field label="Read by" help="Conditions, texts and multipliers that use it. Add a condition with the condition pickers (Setting …), or a prerequisite: Quests › Prerequisites › a setting.">
            <div class="small">{#each r as w (w)}<div>{w}</div>{:else}<span class="muted">Nothing reads it yet.</span>{/each}</div>
          </Field>
        {/if}
      </div>
      <p><button class="mini danger" onclick={remove}>Delete {value ? 'setting' : 'row'}</button></p>
    {/if}

    {#if list.length}
      <div class="sect2">The page in LunaLib (rough preview)</div>
      <div class="preview">
        {#each tabs as t (t)}
          <div class="ptab">{t || 'Main tab'}</div>
          {#each list.filter((s) => (s.tab ?? '') === t) as s (s.id)}
            {#if s.type === 'Header'}<div class="ph">{s.label}</div>
            {:else if s.type === 'Text'}<div class="ptext">{s.label}</div>
            {:else}<div class="prow" title={s.tooltip}><span>{s.label}</span><span class="pv">{s.type === 'Boolean' ? (s.default === 'true' ? '☑' : '☐') : s.type === 'Radio' ? (s.choices ?? []).map((c) => (c === s.default ? `◉ ${c}` : `○ ${c}`)).join('  ') : (s.type === 'Int' || s.type === 'Double') ? `${s.min ?? DEFAULT_MIN} ━━●━━ ${s.max ?? DEFAULT_MAX}  (${s.default})` : `[ ${s.default} ]`}</span></div>{/if}
          {/each}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; height: 100%; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect select { padding: 1px 4px; font-size: 11px; text-transform: none; }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 4px; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .list li.lay .nm { color: var(--muted); }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; display: flex; flex-direction: column; }
  .sub { font-size: 10px; color: var(--muted); }
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .intro { max-width: 980px; margin: 0 0 8px; }
  .note { max-width: 980px; border: 1px solid var(--warn); border-radius: 4px; padding: 6px 10px; font-size: 12px; margin-bottom: 8px; }
  .row { display: flex; gap: 8px; align-items: center; font-size: 12px; }
  .status { margin-bottom: 6px; flex-wrap: wrap; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 480px); gap: 2px 10px; align-items: center; margin-top: 10px; }
  input.short { width: 80px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .good { color: var(--good); }
  .preview { max-width: 640px; background: #0f1216; border: 1px solid var(--border); border-radius: 4px; padding: 8px 12px; font-size: 12px; }
  .ptab { font-size: 11px; color: var(--accent); border-bottom: 1px solid var(--border); margin: 6px 0 4px; }
  .ph { font-weight: bold; margin: 8px 0 2px; }
  .ptext { color: var(--muted); margin: 2px 0; white-space: pre-wrap; }
  .prow { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .pv { color: var(--muted); font-family: var(--mono, monospace); }
</style>
