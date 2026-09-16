import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

const hidden = Decoration.replace({})
const heading = Decoration.mark({ class: 'nexus-inline-heading' })
const strong = Decoration.mark({ class: 'nexus-inline-strong' })

function build(view: EditorView): DecorationSet {
  const ranges: Array<{ from: number; to: number; deco: Decoration }> = []
  const selection = view.state.selection.main
  syntaxTree(view.state).iterate({ from: view.viewport.from, to: view.viewport.to, enter: (node) => {
    const name = node.name
    const active = selection.from >= node.from && selection.to <= node.to
    if (active) return
    if (/^ATXHeading\d$/.test(name)) {
      const line = view.state.doc.lineAt(node.from)
      const prefix = line.text.match(/^#{1,6}\s+/)
      if (prefix) {
        ranges.push({ from: line.from, to: line.from + prefix[0].length, deco: hidden })
        ranges.push({ from: line.from + prefix[0].length, to: node.to, deco: heading })
      }
    } else if (name === 'StrongEmphasis' && node.to - node.from >= 4) {
      ranges.push({ from: node.from, to: node.from + 2, deco: hidden }, { from: node.to - 2, to: node.to, deco: hidden }, { from: node.from + 2, to: node.to - 2, deco: strong })
    } else if (name === 'Emphasis' && node.to - node.from >= 2) {
      ranges.push({ from: node.from, to: node.from + 1, deco: hidden }, { from: node.to - 1, to: node.to, deco: hidden })
    } else if (name === 'InlineCode' && node.to - node.from >= 2) {
      ranges.push({ from: node.from, to: node.from + 1, deco: hidden }, { from: node.to - 1, to: node.to, deco: hidden })
    }
  } })
  return Decoration.set(ranges.sort((a, b) => a.from - b.from || a.to - b.to).map((range) => range.deco.range(range.from, range.to)), true)
}

const plugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = build(view) }
  update(update: { docChanged: boolean; viewportChanged: boolean; selectionSet: boolean; view: EditorView }): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = build(update.view)
  }
}, { decorations: (value) => value.decorations })

export function livePreview(): Extension { return plugin }
