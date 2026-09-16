import type { Nodes, Root } from 'mdast'
import type { IndexedNode, MarkdownIndex, SourcePosition } from './types'
export function sourcePosition(node: Nodes): SourcePosition | undefined {
  const p = node.position
  if (!p || p.start.offset === undefined || p.end.offset === undefined) return undefined
  return { start: { offset: p.start.offset, line: p.start.line, column: p.start.column }, end: { offset: p.end.offset, line: p.end.line, column: p.end.column } }
}
function textOf(node: Nodes): string {
  if ('value' in node) return node.value
  return 'children' in node ? node.children.map(textOf).join('') : ''
}
function codeRange(source: string, position: SourcePosition): { start: number; end: number } | undefined {
  const start = position.start.offset, end = position.end.offset, raw = source.slice(start, end)
  const opening = /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/.exec(raw)
  if (!opening) return undefined // Indented code remains indexable by full range.
  const bodyStart = start + opening[0].length
  const closingStart = source.lastIndexOf('\n', end - 1) + 1
  const closing = source.slice(closingStart, end)
  const marker = opening[2][0], length = opening[2].length
  const match = /^( {0,3})(`{3,}|~{3,})[ \t]*\r?$/.exec(closing)
  const hasClosing = match && match[2][0] === marker && match[2].length >= length && closingStart >= bodyStart
  return { start: bodyStart, end: hasClosing ? closingStart : end }
}
export function buildIndex(ast: Root, source: string, revision: number, file?: string): MarkdownIndex {
  const nodes: IndexedNode[] = [], byId: Record<string, IndexedNode> = Object.create(null)
  const headings: MarkdownIndex['headings'] = [], codeBlocks: MarkdownIndex['codeBlocks'] = []
  const walk = (node: Nodes, depth: number, parentId: string | undefined, path: string): string => {
    const id = `${node.type}:${path}`, position = sourcePosition(node)
    const item: IndexedNode = { id, type: node.type, position, depth, parentId, children: [], file }
    if (node.type === 'heading') {
      const heading = { depth: node.depth, text: textOf(node) }
      item.heading = heading; item.text = heading.text; headings.push({ ...item, heading })
    } else if (node.type === 'code') {
      const text = node.value
      item.text = text; item.language = node.lang ?? undefined
      item.contentRange = position ? codeRange(source, position) : undefined
      codeBlocks.push({ ...item, text })
    } else if (node.type === 'paragraph' || node.type === 'text' || node.type === 'inlineCode') item.text = textOf(node)
    nodes.push(item); byId[id] = item
    if ('children' in node) node.children.forEach((child, index) => item.children.push(walk(child, depth + 1, id, `${path}.${index}`)))
    return id
  }
  walk(ast, 0, undefined, '0')
  const stack: MarkdownIndex['headings'] = []
  for (let i = headings.length - 1; i >= 0; i--) {
    const heading = headings[i]
    while (stack.length && stack[stack.length - 1].heading.depth > heading.heading.depth) stack.pop()
    const next = stack[stack.length - 1]
    heading.sectionRange = { start: heading.position?.start.offset ?? 0, end: next?.position?.start.offset ?? source.length }
    const original = byId[heading.id]; if (original) original.sectionRange = heading.sectionRange
    stack.push(heading)
  }
  return { nodes, byId, headings, codeBlocks, revision }
}
