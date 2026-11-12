import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { programDir, resolveDataDir, type DataDirInput } from '../src/main/datadir'

const base = (over: Partial<DataDirInput> = {}): DataDirInput => ({
  isPackaged: true, appPath: path.resolve('/app/resources/app.asar'), execPath: path.resolve('/apps/sse/Starsector Ship Editor.exe'), env: {}, ...over
})
const yes = () => true
const no = () => false

describe('data folder', () => {
  it('from source: .userdata, or a folder inside it from SF_USERDATA', () => {
    const i = base({ isPackaged: false, appPath: path.resolve('/src/ship-editor') })
    expect(resolveDataDir(i, yes)).toBe(path.resolve('/src/ship-editor/.userdata'))
    expect(resolveDataDir({ ...i, env: { SF_USERDATA: path.resolve('/src/ship-editor/.userdata/e2e') } }, yes)).toBe(path.resolve('/src/ship-editor/.userdata/e2e'))
    expect(resolveDataDir({ ...i, env: { SF_USERDATA: path.resolve('/elsewhere') } }, yes)).toBe(path.resolve('/src/ship-editor/.userdata'))
  })

  it('packaged: a data folder next to the exe, the portable .exe or the AppImage', () => {
    expect(resolveDataDir(base(), yes)).toBe(path.resolve('/apps/sse/data'))
    expect(programDir(base({ env: { PORTABLE_EXECUTABLE_DIR: path.resolve('/usb/tools') } }))).toBe(path.resolve('/usb/tools'))
    expect(programDir(base({ env: { APPIMAGE: path.resolve('/home/me/apps/sse.AppImage') } }))).toBe(path.resolve('/home/me/apps'))
  })

  it('packaged: SF_USERDATA wins; an unwritable folder falls back to the OS profile', () => {
    expect(resolveDataDir(base({ env: { SF_USERDATA: path.resolve('/x/y') } }), no)).toBe(path.resolve('/x/y'))
    expect(resolveDataDir(base(), no)).toBeNull()
  })
})
