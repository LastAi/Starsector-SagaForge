<script lang="ts">
  import { versions } from '../state/versions.svelte'
  /**
   * A text input for an id with suggestions (id — name) from the game index. Commits on Enter or
   * blur. `strict` marks unknown ids red (they still can be typed: the game may know them from code).
   */
  interface Props {
    value: string
    options: { id: string; name?: string }[]
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
  /** Each id once (the mod's own entry first), at most 3000. */
  const unique = $derived.by(() => {
    const seen = new Set<string>()
    const out: { id: string; name?: string }[] = []
    for (const o of options) { if (!o.id || seen.has(o.id)) continue; seen.add(o.id); out.push(o); if (out.length >= 3000) break }
    return out
  })

  function commit() {
    const v = text.trim()
    if (v === (value ?? '')) return
    onCommit(v)
    if (clearOnCommit) text = ''
  }
</script>

<input type="text" class:mono class:bad={strict && !known} list={listId} bind:value={text} {placeholder} {disabled} style="width:{width}"
  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') text = value ?? '' }}
  onblur={commit} />
<datalist id={listId}>
  {#each unique as o (o.id)}
    <!-- #47: a version label when both installs are set ("0.98.5a only", "removed in 0.98.5a") -->
    {@const vl = versions.labels.get(o.id)}
    <option value={o.id}>{[o.name && o.name !== o.id ? o.name : '', vl?.text].filter(Boolean).join(' · ')}</option>
  {/each}
</datalist>
{#if vlabel}<span class="vl" class:removed={vlabel.kind === 'removed'} title="Differs between the two game versions">{vlabel.text}</span>{/if}

<style>
  input { padding: 3px 7px; }
  input.bad { border-color: var(--bad); }
  .vl { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--accent-2); color: var(--accent); white-space: nowrap; margin-left: 4px; }
  .vl.removed { border-color: var(--bad); color: var(--bad); }
</style>
