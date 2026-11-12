import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadConfig, saveConfig, type AppConfig } from './config'
import { buildIndex, type IndexCache } from './gameindex'
import { detectInstall, isFile, modsRootFor } from './install'
import { loadProject, writeFiles } from './modproject'
import { createMod, workspaceProblem, type WriteRules } from './workspace'
import { callExtension, enabledExtensions, runExtensionIndex } from './ext'
import { defsFor } from '../shared/defs'
import { resolveDataDir } from './datadir'
import { loadUserDefs } from './userdefs'
import { findImage, findFont, readImageFile } from './assets'
import type { AppSettings, InstallInfo, ModsMode, Startup, WorkspaceResult } from '../shared/api'
import type { WriteRequest } from '../shared/project'

// Settings and Chromium's cache: tools/saga-forge/.userdata from source, a "data" folder next to
// the program when packaged (portable). See datadir.ts. Must run before 'ready'.
{
  const dataDir = resolveDataDir({ isPackaged: app.isPackaged, appPath: app.getAppPath(), execPath: process.execPath, env: process.env })
  if (dataDir) {
    app.setPath('userData', dataDir)
    app.setPath('sessionData', dataDir)
    app.setPath('crashDumps', path.join(dataDir, 'crashes'))
    app.setPath('logs', path.join(dataDir, 'logs'))
  }
}

/** Automated screenshot / end-to-end mode: SF_SMOKE=<page> npm start writes .userdata/smoke-<page>.png and quits. */
const smoke = process.env.SF_SMOKE || null

let config: AppConfig
let cache: { key: string; promise: Promise<IndexCache> } | null = null
let win: BrowserWindow | null = null
let dirty = false
let userDefs: ReturnType<typeof loadUserDefs>

function currentInstall(): InstallInfo | null {
  return config.starsectorDir ? detectInstall(config.starsectorDir) : null
}

function modsRoot(): string | null {
  const install = currentInstall()
  return install?.ok ? modsRootFor(install, { mode: config.modsMode, workspaceDir: config.workspaceDir }) : null
}

function rules(): WriteRules {
  return { modsRoot: modsRoot(), gameRoot: currentInstall()?.root ?? config.starsectorDir, gameMods: config.modsMode === 'game' }
}

function settings(): AppSettings {
  return { styleChecks: !!config.styleChecks, extensions: { ...config.extensions } }
}

function getCache(reload = false): Promise<IndexCache> {
  const install = currentInstall()
  if (!install?.ok) return Promise.reject(new Error('Starsector folder is not set or no longer valid'))
  const enabled = enabledExtensions(config.extensions)
  const key = JSON.stringify([install.root, config.modsMode, config.workspaceDir, config.activeModDir, [...enabled]])
  if (!cache || reload || cache.key !== key) {
    const promise = (async () => {
      const c = await buildIndex(install, { mode: config.modsMode, workspaceDir: config.workspaceDir, activeModDir: config.activeModDir })
      await runExtensionIndex(c, enabled)
      return c
    })()
    cache = { key, promise }
    promise.catch(() => { if (cache?.promise === promise) cache = null })
  }
  return cache.promise
}

async function activeSource() {
  const c = await getCache()
  const src = c.sources.find((s) => s.id === c.index.activeSourceId)
  return { c, src }
}

