# Phase 1 design: Set later, Inactive, Images, Reference pages

Short design for [WORK-ORDER.md](WORK-ORDER.md) Phase 1 (2026-11-15). Requests: R9, R10, R5 + R1 + R2,
R28 (+ F16), R24, R8 in [INGAME-CHECKS.md](INGAME-CHECKS.md).

## 1. Set later (R9)

**What it is.** A mark on a field: "I'll fill this in later". Not a value: nothing fake is
exported.

**Where it is stored.** On the object that owns the field, in its plan file:
`todo?: Record<fieldPath, { note?: string; was?: string }>` on people, quests, items, encounters
and systems (`was` = the field's value when it was marked, see below). Kept on the
object (not in `project.json`) so it follows the object when it is renamed, and goes away when the
object is deleted. Faction fields are left out: factions are game files (`.faction`), which may
not carry editor keys.

**Field paths** are dotted paths in the object, with `name#id` picking an array element by id:
`placement.market`, `start.person`, `spawn.at`, `nodes#arrive.entity`, `stages#find.marker`,
`portrait`, `icon`. One resolver (`todoValue(obj, path)`) reads the current value.

**Active or done.** A to-do is **active until its field changes** from the value it had when it
was marked (or while the field is empty). That covers fields that start with a placeholder: a new
item's icon is vanilla's `chip1.png`, and marking it "later" must not count as done at once. As
soon as the field holds something new, the to-do counts as done: Problems stops showing it, and Save
removes it from the plan file. So there is no separate "clear" step, and an outdated mark can't
linger. (The mark can also be removed by hand.)

**In the form.** `Field` gets an optional *Set later* control (a small "later" button by the
label). Marked: the label shows a **To do** chip and the note (editable in a small popover). The
first fields with it are the forward references and the art: a person's portrait, placement market
and encounter; a quest's contact, icon, stage map markers and Arrive places; an item's icon; an
encounter's Spawn › At and flagship commander. Others can follow the same way.

**In Problems.** A new level **To do** (between Error and Warning; its own colour and count in the
header), one row per active to-do: "Pops › Placement › Market: set later (note: Felicette, step
6)", with **Go to field**. A check that would report the same field as missing (e.g. "Start: pick
the contact") stays quiet while that field is marked, so the user sees one row, not two.

**Export and release.** Export works (to try things in game) and lists the to-dos it found, so the
user knows. **Mark as released refuses** while any to-do is active, naming them; to-dos in inactive
content don't count (R10).

**Logic check.** An empty field with no mark behaves as today (an error where the field is
required). A mark whose field has since changed is harmless and disappears on Save. Deleting the object
deletes its marks. A renamed node or stage keeps its marks, because `nodes#arrive` is renamed with
the node by the same code that renames edges (the rename helpers update `todo` keys too).

## 2. Inactive (R10)

**What it is.** A planned person or quest (or dialog) that exists in the editor but **is not
exported**, so it never appears in game.

**Stored** as `inactive?: true` on `PersonDef` and `QuestPlan`. Toggle: People page header ("Inactive"
checkbox next to Delete) and Quest settings (an "Inactive" field at the top).

