<script lang="ts">
  /**
   * Scripted faction changes (SagaLib, applied on every load; PLAN.md §4.1, §10.6): what the
   * .faction file can't do, or can't do per mod: a display name, logo, crest, secondary color,
   * known ships, illegal goods, doctrine and the intel tab, set at runtime through the game's
   * FactionAPI setters. With versions, each combination of optional mods can have its own.
   */
  import type { ScriptedFactionChange } from '../../../shared/faction'
  import { app } from '../state/app.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import ModsCond from '../ui/ModsCond.svelte'
  import ImageView from '../ui/ImageView.svelte'

  interface Props {
    factionId: string
    list: ScriptedFactionChange[]
    onEdit: (fn: (list: ScriptedFactionChange[]) => void) => void
  }
  let { factionId, list, onEdit }: Props = $props()

  /** SagaLib 1.3's changes (docs/FORMAT.md "Scripted faction changes"); 0.98a has no long display name setter. */
  const KINDS: { key: string; label: string; make: () => ScriptedFactionChange }[] = [
    { key: 'name', label: 'Display name', make: () => ({ op: 'set', path: 'displayName', value: '' }) },
    { key: 'article', label: 'Name with article ("the …")', make: () => ({ op: 'set', path: 'displayNameWithArticle', value: '' }) },
    { key: 'logo', label: 'Logo', make: () => ({ op: 'set', path: 'logo', value: '' }) },
    { key: 'crest', label: 'Crest', make: () => ({ op: 'set', path: 'crest', value: '' }) },
    { key: 'color', label: 'Secondary color', make: () => ({ op: 'set', path: 'secondaryColor', value: '255,255,255,255' }) },
    { key: 'addShip', label: 'Add a known ship', make: () => ({ op: 'add', path: 'knownShips.hulls', value: '' }) },
    { key: 'removeShip', label: 'Remove a known ship', make: () => ({ op: 'remove', path: 'knownShips.hulls', value: '' }) },
    { key: 'illegal', label: 'Make a commodity illegal', make: () => ({ op: 'add', path: 'illegalCommodities', value: '' }) },
    { key: 'legal', label: 'Make a commodity legal', make: () => ({ op: 'remove', path: 'illegalCommodities', value: '' }) },
    { key: 'doctrine', label: 'Doctrine', make: () => ({ op: 'set', path: 'doctrine.aggression', value: '3' }) },
    { key: 'show', label: 'Show in the intel tab', make: () => ({ op: 'showInIntelTab', path: '', value: '' }) },
    { key: 'hide', label: 'Hide from the intel tab', make: () => ({ op: 'hideFromIntelTab', path: '', value: '' }) }
  ]
  const DOCTRINE: { id: string; label: string; min: number; max: number; step: number }[] = [
    { id: 'warships', label: 'Warships', min: 0, max: 5, step: 1 }, { id: 'carriers', label: 'Carriers', min: 0, max: 5, step: 1 },
    { id: 'phaseShips', label: 'Phase ships', min: 0, max: 5, step: 1 }, { id: 'officerQuality', label: 'Officer quality', min: 0, max: 5, step: 1 },
    { id: 'shipQuality', label: 'Ship quality', min: 0, max: 5, step: 1 }, { id: 'numShips', label: 'Number of ships', min: 1, max: 5, step: 1 },
    { id: 'shipSize', label: 'Ship size', min: 1, max: 5, step: 1 }, { id: 'aggression', label: 'Aggression', min: 1, max: 5, step: 1 },
    { id: 'combatFreighterProbability', label: 'Combat freighters (0–1)', min: 0, max: 1, step: 0.05 }
  ]
  const what = (c: ScriptedFactionChange): string => {
    if (c.op === 'hideFromIntelTab') return 'Hidden from the intel tab'
    if (c.op === 'showInIntelTab') return 'Shown in the intel tab'
    if (c.path === 'knownShips.hulls') return c.op === 'add' ? 'Knows the ship' : 'Forgets the ship'
    if (c.path === 'knownWeapons.weapons') return c.op === 'add' ? 'Knows the weapon' : 'Forgets the weapon'
    if (c.path === 'knownFighters.fighters') return c.op === 'add' ? 'Knows the fighter' : 'Forgets the fighter'
    if (c.path === 'illegalCommodities') return c.op === 'add' ? 'Illegal' : 'Legal'
    if (c.path.startsWith('doctrine.')) return 'Doctrine'
    return ({ displayName: 'Display name', displayNameWithArticle: 'Name with article', logo: 'Logo', crest: 'Crest', secondaryColor: 'Secondary color' } as Record<string, string>)[c.path] ?? `${c.op} ${c.path}`
  }
  const hex = (v: string) => '#' + v.split(',').slice(0, 3).map((x) => Math.max(0, Math.min(255, Number(x) || 0)).toString(16).padStart(2, '0')).join('')
  const fromHex = (h: string, old: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), old.split(',')[3] ?? '255'].join(',')
  const set = (i: number, patch: Partial<ScriptedFactionChange>) => onEdit((l) => { Object.assign(l[i], patch) })
  const hulls = $derived((app.index?.hulls ?? []).map((h) => ({ id: h.id, name: h.name })))
  const commodities = $derived((app.index?.items ?? []).filter((i) => i.kind === 'commodity').map((i) => ({ id: i.id, name: i.name })))
