import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { isolateHistory, undo, redo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { BracketsCurly, CaretLineRight } from '@phosphor-icons/react'
import type { EditorFontFamily } from '../../shared/desktop'
import type { Locale } from '../types'
import type { SourceSelection } from '../lib/useAi'
import { formatMarkdown, type FormatAction, type FormatLabels } from '../lib/format'
import { livePreview } from '../../sdk/live-preview'
import { createEditor } from '../../sdk/editor'
import { markdownColors, editorLanguage } from '../lib/editor-theme'
import { FormatBar } from './FormatBar'

export interface EditorHandle {
  apply: (from: number, to: number, text: string) => void
  select: (from: number, to: number) => void
  undo: () => void
  redo: () => void
  search: () => void
}
interface Props {
  value: string; onChange: (value: string) => void; onSelectionChange: (selection: SourceSelection) => void
  focusLine?: number | null; locale: Locale; live?: boolean; style?: CSSProperties
  wordWrap: boolean; fontSize: number; fontFamily: EditorFontFamily
  onPreference: (patch: { wordWrap?: boolean; editorFontSize?: number; editorFontFamily?: EditorFontFamily }) => void
}
const fontStacks: Record<EditorFontFamily, string> = { mono: 'var(--font-mono)', sans: 'var(--font-ui)', serif: "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif" }
const labels: Record<Locale, FormatLabels> = {
  'zh-CN': { link: '链接文字', columns: ['列 1', '列 2', '列 3'] },
  en: { link: 'link text', columns: ['Column 1', 'Column 2', 'Column 3'] },
}
function typography(fontSize: number, fontFamily: EditorFontFamily) {
  return EditorView.theme({ '&': { fontSize: `${fontSize}px` }, '.cm-scroller': { fontFamily: fontStacks[fontFamily] } })
}
export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane({ value, onChange, onSelectionChange, focusLine, locale, live, style, wordWrap, fontSize, fontFamily, onPreference }, forwardedRef) {
  const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView | null>(null)
  const preview = useRef(new Compartment())
  const language = useRef(new Compartment())
  const wrapping = useRef(new Compartment())
  const type = useRef(new Compartment())
  const callbacks = useRef({ onChange, onSelectionChange }); callbacks.current = { onChange, onSelectionChange }
  /** Replaces the selection with the Markdown the toolbar button asked for. */
  const runFormat = (action: FormatAction) => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const edit = formatMarkdown(view.state.doc.toString(), from, to, action, labels[locale])
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: Text.of(edit.insert.split('\n')) },
      selection: { anchor: edit.anchor, head: edit.head },
      annotations: isolateHistory.of('full'),
      scrollIntoView: true,
    })
    view.focus()
  }
  useImperativeHandle(forwardedRef, () => ({
    apply(from, to, text) {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ changes: { from, to, insert: Text.of(text.split('\n')) }, selection: { anchor: from + text.length }, annotations: isolateHistory.of('full') })
      view.focus()
    },
    select(from, to) { const view = viewRef.current; if (view) { view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) }); view.focus() } },
    undo() { if (viewRef.current) undo(viewRef.current) },
    redo() { if (viewRef.current) redo(viewRef.current) },
    search() { if (viewRef.current) openSearchPanel(viewRef.current) },
  }), [])
  useEffect(() => {
    if (!host.current) return
    const instance = createEditor({ parent: host.current, value, onChange: text => callbacks.current.onChange(text), extensions: [
      basicSetup, wrapping.current.of(wordWrap ? EditorView.lineWrapping : []),
      markdownColors, language.current.of(editorLanguage(locale)),
      preview.current.of(live ? livePreview() : []),
      EditorView.updateListener.of(update => {
        if (update.selectionSet || update.docChanged) { const { from, to } = update.state.selection.main; callbacks.current.onSelectionChange({ from, to, text: update.state.doc.sliceString(from, to) }) }
      }),
      EditorView.theme({
        '&': { backgroundColor: 'transparent', color: 'var(--editor-text)', height: '100%' },
        '.cm-scroller': { overflow: 'auto', lineHeight: '1.8' },
        '.cm-content': { padding: '30px 28px 100px', caretColor: 'var(--accent)' },
        '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--editor-muted)', border: 'none', paddingLeft: '12px' },
        '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
        // One accent-tinted selection replaces the operating system's blue highlight.
        '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 32%, transparent) !important' },
        '.cm-cursor': { borderLeftColor: 'var(--accent)' },
        '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--ink)' },
        '.cm-textfield': { backgroundColor: 'var(--editor)', color: 'var(--ink)', border: '1px solid var(--line-strong)' },
        '.cm-button': { background: 'var(--panel-strong)', color: 'var(--ink)' },
      }),
      type.current.of(typography(fontSize, fontFamily)),
    ] })
    const view = instance.view
    viewRef.current = view
    return () => { instance.destroy(); viewRef.current = null }
  }, [])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: language.current.reconfigure(editorLanguage(locale)) })
  }, [locale])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: preview.current.reconfigure(live ? livePreview() : []) })
  }, [live])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapping.current.reconfigure(wordWrap ? EditorView.lineWrapping : []) })
  }, [wordWrap])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: type.current.reconfigure(typography(fontSize, fontFamily)) })
  }, [fontSize, fontFamily])
  useEffect(() => {
    const view = viewRef.current
    if (!view || value === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: Text.of(value.split('\n')) }, annotations: isolateHistory.of('full') })
  }, [value])
  useEffect(() => {
    const view = viewRef.current
    if (!view || !focusLine) return
    const line = view.state.doc.line(Math.max(1, Math.min(focusLine, view.state.doc.lines)))
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); view.focus()
  }, [focusLine])
  return <section className={`editor-pane ${live ? 'live-editor' : ''}`} style={style} aria-label={locale === 'zh-CN' ? '编辑文档' : 'Edit document'}><div className="pane-heading"><div className="pane-title"><BracketsCurly size={15}/><span>{live ? (locale === 'zh-CN' ? '内联预览' : 'Live preview') : 'Markdown'}</span></div><span className="pane-meta">CommonMark / GFM</span></div><FormatBar locale={locale} wordWrap={wordWrap} fontSize={fontSize} fontFamily={fontFamily} onPreference={onPreference} onFormat={runFormat}/><div className="editor-host" ref={host}/><div className="editor-hint"><CaretLineRight size={14}/>{locale === 'zh-CN' ? '选中文字，让 AI 精确修改 · Ctrl + F 查找' : 'Select text for precise AI edits · Ctrl + F to find'}</div></section>
})
