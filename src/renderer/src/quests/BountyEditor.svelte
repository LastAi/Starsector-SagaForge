<script lang="ts">
  /**
   * #27 (docs/DESIGN-MAGICLIB-BOUNTIES.md): one MagicLib bounty, made from an encounter and
   * optionally a quest. Empty fields come from the sources; the preview is the object the export
   * writes into data/config/modFiles/magicBounty_data.json, with what MagicLib can't do.
   */
  import Field from '../ui/Field.svelte'
  import { project } from '../state/project.svelte'
  import { app } from '../state/app.svelte'
  import { bountyJson, bountyEncounter } from '../../../shared/bounties'
  import { targetVars } from '../../../shared/targets'
  import type { BountyPlan, BountyShowDistance, BountyShowFleet } from '../../../shared/model'

  interface Props { id: string; onDelete?: () => void }
  let { id, onDelete }: Props = $props()

  const m = $derived(project.m)
  const b = $derived(m?.bounties?.find((x) => x.id === id) ?? null)
  const res = $derived(m && b ? bountyJson(m, b, app.index) : null)
  const enc = $derived(m && b ? bountyEncounter(m, b) : null)
  const quest = $derived(m && b?.quest ? m.quests.find((q) => q.id === b.quest) ?? null : null)
  const ed = (fn: (x: BountyPlan) => void) => project.change((mm) => { const x = mm.bounties?.find((y) => y.id === id); if (x) fn(x) })
  const str = (v: string) => v.trim() || undefined
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const list = (v: string) => { const l = v.split(/[\s,]+/).filter(Boolean); return l.length ? l : undefined }
  const FLEET: BountyShowFleet[] = ['none', 'text', 'flagship', 'flagshipText', 'preset', 'presetText', 'vanilla', 'all']
  const DIST: BountyShowDistance[] = ['none', 'vague', 'distance', 'system', 'vanilla', 'vanillaDistance', 'exact']
  const from = (k: string) => (res?.json[k] !== undefined ? String(res.json[k]) : '')
  let showJson = $state(false)
</script>

