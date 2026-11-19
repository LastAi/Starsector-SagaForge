// Builds tools/saga-forge/src/shared/defs/0.98a.json from the extracted API sources + vanilla data.
// Usage: node build.js <apiRoot> <starsector-core/data> <rules.json> <people.json> <out.json>
const fs = require('fs'), path = require('path')
const [API, DATA, RULES, PEOPLE, OUT] = process.argv.slice(2)
const rules = JSON.parse(fs.readFileSync(RULES, 'utf8'))
const people = JSON.parse(fs.readFileSync(PEOPLE, 'utf8'))
const IDS = path.join(API, 'com/fs/starfarer/api/impl/campaign/ids')
const RC = path.join(API, 'com/fs/starfarer/api/impl/campaign/rulecmd')
const warn = []

// ---------- rule commands ----------
const classes = {}
;(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (f !== 'special') walk(p); continue }
    if (!f.endsWith('.java')) continue
    const name = f.slice(0, -5)
    if (['BaseCommandPlugin', 'FleetAdvanceScript', 'PaginatedOptionsExample'].includes(name)) continue
    const rel = path.relative(path.join(API), p).replace(/\\/g, '/').slice(0, -5)
    classes[name] = { className: rel.replace(/\//g, '.'), src: fs.readFileSync(p, 'utf8') }
  }
})(RC)

