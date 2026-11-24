<script lang="ts">
  /**
   * #60 (PLAN.md §10.1): Saga › Mods, the other mods this mod has content for. Required: in
   * mod_info.json dependencies (asked on export); optional: everything using it is conditional
   * ("Only with / Only without"); incompatible: a warning in game and in the release notes. A mod
   * that isn't listed is not used. Every installed mod is offered, enabled or not, except this mod,
   * SagaLib, translation mods and the libraries the listed mods need.
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { mods } from '../state/mods.svelte'
  import { offeredMods, useOf, USE_LABEL, condText, isNone, neverWithOf, type UseKind } from '../../../shared/modlist'
  import { usedBy } from '../../../shared/checks/mods'
  import type { ModUse } from '../../../shared/model'
  import type { SourceInfo } from '../../../shared/api'

  const m = $derived(project.m)
  const index = $derived(app.index)
  let filter = $state('')
  let showLibraries = $state(false)
  let showUnused = $state(true)

  const offered = $derived(index && m ? offeredMods(index, m.project, index.activeSourceId) : { mods: [], libraries: [] })
  const uses = $derived(m && index && project.loaded ? usedBy(m, index, project.loaded) : new Map<string, string[]>())
  /** Listed mods that aren't installed stay in the table. */
  const missing = $derived((m?.project.mods ?? []).filter((x) => !index?.sources.some((s) => s.id === x.id)))
  type Row = { id: string; name: string; version: string; enabled: boolean | null; library: boolean; src: SourceInfo | null }
  const rows = $derived.by((): Row[] => {
    const r: Row[] = [
      ...offered.mods.map((s) => ({ id: s.id, name: s.name, version: s.version, enabled: s.enabled, library: false, src: s })),
      ...(showLibraries ? offered.libraries.map((s) => ({ id: s.id, name: s.name, version: s.version, enabled: s.enabled, library: true, src: s })) : []),
      ...missing.map((x) => ({ id: x.id, name: x.name, version: '', enabled: null, library: false, src: null }))
    ]
    const f = filter.trim().toLowerCase()
    return r.filter((x) => (!f || x.name.toLowerCase().includes(f) || x.id.toLowerCase().includes(f)) && (showUnused || (m && useOf(m.project, x.id) !== 'none') || uses.has(x.id)))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  })
  const rank = (r: Row) => { const u = m ? useOf(m.project, r.id) : 'none'; return u === 'none' ? (uses.has(r.id) ? 1 : 2) : 0 }

  function entry(id: string): ModUse | undefined { return m?.project.mods?.find((x) => x.id === id) }

  function setUse(r: Row, use: UseKind) {
    if (!m) return
    const before = useOf(m.project, r.id)
    if (use === before) return
    const used = uses.get(r.id) ?? []
    if (used.length && (use === 'none' || use === 'incompatible')) {
      const sample = used.slice(0, 8).join('\n  ') + (used.length > 8 ? `\n  … +${used.length - 8}` : '')
      if (!confirm(`${used.length} item${used.length === 1 ? '' : 's'} use${used.length === 1 ? 's' : ''} ${r.name}:\n  ${sample}\n\n${use === 'none' ? `Remove ${r.name} from the list? These` : `Mark ${r.name} incompatible? Referring to its content is then an error, and these`} show in Problems.`)) return
    }
    if (before === 'optional' && use !== 'optional') {
      const conds = [...mods.effective.values()].filter((c) => !isNone(c.eff) && (c.eff.with.includes(r.id) || c.eff.without.includes(r.id) || c.eff.any.some((g) => g.includes(r.id)))).length
      if (conds && !confirm(`${conds} item${conds === 1 ? ' has' : 's have'} "Only with / Only without ${r.name}". Those conditions are kept but only optional mods should have them (Problems lists them). Go on?`)) return
    }
    project.change((mm) => {
      const l = (mm.project.mods ??= [])
      const i = l.findIndex((x) => x.id === r.id)
      if (use === 'none') { if (i >= 0) l.splice(i, 1); return }
      if (i >= 0) l[i].use = use
      else l.push({ id: r.id, name: r.name, use })
      if (use !== 'incompatible') delete l[l.findIndex((x) => x.id === r.id)].reason
    })
  }
  // #76 (PLAN.md §10.8): mods no player runs together with this one (built-in pairs greyed, "known")
  function addNever(id: string, other: string) {
    if (!other) return
    project.change((mm) => { const x = mm.project.mods?.find((y) => y.id === id); if (!x) return; const l = (x.neverWith ??= []); if (!l.includes(other)) l.push(other) })
  }
  function removeNever(id: string, other: string) {
    project.change((mm) => {
      for (const [a, b] of [[id, other], [other, id]]) {
        const x = mm.project.mods?.find((y) => y.id === a)
        if (!x?.neverWith) continue
        x.neverWith = x.neverWith.filter((y) => y !== b)
        if (!x.neverWith.length) delete x.neverWith
      }
    })
  }
  const neverChoices = (id: string) => {
    const have = new Set(m ? neverWithOf(m.project, id).map((x) => x.id) : [])
    return [...offered.mods, ...missing.map((x) => ({ id: x.id, name: x.name }))].filter((s) => s.id !== id && !have.has(s.id)).sort((a, b) => (useOf(m!.project, b.id) === 'optional' ? 1 : 0) - (useOf(m!.project, a.id) === 'optional' ? 1 : 0) || a.name.localeCompare(b.name))
  }
  function setField(id: string, key: 'minVersion' | 'reason', v: string) {
    project.change((mm) => { const x = mm.project.mods?.find((y) => y.id === id); if (!x) return; if (v.trim()) x[key] = v.trim(); else delete x[key] })
  }

  /** What appears in this mod when the mod is listed (PLAN.md §10.1, Unlocks). */
  function unlocks(id: string, use: UseKind): string[] {
    const out: string[] = []
    for (const e of index?.extensions ?? []) if (e.requiresMod === id) out.push(`${e.name}${e.on ? '' : ' (off in Settings › Extensions)'}`)
    // the purpose-built tools (§10.1): #61's contact-post warning, #63's tab on the mod's own factions
    if (id === 'nexerelin' && use !== 'incompatible') out.push('a Nexerelin tab on this mod\'s factions (faction config)', 'warnings for contacts whose post changes faction on capture')
    if (use === 'optional') out.push('"Only with / Only without" conditions', 'a Play mode switch')
    if (use === 'required' || use === 'optional') out.push('its content in lists and pickers')
    return out
  }
  // #64: a sector snapshot (SagaLib dev menu › Write sector snapshot) as a source "seen in game"
  let snapBusy = $state(false)
  async function importSnap(pick: boolean) {
    let file: string | null = null
    if (pick) {
      file = await window.api.pickFile({ title: 'Sector snapshot (sagaforge_snapshot.json.data)', filters: [{ name: 'Sector snapshot', extensions: ['data', 'json'] }] })
      if (!file) return
    }
    snapBusy = true
    try {
      const info = await window.api.importSnapshot(file)
      app.index = await window.api.getIndex(false)
      const n = Object.values(info?.added ?? {}).reduce((a, x) => a + x.systems + x.places + x.markets + x.people, 0)
      app.flash(`Sector snapshot imported: ${n} thing${n === 1 ? '' : 's'} the game files don't show are now known.`)
    } catch (e) { app.error = (e as Error).message } finally { snapBusy = false }
  }
  async function clearSnap() { await window.api.clearSnapshot(); app.index = await window.api.getIndex(false); app.flash('Sector snapshot removed.') }
  const snap = $derived(index?.snapshot ?? null)
  const counts = $derived({ required: (m?.project.mods ?? []).filter((x) => x.use === 'required').length, optional: (m?.project.mods ?? []).filter((x) => x.use === 'optional').length, incompatible: (m?.project.mods ?? []).filter((x) => x.use === 'incompatible').length })
