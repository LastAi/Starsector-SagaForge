# Phase 8 design: loot groups, release, translation, world events, AI guide

Short record for [WORK-ORDER.md](WORK-ORDER.md) Phase 8 (2026-11-16). Like Phase 7: each step ends
with tests, svelte-check, docs, a throwaway test mod with a Ctrl+F9 profile when the step needs the
game (`eight_a`, `eight_b`, …), an in-game checklist in INGAME-CHECKS, and one local commit (no
push). SagaLib changes collect into the next SagaLib version.

## Decisions (user, 2026-11-16)

1. **Order:** 8a loot groups (F7-a, F7-b, F7-c) → 8b release packaging (R32) → 8c translation
   (R31) → 8d world events (RC-R12) with roaming fleets (RC-R14) → 8e AI conversion guide (R12,
   last: it documents the final formats).
2. **World events:** both of vanilla's shapes, **(a) first**: a scheduler of random events (keep
   some alive, roll new ones from a pool; each = conditions + quest-style actions + a news intel),
   then **(b)** the mod's own progress event (a progress bar fed by factors, stages, outcomes).
   Hooking into vanilla's Hostile Activity stays out (it changes every player's crisis).
3. **Translation: a runtime swap.** Not every modder translates their own mod, so **anyone** can
   make a translation and share it **without copying the mod**: a small translation mod (a file of
   translated strings) that SagaLib applies at runtime, next to the original. **Only text the player
   sees** is translated. A list of the most problematic parts is below; it is checked at 8c.
4. **Process:** as Phase 7 (a test mod per step that needs the game, a local commit per step).

## 8a: loot groups

- **F7-a, add to a vanilla group:** a loot pool gets **Adds to** = a vanilla drop group id; its
  entries are exported as rows of that group in the mod's `drop_groups.csv` (checked in game: a
  mod's rows are added, vanilla's stay). The editor knows vanilla's groups and their items (the
  game index reads every `drop_groups.csv`) and warns about an item the group already has (not
  checked in game) and about a "nothing" share (it would change vanilla's own odds).
- **F7-b, a random item from a group as a reward:** a quest reward can roll a drop group (the
  mod's or vanilla's) N times; SagaLib uses vanilla's salvage roller, shows "Gained …" lines.
- **F7-c, two mods adding the same item to one vanilla group** (user, added to #36): two tiny test
  mods in `eight_a`'s test; find out whether the rows stack; record in FORMATS.md; decide whether
  Check mod reports it.

## 8b: release packaging (R32)

Built as the request in INGAME-CHECKS R32. Choices made while working (go with the suggestion,
recorded here):

- **Releases folder:** Saga Forge's data folder › `releases` by default (`.userdata/releases`
  from source; next to the program when packaged), or a folder chosen in Settings. Refused inside
  a mod (the next release would pack the old zips) or a Starsector folder.
- **The zip** holds one folder named after the mod's name (characters Windows refuses are
  dropped), so it unzips straight into `Starsector/mods`. Left out: `sagaforge/` (plans,
  backups, release snapshots), `data/sagaforge/dev/` (test profiles) with their row in
  `content.csv` (in dev mode SagaLib would report the missing file), hidden folders (`.git`,
  `.idea`) and temporary files. Everything else goes in as it is, hand-written files and jars too.
- **Packing waits for Export**: the zip holds the mod folder as it is, so Mark as released with
  packing refuses a version that `mod_info.json` doesn't have yet.
- **Version Checker** only with an address for the master file: a `.version` file without one
  does nothing. Export writes `<mod id>.version` (whole file, ours) and an owned block in
  `data/config/version/version_files.csv` (hand-written rows stay). Uploading the master copy
  is the modder's step.
- **Forum post draft** next to the zip (`… - forum post.txt`), not in the workspace's
  `Forum Posts` folder (that folder is this workspace's own habit; the app has no idea of it).
  The parts only the author can write are `[WRITE: …]` markers. Known libraries (SagaLib,
  LazyLib, MagicLib, LunaLib) get their links; other requirements get a marker.
- **Not done** (later, if wanted): uploading anywhere (GitHub release, forum), a changelog
  section in the post, packing without marking.

## 8d: world events and roaming fleets (design, 2026-11-17)

Research: FORMATS.md "World events, news and roaming fleets". The user's order: (a) a scheduler of
random events first, then (b) progress events; no Hostile Activity hook. Three parts, each its
own commit and test mod checks:

**8d-1, event scheduler (RC-R12 a).** Saga › Events: a **scheduler** keeps between *min* and
*max* of its events running, checks every *interval* days (×0.75–1.25; sooner while fewer than
min run), and starts one by weighted pick among those whose **conditions** hold and that aren't
running, used up (**once**) or cooling down (**cooldown days**). An **event** has a **duration**
(days it counts as running), **start** and **end actions** (the quest Action vocabulary: flags,
reputation, spawn/despawn an encounter, place/remove an object, start a quest, credits, items, a
rule line), and an optional **news item** (title, text, icon, intel tab, place on the map, days
shown).
- Runtime: one JSON per scheduler (`data/sagaforge/events/<id>.json`, type `events`), run by
  SagaLib's existing transient RuntimeScript with all state in memory keys (no saved manager class,
  unlike vanilla's BaseEventManager). Start and end actions are rules (triggers
  `SF_event_<event>_start` / `_end`) fired through the trigger queue, like quest timers; while
  running, `$global.<event>_active` is true for conditions and dialog. News: one saved class,
  `lastai.sagalib.game.SagaNewsIntel` (a FleetLogIntel with strings only), with its texts
  translatable.
