import { contextBridge, ipcRenderer } from 'electron'
import type { AiProviderConfig, AiStreamEvent, ModelInfo } from '../src/ai'
import type { AppInfo, DesktopCommand, Draft, FileDocument, Preferences, SaveRequest } from '../src/shared/desktop'
import type { SettingsView } from './settings'

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:get-info'),
  openMarkdown: (): Promise<FileDocument | undefined> => ipcRenderer.invoke('dialog:open-markdown'),
  saveMarkdown: (request: SaveRequest): Promise<FileDocument | undefined> => ipcRenderer.invoke('dialog:save-markdown', request),
  exportHtml: (html: string): Promise<string | undefined> => ipcRenderer.invoke('dialog:export-html', html),
  confirmDiscard: (): Promise<boolean> => ipcRenderer.invoke('dialog:confirm-discard'),
  setDirty: (value: boolean): Promise<void> => ipcRenderer.invoke('document:dirty', value),
  getSettings: (): Promise<SettingsView> => ipcRenderer.invoke('settings:get'),
  savePreferences: (value: Preferences): Promise<SettingsView> => ipcRenderer.invoke('settings:preferences', value),
  saveProvider: (value: AiProviderConfig): Promise<SettingsView> => ipcRenderer.invoke('settings:provider', value),
  removeProvider: (id: string): Promise<SettingsView> => ipcRenderer.invoke('settings:remove-provider', id),
  activateProvider: (id: string): Promise<SettingsView> => ipcRenderer.invoke('settings:activate', id),
  saveDraft: (draft: Draft): Promise<void> => ipcRenderer.invoke('draft:save', draft),
  closeAfterRecovery: (draft: Draft): Promise<void> => ipcRenderer.invoke('app:close-ready', draft),
  readDraft: (): Promise<Draft | undefined> => ipcRenderer.invoke('draft:read'),
  listModels: (config: AiProviderConfig): Promise<ModelInfo[]> => ipcRenderer.invoke('ai:models', config),
  testConnection: (config: AiProviderConfig): Promise<unknown> => ipcRenderer.invoke('ai:test', config),
  generate: (request: { id: string; prompt: string; sourceText: string }): Promise<void> => ipcRenderer.invoke('ai:generate', request),
  cancelGeneration: (id: string): Promise<void> => ipcRenderer.invoke('ai:cancel', id),
  onAiEvent: (callback: (value: { id: string; event: AiStreamEvent }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { id: string; event: AiStreamEvent }) => callback(value)
    ipcRenderer.on('ai:event', listener)
    return () => ipcRenderer.removeListener('ai:event', listener)
  },
  onCommand: (callback: (command: DesktopCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: DesktopCommand) => callback(command)
    ipcRenderer.on('app:command', listener)
    return () => ipcRenderer.removeListener('app:command', listener)
  },
}
contextBridge.exposeInMainWorld('nexus', api)
export type NexusApi = typeof api
