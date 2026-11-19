import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadConfig, saveConfig, type AppConfig } from './config'
import { buildIndex, type IndexCache } from './gameindex'
import { clearSnapshot, importSnapshot, loadStoredSnapshot } from './snapshotstore'
import { detectInstall, isFile, modsRootFor } from './install'
import { loadProject, snapshotMod, writeFiles } from './modproject'
import { createMod, samePath, workspaceProblem, type WriteRules } from './workspace'
import { packRelease, releaseDirProblem } from './release'
import { langCode, modTexts, translatableMods, translationModFiles } from './translations'
import { callExtension, enabledExtensions, runExtensionIndex } from './ext'
import { defsFor } from '../shared/defs'
import { resolveDataDir } from './datadir'
import { loadUserDefs } from './userdefs'
import { findImage, findFont, readImageFile, listImages, imagesInFolder } from './assets'
import type { AppSettings, InstallInfo, ModsMode, Startup, VersionState, WorkspaceResult } from '../shared/api'
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
/**
 * Workflow walk (scripts/walk.mjs): the native open dialogs answer from this JSON queue file
 * instead of opening (each entry: a path, a list of paths, or null for Cancel). Test use only.
 */
const walkPicks = process.env.SF_WALK_PICKS || null
function walkPick(): { used: boolean; value: string | string[] | null } {
  if (!walkPicks) return { used: false, value: null }
  let q: (string | string[] | null)[] = []
  try { q = JSON.parse(fs.readFileSync(walkPicks, 'utf8')) } catch { /* empty queue */ }
  const value = q.length ? q.shift()! : null
  fs.writeFileSync(walkPicks, JSON.stringify(q))
  return { used: true, value }
}

let config: AppConfig
/** Index caches by key; the target's and (for the version comparison, #47) the other install's. */
const caches = new Map<string, Promise<IndexCache>>()
let win: BrowserWindow | null = null
let refWin: BrowserWindow | null = null
let dirty = false
let userDefs: ReturnType<typeof loadUserDefs>

const mainInstall = (): InstallInfo | null => (config.starsectorDir ? detectInstall(config.starsectorDir) : null)
const migrationInstall = (): InstallInfo | null => (config.migrationDir ? detectInstall(config.migrationDir) : null)
/** The install the active mod targets (#47 D2): the migration install only when it is set and chosen. */
function currentInstall(): InstallInfo | null {
  const mig = migrationInstall()
  return config.target === 'migration' && mig?.ok ? mig : mainInstall()
}
/** The install that isn't the target, when both are set (for the comparison). */
function otherInstall(): InstallInfo | null {
  const mig = migrationInstall()
  if (!mig?.ok) return null
  return config.target === 'migration' ? mainInstall() : mig
}

function modsRoot(): string | null {
  const install = currentInstall()
  return install?.ok ? modsRootFor(install, { mode: config.modsMode, workspaceDir: config.workspaceDir }) : null
}

function rules(): WriteRules {
  const other = otherInstall()
  return { modsRoot: modsRoot(), gameRoot: currentInstall()?.root ?? config.starsectorDir, gameMods: config.modsMode === 'game', otherGameRoots: other?.ok ? [other.root] : [] }
}

function settings(): AppSettings {
  return { styleChecks: !!config.styleChecks, extensions: { ...config.extensions }, releasesDir: releasesDir(), releasesDirChosen: !!config.releasesDir }
}

/** R32: the releases folder (chosen in Settings, or Saga Forge's own data folder). */
function releasesDir(): string {
  return config.releasesDir || path.join(app.getPath('userData'), 'releases')
}

function cacheFor(install: InstallInfo | null, reload: boolean, withActiveMod: boolean): Promise<IndexCache> {
  if (!install?.ok) return Promise.reject(new Error('Starsector folder is not set or no longer valid'))
  const enabled = enabledExtensions(config.extensions)
  const active = withActiveMod ? config.activeModDir : null
  const key = JSON.stringify([install.root, config.modsMode, config.workspaceDir, active, [...enabled]])
  let p = caches.get(key)
  if (!p || reload) {
    const promise = (async () => {
      const c = await buildIndex(install, { mode: config.modsMode, workspaceDir: config.workspaceDir, activeModDir: active, snapshot: loadStoredSnapshot(app.getPath('userData'), install.root) })
      await runExtensionIndex(c, enabled)
      return c
    })()
    caches.set(key, promise)
    promise.catch(() => { if (caches.get(key) === promise) caches.delete(key) })
    p = promise
  }
  return p
}
const getCache = (reload = false) => cacheFor(currentInstall(), reload, true)

