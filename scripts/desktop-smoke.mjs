/** Native Electron smoke test powered by Playwright's Electron driver. */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const electronPath = resolve(require('electron'))
const entry = resolve(root, 'out/main/main.js')
const artifacts = resolve(root, 'artifacts')
const userData = resolve(artifacts, 'smoke-user-data')

if (!existsSync(electronPath)) throw new Error(`Electron binary not found: ${electronPath}`)
if (!existsSync(entry)) throw new Error(`Build output not found: ${entry}. Run pnpm build first.`)
mkdirSync(artifacts, { recursive: true })

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  cwd: root,
  env: { ...process.env, MARKZ_SMOKE: '1', MARKZ_USER_DATA: userData },
})
try {
  const window = await app.firstWindow({ timeout: 20_000 })
  const pageErrors = []
  window.on('pageerror', (error) => pageErrors.push(error.message))
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(500)
  const bodyText = await window.locator('body').innerText()
  if (bodyText.trim().length < 20) throw new Error('Renderer body is unexpectedly empty')
  const editor = window.locator('.cm-content')
  if (await editor.count() !== 1) throw new Error('CodeMirror editor was not mounted')
  await editor.click()
  await window.keyboard.press('Control+Z')
  const themeToggle = window.getByRole('button', { name: /切换主题|Toggle theme/i })
  if (await themeToggle.count() !== 1) throw new Error('Theme toggle is missing')
  await themeToggle.click()
  const localeToggle = window.getByRole('button', { name: /中文|English/i }).first()
  if (await localeToggle.count() !== 1) throw new Error('Language toggle is missing')
  await localeToggle.click()
  await window.getByRole('button', { name: /中文|English/i }).first().click()
  const ioDir = resolve(artifacts, 'io')
  mkdirSync(ioDir, { recursive: true })
  const sourcePath = resolve(ioDir, 'smoke.md')
  const exportPath = resolve(ioDir, 'smoke.html')
  writeFileSync(sourcePath, '# Smoke\n\n内容', 'utf8')
  // Replace Electron's chooser methods so open/export IPC handlers use only
  // files inside this test directory.
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.source] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.export })
  }, { source: sourcePath, export: exportPath })
  const opened = await window.evaluate(() => window.nexus?.openMarkdown())
  if (!opened?.content.includes('# Smoke')) throw new Error('Markdown open IPC failed')
  const saved = await window.evaluate(async ({ sourcePath: target, fingerprint }) => {
    if (!window.nexus) throw new Error('window.nexus bridge is unavailable')
    return window.nexus.saveMarkdown({ content: '# Saved\n', filePath: target, fingerprint, saveAs: false })
  }, { sourcePath, fingerprint: opened.fingerprint })
  if (!saved?.filePath || !readFileSync(sourcePath, 'utf8').includes('# Saved')) throw new Error('Markdown save IPC failed')
  const exported = await window.evaluate(() => window.nexus?.exportHtml('<h1>Smoke</h1>'))
  if (exported !== exportPath || !readFileSync(exportPath, 'utf8').includes('Smoke')) throw new Error('HTML export IPC failed')
  if (pageErrors.length > 0) throw new Error(`Renderer page errors: ${pageErrors.join('; ')}`)
  await window.screenshot({ path: resolve(artifacts, 'desktop-smoke.png'), fullPage: true })
  console.log(`Electron smoke passed: native window loaded (${bodyText.length} chars).`)
  console.log(`Screenshot: ${resolve(artifacts, 'desktop-smoke.png')}`)
} finally {
  // Destroy windows from the main process so an unsaved-document guard cannot
  // keep the smoke process alive after assertions complete.
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy()
  })
  await app.close()
}
