import { Compartment, EditorState, Text, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { compileMarkdown, renderCompilation, type CompileOptions } from '../core/compile'
import type { MarkdownCompilation, NexusPluginBundle } from '../core'
import { livePreview } from './live-preview'
import { widgetExtension } from './widgets'

export interface NexusEditorOptions extends CompileOptions {
  parent: HTMLElement; value?: string; extensions?: Extension[]; plugins?: NexusPluginBundle; readOnly?: boolean
  livePreview?: boolean; onChange?: (value: string, revision: number) => void; onFocus?: () => void; onBlur?: () => void
}

export class NexusEditor {
  readonly view: EditorView
  private revision = 0
  private compilationCache?: MarkdownCompilation
  private readonly options: NexusEditorOptions
  private readonly editableCompartment = new Compartment()
  private readonly previewCompartment = new Compartment()
  private readonly readOnlyCompartment = new Compartment()
  private readonly changeListeners = new Set<(value: string, revision: number) => void>()
  private readonly focusListeners = new Set<() => void>()
  private readonly blurListeners = new Set<() => void>()

  constructor(options: NexusEditorOptions) {
    this.options = options
    const initial = options.value ?? ''
    const pluginExtensions = options.plugins?.editor?.flatMap((plugin) => plugin.extensions ? (Array.isArray(plugin.extensions) ? plugin.extensions : [plugin.extensions]) : []) ?? []
    const widgetDefs = options.plugins?.render?.flatMap((plugin) => plugin.widgets ?? []) ?? []
    const state = EditorState.create({ doc: Text.of(initial.split('\n')), extensions: [EditorState.lineSeparator.of('\n'), markdown(), history(), keymap.of([...defaultKeymap, ...historyKeymap]), this.readOnlyCompartment.of(EditorState.readOnly.of(Boolean(options.readOnly))), this.editableCompartment.of(EditorView.editable.of(!options.readOnly)), this.previewCompartment.of(options.livePreview ? livePreview() : []), ...(widgetDefs.length ? [widgetExtension(widgetDefs)] : []), ...pluginExtensions, ...(options.extensions ?? []), EditorView.updateListener.of((update) => {
      if (update.focusChanged) { (update.view.hasFocus ? this.focusListeners : this.blurListeners).forEach((listener) => listener()); (update.view.hasFocus ? options.onFocus : options.onBlur)?.() }
      if (!update.docChanged) return
      this.revision += 1; this.compilationCache = undefined
      const value = update.state.doc.toString(); options.onChange?.(value, this.revision); this.changeListeners.forEach((listener) => listener(value, this.revision))
    })] })
    this.view = new EditorView({ state, parent: options.parent })
  }
  get value(): string { return this.view.state.doc.toString() }
  get ast(): MarkdownCompilation['ast'] { return this.getCompilation().ast }
  get index(): MarkdownCompilation['index'] { return this.getCompilation().index }
  get diagnostics(): MarkdownCompilation['diagnostics'] { return this.getCompilation().diagnostics }
  get revisionNumber(): number { return this.revision }
  getSelectedText(): string { const { from, to } = this.view.state.selection.main; return this.value.slice(from, to) }
  getCompilation(): MarkdownCompilation { return this.compilationCache ??= compileMarkdown(this.value, { filePath: this.options.filePath, revision: this.revision, plugins: this.options.plugins }) }
  setValue(value: string): void { this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: Text.of(value.split('\n')) } }) }
  setReadOnly(readOnly: boolean): void { this.view.dispatch({ effects: [this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)), this.editableCompartment.reconfigure(EditorView.editable.of(!readOnly))] }) }
  setLivePreview(enabled: boolean): void { this.view.dispatch({ effects: this.previewCompartment.reconfigure(enabled ? livePreview() : []) }) }
  setCallbacks(callbacks: Pick<NexusEditorOptions, 'onChange' | 'onFocus' | 'onBlur'>): void { this.options.onChange = callbacks.onChange; this.options.onFocus = callbacks.onFocus; this.options.onBlur = callbacks.onBlur }
  focus(): void { this.view.focus() }
  onChange(listener: (value: string, revision: number) => void): () => void { this.changeListeners.add(listener); return () => this.changeListeners.delete(listener) }
  onFocus(listener: () => void): () => void { this.focusListeners.add(listener); return () => this.focusListeners.delete(listener) }
  onBlur(listener: () => void): () => void { this.blurListeners.add(listener); return () => this.blurListeners.delete(listener) }
  async toHTML(): Promise<string> { return renderCompilation(this.getCompilation(), this.options.plugins) }
  destroy(): void { this.view.destroy(); this.changeListeners.clear(); this.focusListeners.clear(); this.blurListeners.clear() }
}
export function createEditor(options: NexusEditorOptions): NexusEditor { return new NexusEditor(options) }


