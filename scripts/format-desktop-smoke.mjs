/**
 * Native Electron smoke test for the editor format bar, the word-wrap switch, and
 * the AI composer's Enter / Shift + Enter behaviour.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const electronPath = resolve(require('electron'))
const entry = resolve(root, 'out/main/main.js')
const artifacts = resolve(root, 'artifacts', 'format-smoke')

if (!existsSync(electronPath)) throw new Error(`Electron binary not found: ${electronPath}`)
if (!existsSync(entry)) throw new Error(`Build output not found: ${entry}. Run pnpm build first.`)
mkdirSync(artifacts, { recursive: true })
// Earlier runs leave a provider and a recovery draft behind; this test asserts what
// a first launch does, so both have to start empty.
rmSync(resolve(artifacts, 'user-data'), { recursive: true, force: true })
rmSync(resolve(artifacts, 'documents'), { recursive: true, force: true })

// A reasoning model answers with thinking tokens first, then the document text.
const server = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += String(chunk)
  if (req.url?.endsWith('/models')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'thinking-model' }] })); return }
  if (body.includes('Respond with OK.')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return }
  res.setHeader('content-type', 'text/event-stream')
  const write = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)
  const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms))
  for (const piece of ['先想', '一步']) { write({ choices: [{ delta: { reasoning_content: piece } }] }); await pause(250) }
  await pause(700)
  write({ choices: [{ delta: { content: '流式' } }] })
  await pause(1200)
  write({ choices: [{ delta: { content: '正文' } }] })
  await pause(20)
  res.end('data: [DONE]\n\n')
})
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
const port = server.address().port

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  cwd: root,
  env: {
    ...process.env,
    MARKZ_SMOKE: '1',
    MARKZ_USER_DATA: resolve(artifacts, 'user-data'),
    MARKZ_DOCUMENTS: resolve(artifacts, 'documents'),
  },
})
try {
  const page = await app.firstWindow({ timeout: 20_000 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')

  const editor = page.locator('.cm-content')
  const scroller = page.locator('.cm-scroller')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('hello world')
  await page.keyboard.press('Control+A')

  // 1. The format bar wraps the selection and toggles it back off.
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  if (!(await editor.innerText()).includes('**hello world**')) throw new Error('Bold formatting did not apply')
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  if ((await editor.innerText()).includes('**')) throw new Error('Bold formatting did not toggle off')

  // 2. A list command prefixes each selected line.
  await page.getByRole('button', { name: '无序列表', exact: true }).click()
  if (!(await editor.innerText()).includes('- hello world')) throw new Error('List formatting did not apply')
  await page.getByRole('button', { name: '无序列表', exact: true }).click()

  // 3. Editor type settings persist into the rendered editor.
  await page.getByLabel('字号').selectOption('18')
  await page.waitForTimeout(120)
  const fontSize = await page.locator('.cm-editor').evaluate((node) => getComputedStyle(node).fontSize)
  if (fontSize !== '18px') throw new Error(`Font size preference was not applied: ${fontSize}`)

  // 4. Word wrap decides whether a long line overflows sideways. Measured through
  //    the scroller so the check does not depend on the extension's class names.
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('x'.repeat(600))
  await page.waitForTimeout(120)
  const wrapped = await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  if (!wrapped) throw new Error('Word wrap is on by default but the line overflowed')
  await page.getByRole('button', { name: '自动换行', exact: true }).click()
  await page.waitForTimeout(120)
  const overflowing = await scroller.evaluate((node) => node.scrollWidth > node.clientWidth)
  if (!overflowing) throw new Error('Turning word wrap off did not restore horizontal scrolling')
  await page.getByRole('button', { name: '自动换行', exact: true }).click()

  // 5. The settings dialog exposes the same switch.
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: '通用' }).click()
  const wrapSwitch = dialog.getByRole('switch', { name: '自动换行' })
  if (await wrapSwitch.count() !== 1) throw new Error('Settings is missing the word-wrap switch')
  if (!(await wrapSwitch.isChecked())) throw new Error('Word wrap should stay on until the user turns it off')
  await wrapSwitch.click()
  await page.waitForTimeout(120)
  if (await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)) throw new Error('Settings switch did not disable wrapping')
  await wrapSwitch.click()
  await dialog.getByRole('button', { name: '关闭设置' }).click()

  // 6. Enter sends the AI instruction; Shift + Enter inserts a newline. With no
  //    provider configured, sending is provable through its error notification.
  await page.getByRole('button', { name: 'AI 助手' }).click()
  const instruction = page.getByRole('textbox', { name: '写作指令' })
  await instruction.fill('第一行')
  await instruction.press('Shift+Enter')
  await page.keyboard.type('第二行')
  if (!(await instruction.inputValue()).includes('\n') || await page.getByRole('alert').count()) throw new Error('Shift + Enter did not insert a newline')
  await instruction.fill('测试发送')
  await instruction.press('Enter')
  await page.getByRole('alert').filter({ hasText: '请先配置 AI 服务与模型' }).waitFor({ timeout: 5_000 })

  // 7. A reasoning model must look alive while it thinks: the panel shows the
  //    thinking trace during the think, and keeps it out of the applied document.
  await page.evaluate(async (baseUrl) => {
    const nexus = window.nexus
    if (!nexus) throw new Error('nexus bridge is unavailable')
    await nexus.saveProvider({ id: 'thinking', name: 'Thinking', baseUrl, protocol: 'chat-completions', apiKey: 'smoke-key', defaultModel: 'thinking-model', capabilities: { streaming: true, tools: false, structuredOutput: false, reasoning: true } })
    await nexus.activateProvider('thinking')
  }, `http://localhost:${port}/v1`)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: 'AI 助手' }).click()
  const composer = page.getByRole('textbox', { name: '写作指令' })
  await composer.fill('写一句')
  await composer.press('Enter')
  const status = page.locator('.proposal-stream')
  await page.locator('.reasoning-body').filter({ hasText: '先想一步' }).waitFor({ timeout: 10_000 })
  // The thinking is on screen while the answer is still pending, which is what makes
  // a long reasoning turn look alive instead of stalled.
  if (await page.locator('.stream-pulse').count() !== 1) throw new Error('No live progress indicator while thinking')
  if ((await page.locator('.diff-add').innerText()).includes('流式正文')) throw new Error('The answer appeared before the thinking trace')
  await status.filter({ hasText: '已接收 2 字' }).waitFor({ timeout: 10_000 })
  await page.locator('.diff-add').filter({ hasText: '流式正文' }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: '应用修改' }).click()
  const applied = await page.locator('.cm-content').innerText()
  if (!applied.includes('流式正文')) throw new Error('Streamed answer was not applied to the document')
  if (applied.includes('先想一步')) throw new Error('Reasoning text leaked into the document')

  await page.screenshot({ path: resolve(artifacts, 'format-smoke.png'), fullPage: true })
  if (pageErrors.length > 0) throw new Error(`Renderer page errors: ${pageErrors.join('; ')}`)
  console.log('Format smoke passed: bold/list toggles, font size, word wrap, Enter to send, streamed reasoning.')
  console.log(`Screenshot: ${resolve(artifacts, 'format-smoke.png')}`)
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy()
  })
  await app.close()
  await new Promise((resolveClose) => server.close(() => resolveClose()))
}
