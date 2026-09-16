/**
 * Markdown formatting commands for the source editor. Every command is a pure
 * function of the document and the selection, so the editor only has to dispatch
 * the returned change.
 */
export type FormatAction =
  | 'bold' | 'italic' | 'strike' | 'inline-code' | 'link'
  | 'heading-1' | 'heading-2' | 'heading-3'
  | 'quote' | 'bullet-list' | 'ordered-list' | 'task-list'
  | 'code-block' | 'divider' | 'table'

export interface FormatLabels { link: string; columns: readonly [string, string, string] }
export interface FormatEdit { from: number; to: number; insert: string; anchor: number; head: number }

const inline: Partial<Record<FormatAction, string>> = { bold: '**', italic: '*', strike: '~~', 'inline-code': '`' }
const headingLevels: Partial<Record<FormatAction, string>> = { 'heading-1': '# ', 'heading-2': '## ', 'heading-3': '### ' }
const linePrefixes: Partial<Record<FormatAction, string>> = { quote: '> ', 'bullet-list': '- ', 'task-list': '- [ ] ' }

export function formatMarkdown(text: string, from: number, to: number, action: FormatAction, labels: FormatLabels): FormatEdit {
  const marker = inline[action]
  if (marker) return formatInline(text, from, to, marker)
  if (action === 'link') return formatLink(text, from, to, labels.link)
  if (action === 'code-block') return formatCodeBlock(text, from, to)
  if (action === 'divider') return formatDivider(text, from, to)
  if (action === 'table') return formatTable(text, from, to, labels.columns)
  return formatLines(text, from, to, action, headingLevels[action], linePrefixes[action])
}

/** Wrap, unwrap, or open a marker pair around the selection. */
function formatInline(text: string, from: number, to: number, marker: string): FormatEdit {
  const size = marker.length
  if (from === to) {
    const insert = marker + marker
    return { from, to, insert, anchor: from + size, head: from + size }
  }
  const inner = text.slice(from, to)
  if (inner.length >= size * 2 + 1 && inner.startsWith(marker) && inner.endsWith(marker)) {
    const stripped = inner.slice(size, -size)
    return { from, to, insert: stripped, anchor: from, head: from + stripped.length }
  }
  const wrapped = text.slice(from - size, from) === marker && text.slice(to, to + size) === marker
  if (wrapped) return { from: from - size, to: to + size, insert: inner, anchor: from - size, head: to - size }
  if (!inner.trim()) return { from, to, insert: marker + inner + marker, anchor: from + size, head: to + size }
  const insert = marker + inner + marker
  return { from, to, insert, anchor: from + size, head: from + size + inner.length }
}

function formatLink(text: string, from: number, to: number, label: string): FormatEdit {
  const inner = text.slice(from, to)
  const existing = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(inner)
  if (existing) return { from, to, insert: existing[1] ?? '', anchor: from, head: from + (existing[1]?.length ?? 0) }
  // The URL placeholder stays selected so the address can be typed straight away.
  const linkLabel = inner.trim() ? inner : label
  const insert = `[${linkLabel}](https://)`
  const anchor = from + linkLabel.length + 3
  if (inner.trim()) return { from, to, insert, anchor, head: anchor + 8 }
  return { from, to, insert, anchor: from + 1, head: from + 1 + linkLabel.length }
}

function formatCodeBlock(text: string, from: number, to: number): FormatEdit {
  const leading = from === 0 || text[from - 1] === '\n' ? '' : '\n'
  const trailing = to === text.length || text[to] === '\n' ? '' : '\n'
  if (from === to) {
    const insert = `${leading}\`\`\`\n\n\`\`\`${trailing}`
    const anchor = from + leading.length + 4
    return { from, to, insert, anchor, head: anchor }
  }
  const inner = text.slice(from, to)
  const insert = `${leading}\`\`\`\n${inner}\n\`\`\`${trailing}`
  const anchor = from + leading.length + 4
  return { from, to, insert, anchor, head: anchor + inner.length }
}