function actions(src) {
  const set = new Set()
  for (const m of src.matchAll(/\b(?:command|action)\.equals\("([^"]+)"\)/g)) set.add(m[1])
  for (const m of src.matchAll(/"([^"]+)"\.equals\((?:command|action)\)/g)) set.add(m[1])
  for (const m of src.matchAll(/case\s+"([^"]+)"\s*:/g)) set.add(m[1])
  return [...set]
}
const SUM = { s: 'script', c: 'condition', b: 'both' }
function parseParam(tok, cls) {
  const m = tok.match(/^(\w+):(\w+)(=([^?*]+))?([?*]?)$/)
  if (!m) throw new Error('bad param ' + tok + ' in ' + cls)
  const p = { name: m[1], type: m[2] }
  if (m[5] === '?') p.optional = true
  if (m[5] === '*') p.rest = true
  if (p.type === 'enum') {
    p.values = m[4] ? m[4].split('/') : actions(classes[cls] ? classes[cls].src : '')
    if (!p.values.length) { p.type = 'string'; delete p.values }
  }
  return p
}
const ruleCommands = []
const table = require('./commands.js').trim().split('\n').filter(l => l.trim())
for (const line of table) {
  const [name, use, display, forms, summary] = line.split('|')
  if (!classes[name]) { warn.push('no class for ' + name); continue }
  const f = forms.trim() ? forms.split('||').map(fm => fm.trim().split(/\s+/).map(t => parseParam(t, name))) : [[]]
  ruleCommands.push({ name, use: SUM[use], className: 'com.fs.starfarer.api.' + classes[name].className.replace(/^com\.fs\.starfarer\.api\./, ''), provider: 'vanilla', forms: f, display, summary })
  classes[name].done = true
}
for (const [n, c] of Object.entries(classes)) if (!c.done) warn.push('class without entry: ' + n)
// RepActions enum for the AdjustRep* "action" param
const repSrc = fs.readFileSync(path.join(API, 'com/fs/starfarer/api/impl/campaign/CoreReputationPlugin.java'), 'utf8')
const repBlock = repSrc.match(/enum RepActions\s*\{([\s\S]*?);/)[1].replace(/\/\/.*$/gm, '')
const repActions = repBlock.split(',').map(s => s.trim()).filter(s => /^[A-Z_]+$/.test(s) && s !== 'CUSTOM')
for (const c of ruleCommands) if (c.name.startsWith('AdjustRep')) for (const f of c.forms) for (const p of f) if (p.name === 'action') { p.type = 'enum'; p.values = repActions }
// Cross-check use against rules.csv usage
for (const c of ruleCommands) {
  const inC = rules.CC[c.name] || 0, inS = rules.SC[c.name] || 0
  if (c.use === 'condition' && inS) warn.push(`${c.name} marked condition but used ${inS}x as script`)
  if (c.use === 'script' && inC) warn.push(`${c.name} marked script but used ${inC}x as condition`)
}
// SagaLib commands
const Q = { name: 'quest', type: 'string' }, S = { name: 'step', type: 'string' }, E = { name: 'encounter', type: 'string' }
const sl = (name, use, display, forms, summary) => ruleCommands.push({ name, use, className: 'lastai.sagalib.rulecmd.' + name, provider: 'sagalib', forms, display, summary })
sl('SF_Start', 'script', 'none', [[Q]], 'Starts a Saga Forge quest.')
sl('SF_Step', 'script', 'none', [[Q, S]], 'Moves a quest to a step.')
sl('SF_End', 'script', 'none', [[Q, { name: 'result', type: 'enum', values: ['success', 'fail'] }]], 'Ends a quest with success or failure.')
sl('SF_Reward', 'script', 'text', [[Q, { name: 'reward', type: 'string' }]], 'Gives one of a quest\'s rewards and prints it.')
sl('SF_Spawn', 'script', 'none', [[E]], 'Spawns an encounter.')
sl('SF_Despawn', 'script', 'none', [[E]], 'Removes a spawned encounter.')
sl('SF_AtStep', 'condition', 'none', [[Q, S]], 'True if the quest is active and at the step.')
sl('SF_QuestDone', 'condition', 'none', [[Q, { name: 'result', type: 'enum', values: ['success', 'fail', 'any'], optional: true }]], 'True if the quest has ended (optionally with the given result; default any).')
sl('SF_QuestState', 'condition', 'none', [[Q, { name: 'state', type: 'enum', values: ['notStarted', 'active', 'success', 'fail'] }]], 'True if the quest is in the given state.')
sl('SF_ShowPlanetInfo', 'script', 'visual', [[{ name: 'entity', type: 'entity' }]], 'Shows a planet or station with its info in the visual panel.')
sl('SF_ShowFleets', 'script', 'visual', [[{ name: 'encounterOrFleetKey', type: 'string' }]], 'Shows an encounter\'s fleet (or a fleet in a memory key) in the visual panel.')
sl('SF_ShowShip', 'script', 'visual', [[{ name: 'hullOrVariant', type: 'variant' }]], 'Shows a ship (hull or variant id) in the visual panel.')
sl('SF_Show', 'script', 'text', [[{ name: 'kind', type: 'enum', values: ['image', 'faction', 'ships', 'cargo', 'heading', 'skills'] }, { name: 'args', type: 'any', rest: true }]], 'Adds a panel to the text area: image, faction, ships, cargo, heading or skills.')
sl('SF_Phrase', 'condition', 'none', [[{ name: 'token', type: 'string' }]], 'True if a phrase token has text (optional phrases).')

// ---------- triggers ----------
const TRIG = {
  OpenInteractionDialog: 'An interaction dialog opens (planet, station, fleet, entity); add the first text and options.',
  PopulateOptions: 'Fill in the options for the current state (fired after other triggers and by FireAll PopulateOptions).',
  DialogOptionSelected: 'The player picked an option; condition $option == <option id>.',
  PickGreeting: 'Pick the greeting text when comms open with a person or fleet.',
  OpenCommLink: 'Comms open with a fleet or a person in a comm directory.',
  BeginFleetEncounter: 'A fleet encounter dialog begins (the other fleet engages or the player interacts).',
  RelationshipLevelDesc: 'Prints a description of the relationship level with the faction.',
  RelLevelMoreDescription: 'Extra text after the relationship level description.',
  MarketPostDock: 'After docking at a market, before the market options.',
  MarketPostOpen: 'After the market dialog opens.',
  TradePanelFlavorText: 'Flavor text shown on the trade screen.',
  HistorianBackstoryBlurb: 'A historian backstory blurb for the current entity.',
  AddBarEvents: 'Building the bar: add bar event options.',
  ReturnFromBar: 'Returning from the bar to the market.',
  BarPrintDesc: 'Prints the bar description.',
  NewGameOptionSelected: 'New game creation: an option was picked.',
  AddNewGameChoices: 'New game creation: add the choices.',
  BeginNewGameCreation: 'New game creation starts.',
  ShowSalvageEntityDetails: 'Shows details of a salvageable entity.',
  BeginSalvage: 'The player starts salvaging.',
  PerformSalvage: 'Salvage is performed.',
  CheckSalvageSpecial: 'Checks for a salvage special after salvaging.',
  SalvageSpecialFinished: 'A salvage special interaction finished.',
  SalvageSpecialFinishedNoContinue: 'A salvage special finished without a continue option.',
  BeatDefendersContinue: 'After beating the defenders of an entity.',
  TriggerAutomatedDefenses: 'Automated defenses of an entity activate.',
  PopulateSalvageOptions1: 'Salvage options (first set).',
  PopulateSalvageOptions2: 'Salvage options (second set).',
  PostShipRecoverySpecial: 'After the ship recovery special.',
  ShipRecoveryCustomText: 'Custom text for ship recovery.',
  PostGroundRaid: 'After a ground raid.',
  CargoPodsOptions: 'Options for a cargo pods entity.',
  CargoPodsOptionsUpdate: 'Updates the cargo pods options.',
  AICoresTurnedIn: 'After AI cores are turned in.',
  ZGRItemsTurnedIn: 'After items are turned in to the ZGR.',
  CPCBlueprintsPicked: 'After blueprints were picked.',
  SubstrateWeaponsPicked: 'After shrouded substrate weapons were picked.',
  FoodShortageEndedByPlayerSale: 'The player ended a food shortage by selling food.',
  BarEventFinished: 'A bar event finished.',
  BarEventFinishedNoContinue: 'A bar event finished without a continue option.',
  OngoingBattleEncounter: 'The player joins an ongoing battle.',
  WormholeDeploymentFinished: 'A wormhole anchor deployment finished.',
  MHPostMissionListText: 'Text after a mission hub mission list.',
  CustomsInspectionPayOptions: 'Options to pay during a customs inspection.',
  CommBurstCustomsInspection: 'A customs inspection comm burst.',
  CustomsInspectionEndPeaceful: 'A customs inspection ended peacefully.',
  TOffScanResult: 'Result of a scan with the transponder off.',
  CargoScanResult: 'Result of a cargo scan.',
  PopulateOptionsHire: 'Options for hiring (officers, mercenaries).',
  PickGreetingActive: 'Greeting for an active person.',
  ContactPrintAcceptText: 'Text when a contact is accepted.',
  ContactPostAccept: 'After a contact is accepted.',
  NPCCommsRequest: 'An NPC requests comms with the player.',
  ConfirmNPCWantsToTalk: 'Confirms that an NPC wants to talk.',
  GenericMissionReturn: 'Returning to a mission giver.',
  PopulateGateOptions: 'Options for a gate.',
  OutpostEstablished: 'An outpost was established.',
  StrandedInDeepSpace: 'The player is stranded in deep space.',
}
const allT = Object.entries(rules.T).filter(([t]) => /^[A-Za-z_][\w]*$/.test(t))
const triggers = []
for (const [t, s] of Object.entries(TRIG)) triggers.push({ name: t, summary: s + (rules.T[t] ? ` (${rules.T[t]} vanilla rule${rules.T[t] > 1 ? 's' : ''})` : ' (fired from code; no vanilla rules use it)') })
for (const [t, n] of allT.sort((a, b) => a[0].localeCompare(b[0]))) if (!TRIG[t]) triggers.push({ name: t, summary: `Content trigger fired from other rules with FireBest/FireAll (${n} vanilla rule${n > 1 ? 's' : ''}).` })

// ---------- tokens ----------
const tk = (token, group, sample, summary) => ({ token, summary, sample, group })
const tokens = [
  tk('$playerName', 'player', 'Varga Okonkwo', 'Player\'s full name. Tokens are matched case-sensitively: the game registers explicit case variants ($playerName, $PlayerName, $playername, $Playername).'),
  tk('$PlayerName', 'player', 'Varga Okonkwo', 'Player\'s full name (case variant).'),
  tk('$playerFirstName', 'player', 'Varga', 'Player\'s first name (also $playerFirstname).'),
  tk('$playerLastName', 'player', 'Okonkwo', 'Player\'s last name (also $playerLastname); falls back to the first name if empty.'),
  tk('$playerSirOrMadam', 'player', 'sir', '"sir" / "ma\'am" (or the player\'s honorific), lower case.'),
  tk('$PlayerSirOrMadam', 'player', 'Sir', '"Sir" / "Ma\'am" (or the honorific), capitalised.'),
  tk('$playerBrotherOrSister', 'player', 'brother', '"brother" / "sister" (or "walker").'),
  tk('$PlayerBrotherOrSister', 'player', 'Brother', 'Capitalised $playerBrotherOrSister.'),
  tk('$playerHisOrHer', 'player', 'his', 'Player pronoun: his/her.'),
  tk('$PlayerHisOrHer', 'player', 'His', 'Player pronoun: His/Her.'),
  tk('$playerHimOrHer', 'player', 'him', 'Player pronoun: him/her.'),
  tk('$PlayerHimOrHer', 'player', 'Him', 'Player pronoun: Him/Her.'),
  tk('$playerHeOrShe', 'player', 'he', 'Player pronoun: he/she.'),
  tk('$PlayerHeOrShe', 'player', 'He', 'Player pronoun: He/She.'),
  tk('$shipOrFleet', 'fleet', 'fleet', '"ship" if the player fleet has one ship (or "fighter wing"), else "fleet". Also $fleetOrShip.'),
  tk('$ShipOrFleet', 'fleet', 'Fleet', 'Capitalised $shipOrFleet. Also $FleetOrShip.'),
  tk('$otherShipOrFleet', 'fleet', 'fleet', '"ship" or "fleet" for the other fleet in the dialog.'),
  tk('$otherFleetName', 'fleet', 'hegemony patrol', 'The other fleet\'s name, lower case.'),
  tk('$fleetName', 'entity', 'hegemony patrol', 'The interaction target\'s name, lower case.'),
  tk('$entityName', 'entity', 'Jangala', 'The interaction target\'s name.'),
  tk('$relayName', 'entity', 'Corvus Relay', 'The interaction target\'s name (for comm relays).'),
  tk('$nameInText', 'entity', 'comm relay', 'Custom entity: name as used in a sentence.'),
  tk('$shortName', 'entity', 'relay', 'Custom entity: short name.'),
  tk('$isOrAre', 'entity', 'is', 'Custom entity: "is" or "are".'),
  tk('$aOrAn', 'entity', 'a', 'Custom entity: "a" or "an".'),
  tk('$marketName', 'market', 'Jangala', 'Market name.'),
  tk('$MarketName', 'market', 'Jangala', 'Market name (case variant).'),
  tk('$marketSystem', 'market', 'Corvus star system', '"<system> star system" or "hyperspace".'),
  tk('$playerHostileTimeoutStr', 'market', '3 days', 'Time until the market forgets the player\'s hostile activity.'),
  tk('$faction', 'faction', 'Hegemony', 'Target\'s faction: entity name prefix or display name.'),
  tk('$Faction', 'faction', 'Hegemony', 'Capitalised $faction.'),
  tk('$theFaction', 'faction', 'the Hegemony', 'Faction display name with article.'),
  tk('$TheFaction', 'faction', 'The Hegemony', 'Capitalised $theFaction.'),
  tk('$factionLong', 'faction', 'Hegemony', 'Faction long display name.'),
  tk('$FactionLong', 'faction', 'Hegemony', 'Capitalised $factionLong.'),
  tk('$theFactionLong', 'faction', 'the Hegemony', 'Faction long display name with article.'),
  tk('$TheFactionLong', 'faction', 'The Hegemony', 'Capitalised $theFactionLong.'),
  tk('$factionIsOrAre', 'faction', 'is', 'Faction "is" / "are".'),
  tk('$factionAOrAn', 'faction', 'a', 'Faction person prefix "a" / "an".'),
  tk('$ownerFaction', 'faction', 'Hegemony', 'Same as $faction (also $OwnerFaction, $theOwnerFaction, $TheOwnerFaction).'),
  tk('$marketFaction', 'faction', 'Hegemony', 'Same as $faction (also $MarketFaction, $theMarketFaction, $TheMarketFaction).'),
  tk('$relAdjective', 'faction', 'neutral', 'Target faction\'s relationship level with the player, lower case.'),
  tk('$personName', 'person', 'Baikal Daud', 'Active person\'s full name (or fleet commander).'),
  tk('$PersonName', 'person', 'Baikal Daud', 'Active person\'s full name (case variant).'),
  tk('$personFirstName', 'person', 'Baikal', 'Active person\'s first name.'),
  tk('$personLastName', 'person', 'Daud', 'Active person\'s last name.'),
  tk('$personRank', 'person', 'commander', 'Active person\'s rank, lower case.'),
  tk('$PersonRank', 'person', 'Commander', 'Active person\'s rank, capitalised.'),
  tk('$personPost', 'person', 'station commander', 'Active person\'s post, lower case.'),
  tk('$PersonPost', 'person', 'Station commander', 'Active person\'s post, capitalised.'),
  tk('$heOrShe', 'person', 'he', 'Active person pronoun: he/she.'),
  tk('$HeOrShe', 'person', 'He', 'Active person pronoun: He/She.'),
  tk('$hisOrHer', 'person', 'his', 'Active person pronoun: his/her.'),
  tk('$HisOrHer', 'person', 'His', 'Active person pronoun: His/Her.'),
  tk('$himOrHer', 'person', 'him', 'Active person pronoun: him/her.'),
  tk('$HimOrHer', 'person', 'Him', 'Active person pronoun: Him/Her.'),
  tk('$himOrHerself', 'person', 'himself', 'Active person: himself/herself.'),
  tk('$HimOrHerself', 'person', 'Himself', 'Active person: Himself/Herself.'),
  tk('$manOrWoman', 'person', 'man', 'Active person: man/woman.'),
  tk('$ManOrWoman', 'person', 'Man', 'Active person: Man/Woman.'),
  tk('$brotherOrSister', 'person', 'brother', 'Active person: brother/sister.'),
  tk('$BrotherOrSister', 'person', 'Brother', 'Active person: Brother/Sister.'),
  tk('$sirOrMadam', 'person', 'sir', 'Active person: sir/ma\'am.'),
  tk('$SirOrMadam', 'person', 'Sir', 'Active person: Sir/Ma\'am.'),
  tk('$personFaction', 'person', 'Hegemony', 'Active person\'s faction (prefix or name); also $PersonFaction.'),
  tk('$thePersonFaction', 'person', 'the Hegemony', 'Active person\'s faction with article; also $ThePersonFaction.'),
  tk('$personFactionLong', 'person', 'Hegemony', 'Active person\'s faction long name; also $PersonFactionLong, $thePersonFactionLong, $ThePersonFactionLong.'),
  tk('$personFactionIsOrAre', 'person', 'is', 'Active person\'s faction "is" / "are".'),
  tk('$rank', 'person', 'Commander', 'Memory value $rank of the person (any memory key can be used as a token, e.g. $global.foo, $player.credits).'),
  tk('$post', 'person', 'Station Commander', 'Memory value $post of the person.'),
  tk('$name', 'other', 'Jangala', 'Memory value $name of the local memory (entity or person name).'),
]

// ---------- memory keys ----------
const mk = (key, type, summary) => ({ key, type, summary })
const memoryKeys = [
  mk('$option', 'string', 'Id of the option the player just picked (DialogOptionSelected).'),
  mk('$id', 'string', 'Id of the interaction target or active person (local memory).'),
  mk('$faction.id', 'string', 'Id of the target\'s faction.'),
  mk('$faction.rel', 'number', 'Player\'s relationship with the target\'s faction (-1..1).'),
  mk('$faction.relValue', 'number', 'Player\'s relationship value with the target\'s faction.'),
  mk('$faction.isHostile', 'bool', 'Target\'s faction is hostile to the player.'),
  mk('$faction.friendlyToPlayer', 'bool', 'Target\'s faction is friendly to the player.'),
  mk('$faction.neutralToPlayer', 'bool', 'Target\'s faction is neutral to the player.'),
  mk('$faction.isNeutralFaction', 'bool', 'Target\'s faction is the neutral faction.'),
  mk('$faction.c:allowsTransponderOffTrade', 'bool', 'Faction custom flag (faction file "custom" block); $faction.c:<key> reads any custom value.'),
  mk('$faction.c:offersCommissions', 'bool', 'Faction custom flag: offers commissions.'),
  mk('$personFaction.id', 'string', 'Id of the active person\'s faction.'),
  mk('$market.id', 'string', 'Id of the market.'),
  mk('$market.isPlanetConditionMarketOnly', 'bool', 'The "market" only holds planet conditions (uncolonised planet).'),
  mk('$market.isSurveyed', 'bool', 'Planet is fully surveyed.'),
  mk('$market.isPlayerOwned', 'bool', 'Market belongs to the player.'),
  mk('$market.ruinsExplored', 'bool', 'Ruins on the planet were explored.'),
  mk('$market.hasRuins', 'bool', 'Planet has ruins.'),
  mk('$market.hasUnexploredRuins', 'bool', 'Planet has unexplored ruins.'),
  mk('$market.isHidden', 'bool', 'Market is hidden.'),
  mk('$market.talkingAtBar', 'bool', 'Conversation happens at the bar.'),
  mk('$marketSize', 'number', 'Size of the market (3..10).'),
  mk('$stability', 'number', 'Market stability.'),
  mk('$hasMarket', 'bool', 'Interaction target has a market.'),
  mk('$tradeMode', 'string', 'Trade mode: OPEN, SNEAK or NONE.'),
  mk('$isPerson', 'bool', 'Talking to a person (not a fleet or entity).'),
  mk('$isContact', 'bool', 'Active person is one of the player\'s contacts.'),
  mk('$postId', 'string', 'Post id of the active person (see posts).'),
  mk('$rankId', 'string', 'Rank id of the active person (see ranks).'),
  mk('$voice', 'string', 'Voice of the active person (see voices).'),
  mk('$importance', 'string', 'Importance of the active person (VERY_LOW..VERY_HIGH).'),
  mk('$customType', 'string', 'Custom entity type of the target (e.g. comm_relay, derelict_ship).'),
  mk('$menuState', 'string', 'Current menu state of the market dialog.'),
  mk('$entity.id', 'string', 'Id of the interaction target.'),
  mk('$entity.relativeStrength', 'number', 'Strength of the other fleet relative to the player\'s.'),
  mk('$entity.isHostile', 'bool', 'The other fleet / entity is hostile.'),
  mk('$entity.ignorePlayerCommRequests', 'bool', 'The other fleet ignores comm requests.'),
  mk('$entity.doingCustomsInspection', 'bool', 'The other fleet is doing a customs inspection.'),
  mk('$entity.weakerThanPlayerButHolding', 'bool', 'The other fleet is weaker but holds its ground.'),
  mk('$entity.isTradeFleet', 'bool', 'The other fleet is a trade fleet.'),
  mk('$entity.isScavenger', 'bool', 'The other fleet is a scavenger fleet.'),
  mk('$entity.locationId', 'string', 'Id of the location (star system) of the target.'),
  mk('$ignorePlayerCommRequests', 'bool', 'Local: ignore comm requests.'),
  mk('$isHostile', 'bool', 'Local: the target is hostile.'),
  mk('$hasDefenders', 'bool', 'The entity has defenders.'),
  mk('$defenderFleetDefeated', 'bool', 'The entity\'s defenders were beaten.'),
  mk('$tag:salvageable', 'bool', 'The target has the tag (any $tag:<tag> works, e.g. $tag:gate, $tag:comm_relay, $tag:gas_giant).'),
  mk('$tag:gate', 'bool', 'The target is a gate.'),
  mk('$tag:comm_relay', 'bool', 'The target is a comm relay.'),
  mk('$tag:gas_giant', 'bool', 'The target is a gas giant.'),
  mk('$player.transponderOn', 'bool', 'The player\'s transponder is on.'),
  mk('$player.credits', 'number', 'Player credits.'),
  mk('$player.supplies', 'number', 'Supplies in the player\'s cargo.'),
  mk('$player.fuel', 'number', 'Fuel in the player\'s cargo.'),
  mk('$player.crew', 'number', 'Crew in the player fleet.'),
  mk('$player.marines', 'number', 'Marines in the player fleet.'),
  mk('$player.fleetPoints', 'number', 'Fleet points of the player fleet.'),
  mk('$player.numShips', 'number', 'Number of ships in the player fleet.'),
  mk('$player.maxCombatHullSize', 'number', 'Largest combat hull size in the player fleet.'),
  mk('$player.crewRoom', 'number', 'Free crew capacity.'),
  mk('$player.numColonies', 'number', 'Number of player colonies.'),
  mk('$player.commissionFactionId', 'string', 'Faction the player holds a commission with.'),
  mk('$player.fcm_faction', 'string', 'Faction of the player\'s commission (faction commission mission).'),
  mk('$player.isLeagueMember', 'bool', 'The player\'s colonies are in the Persean League.'),
  mk('$player.atrocities', 'number', 'Number of atrocities (saturation bombardments) committed.'),
  mk('$player.untrustworthy', 'number', 'Untrustworthiness score.'),
  mk('$player.locationId', 'string', 'Id of the player\'s current location.'),
  mk('$global.isDevMode', 'bool', 'Dev mode is on.'),
  mk('$global.daysSinceStart', 'number', 'Days since the game started.'),
  mk('$global.isInTutorial', 'bool', 'The tutorial is running.'),
  mk('$global.tradePanelMode', 'string', 'Mode of the trade panel.'),
  mk('$global.gatesActive', 'bool', 'Gates have been activated.'),
  mk('$global.playerCanUseGates', 'bool', 'The player can use gates.'),
  mk('$global.canScanGates', 'bool', 'The player can scan gates.'),
  mk('$global.numGatesScanned', 'number', 'Number of gates scanned.'),
  mk('$gateScanned', 'bool', 'This gate was scanned.'),
  mk('$explored', 'bool', 'The target was explored.'),
  mk('$salvageSpecialData', 'any', 'Salvage special data attached to the entity.'),
  mk('$missionId', 'string', 'Id of the mission being offered.'),
  mk('$encounteredAlready', 'bool', 'Local: the player met this target before.'),
  mk('$metAlready', 'bool', 'Local: the player met this person before.'),
  mk('$didIntro', 'bool', 'Local: the intro was shown.'),
]
for (const m of memoryKeys) {
  const n = rules.MK[m.key] || 0
  if (!n && !['$rankId', '$importance'].includes(m.key)) warn.push('memory key not found in rules conditions: ' + m.key)
}

// ---------- ids ----------
const consts = (file) => [...fs.readFileSync(path.join(IDS, file), 'utf8').split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n')
  .matchAll(/public static (?:final )?String ([A-Z0-9_]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], m[2]])
const readable = (s) => s.toLowerCase().split('_').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
const ranks = [], posts = [], seenR = new Set(), seenP = new Set()
for (const [k, v] of consts('Ranks.java')) {
  if (!v) continue
  if (k.startsWith('POST_')) { if (!seenP.has(v)) { seenP.add(v); posts.push({ id: v, name: readable(k.slice(5)) }) } }
  else if (!seenR.has(v)) { seenR.add(v); ranks.push({ id: v, name: readable(k.replace(/^(SPACE|GROUND)_/, '')) }) }
}
// nicer names
const RN = { spaceSailor: 'Sailor', spaceChief: 'Chief', spaceEnsign: 'Ensign', spaceLieutenant: 'Lieutenant (navy)', spaceCommander: 'Commander', spaceCaptain: 'Captain (navy)', spaceAdmiral: 'Admiral', groundPrivate: 'Private', groundSergeant: 'Sergeant', groundLieutenant: 'Lieutenant (ground)', groundCaptain: 'Captain (ground)', groundMajor: 'Major', groundColonel: 'Colonel', groundGeneral: 'General' }
for (const r of ranks) if (RN[r.id]) r.name = RN[r.id]
const voices = consts('Voices.java').map(x => x[1])
const personalities = consts('Personalities.java').map(x => x[1])
const fleetTypes = consts('FleetTypes.java').map(([k, v]) => ({ id: v, name: readable(k) }))

// ---------- data ----------
const contactTypes = [...fs.readFileSync(path.join(DATA, 'config/contact_tag_data.json'), 'utf8').matchAll(/^\t"(\w+)"\s*:\s*\{/gm)].map(m => m[1])
const pj = fs.readFileSync(path.join(DATA, 'config/planets.json'), 'utf8')
const starTypes = []
for (const m of pj.matchAll(/^\s*"([\w-]+)"\s*:\s*\{([\s\S]*?)^\s*\},?/gm)) if (/"isStar"\s*:\s*true/.test(m[2])) starTypes.push(m[1])

const itemTags = [
  { tag: 'nonecon', summary: 'Commodity: not part of the economy (no supply/demand, not traded at markets by the economy).' },
  { tag: 'no_loss_from_combat', summary: 'Commodity: never lost when cargo is lost in combat.' },
  { tag: 'hide_in_codex', summary: 'Not shown in the codex.' },
  { tag: 'invisible_in_codex', summary: 'Not shown in the codex, not even when unlocked.' },
  { tag: 'codex_unlockable', summary: 'Hidden in the codex until the player has seen it.' },
  { tag: 'no_drop', summary: 'Never dropped as loot.' },
  { tag: 'no_sell', summary: 'Not for sale at markets.' },
  { tag: 'nosell', summary: 'Commodity: cannot be sold (Commodities.TAG_NO_SELL).' },
  { tag: 'mission_item', summary: 'Special item used by a mission.' },
  { tag: 'meta', summary: 'Commodity: meta item (ships, blueprints, credits).' },
  { tag: 'military', summary: 'Commodity: military goods.' },
  { tag: 'expensive', summary: 'Commodity: expensive goods.' },
  { tag: 'luxury', summary: 'Commodity: luxury goods.' },
  { tag: 'exotic', summary: 'Commodity: exotic goods.' },
  { tag: 'medical', summary: 'Commodity: medical goods.' },
  { tag: 'food', summary: 'Commodity: food.' },
  { tag: 'personnel', summary: 'Commodity: people (crew, marines).' },
  { tag: 'crew', summary: 'Commodity: crew.' },
  { tag: 'marines', summary: 'Commodity: marines.' },
  { tag: 'ai_core', summary: 'Commodity: AI core.' },
  { tag: 'colony_item', summary: 'Special item: can be installed in an industry.' },
  { tag: 'nanoforge', summary: 'Special item: nanoforge.' },
  { tag: 'modspec', summary: 'Special item: hull mod spec.' },
  { tag: 'package_bp', summary: 'Special item: blueprint package.' },
  { tag: 'single_bp', summary: 'Special item: single blueprint.' },
  { tag: 'planet_search', summary: 'Special item: shows up in the planet search filters.' },
  { tag: 'threat', summary: 'Special item: threat-related.' },
  { tag: 'monster', summary: 'Special item: shrouded (dweller) related.' },
]
const itemPresets = [
  { id: 'quest_item', name: 'Quest item', kind: 'commodity', columns: {
    'demand class': '', 'base price': '0', 'export value': '', 'price variability': '0', 'utility': '1', 'origin': '',
    'tags': 'nonecon, no_loss_from_combat, hide_in_codex', 'stack size': '1000', 'cargo space': '1',
    'sound id': 'ui_chip_pickup', 'sound id drop': 'ui_modspec_drop', 'economyTier': '', 'econUnitOrigUnused': '', 'econUnit': '',
    'baseRaidDanger': '', 'eU * base value': '', 'iconWidthMult': '1', 'plugin': '' } },
  { id: 'trade_good', name: 'Trade good', kind: 'commodity', columns: {
    'base price': '200', 'export value': '1500', 'price variability': '3', 'utility': '1', 'origin': '', 'tags': 'expensive',
    'stack size': '1000', 'cargo space': '1', 'sound id': 'ui_cargo_drugs', 'sound id drop': 'ui_cargo_drugs_drop',
    'economyTier': '2.5', 'econUnitOrigUnused': '200', 'econUnit': '400', 'baseRaidDanger': 'HIGH', 'eU * base value': '80000', 'iconWidthMult': '1', 'plugin': '' } },
  { id: 'rare_valuable', name: 'Rare valuable', kind: 'special', columns: {
    'tags': 'codex_unlockable', 'tech/manufacturer': '', 'rarity': '', 'base price': '50000', 'stack size': '1000', 'cargo space': '1',
    'baseRaidDanger': 'HIGH', 'sound id': 'ui_cargo_special_tech_pickup', 'sound id drop': 'ui_cargo_special_tech_drop',
    'plugin': 'com.fs.starfarer.api.campaign.impl.items.GenericSpecialItemPlugin', 'plugin params': '' } },
]

const fk = (key, type, group, summary) => ({ key, type, summary, group })
const factionKeys = [
  fk('id', 'string', 'Identity', 'Faction id (normally the file name).'),
  fk('displayName', 'string', 'Identity', 'Short name, e.g. "Hegemony".'),
  fk('displayNameWithArticle', 'string', 'Identity', 'Name with article, e.g. "the Hegemony".'),
  fk('displayNameLong', 'string', 'Identity', 'Long name.'),
  fk('displayNameLongWithArticle', 'string', 'Identity', 'Long name with article.'),
  fk('displayNameIsOrAre', 'string', 'Identity', '"is" or "are".'),
  fk('entityNamePrefix', 'string', 'Identity', 'Prefix for entities, e.g. "Hegemony" in "Hegemony station".'),
  fk('personNamePrefix', 'string', 'Identity', 'Word for a member, e.g. "Hegemony".'),
  fk('personNamePrefixAOrAn', 'string', 'Identity', '"a" or "an" before the person prefix.'),
  fk('logo', 'string', 'Identity', 'Flag image path.'),
  fk('crest', 'string', 'Identity', 'Crest image path.'),
  fk('description', 'string', 'Identity', 'Short description.'),
  fk('showInIntelTab', 'bool', 'Identity', 'Show the faction in the intel tab.'),
  fk('internalComms', 'string', 'Identity', 'Internal comms name (used by some factions).'),
  fk('color', 'color', 'Colors', 'Main faction color [r,g,b,a].'),
  fk('baseUIColor', 'color', 'Colors', 'UI color.'),
  fk('darkUIColor', 'color', 'Colors', 'Dark UI color.'),
  fk('gridUIColor', 'color', 'Colors', 'Grid UI color.'),
  fk('brightUIColor', 'color', 'Colors', 'Bright UI color.'),
  fk('names', 'object', 'Names & ranks', 'Name lists to draw from, with weights.'),
  fk('shipNamePrefix', 'string', 'Names & ranks', 'Ship name prefix, e.g. "HSS".'),
  fk('shipNameSources', 'object', 'Names & ranks', 'Ship name sources with weights.'),
  fk('portraits', 'object', 'Names & ranks', 'Portrait lists (standard_male, standard_female).'),
  fk('ranks', 'object', 'Names & ranks', 'Ranks and posts with weights.'),
  fk('voices', 'object', 'Names & ranks', 'Voices with weights.'),
  fk('fleetTypeNames', 'object', 'Names & ranks', 'Display names per fleet type.'),
  fk('knownShips', 'object', 'Ships & weapons', 'Known hulls (tags / hulls).'),
  fk('priorityShips', 'object', 'Ships & weapons', 'Preferred hulls.'),
  fk('knownFighters', 'object', 'Ships & weapons', 'Known fighter wings.'),
  fk('priorityFighters', 'object', 'Ships & weapons', 'Preferred fighter wings.'),
  fk('knownWeapons', 'object', 'Ships & weapons', 'Known weapons.'),
  fk('priorityWeapons', 'object', 'Ships & weapons', 'Preferred weapons.'),
  fk('knownHullMods', 'object', 'Ships & weapons', 'Known hull mods.'),
  fk('hullMods', 'list', 'Ships & weapons', 'Hull mods list (rare).'),
  fk('hullFrequency', 'object', 'Ships & weapons', 'Hull frequency by tag / hull.'),
  fk('shipsWhenImporting', 'object', 'Ships & weapons', 'Ships available when importing.'),
  fk('variantOverrides', 'object', 'Ships & weapons', 'Variant weights per hull.'),
  fk('shipRoles', 'object', 'Ships & weapons', 'Ship role overrides.'),
  fk('shipSellFrequency', 'object', 'Ships & weapons', 'Ship sell frequency at markets.'),
  fk('weaponSellFrequency', 'object', 'Ships & weapons', 'Weapon sell frequency at markets.'),
  fk('fighterSellFrequency', 'object', 'Ships & weapons', 'Fighter sell frequency at markets.'),
  fk('hullmodSellFrequency', 'object', 'Ships & weapons', 'Hull mod sell frequency at markets.'),
  fk('fleetCompositions', 'object', 'Doctrine', 'Fleet compositions (rare).'),
  fk('factionDoctrine', 'object', 'Doctrine', 'Doctrine: warships/carriers/phase, officer quality, ship quality, aggression, ...'),
  fk('illegalCommodities', 'list', 'Doctrine', 'Commodities illegal in this faction\'s markets.'),
  fk('music', 'object', 'Music', 'Music per situation (theme, market_neutral, encounter_hostile, ...).'),
  fk('barSound', 'string', 'Music', 'Ambient bar sound.'),
  fk('custom', 'object', 'Other', 'Custom values (read in rules as $faction.c:<key>).'),
  fk('flags', 'list', 'Other', 'Faction flags (rare).'),
]

const repLevels = [
  ['VENGEFUL', 'Vengeful', -1], ['HOSTILE', 'Hostile', -0.74], ['INHOSPITABLE', 'Inhospitable', -0.49], ['SUSPICIOUS', 'Suspicious', -0.24],
  ['NEUTRAL', 'Neutral', -0.09], ['FAVORABLE', 'Favorable', 0.09], ['WELCOMING', 'Welcoming', 0.24], ['FRIENDLY', 'Friendly', 0.49], ['COOPERATIVE', 'Cooperative', 0.74],
].map(([id, name, min]) => ({ id, name, min }))

const codePeople = people.filter(p => p.id !== 'izel_hannan').map(p => {
  const o = { id: p.id, name: p.name, faction: p.faction }
  if (p.market) o.market = p.market
  return o
})

const defs = {
  gameVersion: '0.98a-RC8',
  ruleCommands, triggers, tokens, memoryKeys,
  conditionOperators: ['==', '!=', '>', '>=', '<', '<='],
  repLevels, ranks, posts, voices, personalities, fleetTypes, contactTypes,
  importance: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'],
  itemTags, itemPresets, factionKeys, codePeople, starTypes,
  dialog: { width: 1000, height: 650, visualWidth: 420, textWidth: 520, maxOptions: 13 },
}
fs.writeFileSync(OUT, JSON.stringify(defs, null, 1) + '\n')
for (const w of warn) console.log('WARN', w)
for (const [k, v] of Object.entries(defs)) console.log(k, Array.isArray(v) ? v.length : typeof v === 'object' ? JSON.stringify(v) : v)
