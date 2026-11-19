# Parked work

Work that was built and then put on hold. Each entry says what it is, where it stands, and how to
bring it back.

## Random sector (Nexerelin), from task #61: on hold since 2026-11-18

Descoped by the user on 2026-11-18, after it was built and its random-sector in-game check had
passed: "best to descope all random sector support for now". The rest of #61 (markets changing
owner, invasion protection, the contact-post warning, and quests refused when a place they need is
missing) stayed in. The design is PLAN.md §10.3, "Random sector"; Nexerelin's facts are in
FORMATS.md, "Nexerelin 0.12.2d" ("Checked for task #61").

**What it was:**
- **Sector** in every Mods field: hand-made only, random only, both (keep), automatic.
  - Rules: `!$global.nex_randomSector` / `$global.nex_randomSector` (no SagaLib needed).
  - SagaLib JSON: `"sector"` (`ModGate.sector`, `Mods.blocked`).
- **Automatic "only in the hand-made sector"** (`moduses.ts`): content naming vanilla's markets,
  systems, planets or people. It applied only when the mod listed Nexerelin, and spread to what only
  that content uses.
- **Problems, three choices** (`checks/nexerelin.ts`):
  - Only in the hand-made sector.
  - Use a random target (`nexerelin.ts` `useRandomTarget`: a market target like the place,
    replacing markers, Arrive places, named places, pictures and `$id ==` lines).
  - Keep.
- **Switches and checks:**
  - A random-sector switch in Play mode and the Test context.
  - The combination check counted a random sector as one more combination.
- **SagaLib:**
  - The sector log line at new game.
  - The sector line in dev menu › Mods.
  - The golden steps for the sector in `places.json`.

**What was checked in game** (INGAME-CHECKS.md, "Task #61", "Before the descope"):
- In a random sector everything passed:
  - The hand-made-only quest, person and Corvus additions were skipped with log lines.
  - The random-target version was offered and completed.
  - Nexerelin sets its flag before the mods' `onNewGame`.
- The hand-made-sector check wasn't run.

**To bring it back** (from `D:\ModTools`; check with `--check` first):

```
git apply tools/saga-forge/docs/parked/random-sector.patch
git apply tools/saga-forge/docs/parked/random-sector-docs.patch
```

- `random-sector.patch` restores the code, the tests, the test mod fixture (the three Jangala
  quests, the clerk, the Corvus buoy) and the golden steps.
- `random-sector-docs.patch` restores the SagaLib FORMAT.md and CHANGELOG text, the editor
  CHANGELOG entry, and the guide's recipe "Plan for Nexerelin's random sector".

Both were made against the tree of 2026-11-18. After other changes they may need resolving by hand
(`git apply --3way`). Then:
- rebuild SagaLib (`bash build.sh`) and the test mod (`npx jiti scripts/build-test-mod.ts sixtyone_a`);
- run `npm test`;
- put the old check list back into INGAME-CHECKS.md (below).

**The in-game checks it had** (the test mod's old content):

```
(a) Random sector: hand-made-only content is skipped, the random-target version is offered
  1. New game with Nexerelin's "random core worlds" on. Ctrl+F9 › "61: go to Test Range 61".
  2. starsector.log: "[SagaLib] Nexerelin random sector: content that needs vanilla's hand-made
     sector is skipped", "skipped person soa_clerk …", "skipped system corvus …".
  3. Ctrl+F9 › Mods: "Sector: Nexerelin random sector"; skipped: quest soa_handmade, person
     soa_clerk, system corvus.
  4. Range Control 61: "Test 61, Jangala (only in the hand-made sector)" is NOT offered.
  5. "Test 61, a market like Jangala (random target)": accept, fly to the marked market, report: done.
  6. "Test 61, Jangala (kept, refused when missing)": accept: no journal entry; the log says
     "skipped quest soa_kept: needs place jangala, which doesn't exist in this game".

(b) Hand-made sector: the content runs
  1. New game with the hand-made core worlds. Ctrl+F9 › "61: go to Test Range 61".
  2. starsector.log: "[SagaLib] sector: hand-made core worlds"; no "skipped" lines for sixtyone_a.
  3. Range Control 61 offers all three Jangala quests; the hand-made one runs to Jangala and completes.
  4. Jangala's comm directory lists Ines Calder; Corvus has "Test Buoy 61".
```

**Open points for when it comes back:**
- The hand-made check (b) was never run.
- Task #71 (option-start quests stay offered; target tokens in an offer) was found during this check.
- Nexerelin's own landmarks in a random sector (Galatia Academy, Kanta's Den, Prism Freeport) count
  as hand-made by default.