{#if m && b && res}
  <div class="grid2 wide">
    <Field label="Id" help="The bounty's key in magicBounty_data.json, shared by every mod (so it starts with the mod's prefix). MagicLib remembers it as $global.<id>, with _succeeded, _failed or _expired when it ends: other quests can test those.">
      <span class="mono">{b.id}</span>
    </Field>
    <Field label="Job type" for="bt-type" help="Assassination: disable the flagship. Destruction: destroy it, no recovery. Obliteration: the whole fleet. Neutralization: two thirds of it.">
      <select id="bt-type" value={b.type ?? 'assassination'} onchange={(e) => { const v = e.currentTarget.value as BountyPlan['type']; ed((x) => { x.type = v }) }}><option>assassination</option><option>destruction</option><option>obliteration</option><option>neutralization</option></select>
    </Field>
    <Field label="Quest" for="bt-q" help="A simple quest the job comes from: its title, offer text, success and failure journal, reward, time limit, prerequisites, contact and random target. Optional.">
      <select id="bt-q" value={b.quest ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.quest = v || undefined }) }}><option value="">(none)</option>{#each m.quests.filter((q) => q.kind === 'quest') as q (q.id)}<option value={q.id}>{q.title} ({q.id})</option>{/each}{#if b.quest && !m.quests.some((q) => q.kind === 'quest' && q.id === b.quest)}<option value={b.quest}>{b.quest} ({m.quests.some((q) => q.id === b.quest) ? 'not a quest any more' : 'missing'})</option>{/if}</select>
    </Field>
    <Field label="Encounter (the target)" for="bt-e" help="Its fleet is the bounty's target: faction, ships, captain, place, behaviour, comm dialog. Empty: the quest's Encounter node.">
      <select id="bt-e" value={b.encounter ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.encounter = v || undefined }) }}><option value="">{quest ? `the quest's (${enc?.name ?? 'none'})` : '(pick one)'}</option>{#each m.encounters as e (e.id)}<option value={e.id}>{e.name} ({e.id})</option>{/each}</select>
    </Field>
    <Field wide label="Only as a bounty" help="On: the quest and the encounter aren't exported for SagaLib, so the player doesn't meet the fleet twice. Off: both exist.">
      <label class="chk"><input type="checkbox" checked={b.only !== false} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.only = v }) }} /> the quest and encounter are exported only as this bounty</label>
    </Field>
    <Field wide label="Where" for="bt-w" help="Where the fleet waits. Empty: the encounter's spawn place. A random target is translated into MagicLib's own search (distance from the sector's centre, system themes, entity tags); the notes below say what can't be.">
      <select id="bt-w" value={b.where ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.where = v || undefined }) }}>
        <option value="">the encounter's place{enc?.spawn.at ? ` (${enc.spawn.at})` : ''}</option>
        {#each quest ? targetVars(quest) : [] as v (v.name)}<option value={`target:${v.name}`}>random target {v.name} ({v.target.pick})</option>{/each}
        {#if b.where && !(quest ? targetVars(quest) : []).some((v) => `target:${v.name}` === b.where)}<option value={b.where}>{b.where}{b.where.startsWith('target:') ? ' (missing)' : ''}</option>{/if}
      </select>
    </Field>
  </div>

  <h3>Texts <span class="muted small">(empty: from the quest or encounter; MagicLib's tokens: $name, $system, $location, $reward, $heSheThey …; ==highlight==)</span></h3>
  <div class="grid2 wide">
    <Field wide label="Job name" for="bt-n" help="The job's title on the bounty board. Empty: the quest's title, else the encounter's name."><input id="bt-n" type="text" value={b.name ?? ''} placeholder={from('job_name')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.name = v }) }} /></Field>
    <Field wide label="Description" for="bt-d" help="The board's text for the job."><textarea id="bt-d" rows="3" value={b.description ?? ''} placeholder={from('job_description')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.description = v }) }}></textarea></Field>
    <Field label="On success" for="bt-s" help="Added to the bounty's intel when the job is done. Empty: the journal of the quest's success stage."><textarea id="bt-s" rows="2" value={b.success ?? ''} placeholder={from('job_intel_success')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.success = v }) }}></textarea></Field>
    <Field label="On failure" for="bt-f" help="The flagship was salvaged (a destruction job)."><textarea id="bt-f" rows="2" value={b.failure ?? ''} placeholder={from('job_intel_failure')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.failure = v }) }}></textarea></Field>
    <Field label="When it expires" for="bt-x" help="Added to the intel when the deadline passes or someone else gets the target first."><textarea id="bt-x" rows="2" value={b.expired ?? ''} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.expired = v }) }}></textarea></Field>
    <Field label="Answer when hailed" for="bt-r" help="Empty: the first text of the encounter's comm dialog; none there: the fleet doesn't answer."><textarea id="bt-r" rows="2" value={b.reply ?? ''} placeholder={from('job_comm_reply')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.reply = v }) }}></textarea></Field>
  </div>

  <h3>Pay and offer</h3>
  <div class="grid2 wide">
    <Field wide label="On the board" help="On: MagicLib's bounty board offers it near the markets below. Off: never on the board; only a quest's Action &quot;Start a MagicLib bounty&quot; gives it to the player (SagaLib 1.3; exported as a trigger key nobody sets). Either way a quest can start it, and test how it went with &quot;MagicLib bounty …&quot; conditions.">
      <label class="chk"><input type="checkbox" checked={b.board !== false} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { if (v) delete x.board; else x.board = false }) }} /> offered on MagicLib's bounty board</label>
    </Field>
    <Field label="Paying faction" for="bt-pf" help="Gets the reputation and is shown on the board. Empty: the reward's first reputation faction, else the contact's."><input id="bt-pf" type="text" class="mono" value={b.forFaction ?? ''} placeholder={from('job_forFaction')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.forFaction = v }) }} /></Field>
    <Field label="Credits" for="bt-c" help="Paid on success. Empty: the credits of the quest's success reward."><input id="bt-c" type="number" value={b.credits ?? ''} placeholder={from('job_credit_reward')} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.credits = v }) }} /></Field>
    <Field label="Reputation (0–100)" for="bt-rep" help="Reputation with the paying faction on success (MagicLib's scale: 5 = +5). Empty: the quest reward's, else MagicLib's 5."><input id="bt-rep" type="number" value={b.rep ?? ''} placeholder={from('job_reputation_reward') || '5'} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.rep = v }) }} /></Field>
    <Field label="Deadline (days)" for="bt-dl" help="-1: none. Empty: the quest's time limit."><input id="bt-dl" type="number" value={b.deadline ?? ''} placeholder={from('job_deadline')} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.deadline = v }) }} /></Field>
    <Field label="Offered at markets" for="bt-om" help="Market ids (the export adds each one's entity id, as MagicLib needs). Empty: the quest contact's market."><input id="bt-om" type="text" class="mono" value={(b.offer?.markets ?? []).join(', ')} onchange={(e) => { const v = list(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, markets: v } }) }} /></Field>
    <Field label="…or factions' markets" for="bt-of" help="Without markets: offered near markets of these factions (and friendly ones). Empty: the paying faction."><input id="bt-of" type="text" class="mono" value={(b.offer?.factions ?? []).join(', ')} onchange={(e) => { const v = list(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, factions: v } }) }} /></Field>
    <Field label="Market size at least" for="bt-ms" help="Only offered near markets at least this big. Empty: any size."><input id="bt-ms" type="number" value={b.offer?.minSize ?? ''} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, minSize: v } }) }} /></Field>
    <Field label="Player level at least" for="bt-ml" help="Only offered once the player has this level. Empty: any level."><input id="bt-ml" type="number" value={b.offer?.minLevel ?? ''} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, minLevel: v } }) }} /></Field>
    <Field label="Days into the game" for="bt-md" help="Only offered this many days after the game started. Empty: from the start."><input id="bt-md" type="number" value={b.offer?.minDays ?? ''} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, minDays: v } }) }} /></Field>
    <Field label="Board weight" for="bt-wt" help="How often the board picks it (1 = normal)."><input id="bt-wt" type="number" step="0.1" value={b.offer?.weight ?? ''} placeholder="1" onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.offer = { ...x.offer, weight: v } }) }} /></Field>
  </div>

  <h3>Fleet and board</h3>
  <div class="grid2 wide">
    <Field label="Flagship variant" for="bt-fs" help="MagicLib needs one. Empty: the encounter's first ship (a fleet sized by points has none: set it here)."><input id="bt-fs" type="text" class="mono" value={b.flagship ?? ''} placeholder={from('fleet_flagship_variant')} onchange={(e) => { const v = str(e.currentTarget.value); ed((x) => { x.flagship = v }) }} /></Field>
    <Field label="Match the player's fleet" for="bt-sc" help="Adds ships up to the player's fleet points × this. 0 or empty: no."><input id="bt-sc" type="number" step="0.1" value={b.scaling ?? ''} onchange={(e) => { const v = num(e.currentTarget.value); ed((x) => { x.scaling = v }) }} /></Field>
    <Field label="Board shows the fleet" ref="quests-bounty-board" for="bt-sf" help="How much of the target fleet the board shows: none, a text, the flagship, the preset ships, vanilla's nine biggest, or all."><select id="bt-sf" value={b.show?.fleet ?? 'flagshipText'} onchange={(e) => { const v = e.currentTarget.value as BountyShowFleet; ed((x) => { x.show = { ...x.show, fleet: v } }) }}>{#each FLEET as f (f)}<option>{f}</option>{/each}</select></Field>
    <Field label="Board shows where" ref="quests-bounty-board" for="bt-sd" help="How exactly the board says where the target is: none, vague, a distance, the system, vanilla's description, or exact."><select id="bt-sd" value={b.show?.distance ?? 'vanilla'} onchange={(e) => { const v = e.currentTarget.value as BountyShowDistance; ed((x) => { x.show = { ...x.show, distance: v } }) }}>{#each DIST as f (f)}<option>{f}</option>{/each}</select></Field>
    <Field wide label="Map arrow" help="MagicLib's job_show_arrow."><label class="chk"><input type="checkbox" checked={b.show?.arrow ?? false} onchange={(e) => { const v = e.currentTarget.checked; ed((x) => { x.show = { ...x.show, arrow: v } }) }} /> point at the target on the map once accepted</label></Field>
  </div>

  <h3>As exported</h3>
  {#each res.notes as n, i (i)}
    <div class="note {n.level}"><span class="ico {n.level === 'error' ? 'e' : n.level === 'info' ? 'i' : 'w'}">{n.level === 'error' ? '!' : n.level === 'info' ? 'i' : '?'}</span> <b>{n.field}</b>: {n.message}</div>
  {:else}<div class="muted small">Everything maps.</div>{/each}
  <button class="mini" onclick={() => (showJson = !showJson)}>{showJson ? 'Hide' : 'Show'} the magicBounty_data.json entry</button>
  {#if showJson}<pre class="json">{JSON.stringify({ [b.id]: res.json }, null, 2)}</pre>{/if}
  {#if onDelete}<div class="row2"><button class="mini danger" onclick={onDelete}>Delete bounty</button></div>{/if}
{:else}
  <p class="muted">This bounty no longer exists.</p>
{/if}

<style>
  h3 { font-size: 12px; margin: 14px 0 6px; }
  .note { font-size: 12px; margin: 2px 0; }
  .note.error { color: var(--danger, #e66); }
  .json { max-height: 260px; overflow: auto; font-size: 11px; background: var(--panel2, rgba(0, 0, 0, 0.25)); padding: 8px; }
  .row2 { margin-top: 10px; }
</style>
