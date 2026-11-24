/**
 * The kinds of image a mod uses, with the folder and size vanilla 0.98a uses for each
 * (docs/TEST-MOD-ASSETS.md; docs/DESIGN-PHASE1.md §3). The Images page imports into these folders,
 * resizing and cropping to these sizes (R1, R2, R5).
 */
import { slug } from './quest'

export type ImageKindId = 'flag' | 'crest' | 'portrait' | 'cargoIcon' | 'missionIcon' | 'illustration' | 'entitySprite' | 'mapIcon' | 'planetTexture' | 'modIcon' | 'achievementIcon' | 'techIcon' | 'original'

export interface ImageKind {
  id: ImageKindId
  label: string
  /** Folder in the mod (and in the game) for this kind. */
  folder: string
  w: number
  h: number
  /** Where it shows in game (for the page and the import dialog). */
  help: string
}

export const IMAGE_KINDS: ImageKind[] = [
  { id: 'flag', label: 'Faction flag', folder: 'graphics/factions', w: 410, h: 256, help: 'The flag on the faction\'s colonies, fleets and intel page.' },
  { id: 'crest', label: 'Faction crest', folder: 'graphics/factions', w: 256, h: 256, help: 'The emblem in the intel tab and dialog faction panels.' },
  { id: 'portrait', label: 'Portrait', folder: 'graphics/portraits', w: 128, h: 128, help: 'A person in dialog and the comm directory; a faction\'s portrait pool.' },
  { id: 'cargoIcon', label: 'Item icon', folder: 'graphics/icons/cargo', w: 80, h: 80, help: 'An item in the cargo grid and its tooltip.' },
  { id: 'missionIcon', label: 'Quest icon', folder: 'graphics/icons/missions', w: 64, h: 64, help: 'A quest in the intel screen and the contact\'s mission list.' },
  { id: 'illustration', label: 'Illustration', folder: 'graphics/illustrations', w: 480, h: 300, help: 'The picture on the right of a dialog (registered by key in the mod\'s settings.json on Export).' },
  // the mod's own celestial types (R21; DESIGN-PHASE3.md §6)
  { id: 'entitySprite', label: 'Station / entity sprite', folder: 'graphics/stations', w: 160, h: 160, help: 'A station or other object of the mod\'s own entity types, in the campaign view (vanilla\'s station sprites are 160×160, drawn at 80).' },
  { id: 'mapIcon', label: 'Map icon', folder: 'graphics/icons/map', w: 64, h: 64, help: 'The small icon of the mod\'s own entity type on the map (optional; without one it uses its base type\'s).' },
  { id: 'planetTexture', label: 'Planet / star texture', folder: 'graphics/planets', w: 1024, h: 512, help: 'The surface of the mod\'s own planet or star type, wrapped around the sphere (vanilla\'s are 1024×512).' },
  // #62: LunaLib draws it next to the mod's name in its settings menu (40×40 shows unscaled; any square works)
  { id: 'modIcon', label: 'Mod icon (LunaLib menu)', folder: 'graphics/icons/mod', w: 40, h: 40, help: 'The mod\'s icon next to its name in LunaLib\'s settings menu (Saga › Settings).' },
  // #65: MagicLib draws achievement images square at 48×48 (MagicAchievementIntel)
  { id: 'achievementIcon', label: 'Achievement image (MagicLib)', folder: 'graphics/icons/achievements', w: 64, h: 64, help: 'A MagicLib achievement once unlocked, in MagicLib\'s achievement list (drawn at 48×48; Saga › Achievements).' },
  // #77: Vaults of Knowledge's own tech icons are 320×320 PNGs (graphics/icons/tech)
  { id: 'techIcon', label: 'Tech icon (Vaults of Knowledge)', folder: 'graphics/icons/tech', w: 320, h: 320, help: 'A tech in Vaults of Knowledge\'s research tree (Saga › Research; VoK\'s own icons are 320×320). Export lists it in the mod\'s settings.json under ui_icons_tech_tree.' }
]

