<script lang="ts">
  import { versions } from '../state/versions.svelte'
  import { mods } from '../state/mods.svelte'
  /**
   * A text input for an id with suggestions (id — name) from the game index. Commits on Enter or
   * blur. `strict` marks unknown ids red (they still can be typed: the game may know them from code).
   */
  interface Props {
    value: string
    /** Index entries keep their definedBy (#60): then only vanilla, this mod and its listed mods are suggested, with a switch for all. */
    options: { id: string; name?: string; definedBy?: string }[]
    placeholder?: string
    strict?: boolean
    mono?: boolean
    width?: string
    disabled?: boolean
    onCommit: (v: string) => void
    clearOnCommit?: boolean
  }
  let { value, options, placeholder = '', strict = false, mono = true, width = '100%', disabled = false, onCommit, clearOnCommit = false }: Props = $props()

  const listId = `ids-${Math.random().toString(36).slice(2)}`
  // the current value's version label (only with two installs)
  const vlabel = $derived(value ? versions.labels.get(value) ?? null : null)
  let text = $state('')
  $effect(() => { text = value ?? '' })
  const known = $derived(!text || options.some((o) => o.id === text))
  // #60 (PLAN.md §10.1): the suggestions follow the mod's list of other mods; picking from an unlisted mod offers to add it
  let showAll = $state(false)
  const shown = $derived(showAll ? options : mods.filter('picker', options, (o) => o.definedBy))
  const hiddenN = $derived(options.length - shown.length)
  /** Each id once (the mod's own entry first), at most 3000. */
  const unique = $derived.by(() => {
    const seen = new Set<string>()
    const out: { id: string; name?: string }[] = []
    for (const o of shown) { if (!o.id || seen.has(o.id)) continue; seen.add(o.id); out.push(o); if (out.length >= 3000) break }
    return out
  })

  function commit() {
    const v = text.trim()
    if (v === (value ?? '')) return
    onCommit(v)
    const o = options.find((x) => x.id === v)
    if (o?.definedBy) void mods.picked(o.definedBy, `"${o.name || v}"`)
    if (clearOnCommit) text = ''
  }
</script>

<!-- one element, so it stays one cell in the forms' grids (#60: the "+N" switch sits inside it) -->
<span class="idw" style="width:{width}">
<input type="text" class:mono class:bad={strict && !known} class:withall={hiddenN > 0 || showAll} list={listId} bind:value={text} {placeholder} {disabled}
  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') text = value ?? '' }}
  onblur={commit} />
<datalist id={listId}>
  {#each unique as o (o.id)}
    <!-- #47: a version label when both installs are set ("0.98.5a only", "removed in 0.98.5a") -->
    {@const vl = versions.labels.get(o.id)}
    <option value={o.id}>{[o.name && o.name !== o.id ? o.name : '', vl?.text].filter(Boolean).join(' · ')}</option>
  {/each}
</datalist>
{#if hiddenN > 0 || showAll}<button type="button" class="allm" class:on={showAll} title={showAll ? 'Showing every installed mod: click to show only vanilla, this mod and its listed mods (Saga › Mods)' : `Show all installed mods (${hiddenN} hidden: their mods aren't in Saga › Mods)`} onclick={() => (showAll = !showAll)}>{showAll ? 'all' : `+${hiddenN}`}</button>{/if}
{#if vlabel}<span class="vl" class:removed={vlabel.kind === 'removed'} title="Differs between the two game versions">{vlabel.text}</span>{/if}
</span>

<style>
  .idw { display: inline-flex; align-items: center; position: relative; max-width: 100%; min-width: 0; }
  input { padding: 3px 7px; flex: 1 1 auto; min-width: 0; width: 100%; }
  input.withall { padding-right: 34px; }
  input.bad { border-color: var(--bad); }
  .allm { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); font-size: 10px; line-height: 14px; padding: 0 4px; border-radius: 8px; color: var(--muted); background: var(--panel-2); }
  .allm.on { color: var(--accent); border-color: var(--accent-2); }
  .vl { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--accent-2); color: var(--accent); white-space: nowrap; margin-left: 4px; }
  .vl.removed { border-color: var(--bad); color: var(--bad); }
</style>
