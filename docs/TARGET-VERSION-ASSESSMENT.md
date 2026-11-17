# Game versions: migration install, target switch and version labels

> **Status (2026-11-15, task #47 as Phase 3b of #36): P1–P5 implemented.**
> - **Code:**
>   - main: `src/main/index.ts` (installs, target, caches); `snapshotMod` in `src/main/modproject.ts`.
>   - shared: `src/shared/versiondiff.ts`, `src/shared/versionrefs.ts`, `src/shared/migration.ts`.
>   - renderer: `src/renderer/src/state/versions.svelte.ts`; `SettingsDialog`; the header pill;
>     `export/MigrationDialog.svelte`; `ui/VersionReplace.svelte`.
> - **Tests:** `test/versions.test.ts`.
> - **Differences from this plan:**
>   - Labels are shown in every `IdInput` (in the suggestion list and as a chip by the value), not in
>     a separate index browser column.
>   - The "hide items the target doesn't have" filter isn't needed: pickers list the target
>     install's own data, so items it lacks never appear.
>   - The migration report is a dialog opened from the banner, not a page.
>   - The `gameVersion` line is settled by the Export itself, which now always writes the target's
>     version.
>   - The behaviour notes are in `src/shared/migration.ts`, not in the definitions.
> - **Not done:**
>   - P6 (SagaLib `GameCompat`), on purpose.
>   - The SagaLib dependency version per target, and the optional `sell price mult` column (§6).

Plan, 2026-11-12. Analysis and design only: no code was changed. It builds on
[GAME-0.98.5a-ASSESSMENT.md](GAME-0.98.5a-ASSESSMENT.md), which lists what changed from 0.98a to
0.98.5a. It replaces the first draft of this document, which had a "target + also works on" model
and bundled per-version id lists. Both are dropped here (§7).

## Assumptions (from the user, 2026-11-12)

1. Most modders target **one** game version.
2. A modder who works with **two** versions does so because they are **moving the mod to the new
   version**, not keeping both alive.

## Decisions

The first three were Claude's recommendations, accepted when the user asked for this write-up. They
are easy to revisit.

| # | Decision | Why |
|---|---|---|
| D1 | Settings get an optional **second Starsector install**, clearly labelled as being **for migration**. | The second install gives exact data for the other version (ids, names, rules), so nothing has to be bundled. |
| D2 | A **target radio** picks which install is targeted. The target decides which install's game data and `mods` folder are loaded, which rules Play mode runs, and which `gameVersion` the export writes. | The user's request. One target at a time, per assumption 1. |
| D3 | The target is **remembered per mod**. The radio shows and changes it for the active mod. | Modders with several mods will have them on different versions. |
| D4 | **One mod folder** for both versions, no copies. | Assumption 2: the mod moves forward, it doesn't fork. |
| D5 | **Saving the plan is never blocked.** What is blocked is **exporting to the older version** while the mod uses anything only the newer version has. | Blocking a save loses work. The export is what produces game files for the older version. |
| D6 | When a mod made for the older version is targeted at the newer one, the editor shows a **migration report** that highlights what must change and makes each fix as simple as possible. | The user's request. |
| D7 | **Version labels appear only when both installs are set.** | With one install, everything visible exists in the target, so labels add nothing. |

---

## 1. Where things stand

| Area | Today | File |
|---|---|---|
| Installs | One Starsector folder (`config.starsectorDir`). The mods folder is either that game's `mods` folder (`modsMode: 'game'`) or a separate workspace (`'workspace'`). The index is cached per install root, mods mode and active mod. | `src/main/index.ts:40-80`, `src/main/install.ts:99-130` |
| Game version | Read only from `starsector.log`, so it is unknown on a fresh install. Task #46 adds reading it from `starfarer_obf.jar` (`com/fs/starfarer/Version.class`). | `src/main/install.ts:43` |
| Definitions | One built-in set, `0.98a.json`. `defsFor(version)` matches by prefix and falls back to the newest. User patch files can add versions. #46 adds `0.98.5a.json`. | `src/shared/defs/` |
| Project | `sagaforge/project.json` (format 1) has no target. `mod_info.json` `gameVersion` is set when a mod is created and never updated. | `src/shared/model.ts:14`, `src/main/index.ts:180` |
| Pickers | `ui/IdInput.svelte` (55 uses): a native `<datalist>`, "id — name"; with `strict`, unknown ids turn red. | `src/renderer/src/ui/IdInput.svelte` |
| Problems | Levels `error / warning / save / style / info`; `area`, `ref`, `fixes`, `key` (ignorable with a reason). | `src/shared/api.ts:42-70` |
| Backups | `<mod>/sagaforge/backups/<stamp>` on export, pruned by rules. | `src/main/modproject.ts:184` |
| Export | No target-dependent output. The vanilla commands it writes are unchanged in 0.98.5a. | `src/shared/export/index.ts` |
| SagaLib | One jar, compiled against 0.98a; byte-identical against 0.98.5a. `KNOWN_GAME_VERSIONS` lists only `0.98a-RC8`. | `mods/SagaLib/src/lastai/sagalib/game/Saga.java:20` |

## 2. What differs between versions, and where the editor finds it

Measured between 0.98a-RC8 and 0.98.5a-RC5. The script is in
`.cache/sf-version-probe/manifest_probe.py`.

| Kind | Source once both installs are set | 0.98a → 0.98.5a |
|---|---|---|
| Rule commands (name, **parameter forms**, optional parameters), tokens, ranks, posts, code people, faction keys | Compare the two **definitions files** | +8 commands; one-argument forms of `RepIsAtWorst`/`RepIsAtBest`/`SetPersonHidden`; `MovePersonToMarket`'s 3rd parameter; +2 tokens, +3 ranks, +7 posts, +13 people; faction keys `player_male`, `player_female`, `custom.noBountyForDefeating` |
| Vanilla factions, variants, hullmods, commodities, entity types, music, portraits, images, `settings.json` graphics keys | Compare the two **game indexes** (core only) | +1 faction; variants +14 / **−2**; +2 hullmods; +1 commodity; +1 entity type; +8 music; +24 portraits; +30 images; +44 keys |
| Vanilla rule ids | Compare the two **rule indexes** | +6,491 / **−115** |
| File layout | Export code | `rules` file list in `settings.json`; player portrait keys; commodities column `sell price mult` |
| Engine behaviour | Hand-written **notes** in the definitions | commission pay, Survival mode, `IsSoughtByPatrols`, Askonia storyline |
| Dependencies (other mods) | The two installs' `mods` folders | per user |

---

## 3. Settings and the target switch

### 3.1 Settings → Game

```
Starsector install          D:\Starsector            0.98a-RC8      [Change…]
Migration install (optional) D:\Starsector_98_5a      0.98.5a-RC5    [Change…] [Remove]
  Only for moving a mod to a new game version. Saga Forge compares the two installs
  and shows what your mod needs to change.

Target for <active mod>:   ( ) 0.98a-RC8 (main)   (•) 0.98.5a-RC5 (migration)

[Finish migration]  makes 0.98.5a-RC5 the main install and removes the migration slot
```

- Both slots detect their version from the jar (#46). The editor works out which is **older** and
  which is **newer**; the slot doesn't matter.
- Both installs need their own mods setting (game `mods` folder or workspace). In workspace mode
  they share the workspace. That is the recommended setup for migration (§3.3).
- **Finish migration** is offered when no mod in the workspace still targets the older version, or
  with a confirmation listing those mods.

### 3.2 What the target controls

| Thing | Follows the target |
|---|---|
| Game index (factions, items, hulls, …), definitions (`defsFor`) | yes |
| `mods` folder loaded (other mods, dependencies) | yes: the target install's own setting |
| Play mode / Test context rules | yes |
| `gameVersion` written by export | yes: the target install's full version string |
| Export file layout switches (§6) | yes |
| Plan files (`sagaforge/`) | no: one set for both versions (D4) |

- Stored per mod in `sagaforge/project.json` as `"target": "0.98.5a-RC5"`. The field is optional,
  so the format stays 1. Readers that don't know it ignore it.
- When a mod is opened:
  - target missing → use the install whose version matches `mod_info.json` `gameVersion`;
  - no match → ask.
- Header pill:
  - one install: nothing new is shown;
  - two installs: "Target 0.98.5a · migrating from 0.98a", and "Target 0.98a (older)" when the
    older one is targeted.
- Both indexes are cached (the cache key already includes the install root), so switching is
  instant after the first build.

### 3.3 The mod folder during migration (D4)

- **Workspace mode** (the mod is outside any install): both installs see it; nothing to do.
- **Game mods mode**: the mod lives in one install's `mods` folder, and the other game can't see it.
  The editor must not write into an install (project rule), so it doesn't copy or link the folder.
  Instead:
  - when a migration install is added and the active mod is in a game `mods` folder, suggest
    switching to workspace mode (the existing ⚙ Settings → Mods option);
  - the Export dialog shows a short instruction: "To test in the 0.98.5a game, copy or link this
    folder into `D:\Starsector_98_5a\mods`."

---

## 4. Version labels (D7)

Only shown when both installs are set. Labels are relative to the two versions, plus a colour that
depends on the target:

| Item exists in | Label | With target = newer | With target = older |
|---|---|---|---|
| both | none | — | — |
| newer only | `0.98.5a only` | neutral | **red**, and using it is an error (§5) |
| older only (removed) | `removed in 0.98.5a` | **red**, and using it is in the migration report (§7) | neutral |

- **Where:**
  - `IdInput` option text ("asteroid_base — Asteroid Base · 0.98.5a only"), which covers all 55
    pickers;
  - `IndexBrowser`: a "Game version" column;
  - rank/post selects, the token list, the people list (code people);
  - faction form fields for version-only keys;
  - command parameter hints, once a command picker exists (#30).
- **The data:**
  - definitions items: compare the two definitions files, keyed like the patch merger (`name`,
    `token`, `id`, `key`, `tag`); command forms compared by parameter signature;
  - game data: compare the two indexes by id per category (core sources only).

  Nothing is hand-tagged.
- **Filter:** "Hide items the target doesn't have" on pickers and the index browser, on by default
  when the older version is the target.
- **Later:** a native datalist can't colour options. A custom dropdown would allow real chips; the
  text label works now.

---

## 5. Exporting to the older version (D5)

- **Saving the plan (Ctrl+S) is never blocked.**
- With the older version as target, every use of a newer-only item is a **Version error** in
  Problems, linked to where it is used: "Uses `asteroid_base` (0.98.5a only) in Location
  *Smuggler's Rock*". Errors already block export, so the export is blocked until the list is
  empty.
- **Fix options** on each problem:
  - **Pick a replacement…**: the picker opens filtered to ids the older version has;
  - **Remove**;
  - **Target 0.98.5a instead**.
- **What is checked:**
  - every id the model references (factions, people, hulls, variants, wings, weapons, hullmods,
    items, conditions, industries, submarkets, entity and planet types, music, sounds, portrait and
    illustration paths, `settings.json` graphics keys, ranks, posts, faction keys);
  - **typed rule lines** (extra condition/script lines, dialog actions): parsed with
    `rules/parse.ts`, then the command name and the **form** (argument count and types) checked,
    e.g. `RepIsAtWorst FRIENDLY` → "0.98a needs a faction or person:
    `RepIsAtWorst <faction|person> FRIENDLY`";
  - tokens in text;
  - SagaLib features that need a newer SagaLib or game (§8).
- **Switching the target radio to the older version is always allowed.** The problems simply
  appear; nothing is lost.

---

## 6. Export switches per target

The export stays one code path. These outputs depend on the target:

| Output | Target = 0.98a | Target = 0.98.5a |
|---|---|---|
| `mod_info.json` `gameVersion` | `0.98a-RC8` | `0.98.5a-RC5` (the target install's string) |
| Player portraits in a `player` faction patch | `standard_male` / `standard_female` | `player_male` / `player_female` (feed the new-game picker; `standard_*` means something else now) |
| Rules location | `data/campaign/rules.csv` owned blocks | same. An own rules file (`settings.json` `rules` + `data/campaign/rules/<modid>.csv`) only as a later opt-in, after the in-game check (0.98.5a assessment I1). |
| New `commodities.csv` header | 0.98a header | may add `sell price mult` (the game reads by name; optional) |
| SagaLib dependency | version that runs on 0.98a | version that runs on 0.98.5a (§8) |

Golden-file tests per target cover these.

---

## 7. Migrating a mod to the newer version (D6)

### 7.1 When it shows

The target is the newer install, and the mod's `mod_info.json` `gameVersion` (or its last export)
is the older one. A **Migration** page opens from a banner: "This mod was made for 0.98a. 3 things
must change for 0.98.5a. [Open migration]".

### 7.2 Step 0: snapshot

**Save a 0.98a snapshot** writes a backup to `sagaforge/backups/<stamp> 0.98a` (the existing backup
mechanism). It is never pruned automatically. It is offered first and recommended. If the modder
ever needs a hotfix for the old version, the last old state is there, without the editor managing
two live copies.

### 7.3 The report: three groups

1. **Must change (errors)**: things that break or silently stop working:
   - references to ids the newer version **no longer has**. For 0.98.5a: the variants
     `kite_Stock` and `ziggurat_HF`, and dialog that hooks one of the **115 removed vanilla rule
     ids**;
   - `standard_*` portraits in a `player` faction patch, which no longer feed the new-game picker;
   - `mod_info.json` `gameVersion`;
   - **dependencies missing from the newer install's `mods` folder**: "needs MagicLib; not found
     in the 0.98.5a install";
   - hand-written rows in the mod's `rules.csv` (outside owned blocks) that use removed vanilla
     rule ids or commands. Shown in their own section, since those aren't the editor's to rewrite.
2. **Check (review)**: behaviour that changed, from the definitions' notes, shown only when the mod
   uses the area:
   - "Your faction offers commissions: pay is now 15,000 + 3,500 per active officer";
   - "Rewards and wrecks: Survival mode scales prices and lowers derelict quality";
   - "Quests in Askonia: the new Diktat storyline can change Sindria's owner".

   Each has a **Reviewed** tick, stored like ignored problems, so the group reaches zero.
3. **New in 0.98.5a (optional, collapsed)**: new commands, entity types, music and portraits that
   fit what the mod does. Never counted as work left.

### 7.4 Making it simple

- **One-click fixes** where the change is mechanical and safe:
  - `standard_*` → `player_*` on the player faction;
  - update `gameVersion`;
  - update the SagaLib dependency.
- **Apply all safe fixes** runs them as **one undoable step**, with a summary of what changed.
- Unsafe items (a replacement for a removed variant, a removed vanilla rule a dialog hooked) stay
  manual. "Pick a replacement…" opens the picker filtered to the newer version, with the old id's
  name as the search text.
- **Progress**: "Must change: 3 left · Check: 2 to review", and a final **Export for 0.98.5a**
  button that is enabled when "Must change" is empty.
- **After export**: a generated **in-game test list** for what the migration touched: "Play the
  quests that used a replaced variant", "Start a new game and check the player portraits",
  "Check the commission pay". It can be copied into the test-mod checklist.

### 7.5 Only the new install, no migration slot

A modder who already replaced the game opens an old mod:

- the banner still appears, because `gameVersion` is older than the installed version;
- removed ids show through the existing unknown-id checks (red in `strict` pickers);
- changed commands show through the definitions comparison, since both definitions files are
  built in;
- groups 1 and 2 still work, except "removed vanilla rule ids", which needs the old install's
  rules. That line says "add the old install as a migration install for a full check".

---

## 8. SagaLib

- **One jar for all supported game versions.** Keep compiling against the oldest supported API.
  Newer API (`Misc.isExtended()`, `Misc.getModifiedMissionReward()`,
  `FactionAPI.setDescIdOverride()`) goes through a small `GameCompat` class (reflection or a version
  check). A feature that isn't available logs one clear error naming the mod and feature, and is
  skipped.
- SagaLib commands and actions in the definitions get `sagalib: "<min version>"` and optionally
  `games: [...]`. The export:
  - writes the needed SagaLib version;
  - flags features the target can't run (§5).
- Add `0.98.5a-RC5` to `KNOWN_GAME_VERSIONS` at the next SagaLib release.
- Only needed once the first 0.98.5a-only SagaLib feature is built (0.98.5a assessment ideas I4,
  I6, I10).

## 9. Ship Editor

The Ship Editor has the same single-install setup and per-version definitions. The migration
install, the target switch and the label rules are editor-agnostic. Build them so the Ship Editor
can adopt them later (shared shapes for the definitions comparison and the version labels). The
project rule "share a similar style with Ship Editor" covers the settings layout and label look.
Nothing changes in the Ship Editor for now.

---

## 10. Dropped from the first draft

- **"Target + also works on"**: replaced by one target at a time (assumption 1).
- **Bundled per-version vanilla id lists** (0.5 MB per version): replaced by the migration install,
  which gives exact data including names and rules.
- **Writing output that works on both versions at once** (e.g. both portrait key sets): not needed
  when there is one target. The export writes the target's form (§6).
- **Separate builds per version**: not needed; the snapshot (§7.2) covers the "hotfix for the old
  version" case.

## 11. Order of work

| Phase | Content | Size | Depends on |
|---|---|---|---|
| P0 | Task #46: version from the jar, `0.98.5a.json` definitions (write it as a full file, not a patch), rules file list. | M | — |
| P1 | Settings: migration install slot, version per slot, older/newer detection, target radio stored per mod, header pill, per-install index cache and mods setting, workspace-mode suggestion, **Finish migration**. | M | P0 |
| P2 | Comparison engine: definitions comparison (including command forms), game-index comparison, rule-id comparison; labels in `IdInput`, `IndexBrowser`, selects and forms; "hide items the target doesn't have" filter. | M | P1 |
| P3 | Version problems and the export block to the older target: id references, typed rule lines and forms, tokens; fix actions (pick replacement / remove / change target). | M | P2 |
| P4 | Export switches (§6) with golden tests per target. | S | P1 |
| P5 | Migration page: snapshot, three groups, notes in the definitions, Reviewed ticks, safe fixes as one undo step, progress, in-game test list; the single-install case (§7.5). | M–L | P2, P3, P4 |
| P6 | SagaLib `GameCompat` and feature requirements. Only when the first 0.98.5a-only SagaLib feature is built. | S–M | P3 |

Tests:

- unit tests for the comparison (definitions and indexes, using small fixture installs);
- version parsing and older/newer ordering;
- the export switches as golden files per target;
- the migration fixes (before/after model);
- e2e: add a migration install, switch the target, see a label, an error, the export blocked, and
  a safe fix applied.

## 12. Risks and open points

- **Supported versions**: two installs at a time by design. Older definitions files stay built in
  so `defsFor` keeps working for old mods.
- **RC and hotfix versions**: compare by version family (`0.98.5a`); write the full string only to
  `mod_info.json`.
- **Behaviour notes** are hand-written from the release notes and API diff. They can be incomplete,
  so the release notes must still be read each version.
- **Command forms** in the definitions are hand-curated. A mistake gives a wrong label. Fixture
  tests include the known 0.98.5a changes (`RepIsAtWorst`, `SetPersonHidden`,
  `MovePersonToMarket`).
- **Game mods mode**: the editor can't make the mod visible to the second game (no writes into
  installs); it explains instead (§3.3).
- **Datalist limits**: text labels until a custom dropdown exists.

## 13. Effect on existing tasks

- **#46 (0.98.5a support update)**: P0. Requirement added: write `0.98.5a.json` as a full file and
  keep `0.98a.json` built in.
- **#36 (workflow pass)**: the settings part (P1) is first-launch work. If #36 runs first, it
  should leave room in Settings → Game for the second slot.
- **#41 (test-mod checklist)**: add steps for:
  - setting a migration install;
  - switching the target;
  - a newer-only id blocking export to the older version;
  - the migration page's safe fixes.
- **#30 (editor features)**: the command picker and presets should show version labels from the
  start.
- **#39 (forum post)**: the post's title version comes from the mod's target.
