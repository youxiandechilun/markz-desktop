import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { isolateHistory, undo, redo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { BracketsCurly, CaretLineRight } from '@phosphor-icons/react'
import type { Locale } from '../types'
import type { SourceSelection } from '../lib/useAi'
import { livePreview } from '../../sdk/live-preview'
import { createEditor } from '../../sdk/editor'
import { markdownColors, editorLanguage } from '../lib/editor-theme'

export interface EditorHandle {
  apply: (from: number, to: number, text: string) => void
  select: (from: number, to: number) => void
  undo: () => void
  redo: () => void
  search: () => void
}
interface Props {
  value: string; onChange: (value: string) => void; onSelectionChange: (selection: SourceSelection) => void
  focusLine?: number | null; locale: Locale; live?: boolean
}
export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane({ value, onChange, onSelectionChange, focusLine, locale, live }, forwardedRef) {
  const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView | null>(null)
  const preview = useRef(new Compartment())
  const language = useRef(new Compartment())
  const callbacks = useRef({ onChange, onSelectionChange }); callbacks.current = { onChange, onSelectionChange }
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
      basicSetup, EditorView.lineWrapping,
      markdownColors, language.current.of(editorLanguage(locale)),
      preview.current.of(live ? livePreview() : []),
      EditorView.updateListener.of(update => {
        if (update.selectionSet || update.docChanged) { const { from, to } = update.state.selection.main; callbacks.current.onSelectionChange({ from, to, text: update.state.doc.sliceString(from, to) }) }
      }),
      EditorView.theme({
        '&': { backgroundColor: 'transparent', color: 'var(--editor-text)', height: '100%', fontSize: '14px' },
        '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto', lineHeight: '1.8' },
        '.cm-content': { padding: '30px 28px 100px', caretColor: 'var(--accent)' },
        '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--editor-muted)', border: 'none', paddingLeft: '12px' },
        '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
        '.cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important' },
        '.cm-cursor': { borderLeftColor: 'var(--accent)' },
        '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--ink)' },
        '.cm-textfield': { backgroundColor: 'var(--editor)', color: 'var(--ink)', border: '1px solid var(--line-strong)' },
        '.cm-button': { background: 'var(--panel-strong)', color: 'var(--ink)' },
      }),
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
  return <section className={`editor-pane ${live ? 'live-editor' : ''}`} aria-label={locale === 'zh-CN' ? '编辑文档' : 'Edit document'}><div className="pane-heading"><div className="pane-title"><BracketsCurly size={15}/><span>{live ? (locale === 'zh-CN' ? '内联预览' : 'Live preview') : 'Markdown'}</span></div><span className="pane-meta">CommonMark / GFM</span></div><div className="editor-host" ref={host}/><div className="editor-hint"><CaretLineRight size={14}/>{locale === 'zh-CN' ? '选中文字，让 AI 精确修改 · Ctrl + F 查找' : 'Select text for precise AI edits · Ctrl + F to find'}</div></section>
})
