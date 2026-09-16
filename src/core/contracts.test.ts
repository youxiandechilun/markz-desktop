import { describe, expect, it } from 'vitest'
import { compileMarkdown, renderCompilation, renderMarkdown } from './compile'
import { applyPatch, applyPatches } from './patch'
import { pointToOffset, offsetToPoint } from './positions'

describe('source fidelity and compiler contracts', () => {
  it.each([
    '# 标题\r\n\r\nA  \r\nB\r\n', '# 😀 e\u0301\n\n[link](https://example.org)\n',
    '标题\n====\n\n~~~ts\nconst x = 1\n~~~\n', '> quote\n>\n> **bold**\n',
    '\uFEFF# 文件\r\n\n## section\r\n', '| A | B |\n| - | - |\n| 1 | 2 |\n',
  ])('never rewrites original source %s', async source => {
    const doc = compileMarkdown(source)
    expect(doc.source).toBe(source)
    await renderCompilation(doc)
    expect(doc.source).toBe(source)
    for (const node of doc.index.nodes) if (node.position) {
      expect(node.position.end.offset).toBeLessThanOrEqual(source.length)
      expect(node.position.start.offset).toBeLessThanOrEqual(node.position.end.offset)
    }
  })
  it('maps code body only, including CRLF and tilde fences', () => {
    const source = '# One\r\n\r\n~~~~ts\r\nconst x = 1\r\n~~~~\r\n\r\nTail'
    const doc = compileMarkdown(source)
    const range = doc.index.codeBlocks[0].contentRange
    expect(range).toBeDefined()
    expect(source.slice(range?.start, range?.end)).toBe('const x = 1\r\n')
  })
  it('maps same-name headings to different IDs with bounded sections', () => {
    const doc = compileMarkdown('# Same\n\nA\n\n# Same\n\nB')
    expect(doc.index.headings[0].id).not.toBe(doc.index.headings[1].id)
    expect(doc.index.headings[0].sectionRange?.end).toBe(doc.index.headings[1].position?.start.offset)
  })
  it('sanitizes encoded dangerous URLs and raw HTML with diagnostic source locations', async () => {
    const doc = compileMarkdown('# hello\n\n[x](javascript:alert%281%29)\n\n<script>alert(1)</script>', { filePath: 'danger.md' })
    const html = await renderCompilation(doc)
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<script')
    expect(html).toContain('data-source-line="1"')
    expect(doc.diagnostics.some(item => item.file === 'danger.md' && item.position && item.code === 'MD_UNSAFE_URL')).toBe(true)
  })
  it('executes syntax and rendering plugins, catches duplicate IDs', async () => {
    const doc = compileMarkdown('hello', { plugins: { syntax: [{ id: 'capital', remark: () => tree => { const paragraph = tree.children[0]; if (paragraph.type === 'paragraph' && paragraph.children[0].type === 'text') paragraph.children[0].value = 'HELLO' } }] } })
    expect(await renderCompilation(doc)).toContain('HELLO')
    const duplicate = compileMarkdown('x', { plugins: { syntax: [{ id: 'same' }, { id: 'same' }] } })
    expect(duplicate.diagnostics[0].code).toBe('MD_PLUGIN_ERROR')
    const html = await renderMarkdown('hello', { plugins: { render: [{ id: 'render', rehype: () => tree => { const paragraph = tree.children[0]; if (paragraph.type === 'element') paragraph.tagName = 'h2' } }] } })
    expect(html).toContain('<h2')
  })
  it('rejects surrogate, CRLF, overlap and stale changes without touching source', () => {
    const source = '😀\r\nhello hello'
    expect(applyPatch(source, { from: 1, to: 2, replacement: 'x' }).ok).toBe(false)
    expect(applyPatch(source, { from: 3, to: 4, replacement: 'x' }).ok).toBe(false)
    expect(applyPatches(source, [{ from: 4, to: 9, replacement: 'A' }, { from: 5, to: 7, replacement: 'B' }]).ok).toBe(false)
    const result = applyPatch(source, { from: 10, to: 15, replacement: 'world', expectedText: 'hello', expectedRevision: 2 }, 2)
    expect(result.source).toBe('😀\r\nhello world')
    expect(applyPatch(source, { from: 10, to: 15, replacement: 'world', expectedRevision: 2 }, 3).source).toBe(source)
  })
  it('converts UTF16 locations for Chinese and emoji across CRLF', () => {
    const source = '😀标题\r\n正文'
    expect(offsetToPoint(source, 6)).toEqual({ offset: 6, line: 2, column: 1 })
    expect(pointToOffset(source, 2, 2)).toBe(7)
  })
})
