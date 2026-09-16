import type { Root, Nodes } from 'mdast'
export type { Root } from 'mdast'
export type MarkdownAstNode = Nodes
export type MdastNode = Nodes
export interface SourcePoint { offset: number; line: number; column: number }
export interface SourcePosition { start: SourcePoint; end: SourcePoint }
export interface IndexedNode {
  id: string
  type: string
  position?: SourcePosition
  depth: number
  parentId?: string
  text?: string
  heading?: { depth: number; text: string }
  children: string[]
  language?: string
  contentRange?: { start: number; end: number }
  sectionRange?: { start: number; end: number }
  file?: string
}
export interface MarkdownIndex {
  nodes: IndexedNode[]
  byId: Record<string, IndexedNode>
  headings: Array<IndexedNode & { heading: { depth: number; text: string } }>
  codeBlocks: Array<IndexedNode & { text: string }>
  revision: number
}
export type DiagnosticSeverity = 'error' | 'warning' | 'info'
export interface Diagnostic { code: string; message: string; messageEn?: string; severity: DiagnosticSeverity; file?: string; position?: SourcePosition }
export interface MarkdownCompilation { source: string; ast: Root; index: MarkdownIndex; diagnostics: Diagnostic[]; revision: number; hash: string }
