<script lang="ts">
  /**
   * #65 (PLAN.md §10, "MagicLib achievements"): Saga › Achievements. Exported as rows of
   * data/config/magic_achievements.csv (MagicLib's generic MagicAchievement); quests unlock them at an
   * End node or with "Unlock a MagicLib achievement" (SF_Achievement, SagaLib 1.3's MagicLib bridge).
   * MagicLib keeps them in the common data: one unlocked stays unlocked in every save.
   */
  import { app } from '../state/app.svelte'
  import { project } from '../state/project.svelte'
  import { chooseImages } from '../state/imagepicker.svelte'
  import { useOf } from '../../../shared/modlist'
  import { slug, uniqueId } from '../../../shared/quest'
  import { ACHIEVEMENT_RARITIES, ACHIEVEMENT_SPOILERS, type AchievementDef } from '../../../shared/model'
  import { achievementsOf, MAGICLIB_ID } from '../../../shared/achievements'
  import Field from '../ui/Field.svelte'

  const m = $derived(project.m!)
  const list = $derived(m.project.achievements ?? [])
  const sel = $derived(app.selected.achievement ?? list[0]?.id ?? null)
  const cur = $derived(list.find((a) => a.id === sel) ?? null)
  const magic = $derived(useOf(m.project, MAGICLIB_ID))
  const installed = $derived(!!app.index?.sources.some((s) => s.id === MAGICLIB_ID))
  /** Which quests unlock each achievement (and where). */
  const unlockedBy = $derived.by(() => {
    const out = new Map<string, { quest: string; title: string; node: string }[]>()
    for (const q of m.quests) for (const a of achievementsOf(q)) out.set(a.id, [...(out.get(a.id) ?? []), { quest: q.id, title: q.title || q.id, node: a.node }])
    return out
  })

  const SPOILER_HELP: Record<string, string> = {
    VISIBLE: 'Listed with its name and description from the start.',
    SPOILER: 'Listed, but its name and description are hidden until unlocked. For endings players reach anyway.',
    HIDDEN: 'Not listed until unlocked. For rare or lucky endings players aren\'t expected to chase.'
  }
  const ed = (fn: (a: AchievementDef) => void) => { const id = sel; project.change((mm) => { const a = mm.project.achievements?.find((x) => x.id === id); if (a) fn(a) }) }

  function add() {
    const id = uniqueId(`${m.project.prefix}achievement`, list.map((a) => a.id))
    project.change((mm) => { ((mm.project.achievements ??= []), mm.project.achievements).push({ id, name: 'New achievement', description: '', spoiler: 'SPOILER', rarity: 'COMMON' }) })
    app.selected.achievement = id
  }
  /** Until a quest unlocks it, the id follows the name. */
  function rename(v: string) {
    const a = cur
    if (!a) return
    const p = m.project.prefix
    const nid = unlockedBy.has(a.id) ? a.id : uniqueId(`${p}${slug(v).replace(new RegExp(`^${p}`), '') || 'achievement'}`.slice(0, 48), list.filter((x) => x.id !== a.id).map((x) => x.id))
    ed((x) => { x.name = v; x.id = nid })
    app.selected.achievement = nid
  }
  function setId(v: string) {
    const a = cur
    if (!a) return
    const p = m.project.prefix
    const nid = v.trim().startsWith(p) ? slug(v.trim()) : `${p}${slug(v.trim())}`
    if (!nid || nid === a.id) return
    if (list.some((x) => x.id === nid)) { app.error = `Another achievement already has the id ${nid}.`; return }
    const users = unlockedBy.get(a.id) ?? []
    if (users.length && !confirm(`${users.map((u) => u.title).join(', ')} unlock${users.length === 1 ? 's' : ''} it by its id; those are changed too. Players who unlocked it under the old id lose it (MagicLib keeps achievements by id). Change the id?`)) return
    project.change((mm) => {
      const x = mm.project.achievements?.find((y) => y.id === a.id)
      if (x) x.id = nid
      for (const q of mm.quests) for (const n of q.nodes) {
        if (n.type === 'end' && n.achievement === a.id) n.achievement = nid
        if (n.type === 'action') for (const o of n.ops) if (o.op === 'achievement' && o.achievement === a.id) o.achievement = nid
      }
    })
    app.selected.achievement = nid
  }
  function remove() {
    const a = cur
    if (!a) return
    const users = unlockedBy.get(a.id) ?? []
    if (users.length && !confirm(`${users.map((u) => u.title).join(', ')} unlock${users.length === 1 ? 's' : ''} it. Delete it anyway? (Problems lists what still names it.)`)) return
    project.change((mm) => { mm.project.achievements = (mm.project.achievements ?? []).filter((x) => x.id !== a.id) })
    app.selected.achievement = null
  }
  async function pickImage() {
    const [p] = await chooseImages('achievementIcon', { current: cur?.image, title: 'The achievement\'s image (once unlocked)' })
    if (p) ed((x) => { x.image = p })
  }
  function openQuest(id: string, node: string) { app.selected.questNode = node; app.go('quests', id) }
