import type { MarkdownCompilation, IndexedNode } from './types'

export function findNodeAtOffset(compilation: MarkdownCompilation, offset: number): IndexedNode | undefined {
  return compilation.index.nodes
    .filter((node) => node.position && offset >= node.position.start.offset && offset <= node.position.end.offset)
    .sort((a, b) => (b.position!.start.offset - a.position!.start.offset) || (a.position!.end.offset - b.position!.end.offset))[0]
}

export function findNodesByType(compilation: MarkdownCompilation, type: string): IndexedNode[] {
  return compilation.index.nodes.filter((node) => node.type === type)
}

export function findHeading(compilation: MarkdownCompilation, text: string): IndexedNode | undefined {
  const normalized = text.trim().toLocaleLowerCase()
  return compilation.index.headings.find((heading) => heading.heading.text.trim().toLocaleLowerCase() === normalized)
}