function formatDivider(text: string, from: number, to: number): FormatEdit {
  const leading = from === 0 || text[from - 1] === '\n' ? '' : '\n'
  const insert = `${leading}---\n`
  const anchor = from + insert.length
  return { from, to, insert, anchor, head: anchor }
}

function formatTable(text: string, from: number, to: number, columns: readonly [string, string, string]): FormatEdit {
  const leading = from === 0 || text[from - 1] === '\n' ? '' : '\n'
  const trailing = to === text.length || text[to] === '\n' ? '' : '\n'
  const insert = `${leading}| ${columns[0]} | ${columns[1]} | ${columns[2]} |\n| --- | --- | --- |\n|  |  |  |${trailing}`
  const anchor = from + leading.length + 2
  return { from, to, insert, anchor, head: anchor + columns[0].length }
}

/** Apply or remove a line-level prefix across every line the selection touches. */
function formatLines(text: string, from: number, to: number, action: FormatAction, heading?: string, prefix?: string): FormatEdit {
  const start = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1
  const end = text.indexOf('\n', to) === -1 ? text.length : text.indexOf('\n', to)
  const lines = text.slice(start, end).split('\n')
  // The button clears the formatting only when every touched line already carries it;
  // otherwise a different level or list style is replaced.
  const toggled = lines.every(line => appliedPrefixLength(line, action, heading, prefix) > 0)
  let delta = 0, anchor: number | null = null, head: number | null = null
  const offsets: number[] = [0]
  for (const line of lines) offsets.push((offsets[offsets.length - 1] ?? 0) + line.length + 1)
  const next = lines.map((line, index) => {
    const lineStart = start + (offsets[index] ?? 0)
    const removed = toggled ? appliedPrefixLength(line, action, heading, prefix) : strippedPrefixLength(line, action, heading)
    const inserted = toggled ? '' : (action === 'ordered-list' ? `${index + 1}. ` : (heading ?? prefix ?? ''))
    const shift = (position: number) => lineStart + delta + inserted.length + Math.max(0, position - lineStart - removed)
    if (from >= lineStart && from <= lineStart + line.length) anchor = shift(from)
    if (to >= lineStart && to <= lineStart + line.length) head = shift(to)
    delta += inserted.length - removed
    return inserted + line.slice(removed)
  }).join('\n')
  return { from: start, to: end, insert: next, anchor: anchor ?? start, head: head ?? anchor ?? start }
}

/** Length of the prefix that means "this formatting is already applied". */
function appliedPrefixLength(line: string, action: FormatAction, heading?: string, prefix?: string): number {
  if (heading) return new RegExp(`^#{${heading.trim().length}}\\s+`).exec(line)?.[0].length ?? 0
  if (action === 'ordered-list') return /^\d+\.\s+/.exec(line)?.[0].length ?? 0
  if (action === 'task-list') return /^[-*+]\s+\[ \]\s+/.exec(line)?.[0].length ?? 0
  if (action === 'bullet-list') return /^-\s+/.exec(line)?.[0].length ?? 0
  if (prefix) return new RegExp(`^${escapeRegExp(prefix.trim())}\\s*`).exec(line)?.[0].length ?? 0
  return 0
}

/** Length of the prefix to drop before the requested formatting is written. */
function strippedPrefixLength(line: string, action: FormatAction, heading?: string): number {
  if (heading || action === 'ordered-list') return /^(#{1,6}\s+|\d+\.\s+)/.exec(line)?.[0].length ?? 0
  if (action === 'bullet-list') return /^[-*+]\s+/.exec(line)?.[0].length ?? 0
  if (action === 'task-list') return /^[-*+]\s+(\[[ xX]\]\s+)?/.exec(line)?.[0].length ?? 0
  return 0
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
