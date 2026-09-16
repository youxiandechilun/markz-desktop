import { describe, expect, it } from 'vitest'
import { inspectMarkdown, renderMarkdown } from './markdown'

describe('markdown document pipeline', () => {
  it('builds an outline and code block index from source text', () => {
    const result = inspectMarkdown('# Guide\n\n## Install\n\n```ts\nconst ready = true\n```')

    expect(result.headings.map((heading) => heading.text)).toEqual(['Guide', 'Install'])
    expect(result.headings[1]?.line).toBe(3)
    expect(result.codeBlocks).toBe(1)
    expect(result.nodeCount).toBeGreaterThan(0)
  })

  it('renders GFM structure without executing raw HTML', async () => {
    const html = await renderMarkdown('# Hello\n\n- [x] done\n\n<script>alert(1)</script>')

    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/)
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('<script>')
  })
})
