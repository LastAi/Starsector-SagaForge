<script lang="ts">
  /**
   * #80 (H6): whose reputation a world event's or progress stage's "Change reputation" changes: a
   * faction (AdjustRep) or a named person (AdjustRepPerson). Nobody is talked to there, so there is
   * no "the person you're talking to".
   */
  import IdInput from '../ui/IdInput.svelte'
  import { fullName } from '../../../shared/personname'
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'

  interface Props {
    faction?: string
    person?: string
    /** #60: index factions keep their definedBy (the mod's own have none). */
    factions: { id: string; definedBy?: string }[]
    onChange: (faction: string | undefined, person: string | undefined) => void
  }
  let { faction, person, factions, onChange }: Props = $props()
  const people = $derived([...(project.m?.people ?? []).map((p) => ({ id: p.id, name: fullName(p.name) })), ...(app.index?.people ?? [])])
</script>

<select title="Whose reputation" value={person !== undefined ? 'person' : 'faction'} onchange={(e) => { if (e.currentTarget.value === 'person') onChange(undefined, project.m?.people[0]?.id ?? ''); else onChange(faction || factions[0]?.id || '', undefined) }}>
  <option value="faction">faction</option><option value="person">person</option>
</select>
{#if person === undefined}<IdInput value={faction ?? ''} options={factions} width="140px" placeholder="faction" onCommit={(v) => onChange(v, undefined)} />
{:else}<IdInput value={person} options={people} width="140px" placeholder="person id" onCommit={(v) => onChange(undefined, v)} />{/if}
