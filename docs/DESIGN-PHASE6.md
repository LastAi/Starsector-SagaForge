# Phase 6 design: writing

Short record for [WORK-ORDER.md](WORK-ORDER.md) Phase 6 (2026-11-15). Requests: R29 and R30 in
[INGAME-CHECKS.md](INGAME-CHECKS.md). Editor only; no SagaLib or format change, except the
optional `words` list in `sagaforge/project.json`.

## 1. Writing tools (R29)

**Script view.** Quests has a third center tab, **Script**, next to Chart and Rules
(`src/shared/script.ts`).
- It walks the chart depth first from the Start node, following each node's handles in order, so
  the options read in the order the player sees them.
- What each node shows:
  - A dialog: a scene heading (its title), the speaker in capitals, the paragraphs, and each
    option as a choice with where it leads ("goes nowhere yet" when it isn't linked).
  - Stage, Arrive, Wait, Encounter, End, Link, Branch and titled Action nodes: short italic notes
    ("Journal: …", "The player arrives at … and picks …", "The quest ends: success (reward pay)").
- Nodes that no path reaches come last, marked "(not reached from the start)". The view doubles as
  a quick reachability check.
- **Copy as Markdown** copies the script: `#` for the quest, `##` per scene, bold speaker,
  choices as list items with →. This is for a proofreader or co-writer. Nothing reads it back:
  the chart stays the source.

**Spellcheck.** Chromium's spellchecker is on in every text field.
- On Windows it uses the system's checker and languages.
- Right-click on a misspelled word shows the suggestions and **Add "…" to the mod's word list**.
- The list is `words` in `sagaforge/project.json`. It goes with the mod, so names like "Ailuros"
  stop being flagged for everyone who opens it.
- When a mod opens, the list is given to the spellchecker (`addSpellWords`). Words already added
  stay for the session, since Electron can't remove them one by one, which is harmless.

**Punctuation checks.** These are Style level, off by default (Settings › Checks), and never block
Export.
- `punctuation(text, prose)` finds:
  - an unclosed quotation mark;
  - unbalanced brackets;
  - doubled spaces;
  - straight and curly quotes mixed;
  - a `$token` glued to a word;
  - for prose, a paragraph that doesn't end in punctuation.
- It now covers every text the player sees:
  - dialog text, options and phrase cases;
  - Arrive texts and options;
  - contact offers and bar blurbs, with their options;
  - stage journal and next-step lines;
  - mod and people phrases;
  - descriptions and item descriptions.
- Options, next-step lines and phrases are short labels, so they skip the end-punctuation rule.
- The second-person and number-highlight checks stay on dialog text only.

## 2. Quest templates (R30)

**New quest › Start from:** an empty quest, a built-in template, or a saved template.

**Built-in templates** (`src/shared/templates.ts`) are delivery, bounty, investigate a place,
rescue, and a talk-to-someone chain. Each one has the same parts as the editor's own quests:
- a contact offer with Accept and Decline (Decline goes back to the menu);
- normal stages with journal and next-step lines;
- Arrive or Encounter nodes, then a closing dialog;
- a success stage and an End with a reward (credits);
- a note node that says what to fill in.

The text uses `<place>` and `<person>` as visible placeholders.

**Blanks become to-dos** (`markTemplateBlanks`). The contact, each Arrive's place and each
Encounter's fleet are marked "Set later" (R9). Problems lists them as a checklist instead of as
errors, and Export stays blocked only by the to-dos themselves. Tests check that every template
has no errors against the real game index.

**Saved templates.**
- **Save as template…** (Quest settings › Template) asks for a name in a dialog and writes the quest plan to the app's user-data
  `templates/<name>.quest.json`. It is not inside a mod, so templates work across mods.
- The files are plain plan files that can be shared by copying.
- Using one (`fromSavedTemplate`) replaces the old quest id everywhere: flags, tokens, rule
  conditions. It sets the new title and drops the template's to-dos and inactive mark.

**Deferred:**
- **Escort**: SagaLib has no fleet that follows the player.
- **Smuggling**: needs an illegal-cargo step. It fits better with random targets (RC-R1,
  Phase 7).

The other templates are built the same way, so these can be added later.

## Not changed

- Quest plan, export and SagaLib formats are unchanged. Templates produce ordinary quests.
- Play mode, test profiles and Check mod treat a quest from a template like any other.
