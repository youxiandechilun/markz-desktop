import { _electron as electron } from 'playwright'
import path from 'node:path'

const app = await electron.launch({ args: [path.resolve('out/main/main.js')], timeout: 30000 })
const page = await app.firstWindow({ timeout: 30000 })
await page.waitForLoadState('domcontentloaded')
const title = await page.title()
if (!title) throw new Error('Electron window has no title')
console.log(JSON.stringify({ ok: true, title, url: page.url() }))
await app.close()
