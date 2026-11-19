// Hand-written rule command table for vanilla 0.98a. One line per command:
//   Name | use | display | forms | summary
// forms: alternatives separated by "||"; params separated by spaces: name:type, name:type? (optional),
// name:type* (rest), name:enum=a/b/c. An empty forms field means no parameters.
// use: s = script, c = condition, b = both.
module.exports = `
AbortMission|s|flow||Aborts the mission that BeginMission is offering (stored in a temp key).
AbortWait|s|none|handle:memoryKey|Cancels a Wait started earlier with the given handle.
AcceptMission|s|text||Accepts the mission that BeginMission is offering.
ActivateAbility|s|none|entity:entity ability:string|Activates an ability on an entity (e.g. a fleet).
AddAbility|s|text|ability:string slot:int?|Gives the player an ability, optionally into a given ability bar slot.
AddCommodity|s|text|commodity:commodity quantity:number withText:bool?|Adds (or removes, if negative) a commodity to the player's cargo and prints a gain/loss line.
AddCredits|s|text|amount:number|Gives the player credits (a leading "-" operator subtracts) and prints the change.
AddOption|s|options|order:number id:option text:text|Adds a dialog option at the given order.
AddPopGrowth|s|none|growth:number days:number description:string market:market?|Adds a temporary population growth modifier to a market.
AddPotentialContact|s|text|person:person?|Offers the person (default: active person) as a potential contact.
AddRemoveAnyItem|s|text|type:enum=RESOURCES/WEAPONS/FIGHTER_CHIP/SPECIAL id:string quantity:int || type:enum=SPECIAL id:specialItem data:string quantity:int|Adds or removes any cargo item (commodity, weapon, wing, special item) and prints a gain/loss line.
AddRemoveCommodity|s|text|commodity:commodity quantity:number withText:bool?|Adds or removes (negative or "-" operator) a commodity and prints a gain/loss line.
AddSelector|s|options|order:number result:memoryKey text:text color:color min:number max:number|Adds a slider selector to the options; the chosen value goes into a memory key.
AddShip|s|text|member:memoryKey|Adds a fleet member stored in a memory key to the player fleet.
AddShipToOtherFleet|s|none|member:memoryKey|Adds a fleet member stored in a memory key to the other fleet in the dialog.
AddStoryPoints|s|text|points:int|Gives the player story points.
AddText|s|text|text:text color:color?|Adds a paragraph to the text panel (tokens replaced), optionally colored.
AddTextSmall|s|text|text:text color:color?|Adds a paragraph in the small font to the text panel.
AddXP|s|text|xp:number|Gives the player experience points.
AdjustRep|s|text|faction:faction action:string || faction:faction limit:repLevel amount:repAmount|Changes the player's reputation with a faction (RepActions name, or custom: limit + amount in points).
AdjustRepActivePerson|s|text|action:string || limit:repLevel amount:repAmount|Changes the player's relationship with the active person.
AdjustRepPerson|b|text|person:person action:string || person:person limit:repLevel amount:repAmount|Changes the player's relationship with a person (id or memory key); true if it changed.
AnyNearbyFleetsHostileAndAware|c|none|faction:faction|True if any nearby fleet of the faction is hostile and aware of the player.
ApplyCRDamage|s|text|baseFP:number fpMult:number crMult:number description:string|Applies combat readiness damage to the player fleet.
ArePatrolsNearby|c|none|faction:faction range:number|True if patrols of the faction are within range.
BeginConversation|s|visual|person:person minimal:bool? showRelationship:bool?|Starts a conversation with a person (id or memory key) and shows them in the visual panel.
BeginMission|b|flow|mission:string accept:bool?|Creates a hub mission by id and offers it (optionally accepts it right away).
BroadcastCancelPlayerAction|s|none|range:number responseVariable:memoryKey|Tells nearby fleets that the player cancelled an action.
BroadcastPlayerAction|s|none|type:string range:number responseVariable:memoryKey|Tells nearby fleets about a player action (ActionType).
BroadcastPlayerWaitAction|s|none|handle:memoryKey type:string range:number responseVariable:memoryKey|Broadcasts a player action while waiting.
Call|b|flow|target:memoryKey method:string args:any*|Calls a method on a campaign event/mission object stored in memory (same as CallEvent).
CallEvent|b|flow|target:memoryKey method:string args:any*|Calls a method on a campaign event/mission object stored in memory.
CaresAboutTransponder|c|none||True if the other fleet cares whether the player's transponder is on.
CargoScan|s|text||Performs a cargo scan by the other fleet (customs) and stores the result.
CargoScanApplyResult|s|text||Applies the result of a cargo scan (fines, confiscation, reputation).
CheckSetting|c|none|setting:string|True if a boolean in settings.json is true.
ClearActiveMission|s|none||Clears the active mission of the rule-based dialog.
ClearText|s|text||Clears the text panel.
CustomsInspectionApplyRepLoss|s|text||Applies reputation loss for refusing a customs inspection.
CustomsInspectionApplyResult|s|text||Applies the result of a customs inspection.
CustomsInspectionGenerateResult|s|none||Works out the result of a customs inspection.
DeactivateAbility|s|none|entity:entity ability:string|Deactivates an ability on an entity.
DespawnEntity|s|none|entity:entity?|Fades out and removes an entity (default: the interaction target).
DismissDialog|s|flow|result:string?|Closes the dialog immediately.
DoCanAffordCheck|b|options|price:number option:option showTotal:bool?|Disables the option if the player can't afford the price; can print credits.
DumpMemory|s|text||Debug: prints memory contents to the text panel.
DwellerCMD|b|text|action:enum args:any*|Dweller / Shrouded Substrate encounter helper (multi-purpose).
EndConversation|s|flow|mode:enum=DO_NOT_FIRE/NO_CONTINUE?|Ends a conversation and returns to the entity's normal options (DO_NOT_FIRE / NO_CONTINUE change what fires next).
expire|s|none|key:memoryKey days:number|Sets a memory key to expire after a number of days.
FireAll|s|flow|trigger:trigger|Fires every rule that matches the trigger.
FireBest|b|flow|trigger:trigger keepOptions:bool?|Fires the best matching rule for the trigger.
FleetDesc|s|text||Prints a description of the other fleet.
GiveOtherFleetAssignment|s|none|assignment:string days:number actionText:string? target:entity?|Gives the other fleet an assignment (FleetAssignment name).
HA_CMD|b|text|action:enum args:any*|Hostile activity / Pather and pirate protection deal helper (multi-purpose).
HailPlayer|s|text||The other fleet hails the player (prints the hail text).
HasAttentionOfAuthorities|c|none||True if the player has the attention of local authorities.
HideFirstPerson|s|visual||Hides the first person in the visual panel.
HideMapMarker|s|visual||Hides the map marker shown with ShowMapMarker.
HideSecondPerson|s|visual||Hides the second person shown in the visual panel.
HideThirdPerson|s|visual||Hides the third person shown in the visual panel.
HideVisual|s|visual||Hides the visual panel.
Highlight|s|text|text:text*|Highlights the given strings in the last paragraph (same as SetTextHighlights).
HighlightComms|s|none||Highlights the comm directory entries.
HT_CMD|b|text|action:enum args:any*|Hyperspace topography / slipsurge helper (multi-purpose).
ImportanceAtLeast|c|none|importance:enum=VERY_LOW/LOW/MEDIUM/HIGH/VERY_HIGH test:enum=VERY_LOW/LOW/MEDIUM/HIGH/VERY_HIGH|Compares two PersonImportance values.
IncreaseSmugglingSuspicion|s|none|amount:number|Raises the market's suspicion of smuggling.
InstallCommSniffer|s|none||Installs a comm sniffer on the comm relay.
IsSeenByAnyFleet|c|none|faction:faction?|True if the player is seen by any fleet (optionally of a faction).
IsSeenByPatrols|c|none|faction:faction mustCareAboutTransponder:bool?|True if patrols of the faction can see the player.
IsSoughtByPatrols|c|none|faction:faction|True if patrols of the faction are looking for the player.
KantaCMD|b|text|action:enum args:any*|Kanta's protection and related pirate helper (multi-purpose).
LPTitheCalc|c|none||Computes the Luddic Path tithe for the player's colonies.
MakeFullySurveyed|s|none||Makes the target planet fully surveyed.
MakeHostileWhileTOff|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet hostile while the player's transponder is off.
MakeNearbyFleetsHostile|s|none|faction:faction range:number days:number makeAware:bool?|Makes nearby fleets of a faction hostile for a while.
MakeNearbyFleetsNonHostile|s|none|faction:faction reason:string range:number days:number|Makes nearby fleets of a faction non-hostile for a while.
MakeOptionOpenCore|s|options|option:option tab:enum=CHARACTER/FLEET/REFIT/CARGO/MAP/INTEL/OUTPOSTS mode:enum=NONE/SNEAK/OPEN? onlyTargetShortcut:bool?|Makes an option open a core UI tab (trade, refit, ...).
MakeOtherFleetAggressive|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet aggressive toward the player.
MakeOtherFleetAggressiveOnce|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet aggressive once.
MakeOtherFleetAllowDisengage|s|none|reason:string value:bool days:number? || value:bool|Lets the player disengage from the other fleet.
MakeOtherFleetAvoidContact|s|none|avoid:bool?|Makes the other fleet avoid the player.
MakeOtherFleetDoThing|s|none|id:string days:number text:string clear:bool?|Gives the other fleet a custom action with text for some days.
MakeOtherFleetGoAway|s|none|clearAssignments:bool?|Sends the other fleet away.
MakeOtherFleetHostile|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet hostile to the player.
MakeOtherFleetImportant|s|none|reason:string value:bool days:number? || value:bool|Marks the other fleet important (it won't despawn).
MakeOtherFleetLowRepImpact|s|none|reason:string value:bool days:number? || value:bool|Fighting the other fleet has a low reputation impact.
MakeOtherFleetNoRepImpact|s|none|reason:string value:bool days:number? || value:bool|Fighting the other fleet has no reputation impact.
MakeOtherFleetNonAggressive|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet non-aggressive.
MakeOtherFleetNonHostile|s|none|reason:string value:bool days:number? || value:bool|Makes the other fleet non-hostile to the player.
MakeOtherFleetPreventDisengage|s|none|reason:string value:bool days:number? || value:bool|Prevents the player from disengaging from the other fleet.
MakePlayerImmediatelyAttackable|s|none||Makes the player attackable by the other fleet right away.
MarketGainRandomRep|s|text||The player gains reputation with a random person at the market.
MarketReduceRandomRep|s|text||The player loses reputation with a random person at the market.
MovePersonToMarket|s|none|person:person market:market?|Moves a person to a market (default: current).
NGCAddCargo|s|none|type:enum=RESOURCES/WEAPONS/FIGHTER_CHIP/SPECIAL id:string quantity:number|New game: adds starting cargo.
NGCAddCharacterPoints|s|none|points:number|New game: adds character points.
NGCAddCredits|s|none|credits:number|New game: adds starting credits.
NGCAddDevStartingScript|s|none||New game: adds the dev-mode starting script.
NGCAddShip|s|visual|variant:variant|New game: adds a starting ship and shows it.
NGCAddShipSilent|s|none|variant:variant|New game: adds a starting ship without showing it.
NGCAddStandardStartingScript|s|none||New game: adds the standard starting script.
NGCCanSkipTutorial|c|none||New game: true if the tutorial can be skipped.
NGCDone|s|flow||New game: finishes character creation.
NGCRemoveCargo|s|none|type:enum=RESOURCES/WEAPONS/FIGHTER_CHIP/SPECIAL id:string quantity:number|New game: removes starting cargo.
NGCRemoveShip|s|none|variant:variant|New game: removes a starting ship.
NGCSetAptitude|s|none|aptitude:string level:number|New game: sets an aptitude level.
NGCSetCustom|s|none|key:string value:bool|New game: sets a custom flag.
NGCSetDifficulty|s|none|difficulty:string|New game: sets the difficulty.
NGCSetSkill|s|none|skill:string level:number|New game: sets a skill level.
NGCSetStartingLocation|s|none|location:string x:number y:number|New game: sets the starting location.
NGCSetWithTimePass|s|none|timePass:bool|New game: sets whether time passes at start.
NPCWantsComms|c|none||True if the other fleet wants to talk to the player.
OpenCommDirectory|s|flow||Opens the market's comm directory.
OpenComms|s|flow||Opens comms with the other fleet's commander.
OpenCoreTab|s|flow|tab:enum=CHARACTER/FLEET/REFIT/CARGO/MAP/INTEL/OUTPOSTS mode:enum=NONE/SNEAK/OPEN?|Opens a core UI tab (trade, refit, ...).
PaginatedOptions|s|options|textAndOptionPairs:any*|Shows options split over pages (pairs of text and option id).
PauseMusic|s|sound||Pauses the music.
PickCommsNPC|c|none||Picks a person from the comm directory to talk to.
Ping|s|visual|type:string entity:entity?|Shows a campaign map ping on an entity.
PK_CMD|b|text|action:enum args:any*|Planetkiller quest helper (multi-purpose).
PLAddEntry|s|none|text:string|Adds an entry to the player log.
PlayCustomMusic|s|sound|music:music|Plays a music track.
PlayerFleetHasFragmentShips|c|none||True if the player fleet has threat fragment ships.
PlayerFleetHasShipWithBaseHull|c|none|hull:hull|True if the player fleet has a ship with the base hull id.
PlayerFleetHasShipWithId|c|none|id:string|True if the player fleet has a ship with the fleet member id.
PlayerFleetHasShroudedShips|c|none||True if the player fleet has shrouded ships.
PlayerHasCargo|c|none|id:commodity quantity:number?|True if the player has at least the quantity (default 1) of an item.
PlaySound|s|sound|sound:sound|Plays a UI sound.
PrintDescription|s|text|index:int|Prints the interaction target's description text (1, 2 or 3).
ReinitDialog|s|flow||Reinitialises the dialog.
RemoveCommodity|s|text|commodity:commodity quantity:number withText:bool?|Removes a commodity from the player's cargo and prints a loss line.
RemoveContact|s|text|person:person?|Removes a person (default: active person) from the player's contacts.
RemoveOption|s|options|option:option|Removes an option.
RemoveShip|s|text|member:memoryKey|Removes a fleet member stored in a memory key from the player fleet.
RemoveShipWithBaseHull|s|text|hull:hull|Removes a ship with the base hull id from the player fleet.
RemoveShipWithId|s|text|id:string|Removes a ship with the fleet member id from the player fleet.
RepairAll|s|text|useSupplies:bool?|Repairs all ships in the player fleet.
RepairAvailable|c|none||True if repairs are available here.
RepairEnoughSupplies|c|none||True if the player has enough supplies for repairs.
RepairNeeded|c|none||True if the player fleet needs repairs.
RepGTE|c|none|faction:faction level:repLevel|True if the player's standing with the faction is at least the level.
RepIsAtBest|c|none|faction:faction level:repLevel|True if the player's standing with the faction is at most the level.
RepIsAtWorst|c|none|faction:faction level:repLevel|True if the player's standing with the faction is at least the level.
RepLTE|c|none|faction:faction level:repLevel|True if the player's standing with the faction is at most the level.
ResetActivePerson|s|visual||Clears the active person of the interaction target.
RestoreSavedVisual|s|visual||Restores the visual saved with SaveCurrentVisual.
ResumeNormalMusic|s|sound||Resumes the normal music.
RollProbability|c|none|probability:number|True with the given probability (0..1); seeded per target and month.
SaveCurrentVisual|s|visual||Saves the current visual panel so it can be restored.
SetActiveMission|s|none|mission:memoryKey|Sets the active mission of the rule-based dialog.
SetCodexEntryId|s|none|entry:string?|Sets the codex entry that F2 opens from the dialog.
SetColor|s|none|key:memoryKey color:color|Stores a color in a memory key.
SetEnabled|s|options|option:option enabled:bool|Enables or disables an option.
SetFlagship|s|none||Makes the other fleet's commander's ship its flagship.
SetHistorianBlurbShownAfterDelay|s|none|id:string|Marks a historian blurb as shown after a delay.
SetLater|s|none|key:memoryKey days:number|Sets a memory key to true after a delay in days.
SetNearbyFleetsVariable|s|none|range:number faction:faction key:memoryKey value:string days:number|Sets a memory key on nearby fleets of a faction.
SetOptionColor|s|options|option:option color:color|Sets an option's color.
SetOptionText|s|options|option:option text:text|Changes an option's text.
SetOtherFleetAllowJump|s|none|canJump:bool|Allows or prevents the other fleet from using jump points.
SetPersonHidden|s|none|person:person hidden:bool|Hides or shows a person in comm directories.
SetPersonPortrait|s|visual|person:person portrait:string|Changes a person's portrait (sprite key in the characters category).
SetPromptText|s|text|text:text|Sets the prompt text above the options.
SetShortcut|s|options|option:option key:string putLast:bool?|Sets an option's keyboard shortcut (e.g. ESCAPE).
SetStoryColor|s|options|option:option|Colors an option as a story option.
SetStoryOption|s|options|option:option sound:sound log:text || option:option points:int bonusXP:string sound:sound? log:text?|Makes an option cost story points (with bonus XP type, sound and log text).
SetTextHighlightColors|s|text|color:color*|Sets highlight colors for the last paragraph.
SetTextHighlights|s|text|text:text*|Highlights the given strings in the last paragraph.
SetTooltip|s|options|option:option tooltip:text|Sets an option's tooltip.
SetTooltipHighlightColors|s|options|option:option color:color*|Sets highlight colors for an option's tooltip.
SetTooltipHighlights|s|options|option:option text:text*|Highlights strings in an option's tooltip.
ShowDefaultVisual|s|visual||Shows the default visual for the interaction target (planet, station, fleet).
ShowFirstPerson|s|visual||Shows the first person (active person) in the visual panel.
ShowImageVisual|s|visual|illustration:illustration || category:illustrationCategory illustration:illustration|Shows an illustration in the visual panel.
ShowLargePlanet|s|visual||Shows the interaction target planet large in the visual panel.
ShowMapMarker|s|visual|entity:entity title:string? text:string?|Shows a map marker for an entity.
ShowPersonVisual|s|visual|minimal:bool? person:person?|Shows a person (default: active person / fleet commander) in the visual panel.
ShowPic|s|visual|illustration:illustration|Shows an illustration from the illustrations category.
ShowRemainingCapacity|s|text|commodity:commodity?|Shows the remaining cargo/fuel/crew capacity.
ShowResCost|s|text|commodity:commodity quantity:int consumed:bool? more:any*|Shows a resource cost panel (repeating commodity, quantity, consumed).
ShowSecondPerson|s|visual|person:person|Shows a second person in the visual panel.
ShowThirdPerson|s|visual|person:person|Shows a third person in the visual panel.
ShowThreatPersonVisual|s|visual||Shows the threat entity in the visual panel.
SubCredits|s|text|amount:number|Takes credits from the player and prints the change.
TakeRepCheck|s|none|faction:faction result:memoryKey|Checks a faction's reputation and stores the result.
TT_CMD|b|text|action:enum args:any*|Tri-Tachyon deal helper (multi-purpose).
UnhidePerson|s|none|person:person|Shows a hidden person in comm directories.
UninstallCommSniffer|s|none||Removes a comm sniffer from the comm relay.
UniqueEncounter|b|none|action:string id:string|Tracks unique encounters by id.
unset|s|none|key:memoryKey|Removes a memory key.
unsetAll|s|none|prefix:memoryKey|Removes all memory keys that start with the prefix.
UpdateMemory|s|none||Refreshes the dialog's memory map.
Wait|s|flow|handle:memoryKey days:number finished:memoryKey interrupted:memoryKey inProgress:memoryKey text:string|Waits a number of days with a progress bar; sets memory keys on finish/interrupt.
WasHistorianBlurbShown|c|none|id:string|True if a historian blurb was shown.
AddGAOfficerToCoatl|s|none||Galatia Academy: adds the Hegemony officer to Coatl.
CESetHidden|s|none|id:string hidden:bool|Galatia Academy: hides or shows a codex entry.
GAReduceRandomRep|s|text||Galatia Academy: reputation loss with a random person.
GenGAIntroAcademician|c|none||Galatia Academy: generates the intro academician.
ShowGAOfficer|s|visual||Galatia Academy: shows the Hegemony officer.
UnhideGACharacters|s|none||Galatia Academy: unhides the academy characters.
BarCMD|b|options|action:enum args:any*|Bar events (show options, accept, leave bar).
Commission|b|text|action:enum args:any*|Faction commission (accept, resign, print info, checks).
DeliveryMission|b|text|action:enum args:any*|Delivery missions (complete, check completion).
GateCMD|b|text|action:enum args:any*|Gates (select destination, scan, checks).
GateHaulerCMD|b|text|action:enum args:any*|Gate hauler (deploy, activate, checks).
MissionHubCMD|b|options|action:enum args:any*|Mission hub of a person.
ShrineCMD|b|text|action:enum args:any*|Luddic shrines.
NGC|b|none|action:enum args:any*|New game creation helper.
AddBarEvent|s|options|option:option optionText:text blurb:text color:color?|Adds a bar event option and blurb.
AddRaidObjective|s|none|icon:string name:text danger:enum=NONE/MINIMAL/LOW/MEDIUM/HIGH/EXTREME xp:int trigger:trigger showInCustomOnly:bool? tooltip:text?|Adds a custom raid objective.
AICores|b|text|action:enum args:any*|Turning in AI cores.
CargoPods|b|text|action:enum args:any*|Cargo pods (open, stabilize, destroy).
DemandCargo|b|text|action:enum args:any*|Fleet demanding cargo.
DistressResponse|b|text|action:enum args:any*|Distress call responses.
FactionFleetNearbyAndAware|c|none|faction:faction|True if a fleet of the faction is nearby and aware of the player.
HostileFleetNearbyAndAware|c|none||True if a hostile fleet is nearby and aware of the player.
MarketCMD|b|text|action:enum args:any*|Market defenses, raids, bombardment.
MiscCMD|b|text|action:enum args:any*|Misc helpers (intel, marine XP, ...).
Objectives|b|text|action:enum args:any*|Comm relays, nav buoys, sensor arrays (build, hack, ...).
PrintWreckDescription|s|text||Prints a description of a derelict ship.
RedPlanet|b|text|action:enum args:any*|Red planet quest helper.
RemoveBarEvent|s|options|option:option|Removes a bar event.
SalvageDefenderInteraction|s|flow||Starts the fight with salvage defenders.
SalvageEntity|b|text|action:enum args:any*|Salvage (cost, perform, debris, demolish).
SalvageGenFromSeed|s|none||Generates salvage and defenders from the entity's seed.
SalvageSpecialInteraction|s|flow||Runs the salvage special interaction.
ZGRTurnIn|b|text|action:enum args:any*|Turning in items to the ZGR.
ZigguratCMD|b|text|action:enum args:any*|Ziggurat quest helper.
`
