<script lang="ts">
  /**
   * #67 U43: the mod's node groups (copies of the groups it places), in the Quests page's left panel:
   * Import a shared group (into the mod or your library), Export one to share it, save it to your
   * library, replace it with another version, remove an unused copy.
   */
  import Modal from '../ui/Modal.svelte'
  import { BUILTIN_GROUPS } from '../../../shared/groups'
  import { compareGroups, groupDefProblems, groupHash, groupLines, otherVersions, type NodeGroupDef } from '../../../shared/nodegroups'
  import { project } from '../state/project.svelte'
  import { groupLib, ensureInMod } from '../state/nodegroups.svelte'
  import ReplaceGroupDialog from './ReplaceGroupDialog.svelte'

  const m = $derived(project.m!)
  const groups = $derived(m.nodeGroups ?? [])
  const uses = (id: string) => m.quests.reduce((k, q) => k + q.nodes.filter((n) => n.type === 'group' && n.group === id).length, 0)
  let note = $state('')
  let importing = $state<{ file: string; def: NodeGroupDef } | null>(null)
  let importErr = $state<{ file: string; problems: string[] } | null>(null)
  let replacing = $state<{ from: NodeGroupDef; to: NodeGroupDef; source: string } | null>(null)

  const snap = (d: NodeGroupDef) => $state.snapshot(d) as NodeGroupDef
  async function exportGroup(d: NodeGroupDef) {
    const f = await window.api.exportNodeGroup(snap(d))
    if (f) note = `Exported to ${f}`
  }
  async function toLibrary(d: NodeGroupDef) {
    const lib = groupLib.entries.find((e) => e.def.id === d.id)
    if (lib && lib.hash !== groupHash(d) && !confirm(`Your library already has "${lib.def.label}" (version ${lib.def.version ?? 1}). Overwrite it with the mod's copy (version ${d.version ?? 1})?`)) return
    const f = await window.api.saveNodeGroup(snap(d))
    await groupLib.load()
    note = `Saved to your library: ${f}`
  }
  function remove(d: NodeGroupDef) {
    project.change((mm) => { mm.nodeGroups = (mm.nodeGroups ?? []).filter((x) => x.id !== d.id) })
  }
  async function startImport() {
    note = ''
    const r = await window.api.readNodeGroupFile()
    if (!r) return
    let def: unknown
    try { def = JSON.parse(r.text) } catch { importErr = { file: r.file, problems: ["It isn't valid JSON."] }; return }
    const p = groupDefProblems(def)
    if (p.length) { importErr = { file: r.file, problems: p }; return }
    importing = { file: r.file, def: def as NodeGroupDef }
  }
  /** How the imported group relates to what the mod and the library have. */
  const relation = (d: NodeGroupDef, have: NodeGroupDef | undefined) => (!have ? null : compareGroups(have, d))
  const relText = (r: ReturnType<typeof relation>, where: string) => r === null ? '' : r === 'same' ? `${where} already has this exact version.` : r === 'newer' ? `${where} has an older version: importing replaces it.` : r === 'older' ? `${where} has a newer version.` : `${where} has a different copy with the same version.`
  function importToMod() {
    const d = importing!.def
    const have = groups.find((x) => x.id === d.id)
    importing = null
    if (!have) { ensureInMod(d); note = `"${d.label}" is in the mod: + Node › Node groups.`; return }
    if (compareGroups(have, d) !== 'same') replacing = { from: have, to: d, source: 'the imported file' }
  }
  async function importToLibrary() {
    const d = importing!.def
    importing = null
    const f = await window.api.saveNodeGroup(d)
    await groupLib.load()
    note = `Saved to your library: ${f}`
  }
</script>

