# Definition generator scripts

These scripts made the built-in game definitions in `src/shared/defs/`. Until 2026-11-17 they
were only kept in `D:\ModTools\.cache` (`sf-defs/scripts`, `sf-defs-0985a-gen`,
`sf-version-probe`). Plain Node (CommonJS) and one Python script, with no dependencies. They read
the game's files and never write to them.

Inputs: the game's `starsector-core/data` folder, and its API sources (`starfarer.api.zip`
unzipped; the workspace keeps 0.98a in `.cache/api-old` and 0.98.5a in `.cache/api-new`).

## 0.98a.json (the full set)

1. `node rules.js <data>/campaign/rules.csv json rules.json` analyses vanilla's rules (triggers,
   script and condition commands, memory keys, tokens, operators). Without `json` it prints a
   readable summary instead.
2. `node people.js <api>/com/fs/starfarer/api/impl/campaign/ids/People.java <api>/com/fs/starfarer/api/impl/campaign/ids/Factions.java > people.json`
   lists vanilla's named people.
3. `node build.js <api> <data> rules.json people.json <out.json>` writes the definitions.
   `commands.js` is the rule-command table it reads, written by hand (one line per command:
   name | use | display | forms | summary).

Helpers used while writing `commands.js`, which print to the console:
- `digest.js <api>/com/fs/starfarer/api/impl/campaign/rulecmd`: what each rule command class
  extends and which parameters it reads.
- `data.js <data>`: star types, commodity and special item tags, faction keys.
- `ops.js <rules.csv>`: the comparison operators used in conditions.

## 0.98.5a.json (a patch on top of 0.98a.json)

Made by `../build-defs-0985a.cjs`; its usage is in its header. `cmddiff.js` was its first
version: it only lists new or removed actions of the multi-purpose commands
(`node cmddiff.js <api-old> <api-new> src/shared/defs/0.98a.json`).

## Game version probe

`manifest_probe.py` lists the ids in two installs' data so they can be compared. It was used for
TARGET-VERSION-ASSESSMENT.md §1.

## A new game version

Unzip the new `starfarer.api.zip`, then follow `build-defs-0985a.cjs`: it makes a patch file
against the previous full set, and the new commands' forms and summaries are written by hand.
