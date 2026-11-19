# Saga Forge user guide

Saga Forge is a desktop editor for the campaign side of Starsector mods: factions, people, items,
quests and dialog, star systems and the fleets the player meets. You plan a quest as a flow chart,
see each dialog the way the game will draw it, play it through in the editor, and export a mod
that works the way vanilla does, so it stays compatible with other mods.

This guide goes **tab by tab**. Every tab has two parts:

- **How it works**: what the tab is for, its parts, what it writes into your mod and where that
  shows up in game.
- **How to set up the basics**: short recipes for the common things you do there.

Each tab's section stands on its own. Read the one you need. When a recipe needs something from
another tab (a character for a quest, a place for a fleet), it links to that tab's recipe instead
of explaining it again.

**Reading it offline:** the same guide as one page with a contents sidebar and screenshots that
open full size is `guide.html` (open it in your browser). It is also a download on the
[Releases page](https://github.com/LastAi/Starsector-SagaForge/releases): `SagaForge-UserGuide-<version>.zip`.

## Contents

| Tab | What you do there |
|---|---|
| [Getting started and Settings](sections/settings.md) | Point Saga Forge at the game, choose your mods folder, create or open a mod, move a mod to a new game version |
| [Saga](sections/saga.md) | The whole mod at a glance: quest board, timeline, flags, test profiles, phrases, random pools, scatter, world events, progress events, the other mods it works with, its LunaLib settings page, MagicLib achievements, Nexerelin's quest skip |
| [Factions](sections/factions.md) | New factions, and changes to existing ones (yours or vanilla's) |
| [People](sections/people.md) | Characters: contacts, market staff, quest givers |
| [Items](sections/items.md) | Commodities and special items, such as a quest item |
| [Quests](sections/quests.md) | Quests and conversations as flow charts, with a dialog preview and Play mode |
| [Locations](sections/locations.md) | Star systems, planets, stations, markets, wrecks and caches |
| [Encounters](sections/encounters.md) | Fleets the player meets: for a quest, at new game, roaming |
| [Fleets](sections/fleets.md) | Named fleets with their own ships and captain, fleet type names |
| [Images](sections/images.md) | The mod's flags, crests, portraits, icons and illustrations |
| [Dialog](sections/dialog.md) | Browse every dialog rule of the game and your installed mods |
| [Problems](sections/problems.md) | What's missing or wrong before you export, and Check mod |
| [Export and Release](sections/export.md) | Write the game files, make a release zip, release an update |
| [Translation mods](sections/translation.md) | Translate a Saga Forge mod into another language, as a separate mod |

## Before you start

- **The game.** Saga Forge works with Starsector **0.98a** and **0.98.5a**. It only ever *reads*
  the game folder and the mods installed there; it writes only into the mod you are editing.
- **SagaLib.** Quests, people, star systems, encounters and the other runtime parts are exported
  as data that the free library mod **SagaLib** runs in game, so your mod needs no code. When your
  mod uses it, players need SagaLib (1.3 for content that depends on other mods) enabled next to your mod, and
  the export adds it to your `mod_info.json` dependencies, with the version your mod needs (see
  [Export the mod](sections/export.md#export-the-mod)).
- **Where to get them.** Saga Forge:
  [Starsector-SagaForge](https://github.com/LastAi/Starsector-SagaForge) (download the zip from
  Releases, unzip, run `Saga Forge.exe`). SagaLib:
  [Starsector-SagaLib](https://github.com/LastAi/Starsector-SagaLib).

## The example mod in the pictures

The screenshots show **Vanguard Compact**, Saga Forge's example mod (`VanguardCompact-1.0.1.zip`
on the same Releases page, or the `example` folder of the source): a small faction of free stations, its star
system Kestrel with Haven Station, Commodore Reyes, and the quest *The Lost Convoy*. You can open
it in Saga Forge and look at the same things as the pictures.

The guide's copy has a few extras the shipped example doesn't have, so every tab has something to
show: a random pool and the survey that rolls it, a loot table on a guarded cache, random
encounters, caches scattered across the sector, a world event scheduler with news items, a
progress event, a named fleet led by Reyes, a roaming supply fleet, and a German translation mod.
The pictures were taken on Starsector 0.98.5a.

## Words used in this guide

| Word | Meaning |
|---|---|
| **Vanilla** | The base game, without mods. |
| **The active mod** | The mod you are editing, picked in the header. Saga Forge writes only into this mod's folder. |
| **Id** | The name the game uses for something internally (`vgc_reyes`). Players never see it; saves remember things by it, so change it only with the app's **Change id…**. |
| **Prefix** | A few letters every id of your mod starts with (`vgc_`), so your ids never clash with other mods'. Saga Forge asks for it once per mod. |
| **Plans** | What Saga Forge saves (**Save**, Ctrl+S): your work, in the mod's `sagaforge` folder. The game doesn't read them. |
| **Export** | Writes the game files (`rules.csv`, `.faction` files, CSV rows, SagaLib's data) from your plans. Until you export, the game doesn't see your changes. |
| **Memory keys / flags** | Values the game remembers in a save, such as `$global.vgc_signal_heard`. Quests set and read them. |
| **Dev mode** | Starsector's developer mode (`devMode` in the game's `settings.json`). Test profiles are started from its menu (Ctrl+F9 with SagaLib). |
