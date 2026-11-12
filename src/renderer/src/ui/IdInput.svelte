<script lang="ts">
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
  {#each unique as o (o.id)}<option value={o.id}>{o.name && o.name !== o.id ? o.name : ''}</option>{/each}
</datalist>

<style>
  input { padding: 3px 7px; }
  input.bad { border-color: var(--bad); }
</style>
