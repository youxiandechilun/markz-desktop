import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { FileService, atomicWrite, parseSave, requireText } from './files'
import { SettingsService } from './settings'
import { AiError, AiTransport } from '../src/ai'
import type { DesktopCommand } from '../src/shared/desktop'
import { installMenu } from './menu'

export function registerBridge(window: BrowserWindow, settings: SettingsService, setDirty: (value: boolean) => void, closeReady: () => void): () => void {
  const files = new FileService(app.getPath('documents'))
  const ai = new AiTransport()
  const controllers = new Map<string, AbortController>()
  const channels: string[] = []
  function handle(channel: string, handler: (value: unknown, event: IpcMainInvokeEvent) => unknown): void {
    channels.push(channel)
    ipcMain.handle(channel, (event, value: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('IPC_ACCESS')
      return handler(value, event)
    })
  }
  handle('app:get-info', () => ({ name: 'Markz', version: app.getVersion(), platform: process.platform }))
  handle('document:dirty', value => { setDirty(value === true) })
  handle('settings:get', () => settings.view())
  handle('settings:preferences', async value => { const result = await settings.setPreferences(value); installMenu(window, result.preferences.locale); return result })
  handle('settings:provider', value => settings.saveProvider(value))
  handle('settings:remove-provider', value => settings.removeProvider(value))
  handle('settings:activate', value => settings.activate(value))
  handle('draft:save', value => settings.saveDraft(value))
  handle('app:close-ready', async value => { await settings.saveDraft(value); closeReady() })
  handle('draft:read', () => settings.readDraft())
  handle('dialog:confirm-discard', async () => {
    const zh = settings.view().preferences.locale === 'zh-CN'
    const choice = await dialog.showMessageBox(window, { type: 'question', message: zh ? '文档尚未保存' : 'Unsaved document', detail: zh ? '继续将切换文档。请先保存需要保留的修改。' : 'Save your changes before switching documents.', buttons: zh ? ['取消', '继续'] : ['Cancel', 'Continue'], defaultId: 0, cancelId: 0 })
    return choice.response === 1
  })
  handle('dialog:open-markdown', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] })
    if (result.canceled || !result.filePaths[0]) return undefined
    return files.open(result.filePaths[0])
  })
  handle('workspace:list', () => files.listWorkspace())
  handle('workspace:create', async value => files.createWorkspaceDocument(typeof value === 'string' ? value : '未命名.md'))
  handle('workspace:rename', async value => { if (!value || typeof value !== 'object' || !('filePath' in value) || !('name' in value)) throw new Error('INPUT_INVALID'); return files.renameWorkspace(requireText(value.filePath, 32768), requireText(value.name, 255)) })
  handle('workspace:delete', async value => { await files.deleteWorkspace(requireText(value, 32768)); return true })
  handle('dialog:save-markdown', async value => {
    const request = parseSave(value)
    let filePath = request.filePath
    if (!filePath || request.saveAs) {
      const result = await dialog.showSaveDialog(window, { defaultPath: filePath ?? 'Untitled.md', filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (result.canceled || !result.filePath) return undefined
      filePath = result.filePath
      files.authorizeNew(filePath)
    }
    return files.save({ ...request, filePath })
  })
  handle('dialog:export-html', async value => {
    const html = requireText(value)
    const result = await dialog.showSaveDialog(window, { defaultPath: 'Document.html', filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (result.canceled || !result.filePath) return undefined
    await atomicWrite(result.filePath, html)
    return result.filePath
  })
  handle('ai:models', async value => {
    try { return await ai.listModels(settings.resolve(value)) }
    catch (error) { if (error instanceof AiError) throw new Error(`${error.code}: ${error.message}`); throw error }
  })
  handle('ai:test', async value => { const result = await ai.testConnection(settings.resolve(value)); if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return { ok: true } })
  handle('ai:cancel', value => { const id = requireText(value, 100); controllers.get(id)?.abort(); controllers.delete(id) })
  handle('ai:generate', async (value, event) => {
    if (!value || typeof value !== 'object' || !('id' in value) || !('prompt' in value) || !('sourceText' in value)) throw new Error('AI_INPUT_INVALID')
    const id = requireText(value.id, 100), prompt = requireText(value.prompt, 32000), sourceText = requireText(value.sourceText, 1024 * 1024)
    if (controllers.size > 0) throw new Error('AI_BUSY')
    const controller = new AbortController(); controllers.set(id, controller)
    try {
      for await (const chunk of ai.stream({ prompt, sourceText, signal: controller.signal }, settings.resolve())) {
        if (!controller.signal.aborted && !event.sender.isDestroyed()) {
          const transportEvent = chunk.type === 'error' ? { type: 'error', error: { name: 'AiError', code: chunk.error.code, message: chunk.error.message, status: chunk.error.status, retryable: chunk.error.retryable } } : chunk
          event.sender.send('ai:event', { id, event: transportEvent })
        }
      }
    } finally { controllers.delete(id) }
  })
  return () => { controllers.forEach(controller => controller.abort()); channels.forEach(channel => ipcMain.removeHandler(channel)) }
}
export function sendCommand(window: BrowserWindow, command: DesktopCommand): void { window.webContents.send('app:command', command) }
