/**
 * Special item plugin classes the base game uses (special_items.csv, 0.98a), for the Items page's
 * Plugin list (INGAME-CHECKS R13). The field still accepts any class name: a mod's own class, or
 * another class of the game's API. Descriptions come from how vanilla's own items use each class.
 */
export const VANILLA_PLUGIN_PACKAGE = 'com.fs.starfarer.api.campaign.impl.items'

export interface ItemPluginInfo {
  /** Full class name, as written in special_items.csv. */
  id: string
  /** Short class name. */
  name: string
  /** What it is for (shown in the list and the field's help). */
  summary: string
  /** What its "plugin params" column holds, in vanilla's own rows. */
  params: string
  /** Vanilla items that use it (examples). */
  examples: string[]
}

const p = (name: string, summary: string, params: string, examples: string[]): ItemPluginInfo =>
  ({ id: `${VANILLA_PLUGIN_PACKAGE}.${name}`, name, summary, params, examples })

export const ITEM_PLUGINS: ItemPluginInfo[] = [
  p('GenericSpecialItemPlugin', 'A plain special item with a tooltip. Vanilla uses it for the colony items you install in an industry. Saga Forge\'s default for new special items.',
    'The industries it can be installed in, comma-separated (e.g. "heavyindustry, orbitalworks"); empty for an item that is only carried or traded.', ['corrupted_nanoforge', 'synchrotron', 'soil_nanites']),
  p('BaseSpecialItemPlugin', 'The bare base class: an item with no special behavior of its own.', 'Empty in vanilla.', ['planetkiller', 'topographic_data', 'fragment_fabricator']),
  p('MultiBlueprintItemPlugin', 'A blueprint package: using it teaches every blueprint with a tag.', 'The blueprint tag (e.g. "lowtech_bp").', ['low_tech_package', 'pirate_package']),
  p('ShipBlueprintItemPlugin', 'A single ship blueprint; the hull is stored on the item when it is created.', 'Empty in vanilla.', ['ship_bp']),
  p('WeaponBlueprintItemPlugin', 'A single weapon blueprint.', 'Empty in vanilla.', ['weapon_bp']),
  p('FighterBlueprintItemPlugin', 'A single fighter wing (LPC) blueprint.', 'Empty in vanilla.', ['fighter_bp']),
  p('IndustryBlueprintItemPlugin', 'An industry blueprint (lets the player build that industry).', 'Empty in vanilla.', ['industry_bp']),
  p('ModSpecItemPlugin', 'A hullmod spec: using it teaches a hullmod.', 'Empty in vanilla.', ['modspec']),
  p('ShroudedHullmodItemPlugin', 'A Shrouded (0.98a) item that teaches a specific hullmod.', 'The hullmod id (e.g. "shrouded_thunderhead").', ['shrouded_thunderhead', 'shrouded_mantle']),
  p('ShroudedSubstratePlugin', 'The Shrouded Substrate (vanilla story item).', 'Empty in vanilla.', ['shrouded_substrate']),
  p('WormholeAnchorPlugin', 'The wormhole anchor (vanilla story item).', 'Empty in vanilla.', ['wormhole_anchor']),
  p('WormholeScannerPlugin', 'The wormhole scanner (vanilla story item).', 'Empty in vanilla.', ['wormhole_scanner']),
  p('JanusDevicePlugin', 'The Janus Device (vanilla story item).', 'Empty in vanilla.', ['janus'])
]

/** The plugin's info, by full or short class name. */
export const pluginInfo = (cls: string): ItemPluginInfo | undefined => ITEM_PLUGINS.find((x) => x.id === cls || x.name === cls)
