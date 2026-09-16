import { _electron as electron } from 'playwright'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

execFileSync(path.resolve('node_modules/.bin/vite.cmd'), ['build', '--config', 'scripts/sdk-harness.vite.ts'], { stdio: 'inherit', shell: true })
const script = readFileSync(path.resolve('dist-sdk-test/harness.js'), 'utf8')
const app = await electron.launch({ args: [path.resolve('scripts/sdk-electron-host.cjs'), '--disable-gpu'] })
const page = await app.firstWindow()
await page.goto('about:blank')
await page.setContent('<div id="a"></div><div id="b"></div>')
await page.addScriptTag({ content: script })
const checks = await page.evaluate(() => (window).__SDK_CHECKS__)
console.log(JSON.stringify(checks))
await app.close()
if (Object.values(checks).some((value) => !value)) process.exit(1)
