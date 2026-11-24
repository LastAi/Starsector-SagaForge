# User-experience test: build a mod from a story (task #67)

A dev's exercise (2026-11-21): the user builds a mod in Saga Forge from a story, following a plan that only says
*what* to make, never *how*. Wherever the user gets stuck, that step of the user experience can be
simplified: it's logged in UX-PASS.md (U26 onward) with the step number (S1…).

## The story: "The Other Captain" (working title)

Mostly comedy; no "right" ending; one questline.

- **John Starsector**, a walking disaster with good forged papers, has caused many deaths (a few on purpose, mostly
  by accident). So many orphans were left that a charity built **the Foundling Wheel**, an orphanage station. John
  steals from its charity fund and evades taxes under a stolen identity: the player's.
1. **The wrong name.** A Hegemony fleet stops the player for unpaid taxes in their name. Pay, bluff, flee or fight
   (sets where the crisis bar starts). Someone stole their identity.
2. **The trail.** The paper trail leads to John and the Wheel's charity fund; the crisis bar starts. John will be at
   the Wheel's charity gala.
3. **The Wheel.** Visit before the gala; meet the orphans **Orr** and **Phan**. How you treat them is remembered.
4. **The gala.** John's device knocks out the station's security so he can rob the gala, and the reactor's cooling
   with it. **Save the Wheel**: John escapes, the Wheel survives, Orr and Phan join you, the crisis bar drops.
   **Chase John**: he escapes anyway, but you get a clue; the Wheel is destroyed; Orr and Phan join John, not knowing
   he caused it; the crisis bar jumps.
5. **The reckoning.** Track John down (faster with the clue). Orr and Phan help you, or stand with John (tell them the
   truth or not). John: hand him over with the evidence, take his deal, let him go, or (orphans present) let them
   decide. The ending reflects the Wheel, the orphans, John and the crisis bar.
- **Crisis bar ("Hegemony warrant")**: fills over time, faster when fighting the Hegemony or with John's new crimes,
  and jumps if you chase John; drains with evidence brought to the tax collector, and drops if you save the Wheel.
  Stages: police patrol for you → bounty hunters → full: the Hegemony hunts you until your name is cleared.

## The plan (what to make, not how)

Names, places and wording are yours to choose.

**Setup**
- **S1.** Make a new mod for the story.

**The world**
- **S2.** Make the place where the Foundling Wheel is: a star system of your own, or a spot in an existing one.
- **S3.** Make the Foundling Wheel: an orphanage station with a market.
- **S4.** Make the people: John Starsector, Orr, Phan, the Hegemony tax collector and the Hegemony police officer. Put
  each one where the player can find them (the tax collector somewhere Hegemony).
- **S5.** Make the evidence items the player collects against John (e.g. forged papers, bank records, the clue from
  the chase).

**The fleets**
- **S6.** Make the Hegemony fleet that stops the player at the start.
- **S7.** Make the bounty hunters who come for the player when the crisis bar is high.
- **S8.** Make John's ship or fleet for the final chase.

**The crisis bar**
- **S9.** Make the "Hegemony warrant" crisis bar: what fills it, what drains it, and what happens at each stage
  (police patrols, then bounty hunters, then the Hegemony hunting the player).

**The quest**
- **S10.** Act 1: the Hegemony stop and its four ways out (pay, bluff, flee, fight). Each way sets where the crisis bar starts.
- **S11.** Act 2: following the trail to John and the Wheel. Start the crisis bar; the player learns about the gala.
- **S12.** Act 3: the visit to the Wheel and meeting Orr and Phan. Remember how the player treated them.
- **S13.** Act 4: the gala, the device, and the choice between saving the Wheel and chasing John. John always escapes.
  Saving keeps the Wheel and sends Orr and Phan to the player; chasing destroys the Wheel, gives the clue and sends Orr
  and Phan to John. Move the crisis bar either way.
- **S14.** Act 5: tracking John down and the confrontation, different depending on where Orr and Phan are. The four
  ways to deal with John.
- **S15.** The endings: show what became of the Wheel, Orr and Phan, John, and the player's name.
- **S16.** Evidence: let the player bring evidence to the tax collector to drain the crisis bar.