</script>

<div class="split">
  <div class="side">
    <div class="sect">Achievements <button class="mini" onclick={add} title="A new MagicLib achievement">+ Add</button></div>
    <ul class="list">
      {#each list as a (a.id)}
        <li class:on={a.id === sel}><button class="li" onclick={() => (app.selected.achievement = a.id)}>
          <span class="nm">{a.name || a.id}</span>
          <span class="sub">{a.rarity.toLowerCase()} · {a.spoiler.toLowerCase()}{unlockedBy.has(a.id) ? '' : ' · never unlocked'}</span>
        </button></li>
      {:else}<li class="muted small pad">No achievements yet.</li>{/each}
    </ul>
  </div>

  <div class="scroll pad">
    <p class="muted small intro">Achievements in <b>MagicLib</b>'s list (Intel › Achievements), a reward for reaching a quest's ending. Export writes <span class="mono">data/config/magic_achievements.csv</span>; a quest unlocks one at an End node (its Achievement field) or with the action <b>Unlock a MagicLib achievement</b>. Unlocking goes through SagaLib's MagicLib bridge, so without MagicLib the mod loads and nothing happens.</p>
    <div class="note"><b>Kept outside the save.</b> MagicLib stores achievements in the game's common data, so one unlocked stays unlocked in every playthrough, and unlocking it again does nothing. Never change an id after a release: players lose what they unlocked under it.</div>
    <div class="row status">
      <span>MagicLib: <b class:good={magic === 'required' || magic === 'optional'}>{magic === 'required' ? 'required' : magic === 'incompatible' ? 'marked incompatible' : 'optional'}</b></span>
      <span class="muted small">{magic === 'required' ? 'In mod_info.json dependencies (Saga › Mods).' : 'Not in mod_info.json: without MagicLib there is no list, and quests unlock nothing.'}{magic === 'none' ? ' It isn\'t in the mod\'s list yet (Problems asks for it).' : ''}{installed ? '' : ' MagicLib is not installed in your game.'}</span>
      {#if magic === 'none' && list.length}<button class="mini" title="List MagicLib in Saga › Mods as optional (nothing goes into mod_info.json)" onclick={() => project.change((mm) => { ((mm.project.mods ??= []), mm.project.mods).push({ id: MAGICLIB_ID, name: 'MagicLib', use: 'optional' }) })}>Add as optional</button>{/if}
      <button class="mini" onclick={() => (app.selected.sagaOpen = 'mods')}>Saga › Mods</button>
    </div>

    {#if cur}
      {@const users = unlockedBy.get(cur.id) ?? []}
      <div class="grid2">
        <Field label="Name" for="ac-n" help="Shown in MagicLib's list and its notice when unlocked.">
          <input id="ac-n" type="text" value={cur.name} onchange={(e) => rename(e.currentTarget.value)} />
        </Field>
        <Field label="Id" for="ac-id" help="MagicLib keeps every mod's achievements in one list by id (and skips a second one with the same id). It follows the name until a quest unlocks it; after a release never change it.">
          <input id="ac-id" type="text" class="mono" value={cur.id} onchange={(e) => setId(e.currentTarget.value)} />
        </Field>
        <Field label="Description" for="ac-d" help="Under the name. MagicLib asks for the past tense and one or two sentences: &quot;Found the lost convoy.&quot;">
          <textarea id="ac-d" rows="2" value={cur.description} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { x.description = v }) }}></textarea>
        </Field>
        <Field label="Tooltip" for="ac-t" help="Optional: a longer text shown on hover in the list.">
          <textarea id="ac-t" rows="2" value={cur.tooltip ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { if (v.trim()) x.tooltip = v; else delete x.tooltip }) }}></textarea>
        </Field>
        <Field label="Shown" for="ac-s" help={SPOILER_HELP[cur.spoiler]}>
          <select id="ac-s" value={cur.spoiler} onchange={(e) => { const v = e.currentTarget.value as AchievementDef['spoiler']; ed((x) => { x.spoiler = v }) }}>
            {#each ACHIEVEMENT_SPOILERS as s (s)}<option value={s}>{s === 'VISIBLE' ? 'visible' : s === 'SPOILER' ? 'listed, details hidden (spoiler)' : 'hidden until unlocked'}</option>{/each}
          </select>
        </Field>
        <Field label="Rarity" ref="saga-achievement-rarity" for="ac-r" help="The frame colour and the default image. Common for a quest anyone finishes, rarer for hard or hidden endings.">
          <select id="ac-r" value={cur.rarity} onchange={(e) => { const v = e.currentTarget.value as AchievementDef['rarity']; ed((x) => { x.rarity = v }) }}>
            {#each ACHIEVEMENT_RARITIES as r (r)}<option value={r}>{r.toLowerCase()}</option>{/each}
          </select>
        </Field>
        <Field label="Image" help="Shown once unlocked (48×48 in the list). Empty: MagicLib's image for the rarity. The export lists it in the mod's settings.json so the game loads it.">
          <span class="row">
            {#if cur.image}<span class="mono">{cur.image}</span><button class="mini" onclick={() => ed((x) => { delete x.image })}>✕</button>{:else}<span class="muted">MagicLib's default</span>{/if}
            <button class="mini" onclick={pickImage}>Choose…</button>
          </span>
        </Field>
        <Field label="Notes" for="ac-no" help="For you only; not exported.">
          <input id="ac-no" type="text" value={cur.notes ?? ''} onchange={(e) => { const v = e.currentTarget.value; ed((x) => { if (v) x.notes = v; else delete x.notes }) }} />
        </Field>
        <Field label="Unlocked by" help="End nodes (Achievement) and actions &quot;Unlock a MagicLib achievement&quot; that name it.">
          <div class="small">{#each users as u (u.quest + u.node)}<div><button class="link" onclick={() => openQuest(u.quest, u.node)}>{u.title} › {u.node}</button></div>{:else}<span class="muted">No quest unlocks it yet: pick it at an End node.</span>{/each}</div>
        </Field>
      </div>
      <p><button class="mini danger" onclick={remove}>Delete achievement</button></p>
    {/if}
  </div>
</div>

<style>
  .split { display: grid; grid-template-columns: 260px 1fr; min-height: 0; height: 100%; }
  .side { background: var(--panel); border-right: 1px solid var(--border); overflow: auto; }
  .sect { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
  .list { list-style: none; margin: 0; padding: 0 4px; }
  .list li.on { background: #1f2a38; outline: 1px solid var(--accent-2); border-radius: 4px; }
  .li { width: 100%; text-align: left; border: none; background: none; padding: 4px 8px; display: flex; flex-direction: column; }
  .sub { font-size: 10px; color: var(--muted); }
  .scroll { overflow: auto; min-height: 0; }
  .pad { padding: 10px 14px; }
  .intro { max-width: 980px; margin: 0 0 8px; }
  .note { max-width: 980px; border: 1px solid var(--warn); border-radius: 4px; padding: 6px 10px; font-size: 12px; margin-bottom: 8px; }
  .row { display: flex; gap: 8px; align-items: center; font-size: 12px; }
  .status { margin-bottom: 6px; flex-wrap: wrap; }
  .grid2 { display: grid; grid-template-columns: 110px minmax(0, 480px); gap: 2px 10px; align-items: center; margin-top: 10px; }
  .mini { padding: 0 8px; font-size: 11px; }
  .danger:hover { border-color: var(--bad); color: var(--bad); }
  .small { font-size: 11px; }
  .good { color: var(--good); }
  .link { border: none; background: none; padding: 0; color: var(--accent); cursor: pointer; font-size: 11px; }
</style>
