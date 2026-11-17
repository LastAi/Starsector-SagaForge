/**
 * The kinds of image a mod uses, with the folder and size vanilla 0.98a uses for each
 * (docs/TEST-MOD-ASSETS.md; docs/DESIGN-PHASE1.md §3). The Images page imports into these folders,
 * resizing and cropping to these sizes (R1, R2, R5).
 */
import { slug } from './quest'

export type ImageKindId = 'flag' | 'crest' | 'portrait' | 'cargoIcon' | 'missionIcon' | 'illustration' | 'entitySprite' | 'mapIcon' | 'planetTexture'

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
  { id: 'planetTexture', label: 'Planet / star texture', folder: 'graphics/planets', w: 1024, h: 512, help: 'The surface of the mod\'s own planet or star type, wrapped around the sphere (vanilla\'s are 1024×512).' }
]

export const imageKind = (id: ImageKindId): ImageKind => IMAGE_KINDS.find((k) => k.id === id)!

/**
 * The file an imported image gets: the kind's folder, the mod's prefix, the original name in
 * lowercase with `_`, and `.png` (it is converted). `Mainecoon_Beta.jpg` → `graphics/portraits/sfw_mainecoon_beta.png`.
 * Flags and crests (same folder) get `_flag` / `_crest` unless the name says so already.
 */
export function importPath(kind: ImageKind, fileName: string, prefix: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  let name = slug(base) || 'image'
  if (prefix && !name.startsWith(prefix)) name = `${prefix}${name}`
  if (kind.id === 'flag' && !/flag/.test(name)) name += '_flag'
  if (kind.id === 'crest' && !/crest/.test(name)) name += '_crest'
  return `${kind.folder}/${name}.png`
}

/** The key an imported illustration is registered under (its file name without the extension). */
export const illustrationKey = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

/** The largest crop of a w×h image with the kind's shape, centred (the import dialog's start). */
export function centredCrop(w: number, h: number, kind: ImageKind): { x: number; y: number; w: number; h: number } {
  const want = kind.w / kind.h
  if (w / h > want) { const cw = Math.round(h * want); return { x: Math.round((w - cw) / 2), y: 0, w: cw, h } }
  const ch = Math.round(w / want)
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch }
}

/** Whether an image is already the kind's shape (no crop needed), within a pixel of rounding. */
export const sameShape = (w: number, h: number, kind: ImageKind): boolean => Math.abs(w / h - kind.w / kind.h) < 1 / Math.max(kind.w, kind.h)