</script>

<div class="scroll pad">
  <p class="muted small intro">The other mods this mod has content for. <b>Required</b>: added to <span class="mono">mod_info.json</span> dependencies when you export (asked); the launcher won't enable this mod without it. <b>Optional</b>: this mod must load and play without it, so everything that uses it is conditional ("Only with / Only without", shown as chips); Play mode gets a switch for it. <b>Incompatible</b>: the game can't express it, so SagaLib warns in the log and once per save in game, and the release notes list it under Known conflicts. A mod that isn't listed is not used: lists and pickers show vanilla, this mod and the listed mods. In game, a save follows the mods it started with: players should add or remove optional mods only before a new game.</p>
  <div class="row">
    <input type="search" placeholder="Filter mods…" bind:value={filter} />
    <label class="small"><input type="checkbox" bind:checked={showUnused} /> Show mods not used</label>
    <label class="small" title="The mods the listed mods depend on. They don't need listing; add one only if this mod uses it directly."><input type="checkbox" bind:checked={showLibraries} /> Show libraries ({offered.libraries.length})</label>
    <span class="muted small">{counts.required} required · {counts.optional} optional · {counts.incompatible} incompatible</span>
  </div>
  <table class="t">
    <thead><tr><th>Mod</th><th>Use</th><th>Min version</th><th title="Mods no player runs together with this one. Their combinations get no version cell, no combination check and no Play mode combination; &quot;Only with&quot; both is a warning. Nothing changes in game.">Never with</th><th>Used by</th><th>Unlocks</th><th>Reason</th></tr></thead>
    <tbody>
      {#each rows as r (r.id)}
        {@const use = m ? useOf(m.project, r.id) : 'none'}
        {@const e = entry(r.id)}
        {@const u = uses.get(r.id) ?? []}
        <tr class:listed={use !== 'none'} class:warn={use === 'none' && u.length > 0}>
          <td><b>{r.name}</b> <span class="mono muted">{r.id}</span>{#if r.version}<span class="muted ver-t">{r.version}</span>{/if}
            {#if r.library}<span class="tag">library</span>{/if}{#if r.enabled === false}<span class="tag" title="Not enabled in your game's launcher. You can still write for it.">off in your game</span>{/if}{#if r.enabled === null}<span class="tag bad" title="In the list but not installed">not installed</span>{/if}{#if r.src?.sagaforge}<span class="tag" title="Made with Saga Forge">Saga Forge</span>{/if}</td>
          <td><select value={use} onchange={(ev) => { const v = ev.currentTarget.value as UseKind; ev.currentTarget.value = use; setUse(r, v) }} class:req={use === 'required'} class:opt={use === 'optional'} class:inc={use === 'incompatible'}>
            {#each ['none', 'required', 'optional', 'incompatible'] as k (k)}<option value={k}>{USE_LABEL[k as UseKind]}</option>{/each}
          </select></td>
          <td>{#if use === 'required' || use === 'optional'}<input type="text" class="mono ver" value={e?.minVersion ?? ''} placeholder={r.version || '—'} title="The lowest version of {r.name} this mod needs (required: written into the dependency)" onchange={(ev) => setField(r.id, 'minVersion', ev.currentTarget.value)} />{/if}</td>
          <td class="nw">
            {#each m ? neverWithOf(m.project, r.id) : [] as x (x.id)}
              {#if x.known}<span class="tag known" title="Built in: never played together (user, 2026-11-19; PLAN.md §10.8)">{mods.name(x.id)} · known</span>
              {:else}<span class="tag nwt">{mods.name(x.id)}{#if use !== 'none' || entry(x.id)}<button class="x" title="Remove: they can run together" onclick={() => removeNever(r.id, x.id)}>×</button>{/if}</span>{/if}
            {/each}
            {#if use !== 'none'}<select class="nwadd" value="" title="Mark another mod that no player runs together with {r.name}" onchange={(ev) => { const v = ev.currentTarget.value; ev.currentTarget.value = ''; addNever(r.id, v) }}>
              <option value="">+ never with…</option>{#each neverChoices(r.id) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>{/if}
          </td>
          <td title={u.join('\n')}>{#if u.length}{u.slice(0, 2).join(', ')}{#if u.length > 2}<span class="muted"> +{u.length - 2}</span>{/if}{#if use === 'none'}<div class="bad small">uses it but it isn't listed</div>{/if}{:else}<span class="muted">—</span>{/if}</td>
          <td class="small">{unlocks(r.id, use).join(', ') || '—'}</td>
          <td>{#if use === 'incompatible'}<input type="text" value={e?.reason ?? ''} placeholder="why, shown to players" onchange={(ev) => setField(r.id, 'reason', ev.currentTarget.value)} />{/if}</td>
        </tr>
      {:else}<tr><td colspan="7" class="muted">No mods match.</td></tr>{/each}
    </tbody>
  </table>
  <div class="sect2">Seen in game (sector snapshot)</div>
  <p class="muted small intro">A mod that builds its systems, markets and people in Java code (not in data files) doesn't show them to Saga Forge, so their ids are "not checked". In game with dev mode on, open SagaLib's dev menu (Ctrl+F9) › <b>Write sector snapshot</b>, then import it here: what it saw becomes pickable and checked, tied to the mod it belongs to (by its faction or id prefix). Things it can't tie to a mod, like vanilla's random systems, are left out.</p>
  <div class="row">
    <button disabled={snapBusy || !index} onclick={() => importSnap(false)} title="Read saves/common/sagaforge_snapshot.json.data in your Starsector folder">Import from the game</button>
    <button disabled={snapBusy || !index} onclick={() => importSnap(true)}>Import a file…</button>
    {#if snap}<button class="mini" onclick={clearSnap}>Remove</button>{/if}
  </div>
  {#if snap}
    <div class="small">Imported {new Date(snap.imported).toLocaleString()} from <span class="mono">{snap.file}</span>{snap.gameVersion ? ` · game ${snap.gameVersion}` : ''}{snap.day ? ` · ${snap.day}` : ''} · taken with {snap.mods.length} mod{snap.mods.length === 1 ? '' : 's'} enabled{snap.skipped ? ` · ${snap.skipped} left out (no mod)` : ''}.</div>
    <ul class="small">
      {#each Object.entries(snap.added) as [src, a] (src)}<li><b>{mods.name(src)}</b> <span class="mono muted">{src}</span>: {a.systems} system{a.systems === 1 ? '' : 's'}, {a.places} place{a.places === 1 ? '' : 's'}, {a.markets} market{a.markets === 1 ? '' : 's'}, {a.people} {a.people === 1 ? 'person' : 'people'}</li>
      {:else}<li class="muted">Nothing new: the game files already show everything it saw.</li>{/each}
    </ul>
  {/if}
  {#if mods.optional().length}
    <div class="sect2">Conditional content</div>
    <ul class="small">
      {#each [...mods.effective.entries()].filter(([, c]) => !isNone(c.eff)) as [k, c] (k)}<li><span class="mono">{k}</span>: {condText(c.eff, (id) => mods.name(id))}{#if c.from.length}<span class="muted"> ({c.from.map((f) => f.why).join('; ')})</span>{/if}</li>
      {:else}<li class="muted">Nothing is conditional yet. Set "Only with / Only without" on a quest, person, place, encounter, event, option, Branch case or phrase case.</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .intro { max-width: 980px; margin: 0 0 8px; }
  .row { display: flex; gap: 12px; align-items: center; margin-bottom: 6px; font-size: 12px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t th { text-align: left; color: var(--muted); font-weight: normal; border-bottom: 1px solid var(--border); padding: 4px 8px; position: sticky; top: 0; background: var(--panel); }
  table.t td { border-bottom: 1px solid #1e242c; padding: 4px 8px; vertical-align: top; }
  tr.listed td { background: #16202b; }
  tr.warn td { background: #2a1f10; }
  .ver-t { margin-left: 6px; }
  .tag { font-size: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 0 5px; margin-left: 4px; color: var(--muted); white-space: nowrap; }
  .tag.bad { border-color: var(--bad); color: var(--bad); }
  .nw .tag { margin: 0 4px 2px 0; display: inline-flex; gap: 3px; align-items: center; }
  .tag.known { opacity: .6; font-style: italic; }
  .tag.nwt { color: var(--text); }
  .x { border: none; background: none; padding: 0 1px; color: var(--muted); font-size: 11px; line-height: 1; }
  select.nwadd { font-size: 11px; max-width: 130px; color: var(--muted); }
  select { padding: 1px 4px; font-size: 12px; }
  select.req { border-color: var(--accent-2); color: var(--accent); }
  select.opt { border-color: var(--good); color: var(--good); }
  select.inc { border-color: var(--bad); color: var(--bad); }
  input.ver { width: 80px; padding: 1px 4px; }
  td input[type='text'] { padding: 1px 4px; font-size: 12px; width: 100%; }
  .small { font-size: 11px; }
  .bad { color: var(--bad); }
  .sect2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 4px; }
  ul { margin: 0; padding-left: 18px; }
</style>
