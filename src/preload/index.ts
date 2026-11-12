import { contextBridge, ipcRenderer } from 'electron'
import type { EditorApi } from '../shared/api'

/** The only bridge between the UI and the main process. The UI gets no direct file access. */
const api: EditorApi = {
  getStartup: () => ipcRenderer.invoke('startup'),
  pickFolder: (current, title) => ipcRenderer.invoke('pickFolder', current ?? null, title),
  pickFile: (opts) => ipcRenderer.invoke('pickFile', opts),
  checkInstall: (dir) => ipcRenderer.invoke('checkInstall', dir),
  setInstall: (dir) => ipcRenderer.invoke('setInstall', dir),
  setWorkspace: (dir) => ipcRenderer.invoke('setWorkspace', dir),
  setModsMode: (mode) => ipcRenderer.invoke('setModsMode', mode),
  setActiveMod: (dir) => ipcRenderer.invoke('setActiveMod', dir),
  getIndex: (reload) => ipcRenderer.invoke('getIndex', !!reload),
  getRules: () => ipcRenderer.invoke('getRules'),
  loadFaction: (id) => ipcRenderer.invoke('loadFaction', id),
  loadImage: (p, sourceId) => ipcRenderer.invoke('loadImage', p, sourceId),
  readPickedImage: (p) => ipcRenderer.invoke('readPickedImage', p),
  loadFont: (key) => ipcRenderer.invoke('loadFont', key),
  loadProject: () => ipcRenderer.invoke('loadProject'),
  writeFiles: (req) => ipcRenderer.invoke('writeFiles', req),
  filesExist: (paths) => ipcRenderer.invoke('filesExist', paths),
  setSetting: (key, value) => ipcRenderer.invoke('setSetting', key, value),
  ext: (id, method, arg) => ipcRenderer.invoke('ext', id, method, arg),
  createMod: (mod) => ipcRenderer.invoke('createMod', mod),
  setDirty: (dirty) => ipcRenderer.invoke('setDirty', dirty),
  smokeReady: (info) => ipcRenderer.invoke('smokeReady', info)
}

contextBridge.exposeInMainWorld('api', api)
