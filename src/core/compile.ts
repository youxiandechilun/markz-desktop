import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Root, Nodes } from 'mdast'
import type { Root as HtmlRoot, Nodes as HtmlNode } from 'hast'
import type { Diagnostic, MarkdownCompilation } from './types'
import type { NexusPluginBundle } from './plugins'
import { sourceHash } from './patch'
import { buildIndex, sourcePosition } from './source-index'
import { parseLargeMarkdown } from './segmented'
export interface CompileOptions { filePath?: string; revision?: number; plugins?: NexusPluginBundle }

function assertUniquePlugins(plugins?: NexusPluginBundle): void {
  const ids = [...(plugins?.editor ?? []), ...(plugins?.syntax ?? []), ...(plugins?.render ?? [])].map(plugin => plugin.id)
  if (new Set(ids).size !== ids.length) throw new Error('PLUGIN_DUPLICATE: Duplicate plugin ID')
}
function visit(node: Nodes, visitor: (node: Nodes) => void): void { visitor(node); if ('children' in node) node.children.forEach(child => visit(child, visitor)) }
export function compileMarkdown(source: string, options: CompileOptions = {}): MarkdownCompilation {
  const diagnostics: Diagnostic[] = [], revision = options.revision ?? 0
  let ast: Root = { type: 'root', children: [] }
  try {
    assertUniquePlugins(options.plugins)
    const processor = unified().use(remarkParse).use(remarkGfm)
    for (const plugin of options.plugins?.syntax ?? []) if (plugin.remark) processor.use(plugin.remark)
    const segmented = (options.plugins?.syntax?.length ?? 0) === 0 ? parseLargeMarkdown(source) : undefined
    const parsed = segmented ?? processor.runSync(processor.parse(source))
    if (parsed.type !== 'root' || !('children' in parsed) || !Array.isArray(parsed.children)) throw new Error('PLUGIN_AST_INVALID')
    ast = parsed as Root
    if (source.startsWith('\uFEFF')) visit(ast, node => {
      if (node.position) for (const point of [node.position.start, node.position.end]) {
        if (point.offset !== undefined) point.offset += 1
        if (point.line === 1) point.column += 1
      }
    })
    visit(ast, node => {
      if (node.type === 'html') diagnostics.push({ code: 'MD_RAW_HTML', message: '原始 HTML 已保留在源文中，预览和导出会忽略它。', messageEn: 'Raw HTML stays in the source and is omitted from preview/export.', severity: 'info', file: options.filePath, position: sourcePosition(node) })
      if ((node.type === 'link' || node.type === 'image') && /^(?:javascript|vbscript|data):/i.test(node.url.trim())) diagnostics.push({ code: 'MD_UNSAFE_URL', message: '不安全的链接协议已从 HTML 输出中移除。', messageEn: 'Unsafe URL scheme removed from HTML output.', severity: 'warning', file: options.filePath, position: sourcePosition(node) })
    })
  } catch (error) {
    diagnostics.push({ code: 'MD_PLUGIN_ERROR', message: error instanceof Error ? error.message : 'Markdown 插件处理失败', messageEn: 'Markdown plugin failed.', severity: 'error', file: options.filePath, position: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } } })
  }
  return { source, ast, index: buildIndex(ast, source, revision, options.filePath), diagnostics, revision, hash: sourceHash(source) }
}
function addSourceMap() {
  return (tree: HtmlRoot) => {
    const walk = (node: HtmlNode) => {
      if (node.type === 'element' && node.position) {
        node.properties.dataSourceLine = node.position.start.line
        node.properties.dataSourceOffset = node.position.start.offset
      }
      if ('children' in node) node.children.forEach(walk)
    }
    walk(tree)
  }
}
function pipeline(plugins?: NexusPluginBundle) {
  let processor = unified().use(remarkRehype, { allowDangerousHtml: false })
  for (const plugin of plugins?.render ?? []) if (plugin.rehype) processor = processor.use(plugin.rehype)
  return processor.use(rehypeSanitize, { ...defaultSchema, attributes: { ...defaultSchema.attributes, '*': [...(defaultSchema.attributes?.['*'] ?? []), 'dataSourceLine', 'dataSourceOffset'] } }).use(addSourceMap).use(rehypeStringify)
}
export async function renderCompilation(compilation: MarkdownCompilation, plugins?: NexusPluginBundle): Promise<string> {
  assertUniquePlugins(plugins)
  let tree = compilation.ast
  if (plugins?.render?.some(plugin => plugin.transform)) { tree = structuredClone(tree); for (const plugin of plugins.render) if (plugin.transform) tree = plugin.transform(tree) }
  const renderer = pipeline(plugins), html = await renderer.run(tree)
  return renderer.stringify(html)
}
export async function renderMarkdown(source: string, options: CompileOptions = {}): Promise<string> { return renderCompilation(compileMarkdown(source, options), options.plugins) }
export function renderMarkdownSync(source: string, options: CompileOptions = {}): string {
  const compilation = compileMarkdown(source, options)
  let tree = compilation.ast
  for (const plugin of options.plugins?.render ?? []) if (plugin.transform) tree = plugin.transform(tree)
  const renderer = pipeline(options.plugins)
  return renderer.stringify(renderer.runSync(tree))
}
