import { app, BrowserWindow, dialog, session } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerBridge, sendCommand } from './bridge'
import { SettingsService } from './settings'
import { installMenu } from './menu'

const directory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
app.setName('Markz')
if (process.env.MARKZ_USER_DATA) app.setPath('userData', process.env.MARKZ_USER_DATA)
// Integration tests keep all documents in an isolated fixture directory.
if (process.env.MARKZ_SMOKE === '1' && process.env.MARKZ_DOCUMENTS) app.setPath('documents', process.env.MARKZ_DOCUMENTS)
const logDirectory = app.isPackaged ? join(app.getPath('userData'), 'logs') : join(process.cwd(), 'logs')
/** Diagnostics must never become the failure they are meant to record. */
// Synchronous on purpose: the exit-path lines are the ones most likely to be the last
// thing written, and an async append is lost when the process ends right after.
function log(code: string): void { try { mkdirSync(logDirectory, { recursive: true }); appendFileSync(join(logDirectory, 'desktop.log'), `${new Date().toISOString()} ${code}\n`) } catch { /* an unwritable log must not break the app */ } }
function describe(error: unknown): string { return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/\s+/g, ' ').slice(0, 300) }
process.on('uncaughtException', error => { void log(`UNCAUGHT_EXCEPTION ${describe(error)}`); dialog.showErrorBox('Markz', '发生未处理的错误，请重新启动。 / Unexpected error; restart Markz.') })
process.on('unhandledRejection', reason => { void log(`UNHANDLED_REJECTION ${describe(reason)}`) })
// A dead network or GPU process explains an app that disappears without a JS error.
app.on('child-process-gone', (_event, details) => { void log(`CHILD_PROCESS_GONE ${details.type} ${details.reason} exit=${details.exitCode}`) })
app.on('before-quit', () => { void log('APP_QUIT') })

async function createWindow(): Promise<void> {
  const settings = new SettingsService(app.getPath('userData'))
  try { await settings.load() } catch (error) { dialog.showErrorBox('Markz', error instanceof Error ? error.message : 'SETTINGS_READ') }
  let dirty = false, closing = false
  const window = new BrowserWindow({ width: 1480, height: 940, minWidth: 960, minHeight: 640, show: false, title: 'Markz', icon: join(app.getAppPath(), 'build/icon.png'), backgroundColor: '#eef1ef', autoHideMenuBar: true,
    webPreferences: { preload: join(directory, '../preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
  mainWindow = window
  const dispose = registerBridge(window, settings, value => { dirty = value; window.setDocumentEdited(value) }, () => { closing = true; window.close() }, log)
  window.on('closed', () => { void log('WINDOW_CLOSED'); dispose(); mainWindow = undefined })
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
  window.webContents.on('render-process-gone', (_event, details) => { void log(`RENDERER_EXIT ${details.reason} exit=${details.exitCode}`) })
  window.webContents.on('console-message', details => { if (details.level === 'error') void log(`RENDERER_ERROR ${details.message.replace(/\s+/g, ' ').slice(0, 300)}`) })
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
  log('APP_START')
  await createWindow()
  app.on('activate', () => { if (!mainWindow) void createWindow().catch(() => log('WINDOW_CREATE_FAILED')) })
}).catch(() => { void log('START_FAILED'); app.quit() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
