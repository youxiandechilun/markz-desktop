import { describe, expect, it } from 'vitest'
import { compileMarkdown } from './compile'
import { applyPatch, patchForNode } from './patch'
import { findNodeAtOffset } from './query'

describe('markdown core', () => {
  it('builds positional GFM index', () => {
    const source = '# 标题\n\n- [x] 完成\n\n```ts\nconst x = 1\n```'
    const result = compileMarkdown(source, { filePath: 'demo.md', revision: 3 })
    expect(result.index.headings[0]?.heading.text).toBe('标题')
    expect(result.index.codeBlocks[0]?.language).toBe('ts')
    expect(result.index.codeBlocks[0]?.position?.start.line).toBe(5)
    expect(findNodeAtOffset(result, 2)?.type).toBe('text')
  })

  it('rejects stale patches and applies exact ranges', () => {
    const compilation = compileMarkdown('hello\nworld', { revision: 2 })
    const patch = { from: 0, to: 5, replacement: 'hi', expectedText: 'hello', expectedRevision: 2 }
    expect(applyPatch(compilation.source, patch, 1).ok).toBe(false)
    const applied = applyPatch(compilation.source, patch, 2)
    expect(applied.ok).toBe(true)
    expect(applied.source).toBe('hi\nworld')
    const nodePatch = patchForNode(compilation, compilation.index.nodes[1]?.id ?? '', 'x')
    expect(nodePatch?.expectedHash).toBeDefined()
  })

  it('keeps UTF-16 offsets and CRLF source intact', () => {
    const source = '\uFEFF# 😀\r\n\r\n正文'
    const compilation = compileMarkdown(source)
    const heading = compilation.index.headings[0]
    expect(heading?.position?.start.offset).toBe(1)
    const from = source.indexOf('😀')
    const to = from + '😀'.length
    const result = applyPatch(source, { from, to, replacement: '🌊', expectedText: '😀' })
    expect(result.ok).toBe(true)
    expect(result.source).toContain('\r\n')
  })

  it('indexes large documents within practical limits', () => {
    const source = ('## section\n\ncontent text\n\n').repeat(40000)
    const started = Date.now()
    const result = compileMarkdown(source)
    expect(result.source.length).toBeGreaterThan(1_000_000)
    expect(result.index.headings.length).toBe(40000)
    expect(Date.now() - started).toBeLessThan(30000)
  }, 30000)
})
