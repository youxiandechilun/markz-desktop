import { describe, expect, it } from 'vitest'
import { parseLargeMarkdown } from './segmented'
import { compileMarkdown } from './compile'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

describe('parseLargeMarkdown', () => {
  it('falls back for BOM and document-global nested reference definitions', () => {
    const large = ('# heading\n\n' + 'text '.repeat(42000) + '\n\n').repeat(2)
    for (const definition of ['> [ref]: https://example.org', '- [ref]: https://example.org', '   [ref]: https://example.org']) {
      const source = '[link][ref]\n\n' + large + definition
      expect(parseLargeMarkdown(source)).toBeUndefined()
      expect(compileMarkdown(source).ast).toEqual(unified().use(remarkParse).use(remarkGfm).parse(source))
    }
    expect(parseLargeMarkdown('\uFEFF' + large)).toBeUndefined()
    expect(compileMarkdown('\uFEFF' + large).ast.children[0]?.position?.start.offset).toBe(1)
  }, 30000)

  it('returns undefined for small or reference-definition documents', () => {
    expect(parseLargeMarkdown('# small')).toBeUndefined()
    const source = ('text '.repeat(60000) + '\n\n[ref]: https://example.com\n').repeat(5)
    expect(parseLargeMarkdown(source)).toBeUndefined()
  })

  it('splits a large GFM document only at top-level headings', () => {
    const block = 'paragraph '.repeat(30000)
    const source = `# one\r\n\r\n${block}\r\n\r\n> # quoted\r\n\r\n- item\r\n\r\n\u0060\u0060\u0060ts\r\n# fake\r\n\u0060\u0060\u0060\r\n\r\n# two\r\n\r\nend`
    const ast = parseLargeMarkdown(source)
    expect(ast).toBeDefined()
    expect(ast?.children.filter((node) => node.type === 'heading').map((node) => 'depth' in node ? node.depth : 0)).toEqual([1, 1])
    expect(ast?.position?.start.offset).toBe(0)
    expect(ast?.position?.end.offset).toBe(source.length)
  })

  it('is used by compileMarkdown for large documents without syntax plugins', () => {
    const source = ('# section\n\n' + 'content '.repeat(24000) + '\n\n').repeat(2)
    const result = compileMarkdown(source)
    expect(result.source.length).toBeGreaterThan(256 * 1024)
    expect(result.index.headings.length).toBe(2)
    expect(result.index.headings[1]?.position?.start.column).toBe(1)
  })
})