function registerIpc(): void {
  ipcMain.handle('startup', (): Startup => ({
    starsectorDir: config.starsectorDir, workspaceDir: config.workspaceDir, modsMode: config.modsMode,
    install: currentInstall(), smoke, definitions: userDefs, settings: settings()
  }))

  ipcMain.handle('pickFolder', async (_e, current: string | null, title?: string) => {
    const r = await dialog.showOpenDialog(win!, { title: title || 'Choose a folder', defaultPath: current || undefined, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('pickFile', async (_e, opts: { title?: string; current?: string | null; filters?: { name: string; extensions: string[] }[] }) => {
    const r = await dialog.showOpenDialog(win!, { title: opts?.title || 'Choose a file', defaultPath: opts?.current || undefined, filters: opts?.filters, properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('checkInstall', (_e, dir: string) => detectInstall(String(dir)))

  ipcMain.handle('setInstall', (_e, dir: string) => {
    const info = detectInstall(String(dir))
    if (info.ok) { config.starsectorDir = info.root; saveConfig(config); cache = null }
    return info
  })

  ipcMain.handle('setWorkspace', (_e, dir: string): WorkspaceResult => {
    const d = path.resolve(String(dir))
    const problem = workspaceProblem(d, currentInstall()?.root ?? null)
    if (problem) return { ok: false, error: problem, workspaceDir: config.workspaceDir }
    config.workspaceDir = d
    saveConfig(config)
    cache = null
    return { ok: true, workspaceDir: d }
  })

  ipcMain.handle('setModsMode', (_e, mode: ModsMode): WorkspaceResult => {
    if (mode !== 'workspace' && mode !== 'game') return { ok: false, error: 'Unknown mode', workspaceDir: config.workspaceDir }
    const install = currentInstall()
    if (mode === 'game' && !(install?.ok && install.modsDir)) return { ok: false, error: 'The Starsector folder has no mods folder.', workspaceDir: config.workspaceDir }
    config.modsMode = mode
    saveConfig(config)
    cache = null
    return { ok: true, workspaceDir: config.workspaceDir }
  })

  ipcMain.handle('setActiveMod', async (_e, dir: string | null) => {
    const current = await getCache()
    const target = dir ? current.sources.find((s) => s.writable && s.writeDir === dir) : null
    if (dir && !target) throw new Error('That mod is not in your mods folder.')
    config.activeModDir = target ? target.writeDir : null
    saveConfig(config)
    return (await getCache()).index
  })

  ipcMain.handle('getIndex', async (_e, reload: boolean) => (await getCache(!!reload)).index)
  ipcMain.handle('getRules', async () => (await getCache()).rules)

  ipcMain.handle('loadFaction', async (_e, id: string) => {
    const c = await getCache()
    const key = c.factionFiles.get(String(id))
    const layers = key ? c.factionLayers.get(key) ?? [] : []
    return { id: String(id), layers: layers.map((l) => ({ sourceId: l.sourceId, file: l.file, raw: l.raw })) }
  })

  ipcMain.handle('loadImage', async (_e, gamePath: string, sourceId?: string) => findImage(await getCache(), String(gamePath ?? ''), sourceId ? String(sourceId) : undefined))
  ipcMain.handle('readPickedImage', async (_e, abs: string) => readImageFile(String(abs), 'picked'))
  ipcMain.handle('loadFont', async (_e, key: string) => findFont(await getCache(), String(key)))

  ipcMain.handle('loadProject', async () => {
    const { c, src } = await activeSource()
    return src ? loadProject(c, src) : null
  })

  ipcMain.handle('writeFiles', async (_e, req: WriteRequest) => {
    const { src } = await activeSource()
    if (!src?.writable) throw new Error('No active mod. Pick one (or create one) first.')
    const r = await writeFiles(src.writeDir, req, rules())
    if (r.written.length) await getCache(true)
    return r
  })

  ipcMain.handle('filesExist', async (_e, paths: string[]) => {
    const { c, src } = await activeSource()
    const out: Record<string, boolean> = {}
    for (const p of paths ?? []) {
      const rel = String(p)
      out[rel] = (!!src && isFile(path.join(src.dir, rel))) || c.sources.some((s) => isFile(path.join(s.dir, rel)))
    }
    return out
  })

  ipcMain.handle('setSetting', (_e, key: keyof AppSettings, value: unknown) => {
    if (key === 'styleChecks') config.styleChecks = !!value
    else if (key === 'extensions' && value && typeof value === 'object') { config.extensions = { ...(value as Record<string, boolean>) }; cache = null }
    saveConfig(config)
    return settings()
  })

  ipcMain.handle('ext', async (_e, id: string, method: string, arg: unknown) =>
    callExtension({ cache: await getCache(), rules: rules(), reload: () => getCache(true) }, String(id), String(method), arg))

  ipcMain.handle('createMod', async (_e, mod: { id: string; name: string }) => {
    const install = currentInstall()
    config.activeModDir = createMod({ id: String(mod.id), name: String(mod.name), author: '', gameVersion: (install?.ok && install.gameVersion) || defsFor(null).gameVersion }, rules())
    saveConfig(config)
    return (await getCache(true)).index
  })

  ipcMain.handle('setDirty', (_e, d: boolean) => { dirty = !!d })

  ipcMain.handle('smokeReady', async (_e, info?: unknown) => {
    if (!smoke || !win) return
    if (info) console.log(`[smoke] ${JSON.stringify(info)}`)
    const image = await win.webContents.capturePage()
    const out = path.join(app.getPath('userData'), `smoke-${smoke.replace(/[^\w.-]/g, '_')}.png`)
    await fsp.writeFile(out, image.toPNG())
    console.log(`[smoke] wrote ${out}`)
    app.quit()
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 680, backgroundColor: '#12151a', title: 'Saga Forge', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (smoke) win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message}`) })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('close', (e) => {
    if (!dirty || smoke) return
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'warning', buttons: ['Discard changes and close', 'Cancel'], defaultId: 1, cancelId: 1,
      title: 'Unsaved changes', message: 'You have unsaved changes.', detail: 'Close anyway and lose them?'
    })
    if (choice !== 0) e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  config = loadConfig()
  if (process.env.SF_STARSECTOR && !config.starsectorDir) config.starsectorDir = process.env.SF_STARSECTOR
  if (process.env.SF_WORKSPACE) config.workspaceDir = process.env.SF_WORKSPACE
  if (process.env.SF_ACTIVE_MOD) config.activeModDir = process.env.SF_ACTIVE_MOD
  userDefs = loadUserDefs(path.join(app.getPath('userData'), 'definitions'))
  registerIpc()
  if (smoke) setTimeout(() => { console.error('[smoke] timed out waiting for the UI'); app.exit(1) }, 90_000)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