/** The two installs, their versions and the target, for the renderer (#47). */
function versionState(error?: string): VersionState {
  const main = mainInstall(), mig = migrationInstall()
  return {
    main: main ? { dir: config.starsectorDir!, ok: main.ok, version: main.ok ? main.gameVersion ?? null : null } : null,
    migration: config.migrationDir ? { dir: config.migrationDir, ok: !!mig?.ok, version: mig?.ok ? mig.gameVersion ?? null : null } : null,
    target: config.target === 'migration' && mig?.ok ? 'migration' : 'main',
    modsMode: config.modsMode,
    error
  }
}
const resetCaches = () => caches.clear()

async function activeSource() {
  const c = await getCache()
  const src = c.sources.find((s) => s.id === c.index.activeSourceId)
  return { c, src }
}

function registerIpc(): void {
  ipcMain.handle('startup', (): Startup => ({
    starsectorDir: config.starsectorDir, workspaceDir: config.workspaceDir, modsMode: config.modsMode,
    install: currentInstall(), smoke, definitions: userDefs, settings: settings(), versions: versionState()
  }))

  // ---- #47: the migration install and the target (TARGET-VERSION-ASSESSMENT.md §3)
  ipcMain.handle('setMigrationInstall', (_e, dir: string | null) => {
    if (!dir) { config.migrationDir = null; config.target = 'main' }
    else {
      const info = detectInstall(String(dir))
      if (!info.ok) return versionState(info.error ?? 'Not a Starsector install.')
      if (config.starsectorDir && samePath(info.root, config.starsectorDir)) return versionState('That is the main install already.')
      config.migrationDir = info.root
    }
    saveConfig(config)
    resetCaches()
    return versionState()
  })
  ipcMain.handle('setTarget', async (_e, slot: 'main' | 'migration') => {
    const want = slot === 'migration' && migrationInstall()?.ok ? 'migration' : 'main'
    if (want !== config.target) {
      config.target = want
      // the active mod is found again in the target's mods setting (same workspace, or its own mods folder)
      saveConfig(config)
    }
    const c = await getCache()
    if (config.activeModDir && !c.sources.some((s) => s.writable && s.writeDir === config.activeModDir)) { config.activeModDir = null; saveConfig(config) }
    return { versions: versionState(), index: (await getCache()).index }
  })
  // Finish migration: the migration install becomes the main one, and the slot is emptied
  ipcMain.handle('finishMigration', async () => {
    const mig = migrationInstall()
    if (!mig?.ok) return versionState('There is no migration install.')
    config.starsectorDir = mig.root
    config.migrationDir = null
    config.target = 'main'
    saveConfig(config)
    resetCaches()
    return versionState()
  })
  // the install that isn't the target, for the version comparison (core data only)
  ipcMain.handle('getOtherIndex', async () => {
    const other = otherInstall()
    return other?.ok ? (await cacheFor(other, false, false)).index : null
  })
  ipcMain.handle('getOtherRuleIds', async () => {
    const other = otherInstall()
    if (!other?.ok) return null
    const c = await cacheFor(other, false, false)
    return [...new Set(c.rules.filter((r) => r.sourceId === 'starsector-core').map((r) => r.id))]
  })

  ipcMain.handle('pickFolder', async (_e, current: string | null, title?: string) => {
    const w = walkPick()
    if (w.used) return typeof w.value === 'string' ? w.value : null
    const r = await dialog.showOpenDialog(win!, { title: title || 'Choose a folder', defaultPath: current || undefined, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('pickFile', async (_e, opts: { title?: string; current?: string | null; filters?: { name: string; extensions: string[] }[] }) => {
    const w = walkPick()
    if (w.used) return typeof w.value === 'string' ? w.value : null
    const r = await dialog.showOpenDialog(win!, { title: opts?.title || 'Choose a file', defaultPath: opts?.current || undefined, filters: opts?.filters, properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('checkInstall', (_e, dir: string) => detectInstall(String(dir)))

  ipcMain.handle('setInstall', (_e, dir: string) => {
    const info = detectInstall(String(dir))
    if (info.ok) { config.starsectorDir = info.root; saveConfig(config); resetCaches() }
    return info
  })

  ipcMain.handle('setWorkspace', (_e, dir: string): WorkspaceResult => {
    const d = path.resolve(String(dir))
    const problem = workspaceProblem(d, mainInstall()?.root ?? null) ?? workspaceProblem(d, migrationInstall()?.ok ? migrationInstall()!.root : null)
    if (problem) return { ok: false, error: problem, workspaceDir: config.workspaceDir }
    config.workspaceDir = d
    saveConfig(config)
    resetCaches()
    return { ok: true, workspaceDir: d }
  })

  ipcMain.handle('setModsMode', (_e, mode: ModsMode): WorkspaceResult => {
    if (mode !== 'workspace' && mode !== 'game') return { ok: false, error: 'Unknown mode', workspaceDir: config.workspaceDir }
    const install = currentInstall()
    if (mode === 'game' && !(install?.ok && install.modsDir)) return { ok: false, error: 'The Starsector folder has no mods folder.', workspaceDir: config.workspaceDir }
    config.modsMode = mode
    saveConfig(config)
    resetCaches()
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
  // the Images page and its pickers (R5, R28)
  ipcMain.handle('listImages', async (_e, folder: string) => listImages(await getCache(), String(folder ?? '')))
  // sizes of the active mod's own images, for Check mod (R5)
  ipcMain.handle('imageSizes', async (_e, paths: string[]) => {
    const { src } = await activeSource()
    const out: Record<string, { w: number; h: number }> = {}
    if (!src) return out
    for (const p of paths ?? []) {
      const rel = String(p).replace(/\\/g, '/')
      if (rel.split('/').includes('..')) continue
      const abs = path.join(src.dir, ...rel.split('/'))
      if (!isFile(abs)) continue
      const s = nativeImage.createFromPath(abs).getSize()
      if (s.width && s.height) out[rel] = { w: s.width, h: s.height }
    }
    return out
  })
  ipcMain.handle('pickImages', async (_e, opts: { title?: string; folder?: boolean }) => {
    const w = walkPick()
    if (w.used) {
      if (w.value === null) return []
      const v = Array.isArray(w.value) ? w.value : [w.value]
      return opts?.folder ? imagesInFolder(v[0]) : v
    }
    const r = await dialog.showOpenDialog(win!, { title: opts?.title || 'Choose images', filters: opts?.folder ? undefined : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: opts?.folder ? ['openDirectory'] : ['openFile', 'multiSelections'] })
    if (r.canceled) return []
    return opts?.folder ? imagesInFolder(r.filePaths[0]) : r.filePaths
  })
  ipcMain.handle('loadFont', async (_e, key: string) => findFont(await getCache(), String(key)))
  // the reference pages (R8): written to Saga Forge's own data folder, shown in their own window
  ipcMain.handle('openReference', async (_e, html: string, anchor: string) => {
    const file = path.join(app.getPath('userData'), 'reference', 'reference.html')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, String(html))
    if (!refWin || refWin.isDestroyed()) {
      refWin = new BrowserWindow({ width: 1000, height: 760, title: 'Saga Forge reference', autoHideMenuBar: true, backgroundColor: '#12151a', webPreferences: { sandbox: true, contextIsolation: true } })
      refWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
    await refWin.loadFile(file, { hash: String(anchor ?? '').replace(/[^a-z0-9-]/g, '') })
    refWin.show(); refWin.focus()
  })

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

  // R29: the active mod's word list, known to the spellchecker
  ipcMain.handle('addSpellWords', (_e, words: string[]) => {
    for (const w of words ?? []) if (typeof w === 'string' && w.trim()) win?.webContents.session.addWordToSpellCheckerDictionary(w.trim())
  })

  // R30: quest templates the user saved, in Saga Forge's own data folder (never in a mod or the game)
  const templatesDir = () => path.join(app.getPath('userData'), 'templates')
  ipcMain.handle('listQuestTemplates', async () => {
    const dir = templatesDir()
    if (!fs.existsSync(dir)) return []
    const out: { file: string; quest: unknown }[] = []
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.quest.json')).sort()) {
      try { out.push({ file: f, quest: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }) } catch { /* a broken file is skipped */ }
    }
    return out
  })
  ipcMain.handle('saveQuestTemplate', async (_e, name: string, quest: unknown) => {
    const safe = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'template'
    fs.mkdirSync(templatesDir(), { recursive: true })
    const file = path.join(templatesDir(), `${safe}.quest.json`)
    fs.writeFileSync(file, JSON.stringify(quest, null, 2) + '\n')
    return file
  })

  // #47 §7.2: a named snapshot of the active mod before migrating it
  ipcMain.handle('snapshotMod', async (_e, label: string) => {
    const { src } = await activeSource()
    if (!src?.writable) throw new Error('No active mod.')
    const dir = await snapshotMod(src.writeDir, String(label ?? ''), rules())
    return path.relative(src.writeDir, dir).replace(/\\/g, '/')
  })

  // R32: the release zip and forum post draft, in the releases folder (never in a mod or the game)
  ipcMain.handle('packRelease', async (_e, req: { version: string; forumPost: string; overwrite?: boolean; notes?: string }) => {
    const { src } = await activeSource()
    if (!src?.writable) throw new Error('No active mod.')
    return packRelease({ modDir: src.dir, releasesDir: releasesDir(), version: String(req?.version ?? ''), forumPost: String(req?.forumPost ?? ''), overwrite: !!req?.overwrite, rules: rules(), notes: String(req?.notes ?? '') })
  })
  ipcMain.handle('showInFolder', async (_e, file: string) => {
    const p = path.resolve(String(file))
    if (p === path.resolve(releasesDir())) { fs.mkdirSync(p, { recursive: true }); await shell.openPath(p) } else shell.showItemInFolder(p)
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
    else if (key === 'extensions' && value && typeof value === 'object') { config.extensions = { ...(value as Record<string, boolean>) }; resetCaches() }
    else if (key === 'releasesDir') {
      const dir = value ? path.resolve(String(value)) : null
      const problem = dir ? releaseDirProblem(dir, rules()) : null
      if (problem) throw new Error(problem)
      config.releasesDir = dir
    }
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

  // R31: translations. Other mods are only read; a new translation mod is a new folder in the mods folder
  // #64: a sector snapshot as a source "seen in game" (per install; the game's file is only read)
  ipcMain.handle('importSnapshot', async (_e, file?: string | null) => {
    const inst = currentInstall()
    if (!inst?.ok) throw new Error('Starsector folder is not set')
    importSnapshot(app.getPath('userData'), inst.root, file ? String(file) : null)
    resetCaches()
    return (await getCache(true)).index.snapshot ?? null
  })
  ipcMain.handle('clearSnapshot', async () => {
    const inst = currentInstall()
    if (inst?.ok) clearSnapshot(app.getPath('userData'), inst.root)
    resetCaches()
    return null
  })
  ipcMain.handle('translatableMods', async () => translatableMods((await getCache()).sources))
  ipcMain.handle('modTexts', async (_e, modId: string) => {
    const src = (await getCache()).sources.find((s) => s.id === String(modId) && !s.isCore)
    return src ? modTexts(src) : null
  })
  ipcMain.handle('createTranslation', async (_e, req: { target: string; language: string; languageName: string }) => {
    const c = await getCache()
    const target = c.sources.find((s) => s.id === String(req?.target) && !s.isCore)
    if (!target) throw new Error(`Mod "${req?.target}" isn't installed.`)
    const lang = langCode(String(req?.language ?? ''))
    if (!lang) throw new Error('Enter a language code, e.g. de, fr or pt_br.')
    const id = `${target.id}_${lang}`.slice(0, 64)
    const { info, files } = translationModFiles(target, lang, id)
    const install = currentInstall()
    const name = `${target.name} (${String(req?.languageName ?? '').trim() || lang})`
    config.activeModDir = createMod({ id, name, author: '', gameVersion: (install?.ok && install.gameVersion) || defsFor(null).gameVersion, info, files }, rules())
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
  // R29: spelling suggestions and "add to the mod's word list" on right-click, plus the usual edit commands
  win.webContents.on('context-menu', (_e, params) => {
    const items: MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 6)) items.push({ label: s, click: () => win?.webContents.replaceMisspelling(s) })
      if (!params.dictionarySuggestions.length) items.push({ label: 'No suggestions', enabled: false })
      items.push({ type: 'separator' }, {
        label: `Add "${params.misspelledWord}" to the mod's word list`,
        click: () => { win?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord); win?.webContents.send('spellAdd', params.misspelledWord) }
      }, { type: 'separator' })
    }
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' })
    else if (params.selectionText) items.push({ role: 'copy' })
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win! })
  })
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