**Effectively inactive** (computed): a person with the flag; a quest with the flag, **or a contact
quest whose named contact is inactive** (it couldn't be offered anyway).

**Export.** One step, before everything else: the exported model drops inactive people and
effectively inactive quests, and removes inactive people from markets' people lists. Everything
downstream (rules blocks, SagaLib files, mission rows, the index) is then simply consistent, and
files exported earlier are removed by the normal removal step (R11, fixed in Phase 0).

**Problems.**
- Problems located **inside** inactive content are shown as **warnings** (errors downgraded), with
  "(inactive)" in front, and its to-dos don't block release.
- A quest that is inactive only because its contact is inactive gets one **warning** saying so.
- **Active content that uses an inactive person during play is an error**: in an active quest, a
  Dialog's speaker or person visual (first, second, third); an active encounter's flagship
  commander. Also an active quest whose Action starts an inactive quest.
- A market that lists an inactive person is fine (the person is simply not placed until active).
- An active encounter tied to an inactive quest (its spawn quest, or its comm dialog) is a
  **warning**: the fleet would never spawn, or would use vanilla's greeting.
- An inactive prerequisite quest (an active quest requires it) is a **warning**: the active quest
  can never be offered until the other is active.

**Save safety.** If the last release contains a person or quest that is now inactive, it gets the
same save warning as a deletion ("removed since 1.0.0"), saying it was made inactive.

**Display.** Lists (People, Quests, the Saga board) show inactive entries greyed out with
"[Inactive]" after the name, and a **Show inactive** filter (on by default, so nothing seems to
vanish).

**Logic check.** Play mode still plays inactive quests (it's the editor; the user is planning
them). Test profiles that mention an inactive quest keep working in the editor; they are exported
as they are (SagaLib ignores a profile entry for a quest it doesn't know, with a log line). A
market listing an inactive person keeps the entry in the plan, so reactivating needs no re-placing.

## 3. Images page (R5, with R1 resize, R2 crop, R28 previews, R24, F16)

**Image kinds** (each with its folder and vanilla size): flag `graphics/factions/` 410×256 · crest
`graphics/factions/` 256×256 · portrait `graphics/portraits/` 128×128 · item icon
`graphics/icons/cargo/` 80×80 · mission icon `graphics/icons/missions/` 64×64 · illustration
`graphics/illustrations/` 480×300.

**Import** (a file, several, or a whole folder), one dialog:
- pick the kind; each file gets a name **with the mod's prefix** (`Mainecoon_Beta.jpg` →
  `sfw_mainecoon_beta.png`), editable;
- **crop** (R2): a preview with a crop frame locked to the kind's shape, dragged and resized on the
  image; it starts centred and as large as fits. Same shape already: no crop step;
- **resize** (R1) to the kind's size and **convert to PNG**, done in the renderer with a canvas
  (high-quality smoothing), so the preview shows exactly what will be written;
- the result joins the existing "copied on Save" list (`pendingCopies`), now carrying the PNG
  bytes; Save writes it through the write guard. An existing file of the same name asks before it
  is replaced (the old one goes to `sagaforge/backups/`);
- an illustration also gets its key registered (the mod's `settings.json` on Export, as today).

**The page** lists the mod's images by kind as thumbnails, with each file's size and a badge when
it isn't the kind's size; Check mod reports those too.

**Pickers** (R28): every place that picks an image (faction flag and crest, a person's portrait, the
faction's portrait lists, item icons, the quest icon, dialog illustrations) opens one **image picker**
with thumbnails: the mod's images of that kind first, then the game's and other mods' (marked by
source), a search box, and **Import…** (the dialog above, which then selects the result). The
faction's portrait lists show thumbnails on their chips, and their picker can add several at once
or **a whole folder** (F16), importing it first.

**Logic check.** Nothing is written before Save, as with today's Pick…; undo doesn't cover image
files (as today), but undoing the field change leaves an unused file, which the Images page shows
and can delete. Vanilla's own images are only referenced, never copied (as today with portraits).

## 4. Reference pages (R8)

**One HTML document**, generated by Saga Forge for the game version in use, with a section per list
and a table per section (id, name in game, what it is and where it shows). Written to Saga Forge's
own data folder (never the mod or the game) and opened in the system browser at the right section
(`#people-rank`, …). Rebuilt when the definitions change.

**Info buttons**: a small ⓘ next to a list's label (in `Field`, an optional `ref` prop) opens the
document at that list's section.

**Content, first pass:** People (rank, post, voice, personality, contact types, importance), built
from the game definitions plus hand-written descriptions where they're known; the other lists of R8
are added as their phases come (R7 Other keys, R13 plugins, R18/R20 types).

**Logic check.** Descriptions are only written where they are known from the game's code or files;
an option without one shows its id and in-game name, never a guess.

## Order of building

R9 → R10 (it uses R9's levels) → the image kinds and import dialog (R5, R1, R2) → the picker (R28,
R24, F16) → R8. Each step ends with tests and screenshots.
