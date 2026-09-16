import { describe, expect, it } from 'vitest'
import { formatMarkdown, type FormatAction, type FormatEdit } from './format'

const labels = { link: '链接文字', columns: ['列 1', '列 2', '列 3'] as const }
function run(text: string, from: number, to: number, action: FormatAction) {
  const edit = formatMarkdown(text, from, to, action, labels)
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  return { ...edit, text: next, selected: next.slice(edit.anchor, edit.head) }
}
/** Select `needle` inside `text` so cases read as document plus selection. */
function pick(text: string, needle: string, occurrence = 0) {
  let index = -1
  for (let found = 0; found <= occurrence; found++) index = text.indexOf(needle, index + 1)
  return { text, from: index, to: index + needle.length }
}

describe('inline formatting', () => {
  it('opens an empty marker pair for an empty selection', () => {
    const result = run('', 0, 0, 'bold')
    expect(result).toMatchObject({ from: 0, to: 0, insert: '****', anchor: 2, head: 2 })
  })

  it('wraps, unwraps inside, and unwraps around a selection', () => {
    const inner = pick('hello', 'ell')
    const wrapped = run(inner.text, inner.from, inner.to, 'bold')
    expect(wrapped.text).toBe('h**ell**o'); expect(wrapped.selected).toBe('ell')
    const unwrapped = run('**ell**', 2, 5, 'bold')
    expect(unwrapped.text).toBe('ell')
    const around = run('a **b** c', 4, 5, 'bold')
    expect(around.text).toBe('a b c')
  })

  it('uses the marker of each inline action', () => {
    expect(run('x', 0, 1, 'italic').text).toBe('*x*')
    expect(run('x', 0, 1, 'strike').text).toBe('~~x~~')
    expect(run('x', 0, 1, 'inline-code').text).toBe('`x`')
  })

  it('wraps a selection as a link and selects the placeholder URL', () => {
    const result = run('see site now', 4, 8, 'link')
    expect(result.text).toBe('see [site](https://) now'); expect(result.selected).toBe('https://')
  })

  it('unwraps an existing link and selects its text', () => {
    const result = run('[site](https://x)', 0, 18, 'link')
    expect(result.text).toBe('site'); expect(result.selected).toBe('site')
  })
})

describe('line formatting', () => {
  it('applies and removes a heading without moving the caret text', () => {
    const added = run('title', 0, 0, 'heading-2')
    expect(added.text).toBe('## title'); expect(added.anchor).toBe(3)
    expect(run('## title', 3, 3, 'heading-2').text).toBe('title')
    expect(run('# title', 3, 3, 'heading-2').text).toBe('## title')
  })

  it('prefixes every selected line and keeps the selection meaningful', () => {
    const bullets = run('a\nb', 0, 3, 'bullet-list')
    // The selection is mapped past the prefix it gains, so it stays on the text.
    expect(bullets.text).toBe('- a\n- b'); expect(bullets.selected).toBe('a\n- b')
    expect(run('a\nb', 0, 3, 'ordered-list').text).toBe('1. a\n2. b')
    expect(run('- a\n- b', 0, 7, 'bullet-list').text).toBe('a\nb')
    expect(run('- a', 0, 3, 'task-list').text).toBe('- [ ] a')
    expect(run('a', 0, 1, 'quote').text).toBe('> a')
    expect(run('> a', 2, 2, 'quote').text).toBe('a')
  })

  it('formats only the lines the selection touches', () => {
    const { text, from, to } = pick('one\ntwo\nthree', 'two')
    const result = run(text, from, to, 'bullet-list')
    expect(result.text).toBe('one\n- two\nthree')
  })
})

describe('block formatting', () => {
  it('fences a selection as a code block', () => {
    const result = run('const a = 1', 0, 11, 'code-block')
    expect(result.text).toBe('```\nconst a = 1\n```'); expect(result.selected).toBe('const a = 1')
  })

  it('opens an empty code block on a fresh line', () => {
    const result = run('ab', 1, 1, 'code-block')
    expect(result.text).toBe('a\n```\n\n```\nb'); expect(result.anchor).toBe(6)
  })

  it('inserts a divider and a table template', () => {
    expect(run('a\n', 2, 2, 'divider').text).toBe('a\n---\n')
    const table = run('', 0, 0, 'table')
    expect(table.text).toBe('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |')
    expect(table.selected).toBe('列 1')
  })
})

describe('selection mapping', () => {
  it('keeps the caret inside a line it reformats', () => {
    const edit: FormatEdit = formatMarkdown('hello world', 8, 8, 'heading-1', labels)
    const next = 'hello world'.slice(0, edit.from) + edit.insert + 'hello world'.slice(edit.to)
    expect(next).toBe('# hello world')
    expect(next.slice(edit.anchor, edit.head)).toBe('')
    expect(edit.anchor).toBe(10)
  })
})
