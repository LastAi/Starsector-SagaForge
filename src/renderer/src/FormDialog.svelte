<!-- Copied from Ship Editor (src/renderer/src/FormDialog.svelte); may drift, see docs/PLAN.md §2. -->
<script lang="ts" module>
  export interface FormField {
    key: string
    label: string
    value: string
    kind?: 'text' | 'select' | 'image' | 'check'
    options?: string[]
    placeholder?: string
    help?: string
    /** Monospace text (ids). */
    mono?: boolean
  }
</script>

<script lang="ts">
  /** A small modal form with fields (New faction, New quest, Change id…). */
  interface Props {
    title: string
    text?: string
    fields: FormField[]
    okLabel: string
    busy?: boolean
    error?: string | null
    onOk: (values: Record<string, string>) => void
    onCancel: () => void
  }
  let { title, text = '', fields, okLabel, busy = false, error = null, onOk, onCancel }: Props = $props()

  // the dialog owns its values once open
  let values = $state<Record<string, string>>({})
  $effect.pre(() => {
    if (!Object.keys(values).length) values = Object.fromEntries(fields.map((f) => [f.key, f.value]))
  })
  let missing = $derived(fields.some((f) => f.kind !== 'check' && !(values[f.key] ?? '').trim()))

  async function pick(key: string) {
    const p = await window.api.pickFile({ title: 'Choose an image', current: values[key] || null, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
    if (p) values[key] = p
  }
  function submit(e: Event) {
    e.preventDefault()
    if (!missing && !busy) onOk({ ...values })
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}><form onsubmit={submit}>
    <h2>{title}</h2>
    {#if text}<p class="muted">{text}</p>{/if}
    {#each fields as f (f.key)}
      {#if f.kind === 'check'}
        <label class="check"><input type="checkbox" checked={values[f.key] === 'true'} onchange={(e) => (values[f.key] = String(e.currentTarget.checked))} /> {f.label}</label>
      {:else}
        <label for={`ff-${f.key}`} title={f.help}>{f.label}</label>
        {#if f.kind === 'select'}
          <select id={`ff-${f.key}`} bind:value={values[f.key]}>
            {#each f.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
          </select>
        {:else if f.kind === 'image'}
          <div class="row">
            <input id={`ff-${f.key}`} class="mono" type="text" bind:value={values[f.key]} placeholder={f.placeholder} />
            <button type="button" onclick={() => pick(f.key)}>Browse…</button>
          </div>
        {:else}
          <input id={`ff-${f.key}`} class:mono={f.mono} type="text" bind:value={values[f.key]} placeholder={f.placeholder} />
        {/if}
        {#if f.help}<div class="help muted">{f.help}</div>{/if}
      {/if}
    {/each}
    {#if error}<div class="bad">{error}</div>{/if}
    <div class="actions">
      <button type="button" onclick={onCancel}>Cancel</button>
      <button type="submit" class="primary" disabled={missing || busy || fields.some((f) => f.kind === 'check' && values[f.key] !== 'true')}>{busy ? 'Working…' : okLabel}</button>
    </div>
  </form></div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(520px, calc(100% - 40px)); background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
  h2 { margin: 0 0 8px; font-size: 16px; }
  p { margin: 0 0 8px; }
  label { display: block; margin: 10px 0 4px; font-weight: 600; }
  input[type='text'], select { width: 100%; box-sizing: border-box; }
  .row { display: flex; gap: 6px; }
  .row input { flex: 1; }
  .check { display: flex; gap: 8px; align-items: flex-start; font-weight: normal; }
  .help { font-size: 11px; margin-top: 2px; }
  .bad { color: var(--bad); margin-top: 10px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
