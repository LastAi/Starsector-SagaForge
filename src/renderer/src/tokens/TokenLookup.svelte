<script lang="ts">
  /**
   * #67 U44: the token lookup (in the token window, or inside the editor in screenshot mode): tokens
   * grouped and searchable, with what they become here, portraits and crests, Insert and Copy.
   */
  import { TOKEN_GROUPS, searchTokens, type TokenEntry } from '../../../shared/tokens'
  import type { TokenPayload } from '../state/tokens.svelte'
  import { pushRecent, recentTokens } from './recent'

  interface Props { payload: TokenPayload | null; onInsert: (token: string) => void; imageUrl: (path: string) => Promise<string | null> }
  let { payload, onInsert, imageUrl }: Props = $props()

  let q = $state('')
  let capital = $state(false)
  let recent = $state<string[]>(recentTokens())
  let copied = $state('')
  let closed = $state<Record<string, boolean>>({ other: true })
  const refreshRecent = () => { recent = recentTokens() }
  $effect(() => {
    window.addEventListener('focus', refreshRecent)
    window.addEventListener('storage', refreshRecent)
    return () => { window.removeEventListener('focus', refreshRecent); window.removeEventListener('storage', refreshRecent) }
  })

  const entries = $derived(searchTokens(payload?.entries ?? [], q))
  const groups = $derived.by(() => {
    const out: { id: string; title: string; entries: TokenEntry[] }[] = []
    const all = payload?.entries ?? []
    if (!q) {
      const rec = recent.map((t) => all.find((e) => e.token === t || e.cap === t)).filter((e): e is TokenEntry => !!e)
      if (rec.length) out.push({ id: 'recent', title: 'Recently used', entries: rec })
    }
    for (const g of TOKEN_GROUPS) {
      const es = entries.filter((e) => e.group === g.id)
      if (es.length) out.push({ id: g.id, title: g.title, entries: es })
    }
    return out
  })
  const shown = (e: TokenEntry) => (capital && e.cap ? e.cap : e.token)
  function insert(e: TokenEntry) { const t = shown(e); pushRecent(t); refreshRecent(); onInsert(t) }
  async function copy(e: TokenEntry) {
    const t = shown(e)
    await navigator.clipboard.writeText(t)
    pushRecent(t); refreshRecent()
    copied = t
    setTimeout(() => { if (copied === t) copied = '' }, 1500)
  }
  // pictures, loaded once per path
  // (a plain map: the template may not change state while it draws; `loaded` redraws when one arrives)
  const urls = new Map<string, string | null>()
  let loaded = $state(0)
  function pic(path: string | undefined): string | null {
    void loaded
    if (!path) return null
    if (!urls.has(path)) { urls.set(path, null); imageUrl(path).then((u) => { urls.set(path, u); loaded++ }) }
    return urls.get(path) ?? null
  }
  const ctx = $derived(payload?.context)
  const herePerson = $derived(payload?.entries.find((e) => e.group === 'here' && e.image?.kind === 'portrait'))
</script>

