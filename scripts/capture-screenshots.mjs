/**
 * Captures the screenshots embedded in README.md.
 *
 * Runs the real Electron window through Playwright with an isolated user-data
 * directory and a fixture workspace, and asserts the expected UI state before
 * every shot so a blank or half-loaded frame cannot end up in the README.
 *
 *   node scripts/capture-screenshots.mjs
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'assets/screenshots')
const scratch = resolve(root, 'artifacts/screenshots')
const userData = resolve(scratch, 'user-data')
const documents = resolve(scratch, 'documents')
const workspace = resolve(documents, 'Markz')

const require = createRequire(import.meta.url)
const executablePath = resolve(require('electron'))
const entry = resolve(root, 'out/main/main.js')
if (!existsSync(executablePath)) throw new Error(`Electron binary not found: ${executablePath}`)
if (!existsSync(entry)) throw new Error(`Build output not found: ${entry}. Run a build first.`)

// A clean user-data directory guarantees the default theme, locale and layout.
rmSync(scratch, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
mkdirSync(workspace, { recursive: true })

writeFileSync(resolve(workspace, 'Markz 设计说明.md'), `# Markz 设计说明

Markz 是一个 Markdown 原生的桌面编辑器。**源文本是唯一真值**，编辑器、预览、索引和 AI 修改都从它派生。

## 核心主张

1. 源码始终可编辑，预览只是派生结果；
2. AI 不重写整篇文档，只提交带校验的区间补丁；
3. 没有 API Key 时，编辑、索引、预览和导出照常可用。

> 写作发生在本地，AI 是可选的一层。

## 待办

- [x] CodeMirror 6 编辑器与四种视图模式
- [x] CommonMark / GFM 解析与安全 HTML 渲染
- [ ] 逐模型连接测试与能力配置

## 请求示例

\`\`\`ts
const editor = createEditor({ parent, value, livePreview: true })
editor.onChange((source) => console.log(source))
\`\`\`

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 编辑器 | CodeMirror 6 | 源码为真值 |
| 解析 | unified / mdast | 派生 AST 与索引 |

详见 [需求规格说明书](docs/01_需求/需求规格说明书.md)。
`, 'utf8')

const proposalText = '写作发生在本地，AI 是可选的一层。它读取选区，提交带校验的补丁，最终是否应用由你决定。'

// A fixture provider: model discovery, the reachability probe, and a streaming edit.
let requests = 0
const server = createServer(async (req, res) => {
  requests += 1
  if (req.url?.endsWith('/models')) {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ data: [
      { id: 'deepseek-v4-pro', context_length: 131072 },
      { id: 'deepseek-flash', context_window: 65536 },
    ] }))
  }
  let body = ''
  for await (const chunk of req) body += String(chunk)
  if (body.includes('Respond with OK.')) {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
  }
  res.setHeader('content-type', 'text/event-stream')
  res.setHeader('cache-control', 'no-cache')
  const parts = proposalText.match(/[^，。]{1,8}[，。]?/g) ?? [proposalText]
  let index = 0
  const timer = setInterval(() => {
    if (index >= parts.length) {
      clearInterval(timer)
      res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
      return res.end('data: [DONE]\n\n')
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[index++] } }] })}\n\n`)
  }, 18)
})
await new Promise(ready => server.listen(0, '127.0.0.1', ready))
const baseUrl = `http://localhost:${server.address().port}/v1`

const app = await electron.launch({
  executablePath,
  args: [root],
  cwd: root,
  env: { ...process.env, MARKZ_SMOKE: '1', MARKZ_USER_DATA: userData, MARKZ_DOCUMENTS: documents },
})

const shots = []
async function shoot(page, name, target) {
  const errors = await page.getByRole('alert').allInnerTexts()
  if (errors.length) throw new Error(`Refusing to capture ${name}: error toast visible -> ${errors.join(' | ')}`)
  const path = resolve(output, name)
  await (target ?? page).screenshot({ path })
  shots.push(name)
  console.log(`captured ${name}`)
}

try {
  const page = await app.firstWindow({ timeout: 30_000 })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.cm-content').waitFor({ timeout: 30_000 })

  // The fixture document must actually be the one on screen before anything is captured.
  const editor = page.locator('.cm-content')
  if (!(await editor.innerText()).includes('Markz 设计说明')) throw new Error('Fixture document did not load')
  if (!(await page.locator('.preview-pane, .preview').count())) throw new Error('Preview pane is missing in split mode')
  await page.waitForTimeout(900)

  // 1. Split view, light theme, default locale.
  await shoot(page, '01-split-light.png')

  // 2. Live preview hides the markers the caret is not in.
  await page.getByRole('button', { name: '内联' }).click()
  await page.waitForTimeout(700)
  await shoot(page, '02-live-light.png')

  // 3. Source mode keeps every marker visible.
  await page.getByRole('button', { name: '源码' }).click()
  await page.waitForTimeout(500)
  await shoot(page, '03-source-light.png')

  // 4. Format bar close-up.
  const formatBar = page.locator('.format-bar')
  if (await formatBar.count() !== 1) throw new Error('Format bar is missing')
  await shoot(page, '04-format-bar.png', formatBar)

  // 5. Dark theme.
  await page.getByRole('button', { name: '切换主题' }).click()
  await page.getByRole('button', { name: '分栏' }).click()
  await page.waitForTimeout(700)
  await shoot(page, '05-split-dark.png')

  // 6. English interface, dark theme.
  await page.getByRole('button', { name: /中文|English/ }).first().click()
  await page.waitForTimeout(700)
  await shoot(page, '06-split-dark-en.png')

  // Back to Chinese and the light theme for the AI shots.
  await page.getByRole('button', { name: /中文|English/ }).first().click()
  await page.getByRole('button', { name: '切换主题' }).click()
  await page.waitForTimeout(500)

  // The fixture provider is saved through the bridge, then reloaded the way the app does at startup.
  const probe = await page.evaluate(async url => {
    const provider = {
      id: 'fixture', name: 'DeepSeek', baseUrl: url, protocol: 'chat-completions',
      apiKey: 'fixture-key-not-a-real-credential', defaultModel: 'deepseek-v4-pro',
      capabilities: { streaming: true, tools: false, structuredOutput: false, reasoning: false, contextWindow: 131072, maxOutputTokens: 4096 },
    }
    await window.nexus.saveProvider(provider)
    await window.nexus.activateProvider('fixture')
    return window.nexus.testConnection(provider)
  }, baseUrl)
  if (!probe || !probe.ok) throw new Error('Fixture provider probe failed')

  await page.reload()
  await page.locator('.cm-content').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(900)

  // 7. AI settings: model list with per-model capability configuration.
  // "exact" picks the topbar control; the sidebar's own settings button is labelled 打开设置.
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: 'AI 服务' }).click()
  await page.locator('.model-section').waitFor({ timeout: 10_000 })
  const modelRows = page.locator('.model-row')
  if (await modelRows.count() < 1) throw new Error('Saved provider has no model rows')
  await page.waitForTimeout(600)
  await shoot(page, '07-ai-settings.png')
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.waitForTimeout(400)

  // 8. A streamed proposal next to the selection it will replace.
  await page.getByRole('button', { name: 'AI 助手' }).click()
  const target = page.locator('.cm-line', { hasText: '写作发生在本地' }).first()
  await target.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  const instruction = page.getByRole('textbox', { name: '写作指令' })
  await instruction.fill('把这句话写得更具体一些')
  await page.getByRole('button', { name: '发送指令' }).click()
  // The action row renders as soon as the proposal exists, so wait on the streaming
  // indicator disappearing rather than on the button appearing.
  await page.locator('.proposal-card').waitFor({ timeout: 20_000 })
  await page.locator('.proposal-stream').waitFor({ state: 'detached', timeout: 30_000 })
  const apply = page.getByRole('button', { name: '应用修改' })
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.includes('应用修改'))
    return Boolean(button && !button.disabled)
  }, null, { timeout: 20_000 })
  const diff = await page.locator('.diff-add').innerText()
  if (!diff.includes('补丁')) throw new Error(`Proposal diff did not render the streamed edit: ${diff}`)
  await page.waitForTimeout(400)
  await shoot(page, '08-ai-proposal.png')

  if (pageErrors.length) throw new Error(`Renderer page errors: ${pageErrors.join('; ')}`)
  console.log(`\n${shots.length} screenshots -> ${output}`)
  console.log(`fixture requests: ${requests}`)
} finally {
  try {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy() })
  } catch { /* the window may already be gone */ }
  await app.close()
  server.close()
}