<div class="sect">Node groups <span class="sectr"><button title="Import a node group file someone shared (into this mod or your library)" onclick={startImport}>Import…</button></span></div>
<ul class="list">
  {#each groups as d (d.id)}
    {@const n = uses(d.id)}
    {@const other = otherVersions(d.id, groups, BUILTIN_GROUPS, groupLib.entries)}
    <li class="g">
      <div class="gl"><span>{d.label}</span><span class="sub mono">{d.id} v{d.version ?? 1} · {n ? `placed ${n}×` : 'unused'}</span></div>
      <div class="gb">
        <button class="mini" title="Save it as a file to share it" onclick={() => exportGroup(d)}>Export…</button>
        <button class="mini" title="Copy it into your library, to use it in other mods" onclick={() => toLibrary(d)}>To library</button>
        {#each other as o (o.hash)}<button class="mini hl" title={o.def.changes ?? ''} onclick={() => (replacing = { from: d, to: o.def, source: o.source === 'builtin' ? 'Saga Forge' : 'your library' })}>{o.relation === 'newer' ? `v${o.def.version ?? 1} available` : o.relation === 'older' ? `older v${o.def.version ?? 1}` : 'modified copy'}…</button>{/each}
        {#if !n}<button class="mini" title="Remove the mod's copy (no node uses it)" onclick={() => remove(d)}>Remove</button>{/if}
      </div>
    </li>
  {:else}
    <li class="muted small pad">None yet. + Node › Node groups places one (the mod gets a copy); Import… adds a shared one.</li>
  {/each}
  {#each groupLib.broken as b (b.file)}
    <li class="muted small pad bad" title={b.problems.join('\n')}>Library file {b.file.split(/[\\/]/).pop()} isn't a valid node group: {b.problems[0]}</li>
  {/each}
</ul>
{#if note}<div class="muted small pad">{note}</div>{/if}

{#if importErr}
  <Modal title="Import node group" onClose={() => (importErr = null)} width={520}>
    <p>{importErr.file.split(/[\\/]/).pop()} can't be imported:</p>
    <ul class="small">{#each importErr.problems as p (p)}<li>{p}</li>{/each}</ul>
    {#snippet actions()}<button onclick={() => (importErr = null)}>Close</button>{/snippet}
  </Modal>
{/if}
{#if importing}
  {@const d = importing.def}
  {@const rm = relation(d, groups.find((x) => x.id === d.id))}
  {@const rl = relation(d, groupLib.entries.find((x) => x.def.id === d.id)?.def)}
  <Modal title="Import node group" onClose={() => (importing = null)} width={600} keepOpen>
    <p><b>{d.label}</b> <span class="mono muted">{d.id} v{d.version ?? 1}</span></p>
    {#if d.description}<p class="muted">{d.description}</p>{/if}
    {#if d.requires?.sagalib || d.requires?.game}<p class="small">Needs {[d.requires.sagalib ? `SagaLib ${d.requires.sagalib}` : '', d.requires.game ? `Starsector ${d.requires.game}` : ''].filter(Boolean).join(' and ')}.</p>{/if}
    <p class="small">Fields: {d.fields.map((f) => f.label).join(', ') || 'none'} · {d.nodes.length} node{d.nodes.length === 1 ? '' : 's'}{d.exits.length ? ` · exits: ${d.exits.map((x) => x.label).join(', ')}` : ''}</p>
    <p class="small">What it can write into rules.csv (every case):</p>
    <pre class="lines">{groupLines(d).join('\n') || '(only dialog text and normal nodes)'}</pre>
    {#if rm !== null}<p class="small">{relText(rm, 'This mod')}</p>{/if}
    {#if rl !== null}<p class="small">{relText(rl, 'Your library')}</p>{/if}
    {#snippet actions()}
      <button onclick={() => (importing = null)}>Cancel</button>
      <button disabled={rl === 'same'} onclick={importToLibrary} title="Your library: offered in every mod's + Node menu">Add to my library</button>
      <button class="primary" disabled={rm === 'same'} onclick={importToMod}>{rm === null ? 'Add to this mod' : 'Replace in this mod…'}</button>
    {/snippet}
  </Modal>
{/if}
{#if replacing}<ReplaceGroupDialog from={replacing.from} to={replacing.to} source={replacing.source} onClose={() => (replacing = null)} />{/if}

<style>
  /* the Quests page's left-panel sections (its styles are scoped) */
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .sect button { padding: 1px 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .sectr { display: flex; gap: 8px; align-items: center; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .g { display: flex; flex-direction: column; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .gl { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; }
  .gb { display: flex; gap: 4px; flex-wrap: wrap; }
  .hl { border-color: var(--accent-2); color: var(--accent); }
  .lines { font-family: var(--mono); font-size: 11px; background: var(--bg); border: 1px solid var(--border); padding: 6px; max-height: 180px; overflow: auto; white-space: pre-wrap; }
  .bad { color: var(--warn); }
  .mini { padding: 0 6px; font-size: 11px; }
  .muted { color: var(--muted); } .small { font-size: 12px; } .mono { font-family: var(--mono); } .pad { padding: 4px 8px; }
  .sub { color: var(--muted); font-size: 10px; }
</style>
