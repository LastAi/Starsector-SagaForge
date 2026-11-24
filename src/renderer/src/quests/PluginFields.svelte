<script lang="ts">
  /**
   * #79 (SagaLib 1.4): a plugin call's class, picked from the jars the mod's mod_info.json lists (or
   * typed), and its key=value arguments. Used by the Plugin node, the Action op "Run a plugin", and
   * world events' and progress stages' actions. `compact`: one row for an op list, without labels.
   */
  import type { PluginArg } from '../../../shared/model'
  import { pluginClassChoices } from '../../../shared/plugins'
  import { project } from '../state/project.svelte'
  import { app, cleanError } from '../state/app.svelte'
  import IdInput from '../ui/IdInput.svelte'
  import Field from '../ui/Field.svelte'

  interface Props {
    className: string
    args: PluginArg[]
    onClass: (v: string) => void
    onArgs: (a: PluginArg[]) => void
    compact?: boolean
  }
  let { className, args, onClass, onArgs, compact = false }: Props = $props()

  const jars = $derived(project.loaded?.jars ?? [])
  const choices = $derived(pluginClassChoices(jars))
  const nPlugins = $derived(jars.reduce((n, j) => n + j.classes.filter((c) => c.plugin).length, 0))
  const found = $derived(jars.filter((j) => j.found).map((j) => j.path))
  const jarNote = $derived(!jars.length ? 'The mod lists no jar under "jars" in its mod_info.json yet.'
    : !found.length ? `The jar${jars.length === 1 ? '' : 's'} ${jars.map((j) => j.path).join(', ')} ${jars.length === 1 ? "isn't" : "aren't"} built yet.`
    : `${nPlugins} plugin class${nPlugins === 1 ? '' : 'es'} in ${found.join(', ')}.`)
  let scanning = $state(false)

  /** Reads the jars again (after the mod's jar was rebuilt). */
  async function rescan() {
    scanning = true
    try {
      const j = await window.api.modJars()
      if (project.loaded) project.loaded = { ...project.loaded, jars: j }
      const n = j.reduce((k, x) => k + x.classes.filter((c) => c.plugin).length, 0)
      app.flash(`Read ${j.length} jar${j.length === 1 ? '' : 's'}: ${n} plugin class${n === 1 ? '' : 'es'}.`)
    } catch (e) {
      app.error = cleanError(e)
    } finally {
      scanning = false
    }
  }
  const setArg = (i: number, k: 'key' | 'value', v: string) => onArgs(args.map((a, j) => (j === i ? { ...a, [k]: k === 'key' ? v.trim() : v } : { ...a })))
  const addArg = () => onArgs([...args.map((a) => ({ ...a })), { key: '', value: '' }])
  const dropArg = (i: number) => onArgs(args.filter((_, j) => j !== i).map((a) => ({ ...a })))
</script>

{#snippet classInput()}
  <div class="col">
    <IdInput value={className} options={choices} width="100%" placeholder="e.g. data.scripts.MyPlugin" onCommit={(v) => onClass(v.trim())} />
    <span><button class="mini" disabled={scanning} title="Read the mod's jars again (after you rebuilt the jar)" onclick={rescan}>Rescan jars</button></span>
  </div>
{/snippet}
{#snippet argRows()}
  <div class="col">
    {#each args as a, i (i)}
      <span class="row"><input type="text" class="mono key" value={a.key} placeholder="key" title="The argument's key: letters, digits, _ and ." onchange={(e) => setArg(i, 'key', e.currentTarget.value)} /><span>=</span><input type="text" value={a.value} placeholder="value ($key: read from memory)" title="The value; text with spaces is fine. A value starting with $ is read from memory when the plugin runs." onchange={(e) => setArg(i, 'value', e.currentTarget.value)} /><button class="mini" title="Remove this argument" onclick={() => dropArg(i)}>✕</button></span>
    {/each}
    <span><button class="mini" onclick={addArg}>+ argument</button></span>
  </div>
{/snippet}

{#if compact}
  <div class="compact">
    {@render classInput()}
    {@render argRows()}
    <div class="f-help">{jarNote}</div>
  </div>
{:else}
  <div class="grid2">
    <Field label="Class" help={`The plugin's full class name: a class in the mod's own jar that implements lastai.sagalib.api.SagaPlugin. ${jarNote}`}>
      {@render classInput()}
    </Field>
    <Field label="Arguments" help="key = value pairs the plugin gets (its run() map), e.g. sizes = 2. A value starting with $ is read from memory when it runs. quest and node are SagaLib's own keys.">
      {@render argRows()}
    </Field>
  </div>
{/if}

<style>
  .grid2 { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 2px 8px; align-items: center; margin-bottom: 6px; }
  .compact { width: 100%; display: flex; flex-direction: column; gap: 2px; }
  .col { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; gap: 4px; align-items: center; }
  .row input { flex: 1; min-width: 0; padding: 3px 6px; }
  .row input.key { flex: 0 0 76px; }
  .mini { padding: 0 6px; font-size: 11px; white-space: nowrap; }
  .mono { font-family: var(--mono); }
</style>
