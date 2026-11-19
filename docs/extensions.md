# Extensions

Extensions add support for another mod's file formats without changing the core editor.
Examples: Nexerelin faction config, MagicLib bounties, LunaLib settings (PLAN.md §10, §11.7).
1.0 ships the extension point and no extensions. Task #27 and the tasks decided in #31's review
(PLAN.md §10: LunaLib settings, Nexerelin faction config) add the first ones.

## Contract (`src/main/ext/index.ts`)

| Hook | When it runs | What it may do |
|---|---|---|
| `info` | always | id, name, description; `requiresMod` (the extension is unavailable without that mod), `defaultEnabled` |
| `index(cache)` | after the core GameIndex is built | read its own files from every source; its `data` goes to `GameIndex.ext[id]`, and its problems join the index problems |
| `check(cache, project)` | Check mod | add problems for the active mod |
| `exportFiles(cache, project)` | Export | return extra `FileWrite`s; they go through the same preview, write guard, changed-on-disk check and backups as everything else |
| `methods` | `window.api.ext(id, method, arg)` from the UI | anything else; writes go through the write guard only |

Register an extension with `registerExtension()` at startup. Users switch extensions on or off
in Settings → Extensions.

## Rules every extension follows

These are the same rules as the core editor (PLAN.md §6, §10):

- Only the active mod is written, with prefixed ids.
- Using another mod's format puts that mod in the active mod's list (Saga › Mods, PLAN.md
  §10.1) as **required** or **optional**. Required: added to `mod_info.json` dependencies, asked,
  one click. Optional: never added there, and the content that uses it is conditional (§10.2).
  Data files that only that mod reads (LunaLib settings, Nexerelin config, MagicLib files)
  default to optional. Not using it adds nothing.
- **Visibility**: Settings → Extensions (app-wide) says whether an extension is available. Its
  tabs, fields and node types show in a mod only when its `requiresMod` is in that mod's list as
  required or optional: the UI asks `toolVisible(extensionId)` (`src/renderer/src/state/mods.svelte.ts`),
  and Saga › Mods lists the extension under **Unlocks** for its mod. The index passes each
  extension's `requiresMod` to the UI (`GameIndex.extensions`).
- The format is documented from the installed mod (read-only) in `docs/FORMATS.md` before any
  code is written, with the version it was checked against.
- If in-game behaviour is needed, it goes into an optional SagaLib bridge (`src-optional/<mod>`),
  which is loaded only when that mod is enabled.
