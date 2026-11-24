/** Image size check (R5): the mod's own images that aren't the size vanilla uses for their kind. Check mod only. */
import type { Problem } from '../api'
import type { CheckContext } from '.'
import { IMAGE_KINDS, type ImageKind } from '../imagekinds'

/** The kind of an image by its folder (flags and crests share graphics/factions: "crest" in the name decides). */
export function kindOfPath(p: string): ImageKind | null {
  const k = IMAGE_KINDS.filter((x) => p.startsWith(`${x.folder}/`))
  if (!k.length) return null
  if (k.length > 1) return k.find((x) => (x.id === 'crest') === /crest/i.test(p.replace(/^.*\//, ''))) ?? k[0]
  return k[0]
}

export function imageSizeProblems(ctx: CheckContext): Problem[] {
  const out: Problem[] = []
  for (const [p, s] of Object.entries(ctx.imageSizes ?? {})) {
    const kind = kindOfPath(p)
    // #67 U38: originals keep their own size
    if (!kind || !kind.w || (s.w === kind.w && s.h === kind.h)) continue
    out.push({
      level: 'warning', area: 'Image', file: p, ref: { page: 'images' },
      message: `${p} is ${s.w}×${s.h}; vanilla's ${kind.label.toLowerCase()} images are ${kind.w}×${kind.h}, so the game shows it scaled${kind.w / kind.h !== s.w / s.h ? ' and stretched' : ''}. Re-import it on the Images page (it crops and resizes).`,
      key: `imgsize:${p}`
    })
  }
  return out
}
