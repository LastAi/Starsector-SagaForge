<script lang="ts">
  /**
   * #77 (PLAN.md §10.8, "Vaults of Knowledge: research"): the research stance of one of the mod's own
   * factions, a row of data/campaign/aotd_faction_behaviour.csv (VoK merges every mod's file by
   * factionId; an owned block, so hand-written rows stay). Shown when the mod lists VoK, or the faction
   * already has a stance (or a hand-written row).
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { STANCE_HELP, VOK_FACTIONS_CSV, VOK_STANCES, emptyResearch, factionFromRow, handRows, newFactionResearch, techChoices, type FactionResearch } from '../../../shared/research'
  import Field from '../ui/Field.svelte'
  import IdInput from '../ui/IdInput.svelte'

  interface Props { factionId: string }
  let { factionId }: Props = $props()
  const m = $derived(project.m!)
  const cur = $derived(m.research?.factions[factionId] ?? null)
  const hand = $derived(handRows(project.loaded?.files[VOK_FACTIONS_CSV]?.text, 'factionId').find((r) => r.key === factionId) ?? null)
  const choices = $derived(techChoices(m, app.index))
  /** The stance another installed mod gives this id (another mod's row for the same faction would compete). */
  const other = $derived((app.index?.researchFactions ?? []).find((f) => f.id === factionId && f.definedBy !== project.loaded?.sourceId) ?? null)

  const ed = (fn: (f: FactionResearch) => void) => project.change((mm) => { const f = mm.research?.factions[factionId]; if (f) fn(f) })
  const create = (from?: FactionResearch) => project.change((mm) => { (mm.research ??= emptyResearch()).factions[factionId] = from ?? newFactionResearch() })
  function remove() {
    if (!confirm(`Remove ${factionId}'s research stance? Export then removes its row. Undo can bring it back until you save.`)) return
    project.change((mm) => { delete mm.research?.factions[factionId] })
  }
  const num = (v: string, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d }
  const text = (k: 'initResponse' | 'selectOption' | 'dismayOption' | 'responseAfter', v: string) => ed((f) => { if (v.trim()) f[k] = v; else delete f[k] })
</script>

<div class="group">
  <div class="gt"><span>Research (AoTD Vaults of Knowledge)</span><span class="mono">aotd_faction_behaviour.csv · {factionId}</span></div>
  <p class="help">How the faction treats research with <b>Vaults of Knowledge</b>: its stance, what it pays for research databanks the player sells to its station, base and outpost commanders and administrators (VoK offers the trade to no one else), and the lines of that conversation. Only VoK reads the row, so without VoK nothing changes. A faction without a row has VoK's default stance and, as far as VoK's code shows, buys no databanks.</p>
  {#if !cur}
    {#if hand}
      <p class="help">The mod's aotd_faction_behaviour.csv has a hand-written row for {factionId} (stance {hand.row.researchStance || '?'}). Export leaves it alone.</p>
      <button class="mini" title="Edit it here: the next export moves the row into Saga Forge's block" onclick={() => { create(factionFromRow(hand.row)); app.flash(`${factionId}'s research stance is now edited here. The next export removes its hand-written row and writes it in Saga Forge's block.`) }}>Edit in Saga Forge</button>
    {:else}
      <button class="mini" onclick={() => create()}>+ Research stance</button>
    {/if}
  {:else}
    {#if other}<p class="help warn">{other.definedBy} also has a row for {factionId} (stance {other.stance}): VoK merges the files by faction, so only one of them counts.</p>{/if}
    <div class="grid2">
      <Field label="Stance" for="vr-s" help={STANCE_HELP[cur.stance] ?? 'Not one of the stances VoK\'s factions use.'}>
        <select id="vr-s" value={cur.stance} onchange={(e) => { const v = e.currentTarget.value; ed((f) => { f.stance = v }) }}>
          {#each VOK_STANCES as s (s)}<option value={s}>{s.toLowerCase()}</option>{/each}
          {#if !(VOK_STANCES as readonly string[]).includes(cur.stance)}<option value={cur.stance}>{cur.stance} (hand-written)</option>{/if}
        </select>
      </Field>
      <Field label="Databank price" for="vr-c" help="Multiplies the credits it pays for a research databank (VoK's factions: 0.2 to 3; Tri-Tachyon pays 3).">
        <input id="vr-c" type="number" min="0" step="0.05" value={cur.cashMult} onchange={(e) => { const v = Math.max(0, num(e.currentTarget.value, 1)); ed((f) => { f.cashMult = v }) }} />
      </Field>
      <Field label="Reputation" for="vr-r" help="Multiplies the reputation it gives for a research databank (VoK's factions: 0.2 to 1).">
        <input id="vr-r" type="number" min="0" step="0.05" value={cur.repMult} onchange={(e) => { const v = Math.max(0, num(e.currentTarget.value, 1)); ed((f) => { f.repMult = v }) }} />
      </Field>
      <Field label="Forbidden" help="Techs this faction won't research (VoK's own, another mod's or this mod's).">
        <div class="col">
          {#each cur.forbidden as t, i (i)}
            <span class="row"><IdInput value={t} options={choices} width="260px" placeholder="tech id" onCommit={(v) => ed((f) => { f.forbidden[i] = v.trim(); f.forbidden = f.forbidden.filter(Boolean) })} /><button class="mini" onclick={() => ed((f) => { f.forbidden.splice(i, 1) })}>✕</button></span>
          {/each}
          <span><button class="mini" onclick={() => ed((f) => { f.forbidden.push('') })}>+ tech</button></span>
        </div>
      </Field>
      <Field label="Greeting" for="vr-i" help="What the faction's person says when the player offers databanks. Empty: VoK's default line.">
        <textarea id="vr-i" rows="2" value={cur.initResponse ?? ''} onchange={(e) => text('initResponse', e.currentTarget.value)}></textarea>
      </Field>
      <Field label="Sell option" for="vr-o" help="The player's option that opens the databank picker, e.g. &quot;Select databanks to trade.&quot; Empty: VoK's default.">
        <input id="vr-o" type="text" value={cur.selectOption ?? ''} onchange={(e) => text('selectOption', e.currentTarget.value)} />
      </Field>
      <Field label="Back out" for="vr-d" help="The player's option to keep the databanks after all. Empty: VoK's default.">
        <input id="vr-d" type="text" value={cur.dismayOption ?? ''} onchange={(e) => text('dismayOption', e.currentTarget.value)} />
      </Field>
      <Field label="After the sale" for="vr-a" help="What the person says after the sale. Empty: VoK's default line.">
        <textarea id="vr-a" rows="2" value={cur.responseAfter ?? ''} onchange={(e) => text('responseAfter', e.currentTarget.value)}></textarea>
      </Field>
    </div>
    <p><button class="mini danger" onclick={remove}>Remove research stance</button></p>
  {/if}
</div>

<style>
  .group { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 10px 0; background: #161a20; }
  .gt { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
  .gt .mono { text-transform: none; letter-spacing: 0; }
  .help { font-size: 11px; color: var(--muted); margin-top: 6px; max-width: 900px; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 520px); gap: 4px 10px; align-items: center; margin-top: 8px; }
  .grid2 input, .grid2 select, .grid2 textarea { width: 100%; }
  .row { display: flex; gap: 6px; align-items: center; }
  .col { display: flex; flex-direction: column; gap: 3px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .warn { color: var(--warn); }
</style>
