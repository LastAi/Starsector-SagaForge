/**
 * One image picker for every page (R28): `chooseImages(kind)` opens it and resolves with the
 * chosen paths (or illustration keys), or [] when cancelled. The Shell shows it.
 */
import type { ImageKindId } from '../../../shared/imagekinds'

interface Request { kind: ImageKindId; multi: boolean; current?: string; title?: string; resolve: (v: string[]) => void }

class PickerState {
  req = $state<Request | null>(null)
  close(v: string[]): void { const r = this.req; this.req = null; r?.resolve(v) }
}
export const picker = new PickerState()

export function chooseImages(kind: ImageKindId, opts: { multi?: boolean; current?: string; title?: string } = {}): Promise<string[]> {
  return new Promise((resolve) => { picker.req = { kind, multi: !!opts.multi, current: opts.current, title: opts.title, resolve } })
}