- Choices made (going with the suggestion): the scheduler doesn't random-walk its max like vanilla
  (it fills up to max, interval apart: easier to predict and test); dev-mode test profiles start a
  check at once by setting its next-check key.

**8d-2, roaming fleets (RC-R14).** An encounter with `spawn.when: 'roaming'`: from a market to
another (or back), at most N on the way, a new one every X days on average; real only near the
player. Runtime: one SagaLib `BaseRouteFleetManager` subclass (a saved, stable class) with a route
source per encounter, fleets made like the encounter's other fleets.

**8d-3, progress events (RC-R12 b), as built.** Stage outcomes are a simple weighted pick when the
stage is reached (not vanilla's roll-at / reset-at randomized stages, whose hidden icons and rules
are more than modders asked for); the definition is re-read after every load (so a mod update can
move thresholds); one-time points come from the new "Add progress" action (SF_Progress). Earlier
plan text, kept: **8d-3, progress events (RC-R12 b).** The mod's own event with a progress bar, stages, monthly and
one-time factors fed by flags and quest outcomes, and randomized stages that pick an outcome. One
generic SagaLib `BaseEventIntel` subclass with a fixed stage enum (stage slots), its definition
looked up by id after loading.

## 8c: translation, as built

- **A translation mod**: `<mod id>_<language>` with a content.csv row
  `<mod id>/<language>,translation,data/sagaforge/translations/<mod id>.<language>.csv,<its id>`
  and that CSV (key, context, original, translation, source). Made by "+ Translation"; the mod it
  translates is only read (also when it is someone else's, installed in the game's mods folder).
- **Keys** come from the exported runtime files (content id + path, ids instead of positions), so a
  translator needs only the released mod, not its plans. **source** = fingerprint of the original:
  a changed original makes the line stale (shown as "Original changed" in the editor; in game the
  original shows until the translator checks it).
