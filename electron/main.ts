import { app, BrowserWindow, dialog, session } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerBridge, sendCommand } from './bridge'
import { SettingsService } from './settings'
import { installMenu } from './menu'

const directory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
app.setName('Markz')
if (process.env.MARKZ_USER_DATA) app.setPath('userData', process.env.MARKZ_USER_DATA)
const logDirectory = app.isPackaged ? join(app.getPath('userData'), 'logs') : join(process.cwd(), 'logs')
async function log(code: string): Promise<void> { await mkdir(logDirectory, { recursive: true }); await appendFile(join(logDirectory, 'desktop.log'), `${new Date().toISOString()} ${code}\n`) }
process.on('uncaughtException', () => { void log('UNCAUGHT_EXCEPTION'); dialog.showErrorBox('Markz', '发生未处理的错误，请重新启动。 / Unexpected error; restart Markz.') })

async function createWindow(): Promise<void> {
  const settings = new SettingsService(app.getPath('userData'))
  try { await settings.load() } catch (error) { dialog.showErrorBox('Markz', error instanceof Error ? error.message : 'SETTINGS_READ') }
  let dirty = false, closing = false
  const window = new BrowserWindow({ width: 1480, height: 940, minWidth: 960, minHeight: 640, show: false, title: 'Markz', icon: join(app.getAppPath(), 'build/icon.png'), backgroundColor: '#151b20', autoHideMenuBar: true,
    webPreferences: { preload: join(directory, '../preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
  mainWindow = window
  const dispose = registerBridge(window, settings, value => { dirty = value; window.setDocumentEdited(value) }, () => { closing = true; window.close() })
  window.on('closed', () => { dispose(); mainWindow = undefined })
  window.on('close', event => {
    if (!dirty || closing) return
    event.preventDefault()
    const zh = settings.view().preferences.locale === 'zh-CN'
    void dialog.showMessageBox(window, { type: 'question', message: zh ? '保存修改后再关闭？' : 'Save changes before closing?', detail: zh ? '未保存的内容会保留为本地恢复草稿。' : 'Unsaved content is kept as a local recovery draft.', buttons: zh ? ['取消', '保存', '关闭'] : ['Cancel', 'Save', 'Close'], defaultId: 1, cancelId: 0 }).then(result => {
      if (result.response === 1) sendCommand(window, 'save')
      if (result.response === 2) sendCommand(window, 'close')
    })
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('render-process-gone', (_event, details) => { void log(`RENDERER_EXIT ${details.reason}`) })
  window.once('ready-to-show', () => { window.show(); void log('WINDOW_READY') })
  installMenu(window, settings.view().preferences.locale)
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(directory, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const dev = Boolean(process.env.ELECTRON_RENDERER_URL)
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [`default-src 'self'; script-src 'self'${dev ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${dev ? "'self' ws: http://localhost:*" : "'none'"}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'`] } })
  })
  await log('APP_START')
  await createWindow()
  app.on('activate', () => { if (!mainWindow) void createWindow().catch(() => log('WINDOW_CREATE_FAILED')) })
}).catch(() => { void log('START_FAILED'); app.quit() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