<div class="tl">
  <div class="top">
    <input class="search" type="search" placeholder="Search tokens: name, rank, faction, Varro…" bind:value={q} />
    <label class="aa" title="Insert and copy the form with a capital first letter ($PersonName), for the start of a sentence"><input type="checkbox" bind:checked={capital} /> Aa</label>
  </div>
  <div class="target muted">{payload?.target ? `Insert goes into: ${payload.target}` : 'Click a text field in the editor, then Insert puts the token there. Copy works anywhere.'} <span class="tip">Typing $ in a text field suggests tokens too.</span></div>
  {#if ctx?.label}
    <div class="ctx">
      {#if herePerson?.image}{@const u = pic(herePerson.image.path)}{#if u}<img class="portrait" src={u} alt="" />{/if}{/if}
      <div>
        <div class="ctxh">{ctx.label}</div>
        {#if ctx.person === 'yes'}<div class="small">$person… tokens: <b>{payload?.entries.find((e) => e.group === 'here' && e.token === '$personName')?.example ? 'someone the game makes up' : payload?.entries.find((e) => e.group === 'here' && e.token === '$personName')?.value}</b>: {ctx.personWhy}</div>
        {:else if ctx.person === 'no'}<div class="small">No one is spoken to: $person… tokens stay as they are.</div>{/if}
        {#if ctx.market === 'no'}<div class="small">No market here: $market… tokens stay as they are.</div>{/if}
      </div>
    </div>
  {/if}
  <div class="list">
    {#each groups as g (g.id)}
      <details open={q ? true : !closed[g.id]} ontoggle={(e) => { if (!q) closed[g.id] = !e.currentTarget.open }}>
        <summary>{g.title} <span class="muted">{g.entries.length}</span></summary>
        {#each g.entries as e, i (g.id + e.token + i)}
          {@const prev = g.entries[i - 1]}
          {#if e.owner && prev?.owner?.id !== e.owner.id}
            <div class="owner">{#if e.owner.image}{@const u = pic(e.owner.image.path)}{#if u}<img class="face" src={u} alt="" />{:else}<span class="face"></span>{/if}{/if}<span>{e.owner.name}</span></div>
          {/if}
          <div class="row" class:no={e.works === 'no'} title={e.why ?? ''}>
            {#if e.image && !e.owner}{@const u = pic(e.image.path)}{#if u}<img class={e.image.kind === 'crest' ? 'crest' : 'face'} src={u} alt="" />{/if}{/if}
            <div class="main">
              <div><span class="tok mono">{shown(e)}</span> {#if e.value}<span class="val" class:ex={e.example}>{e.example ? 'e.g. ' : '= '}{e.value}</span>{/if}</div>
              <div class="lbl muted">{e.label}{e.works === 'no' ? ` · not filled here: ${e.why}` : e.works === 'maybe' ? ' · depends on where it is used' : ''}</div>
            </div>
            <button class="mini" onclick={() => copy(e)} title="Copy to the clipboard">{copied === shown(e) ? 'Copied' : 'Copy'}</button>
            <button class="mini primary" onclick={() => insert(e)} title="Put it where the cursor is in the last text field you clicked">Insert</button>
          </div>
        {/each}
      </details>
    {:else}
      <div class="muted pad">{payload ? 'No token matches.' : 'Open a mod in the editor.'}</div>
    {/each}
  </div>
</div>

<style>
  .tl { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; color: var(--text); }
  .top { display: flex; gap: 8px; align-items: center; padding: 8px; }
  .search { flex: 1; }
  .aa { display: flex; gap: 4px; align-items: center; white-space: nowrap; }
  .target { padding: 0 8px 6px; font-size: 11px; }
  .tip { opacity: .8; }
  .ctx { display: flex; gap: 8px; margin: 0 8px 6px; padding: 6px 8px; border: 1px solid var(--accent-2); border-radius: 4px; background: #172131; }
  .ctxh { font-weight: 600; }
  .portrait { width: 48px; height: 48px; object-fit: cover; border-radius: 3px; }
  .list { flex: 1; overflow: auto; padding: 0 4px 8px; }
  details { border-top: 1px solid var(--border); }
  summary { cursor: pointer; padding: 5px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .owner { display: flex; gap: 6px; align-items: center; padding: 6px 6px 2px; font-weight: 600; }
  .face { width: 28px; height: 28px; object-fit: cover; border-radius: 3px; background: var(--border); display: inline-block; }
  .crest { width: 28px; height: 28px; object-fit: contain; }
  .row { display: flex; gap: 6px; align-items: center; padding: 3px 6px; border-radius: 4px; }
  .row:hover { background: #1b2230; }
  .row.no { opacity: .45; }
  .main { flex: 1; min-width: 0; }
  .tok { color: var(--accent); }
  .val { color: var(--text); }
  .val.ex { color: var(--muted); font-style: italic; }
  .lbl { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { padding: 0 6px; font-size: 11px; }
  .muted { color: var(--muted); } .small { font-size: 11px; } .mono { font-family: var(--mono); } .pad { padding: 8px; }
</style>
