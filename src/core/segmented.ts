import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root, Node, RootContent } from 'mdast'
import { parser as lezerParser } from '@lezer/markdown'

const parser = unified().use(remarkParse).use(remarkGfm)
const CHUNK_LIMIT = 192 * 1024

/** Parse very large documents in heading-delimited chunks when boundaries are safe. */
export function parseLargeMarkdown(source: string): Root | undefined {
  if (source.length <= 256 * 1024 || source.startsWith('\uFEFF')) return undefined
  // Definitions inside blockquotes/lists are also document-global in CommonMark.
  // Conservative fallback preserves references whose definitions cross chunks.
  if (/\[[^\]]+\]:/.test(source)) return undefined
  const boundaries = findSafeBoundaries(source)
  if (boundaries.length < 3) return undefined
  const children: RootContent[] = []
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i]!
    const end = boundaries[i + 1]!
    const chunk = source.slice(start, end)
    try {
      const tree = parser.parse(chunk) as Root
      const base = point(source, start)
      tree.children.forEach((node) => { shiftNode(node, start, base); children.push(node) })
    } catch { return undefined }
  }
  return { type: 'root', children, position: { start: point(source, 0), end: point(source, source.length) } }
}

function findSafeBoundaries(source: string): number[] {
  const result = [0]
  let last = 0
  const tree = lezerParser.parse(source)
  let cursor = tree.topNode.firstChild
  while (cursor) {
    if (/^ATXHeading\d$/.test(cursor.name) && cursor.from - last >= CHUNK_LIMIT) { result.push(cursor.from); last = cursor.from }
    cursor = cursor.nextSibling
  }
  result.push(source.length)
  return result
}

function point(source: string, offset: number): { line: number; column: number; offset: number } {
  const before = source.slice(0, offset)
  const breaks = before.match(/\r\n|\r|\n/g)?.length ?? 0
  const index = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'))
  return { line: breaks + 1, column: offset - index, offset }
}

function shiftNode(node: Node, delta: number, base: { line: number; column: number; offset: number }): void {
  if (node.position) { const startLine = node.position.start.line; const endLine = node.position.end.line; node.position.start.offset = (node.position.start.offset ?? 0) + delta; node.position.end.offset = (node.position.end.offset ?? 0) + delta; node.position.start.line += base.line - 1; node.position.end.line += base.line - 1; if (startLine === 1) node.position.start.column += base.column - 1; if (endLine === 1) node.position.end.column += base.column - 1 }
  if ('children' in node && Array.isArray(node.children)) node.children.forEach((child) => shiftNode(child, delta, base))
}