</script>

<div class="sc">
  {#each list as c, i (i)}
    <div class="row">
      <span class="what">{what(c)}</span>
      {#if c.op === 'set' && (c.path === 'displayName' || c.path === 'displayNameWithArticle')}
        <input type="text" value={c.value} placeholder={c.path === 'displayName' ? 'e.g. Reyes Free Port' : 'e.g. the Reyes Free Port'} onchange={(e) => set(i, { value: e.currentTarget.value })} />
      {:else if c.op === 'set' && (c.path === 'logo' || c.path === 'crest')}
        <ImageView path={c.value} w={c.path === 'logo' ? 48 : 24} h={c.path === 'logo' ? 30 : 24} />
        <IdInput value={c.value} options={(app.index?.factions ?? []).map((f) => ({ id: c.path === 'logo' ? f.logo : f.crest, name: f.name })).filter((x) => x.id)} placeholder="graphics/factions/…png" onCommit={(v) => set(i, { value: v })} />
      {:else if c.op === 'set' && c.path === 'secondaryColor'}
        <input type="color" value={hex(c.value)} onchange={(e) => set(i, { value: fromHex(e.currentTarget.value, c.value) })} /><span class="mono small">{c.value}</span>
      {:else if c.op === 'set' && c.path.startsWith('doctrine.')}
        {@const d = DOCTRINE.find((x) => `doctrine.${x.id}` === c.path) ?? DOCTRINE[7]}
        <select value={c.path} onchange={(e) => set(i, { path: e.currentTarget.value })}>{#each DOCTRINE as x (x.id)}<option value={`doctrine.${x.id}`}>{x.label}</option>{/each}</select>
        <input type="number" min={d.min} max={d.max} step={d.step} value={c.value} style="width:70px" onchange={(e) => set(i, { value: e.currentTarget.value })} />
      {:else if c.path === 'knownShips.hulls'}
        <IdInput value={c.value} options={hulls} placeholder="hull id" onCommit={(v) => set(i, { value: v })} />
      {:else if c.path === 'illegalCommodities'}
        <IdInput value={c.value} options={commodities} placeholder="commodity id" onCommit={(v) => set(i, { value: v })} />
      {:else if c.op === 'remove'}
        <span class="mono small">− {c.value} · {c.path}</span>
      {/if}
      <ModsCond compact value={c.mods} onChange={(v) => onEdit((l) => { if (v) l[i].mods = v; else delete l[i].mods })} />
      <button class="mini" title="Remove this change" onclick={() => onEdit((l) => { l.splice(i, 1) })}>✕</button>
    </div>
  {/each}
  <select value="" onchange={(e) => { const k = KINDS.find((x) => x.key === e.currentTarget.value); e.currentTarget.value = ''; if (k) onEdit((l) => { l.push(k.make()) }) }}>
    <option value="">+ Add a change…</option>{#each KINDS as k (k.key)}<option value={k.key}>{k.label}</option>{/each}
  </select>
  <div class="help">Applied by SagaLib on every load (<span class="mono">data/sagaforge/factions.json</span>). Use them for what can differ per optional mod (the versions strip above) or change during play; the faction's own file can't depend on mods. {factionId}'s main color, ranks and music can't change at runtime.</div>
</div>

<style>
  .sc { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .what { min-width: 150px; font-size: 12px; color: var(--muted); }
  .row input[type='text'] { width: 220px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .small { font-size: 11px; }
  .help { font-size: 11px; color: var(--muted); }
  select { width: auto; max-width: 240px; }
</style>
