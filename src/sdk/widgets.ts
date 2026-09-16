import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, WidgetType, ViewPlugin, type DecorationSet } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { WidgetDefinition } from '../core/plugins'

class NexusWidget extends WidgetType {
  constructor(private readonly definition: WidgetDefinition, private readonly source: string, private readonly from: number, private readonly to: number) { super() }
  toDOM(): HTMLElement { return this.definition.render({ node: { type: this.definition.nodeType }, source: this.source, from: this.from, to: this.to }) }
  eq(other: NexusWidget): boolean { return other.from === this.from && other.to === this.to && other.definition.nodeType === this.definition.nodeType && other.source === this.source }
  destroy(dom: HTMLElement): void { const candidate = this.definition as WidgetDefinition & { destroy?: (dom: HTMLElement) => void }; candidate.destroy?.(dom) }
}

export function widgetExtension(widgets: WidgetDefinition[]): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }): void { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
    private build(view: EditorView): DecorationSet {
      const ranges: Array<{ from: number; to: number; decoration: Decoration }> = []
      syntaxTree(view.state).iterate({ from: view.viewport.from, to: view.viewport.to, enter: (node) => {
        const definition = widgets.find((item) => item.nodeType === node.name)
        if (definition) ranges.push({ from: node.to, to: node.to, decoration: Decoration.widget({ widget: new NexusWidget(definition, view.state.doc.toString(), node.from, node.to), side: 1 }) })
      } })
      return Decoration.set(ranges.sort((a, b) => a.from - b.from).map((range) => range.decoration.range(range.from, range.to)), true)
    }
  }, { decorations: (value) => value.decorations })
  return plugin
}