- **Dialog**: tokens `$sft-<rule>-<part>-` (prefix-free: `-` can't be in our ids), texts in
  `data/sagaforge/text.json`; SagaLib's TextTokens makes only the firing rule's tokens (plus the few
  "g_" ones) so vanilla dialog doesn't slow down.
- **Translatable is on by default** whenever a mod uses SagaLib (the user: not every modder
  translates their own mod), so such mods now need SagaLib 1.2. The Export dialog can switch it off.
- **Only one translation per mod is active**; two enabled → the first listed, and a warning.
- Choices made while working (go with the suggestion, recorded here): a made-up language "xx" for
  the test mod (visible prefix [XX], no font needed); the CSV is the only translation format (opens
  in a spreadsheet; the editor's page writes the same file); translations get SagaLib 1.2 (not 1.3:
  1.2 isn't released yet).

## 8c: translation, the parts most likely to be a problem (checked)

| # | Part | Result |
|---|---|---|
| 1 | Fonts for other alphabets | Unchanged: the Translation page and README say a font mod is needed. |
| 2 | Dialog text and option labels | Tokens, filled by TextTokens: text and script lines per rule; option labels, tooltips and bar scene options for every rule (the game fills options with the calling rule's id; found in the first in-game run). Tokens inside a translation ($playerName, phrases) are filled in the same pass (the generator calls the game's own replacement). In game: 8c-1/8c-2. |
| 3 | Highlights | Each highlight is its own line ("highlighted words n (must appear in the text)"); vanilla's SetTextHighlights fills quoted tokens (checked in its source). Not checked by the editor: that the words appear in the translated text. |
| 4 | Grammar inside tokens | Not solved: a translation can't add phrase cases. Translators write around $heOrShe etc. Later: per-language phrase cases. |
| 5 | Things stored in the save | Systems, their star, places, markets renamed on load while SagaLib's name is unchanged; people every load; faction name overrides set and taken back. Not renamed: scatter objects, jump points (named after the system when built), vanilla systems. |
| 6 | Text passed into vanilla commands | Checked per command (FORMATS.md "Token replacement"): AddText, AddTextSmall, SetTooltip, SetTextHighlights, AddBarEvent, AddRaidObjective name work; raid tooltip and story option log go through "g_" parts; **ShowMapMarker titles can't be translated** (no replacement there). |
| 7 | Text variants and phrase cases | Each OR variant (t1, t2…) and each phrase case is its own line. |
| 8 | Length | Warning on the Translation page for option labels, tooltips, raid objectives, next-step lines and names. |
| 9 | Things Saga Forge doesn't make | Out of scope, as decided. |
| 10 | Keeping translations current | Fingerprints: stale lines listed, kept, and ignored in game until checked. |
| 11 | The editor's own checks | The Translation page has no spellcheck (the app's spellchecker is English). The colon rule doesn't apply to translated labels (tokens are filled after the game split the options line). |
| 12 | **New: `$` and `\` in texts** | The game uses token values as regex replacements (FORMATS.md); SagaLib quotes them now, for phrases too (a bug before). |
| 13 | **New: other mods' dialog in the editor** | The Dialog page shows another Saga Forge mod's rules with tokens. Later: fill them from its text.json. |
| 14 | **New: Play mode** | Plays the original language only. |

## 8c: translation, the parts most likely to be a problem (first list)

The game's API offers no way to list all rules or change their stored text. Dialog therefore
exports with a **token** in place of each translatable text, filled by SagaLib from the active
translation, or the original language (the mechanism phrases already use). Names and descriptions
can be swapped directly at runtime (`setName`, `setDisplayNameOverride`, `Description.setText1`).

| # | Part | Why it is hard | Likely way |
|---|---|---|---|
| 1 | **Fonts for other alphabets** | The game's bitmap fonts have no Chinese, Japanese, Korean or Cyrillic glyphs; translators of those languages use a separate font mod. Our dialog preview draws with the game's fonts too. | Out of our hands: document that the font mod is needed; the preview falls back to a system font for missing glyphs. |
| 2 | **Dialog text and option labels** (rules.csv) | No API to change a rule's text after loading. | Export text as tokens SagaLib fills; must check that tokens **inside** a translation (`$playerName`, `$heOrShe`) are still replaced (one pass or two?). |
| 3 | **Highlights** (`SetTextHighlights`, Highlight) | They match exact words of the text; a translation has other words. | The highlights become part of the translation (the translator lists the words to highlight). |
| 4 | **Grammar inside tokens** | `$heOrShe`, `$HisOrHer`, `$playerSirOrMadam` are English words; other languages need gender and case forms the tokens don't give. | Phrases (cases by `$player.gender` etc.) in the translation; document per language. |
| 5 | **Things stored in the save** | Names of the mod's systems, planets, markets, people, fleets and ships are written into the save when made; switching the translation later doesn't change them by itself. | SagaLib renames the mod's own objects on load from the active translation (and back). |
| 6 | **Text passed into vanilla commands** | Bar scene options and blurbs, raid objectives, AddTextSmall lines, tooltips: quoted strings in scripts. | Most go through vanilla's token replacement, so tokens work there too; each command checked. |
| 7 | **Text variants and phrase cases** | `OR` variants in a text and each phrase case are separate strings. | Each is its own key; the translator sees them together with their context. |
| 8 | **Length** | Translations are often longer: option labels, journal next-step lines and names can overflow. | A length warning on import; the preview shows the translated text. |
| 9 | **Things Saga Forge doesn't make** | The mod's hand-written rules, Java strings, other mods' text, vanilla's text, the launcher's mod name and description. | Out of scope (only text Saga Forge exports). |
| 10 | **Keeping translations current** | When the mod changes a text, the translation's line is stale. | Keys are stable; each key stores a fingerprint of the original, so stale and missing lines are listed. |
| 11 | **The editor's own checks** | Spellcheck, punctuation checks and the colon rule are English or language-dependent. | Per-language word lists; the colon rule (options cut at ":") applies to translations too. |

## 8e: AI conversion guide (R12)

Written as docs/AI-CONVERSION.md, addressed to an AI assistant (the request's wording), checked
against model.ts and SagaLib's parsers (field names, entity kinds, plan files). Choices made: the
conversion always works on a copy of the mod; unconverted code is listed in
sagaforge/UNCONVERTED.md (inside the plans folder, so releases leave it out); converted
hand-written rules rows are deleted from the copy so they don't run twice. Not tried on a real mod
yet: a first conversion (a small mod of the user's) would show what the guide misses.

**Phase 8 is complete** (8a–8e). The forum post export was discussed: greyed out (below).
Settled on its own: the Phase 7 question "should any mod with a new system require SagaLib 1.2"
(cloud clearing): every SagaLib mod now exports translatable texts, which need SagaLib 1.2 anyway.
The deferred items of Phases 7 and 8 are task #53.

## Questions for later (recorded while working)

- **Forum post export** (user, 2026-11-17): discussed after Phase 8. **Decision: greyed out for
  now** (Mark as released packs the zip only; the forum fields in Release details are kept but
  disabled, with a "coming later" note). It will come back as **post templates**: the user makes a
  template of how they want their post (their layout and sections) and Saga Forge creates the post
  from it, filling in the sections. `shared/releasepack.ts` `forumPost()` and its tests stay as a
  starting point.
- **8e AI conversion guide** (user, 2026-11-17): a "trial by fire": the user looks for a modder
  willing to try it on their mod and give feedback; until then it is untested.
