<script lang="ts">
  /**
   * #62: a number scaled by one of the mod's settings (Saga › Settings): encounter fleet size and
   * credit rewards. A whole-number setting is a percent (100 = as made), a number is times (1 = as
   * made); on/off and choice settings get a factor per value.
   */
  import { project } from '../state/project.svelte'
  import type { SettingScale } from '../../../shared/model'
  import { isValueSetting, scaleText } from '../../../shared/settings'

  interface Props { value: SettingScale | undefined; onChange: (v: SettingScale | undefined) => void; id?: string }
  let { value, onChange, id }: Props = $props()

  const defs = $derived(project.m?.project.settings ?? [])
  const usable = $derived(defs.filter((s) => isValueSetting(s) && s.type !== 'String'))
  const cur = $derived(value?.setting ? defs.find((s) => s.id === value.setting) : undefined)
  const keys = $derived(cur?.type === 'Boolean' ? ['true', 'false'] : cur?.type === 'Radio' ? cur.choices ?? [] : [])

  function pick(sid: string) {
    if (!sid) { onChange(undefined); return }
    const d = defs.find((s) => s.id === sid)
    if (d?.type === 'Boolean' || d?.type === 'Radio') {
      const ks = d.type === 'Boolean' ? ['true', 'false'] : d.choices ?? []
      onChange({ setting: sid, factors: Object.fromEntries(ks.map((k) => [k, value?.factors?.[k] ?? 1])) })
    } else onChange({ setting: sid })
  }
  function setFactor(k: string, v: number) {
    if (!value) return
    onChange({ ...value, factors: { ...(value.factors ?? {}), [k]: Number.isFinite(v) ? v : 1 } })
  }
</script>

{#if !usable.length && !value}
  <span class="muted small">No settings that can scale it (Saga › Settings: an on/off, a number or a choice).</span>
{:else}
  <div class="sc">
    <select {id} value={value?.setting ?? ''} onchange={(e) => pick(e.currentTarget.value)}>
      <option value="">(not scaled)</option>
      {#each usable as s (s.id)}<option value={s.id}>{s.label || s.id} ({s.type === 'Int' ? 'percent' : s.type === 'Double' ? 'times' : s.type === 'Boolean' ? 'on/off' : 'choice'})</option>{/each}
      {#if value?.setting && !cur}<option value={value.setting}>{value.setting} (not a setting)</option>{/if}
    </select>
    {#if keys.length}
      {#each keys as k (k)}<label class="small">{cur?.type === 'Boolean' ? (k === 'true' ? 'on' : 'off') : k} × <input type="number" step="0.05" min="0" class="f" value={value?.factors?.[k] ?? 1} onchange={(e) => setFactor(k, Number(e.currentTarget.value))} /></label>{/each}
    {/if}
    {#if value?.setting}<span class="muted small">{scaleText(value, defs)}</span>{/if}
  </div>
{/if}

<style>
  .sc { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
  .sc select { padding: 2px 4px; }
  input.f { width: 56px; padding: 1px 4px; }
  .small { font-size: 11px; }
</style>