/**
 * #67 U38 (user, 2026-11-22): the source images as they are (no crop, no resize, the same format),
 * renamed with the mod's prefix and kept where the game never loads them. Import… › From Originals
 * makes game images from them; Export can put them in the release zip or leave them out.
 */
export const ORIGINALS_FOLDER = 'sagaforge/originals'
IMAGE_KINDS.push({ id: 'original', label: 'Original (not in the game)', folder: ORIGINALS_FOLDER, w: 0, h: 0, help: 'Your source image as it is: not cropped, not resized, the same format, only renamed with the mod\'s prefix. Kept in sagaforge/originals/, which the game never loads. Import… › From Originals makes game images from it.' })
export const isOriginal = (k: ImageKind): boolean => k.id === 'original'
/** "128×128", or "as it is" for originals. */
export const kindSize = (k: ImageKind): string => (isOriginal(k) ? 'as it is' : `${k.w}×${k.h}`)

export const imageKind = (id: ImageKindId): ImageKind => IMAGE_KINDS.find((k) => k.id === id)!

/**
 * The file an imported image gets: the kind's folder, the mod's prefix, the original name in
 * lowercase with `_`, and `.png` (it is converted). `Mainecoon_Beta.jpg` → `graphics/portraits/sfw_mainecoon_beta.png`.
 * Flags and crests (same folder) get `_flag` / `_crest` unless the name says so already.
 */
export function importPath(kind: ImageKind, fileName: string, prefix: string): string {
  const file = fileName.replace(/^.*[\\/]/, '')
  return kindPath(kind, importName(kind, file.replace(/\.[^.]+$/, ''), prefix), file)
}

/**
 * #67 U38: a name as the user types it, made a file name: lowercase with `_`, the mod's prefix in
 * front, `_flag` / `_crest` for those kinds. "Jane" → "toc_jane".
 */
export function importName(kind: ImageKind, typed: string, prefix: string): string {
  let name = slug(typed.trim().replace(/^.*[\\/]/, '').replace(/\.(png|jpe?g)$/i, '')) || 'image'
  if (prefix && !name.startsWith(prefix)) name = `${prefix}${name}`
  if (kind.id === 'flag' && !/flag/.test(name)) name += '_flag'
  if (kind.id === 'crest' && !/crest/.test(name)) name += '_crest'
  return name
}

/** #67 U38: the file in the mod for a name: PNG (it is converted), or an original's own format. */
export function kindPath(kind: ImageKind, name: string, source: string): string {
  const ext = isOriginal(kind) && /\.jpe?g$/i.test(source) ? '.jpg' : '.png'
  return `${kind.folder}/${name}${ext}`
}

/** #67 U38: the crop is smaller than the result, so the image is enlarged (and gets blurrier). */
export const upscales = (crop: { w: number; h: number }, kind: ImageKind): boolean => !isOriginal(kind) && (crop.w < kind.w || crop.h < kind.h)

/** The key an imported illustration is registered under (its file name without the extension). */
export const illustrationKey = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

/** The largest crop of a w×h image with the kind's shape, centred (the import dialog's start). */
export function centredCrop(w: number, h: number, kind: ImageKind): { x: number; y: number; w: number; h: number } {
  if (isOriginal(kind)) return { x: 0, y: 0, w, h }
  const want = kind.w / kind.h
  if (w / h > want) { const cw = Math.round(h * want); return { x: Math.round((w - cw) / 2), y: 0, w: cw, h } }
  const ch = Math.round(w / want)
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch }
}

/** Whether an image is already the kind's shape (no crop needed), within a pixel of rounding. */
export const sameShape = (w: number, h: number, kind: ImageKind): boolean => isOriginal(kind) || Math.abs(w / h - kind.w / kind.h) < 1 / Math.max(kind.w, kind.h)