**Trying it**
- **S17.** Play through it in the editor: both gala choices, and at least two endings.
- **S18.** Fix what the editor's checks find.
- **S19.** Export it and play it in the game.

## Where the user got stuck

Logged as UX-PASS.md items (U26 onward), each with its step: | Step | What happened | UX item |

| Step | What happened | UX item |
|---|---|---|
| S2 | Choosing a Hegemony system for the Wheel: the Hyperspace map didn't show who owns a system or where the markets are. | U26 (fixed) |
| S2 | Hegemony showed red: read-only data mixed in every installed mod. Map labels small or cut by the rings; no edge of hyperspace; Limbo missing. | U27, U28, U29 (fixed) |
| S2 | Systems hard to hit on the map; the tooltip flickered; wanted to jump from a market to its planet. | U30 (fixed) |
| S2 | System view: could not pan by dragging; could not select a vanilla planet to see what it is. | U31 (fixed) |
| S3 | No reference for colony conditions; types and other lists show every installed mod, not the listed ones. | U32 (fixed), U33 (fixed), U34 (fixed) |
| S3 | Placing the Foundling Wheel: Appears looked reset to "when an Action places it" while Problems said its quest was missing (no quests yet); a pale planet hid its label. | U35, U36 (fixed) |
| S4 | Importing John's and Jane's portraits: a changed "Saved as" was ignored; no way to delete an image; wanted to keep the source pictures, see when a crop is enlarged, and reuse originals. | U38 (fixed) |
| S6 | The tax collector's fleet: Fleet type offered nex_specialForces (Nexerelin) as if it were vanilla; fleet types, music and other lists aren't filtered by the mod list. | task #86 |
| S6 | The tax collector's fleet: picking every ship one by one from all variants; wanted a vanilla ship set to start from and only the faction's ships in the list. | U39 (fixed) |
| S7 | The bounty hunters: wanted them partly random (some ships always, others by chance); fleets were either all random or all fixed. | U40 (built) |
| S7 | Making the hunters' fleets: wanted to copy a named fleet, pull a named fleet's ships into an extra group, and keep draft encounters and fleets out of the game. | U41 (fixed) |
| S7 | Back Taxes switched to a named fleet still warned about its old fleet type "t" (hidden fields of the earlier Ships choice). | U42 (fixed) |
| S10 | The Hegemony stop: making the fleet hail the player, block leaving and end the talk with pay / fight / flee took a second conversation of raw rule lines; a deleted comm dialog couldn't be unlinked. | U43 (fixed: Encounters › Hail, node groups and the Fleet response group) |
| S10 | Having the tax collector say his name: the token dropdown was long, listed every token twice and showed example names (Baikal Daud) instead of the conversation's person; the mod's people's name tokens weren't listed. | U44 (fixed: the token window, "$" autocomplete) |
| S9 | The crisis bar's conditions (Starts when, monthly factors): no reference explained conditions, and the fields were bare text boxes. (S1–S9 were then filled in for the user; see the session notes.) | U45 (fixed: the condition editor, Rules › Conditions) |
| S10–S16 | Filled in for the user (2026-11-24): the quest "The Other Captain" (toc_main: Acts 1–5 and the endings), the evidence hand-in at Arcadia Station (toc_evidence_turnin), and a fight choice plus way-out flags in the user's own Act 1 comm dialog. Built with a script (.userdata/toc) and checked with 240 play-through checks through the rules engine (every Act 1 way out, both gala choices, all five endings, the hand-in, a female player). | U47 (two bugs found and fixed) |
| S13 | The gala reworked into two scenes with pictures from the user's image library (generic_image_mod): the bar before the speech (gim_gala_bar) and the hall (gim_gala). The pictures didn't show up: the library had never been exported. Switching mods with unsaved changes then left the user stuck. | U49, U48 (fixed) |
| S9 | The crisis bar's "fought the Hegemony" factor: nothing set its flag when a patrol the bar sent was beaten (only a quest's Encounter node had outcomes). | U46 (fixed: Encounters › Outcomes › When defeated) |
