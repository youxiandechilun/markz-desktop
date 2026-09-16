import { performance } from 'node:perf_hooks'
import { cpus, totalmem, platform, release } from 'node:os'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { compileMarkdown, renderCompilation, findNodeAtOffset } from '../dist-sdk/core.js'

const artifacts = new URL('../artifacts/', import.meta.url)
await mkdir(artifacts, { recursive: true })
function dataset(bytes) {
  const blocks = []
  let size = 0, index = 0
  while (size < bytes) {
    const block = `## 第 ${index} 节 / Section ${index}\n\n${'这里是一段带有中文、English、emoji 😀 和 **重点** 的原生 Markdown 文本。'.repeat(12)}\n\n> 引用内容，保留软换行。\n\n- [x] 已完成\n- [ ] 待完成\n\n~~~typescript\nfunction item${index}(value: string) {\n  return value.trim()\n}\n~~~\n\n| 项目 | 状态 |\n| --- | --- |\n| 文档 ${index} | ready |\n\n`
    blocks.push(block); size += Buffer.byteLength(block); index++
  }
  return blocks.join('')
}
const samples = Number(process.env.MARKZ_BENCH_SAMPLES ?? 5)
const report = { machine: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramGiB: totalmem() / 1024 ** 3, os: `${platform()} ${release()}`, node: process.version }, samples, datasets: [], bundles: [] }
for (const target of [100 * 1024, 1024 ** 2, 5 * 1024 ** 2]) {
  const source = dataset(target), parses = [], renders = [], queries = []
  let nodeCount = 0
  for (let iteration = 0; iteration < samples; iteration++) {
    const start = performance.now(), doc = compileMarkdown(source)
    parses.push(performance.now() - start); nodeCount = doc.index.nodes.length
    const renderStart = performance.now(); await renderCompilation(doc); renders.push(performance.now() - renderStart)
    if (iteration === 0) for (let i = 0; i < 100; i++) {
      const queryStart = performance.now(); findNodeAtOffset(doc, Math.floor(source.length * i / 100)); queries.push(performance.now() - queryStart)
    }
    console.log(`${Math.round(target / 1024)} KiB ${iteration + 1}/${samples}: parse=${parses.at(-1).toFixed(1)}ms render=${renders.at(-1).toFixed(1)}ms`)
  }
  const summary = values => ({ min: Math.min(...values), median: [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)], max: Math.max(...values) })
  report.datasets.push({ bytes: Buffer.byteLength(source), nodeCount, parseMs: summary(parses), htmlMs: summary(renders), queryP95Ms: queries.sort((a,b) => a-b)[94], heapMiB: process.memoryUsage().heapUsed / 1024 ** 2 })
}
for (const name of await readdir(new URL('../out/renderer/assets/', import.meta.url))) {
  if (!/\.(js|css)$/.test(name)) continue
  const bytes = await readFile(new URL(`../out/renderer/assets/${name}`, import.meta.url))
  report.bundles.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length })
}
await writeFile(new URL('benchmark.json', artifacts), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
