import { EditorState, type Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'

export const markdownColors = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.heading, color: 'var(--ink)', fontWeight: '600', textDecoration: 'none' },
  { tag: tags.strong, fontWeight: '650', color: 'var(--ink)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--muted)' },
  { tag: [tags.url, tags.link], color: 'var(--accent-strong)' },
  { tag: [tags.monospace, tags.string], color: 'var(--accent-strong)' },
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
]))
const chinese: Record<string, string> = {
  'Find': '查找', 'Replace': '替换', 'next': '下一个', 'previous': '上一个', 'all': '全部', 'match case': '区分大小写',
  'by word': '全词匹配', 'regexp': '正则表达式', 'replace': '替换', 'replace all': '全部替换', 'close': '关闭',
  'Go to line': '跳转到行', 'go': '跳转', 'Fold line': '折叠行', 'Unfold line': '展开行',
  '$ matches': '$ 处匹配', 'Search': '搜索', 'No matches': '无匹配',
}
export function editorLanguage(locale: string): Extension {
  return [EditorState.phrases.of(locale === 'zh-CN' ? chinese : {}), EditorView.contentAttributes.of({ 'aria-label': locale === 'zh-CN' ? 'Markdown 源码编辑器' : 'Markdown source editor' })]
}
