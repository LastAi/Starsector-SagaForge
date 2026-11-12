<script lang="ts">
  /** Condition or script lines (one per line, as rules.csv has them), with a menu of common templates. */
  interface Props {
    lines: string[]
    onChange: (lines: string[]) => void
    templates?: { label: string; line: string }[]
    placeholder?: string
    rows?: number
  }
  let { lines, onChange, templates = [], placeholder = '', rows = 2 }: Props = $props()
  let text = $state('')
  $effect(() => { text = lines.join('\n') })
  const commit = () => {
    const next = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (next.join('\n') !== lines.join('\n')) onChange(next)
  }
</script>

<div class="li">
  <textarea class="mono" rows={Math.max(rows, lines.length + 1)} bind:value={text} onblur={commit} {placeholder} spellcheck="false"></textarea>
  {#if templates.length}
    <select class="add" value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) onChange([...lines, v]) }}>
      <option value="">+ add…</option>
      {#each templates as t (t.label + t.line)}<option value={t.line}>{t.label}</option>{/each}
    </select>
  {/if}
</div>

<style>
  .li { display: flex; flex-direction: column; gap: 3px; }
  textarea { width: 100%; resize: vertical; font-size: 11px; padding: 3px 6px; }
  .add { align-self: flex-start; font-size: 11px; padding: 1px 4px; }
</style>
