<script lang="ts">
  import { onMount } from 'svelte'
  import Setup from './Setup.svelte'
  import Shell from './Shell.svelte'
  import type { Startup, ValidInstall } from '../../shared/api'
  import { registerDefs } from '../../shared/defs'
  import { app } from './state/app.svelte'

  let startup = $state<Startup | null>(null)
  let install = $state<ValidInstall | null>(null)
  let showSetup = $state(false)

  onMount(async () => {
    const st = await window.api.getStartup()
    registerDefs(st.definitions.patches) // user definition files, before anything reads the definitions
    app.definitions = st.definitions
    app.settings = st.settings
    app.smoke = st.smoke
    if (st.smoke) {
      const [page, id, arg] = st.smoke.split(":")
      app.smokeArg = arg ?? null
      app.go(page as typeof app.page, id ?? null)
    }
    startup = st
    if (st.install?.ok) install = st.install
    else {
      showSetup = true
      if (st.smoke) setTimeout(() => window.api.smokeReady({ page: 'setup' }), 500)
    }
  })
</script>

{#if !startup}
  <div class="loading muted">Starting…</div>
{:else if showSetup || !install}
  <Setup
    savedDir={startup.starsectorDir}
    savedProblem={startup.install && !startup.install.ok ? startup.install.error : null}
    canCancel={!!install}
    onDone={(i) => { install = i; showSetup = false }}
    onCancel={() => (showSetup = false)}
  />
{:else}
  {#key install.root}
    <Shell onChangeFolder={() => (showSetup = true)} />
  {/key}
{/if}

<style>
  .loading { display: grid; place-items: center; height: 100%; }
</style>
