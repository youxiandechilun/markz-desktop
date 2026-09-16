import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const artifacts = resolve(root, 'artifacts', 'settings-smoke')
mkdirSync(artifacts, { recursive: true })
const userData = mkdtempSync(resolve(artifacts, 'userdata-'))
const requests = []
let modelsStatus = 404
const fixtureModels = [{ id: 'fixture-vision', context_length: 131072 }, { id: 'fixture-text' }]
const server = createServer(async (req, res) => {
  requests.push(req.url)
  res.setHeader('content-type', 'application/json')
  if (req.url === '/v1/models') {
    if (modelsStatus !== 200) { res.statusCode = modelsStatus; res.end('{}'); return }
    res.end(JSON.stringify({ data: fixtureModels })); return
  }
  if (req.url !== '/v1/messages' || req.headers['x-api-key'] !== 'settings-test-key') { res.statusCode = 400; res.end('{}'); return }
  let body = ''; for await (const chunk of req) body += chunk
  assert.ok(fixtureModels.some(model => model.id === JSON.parse(body).model))
  res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }))
})
await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady))
const address = server.address()
const executablePath = process.env.MARKZ_EXECUTABLE || electronPath
const app = await electron.launch({ executablePath, args: process.env.MARKZ_EXECUTABLE ? [] : [root], cwd: root, env: { ...process.env, MARKZ_USER_DATA: userData, MARKZ_SMOKE: '1' } })
try {
  const page = await app.firstWindow({ timeout: 20000 })
  page.setDefaultTimeout(15000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const text = dialog.getByRole('checkbox', { name: '文本（始终开启）' })
  const image = dialog.getByRole('checkbox', { name: '图像', exact: true })
  assert.equal(await text.isChecked(), true)
  assert.equal(await text.isDisabled(), true)
  assert.equal(await image.isChecked(), false)
  assert.equal(await dialog.getByRole('checkbox').count(), 2)
  await dialog.getByLabel('服务名称', { exact: true }).fill('Settings fixture')
  await dialog.getByPlaceholder('https://api.example.com/v1').fill(`http://localhost:${address.port}/v1`)
  await dialog.getByLabel(/^请求协议/).selectOption('anthropic-messages')
  await dialog.getByPlaceholder('输入服务商提供的 Key').fill('settings-test-key')
  await dialog.getByRole('button', { name: '获取模型', exact: true }).click()
  await dialog.getByText(/MODEL_LIST_UNAVAILABLE/).waitFor()
  assert.match(await dialog.locator('.settings-message').innerText(), /手动填写模型 ID/)
  assert.doesNotMatch(await dialog.locator('.settings-message').innerText(), /remote method/)
  await dialog.getByLabel('模型 ID', { exact: true }).fill('fixture-vision')
  await dialog.locator('label.capability-item').filter({ hasText: /^图像$/ }).click()
  assert.equal(await image.isChecked(), true)
  await dialog.getByRole('button', { name: '测试连接', exact: true }).click()
  await dialog.getByText('连接成功，已收到模型响应。', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await dialog.waitFor({ state: 'hidden' })
  const settings = await page.evaluate(() => window.nexus.getSettings())
  assert.equal(settings.providers[0].capabilities.text, true)
  assert.equal(settings.providers[0].capabilities.image, true)
  assert.equal(settings.providers[0].modelCapabilities['fixture-vision'].image, true)
  assert.equal(readFileSync(resolve(userData, 'settings.json'), 'utf8').includes('settings-test-key'), false)
  await page.reload(); await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  assert.equal(await dialog.getByRole('checkbox', { name: '图像', exact: true }).isChecked(), true)
  await dialog.screenshot({ path: resolve(artifacts, 'model-capabilities-zh.png') })
  await dialog.getByRole('button', { name: '关闭设置' }).click()
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  assert.equal(await dialog.getByRole('checkbox', { name: 'Text (always enabled)' }).isDisabled(), true)
  assert.equal(await dialog.getByRole('checkbox', { name: 'Images', exact: true }).isChecked(), true)
  await dialog.getByRole('button', { name: 'Fetch models' }).click()
  await dialog.getByText(/Enter a model ID manually/).waitFor()
  // Discovery fills the list directly, and every model is probed on its own.
  modelsStatus = 200
  await dialog.getByRole('button', { name: 'Fetch models' }).click()
  await dialog.getByText(/1 added to the list/).waitFor()
  assert.equal(await dialog.locator('.model-row').count(), 2)
  assert.equal(await dialog.locator('.model-row').filter({ hasText: 'fixture-text' }).count(), 1)
  await dialog.getByRole('button', { name: 'Test all models' }).click()
  await dialog.getByText(/All 2 models are reachable/).waitFor()
  assert.equal(await dialog.locator('.model-badge.probe-ok').count(), 2)
  await dialog.screenshot({ path: resolve(artifacts, 'model-capabilities-en.png') })
  // Fetching into a brand new provider needs no second click: a model becomes current.
  await dialog.getByRole('button', { name: 'Add provider' }).click()
  await dialog.getByPlaceholder('https://api.example.com/v1').fill(`http://localhost:${address.port}/v1`)
  await dialog.getByRole('button', { name: 'Fetch models' }).click()
  await dialog.getByText(/2 added to the list/).waitFor()
  assert.equal(await dialog.locator('.model-row').count(), 2)
  assert.equal(await dialog.getByRole('button', { name: 'Save & use' }).isEnabled(), true)
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, ['/v1/models', '/v1/messages', '/v1/models', '/v1/models', '/v1/messages', '/v1/messages', '/v1/models'])
  console.log(`Settings Electron smoke passed: locked text, images saved/reloaded, 404 recovery, manual probe, auto-added models, per-model probes, zh/en; requests=${requests.length}`)
} finally {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()))
  await app.close()
  await new Promise(resolveClosed => server.close(resolveClosed))
  if (userData.startsWith(resolve(artifacts, 'userdata-'))) rmSync(userData, { recursive: true, force: true })
}
