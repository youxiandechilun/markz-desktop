import { compileMarkdown, renderMarkdown } from '../../core'
export { renderMarkdown }
export interface OutlineItem { id: string; depth: number; text: string; line: number }
export interface MarkdownDocument { title: string; headings: OutlineItem[]; wordCount: number; nodeCount: number; codeBlocks: number }
export function inspectMarkdown(source: string): MarkdownDocument {
  const compilation = compileMarkdown(source)
  const headings = compilation.index.headings.map(item => ({ id: item.id, depth: item.heading.depth, text: item.heading.text, line: item.position?.start.line ?? 1 }))
  return { title: headings[0]?.text ?? 'Untitled document', headings, wordCount: source.length, nodeCount: compilation.index.nodes.length, codeBlocks: compilation.index.codeBlocks.length }
}
export function getSelectedText(source: string, from: number, to: number): string { return source.slice(Math.min(from, to), Math.max(from, to)) }
