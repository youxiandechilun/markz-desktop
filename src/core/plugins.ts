import type { Extension } from '@codemirror/state'
import type { Root } from 'mdast'
import type { Root as HtmlRoot } from 'hast'
import type { Plugin } from 'unified'
export interface WidgetContext { node: { type: string; value?: unknown; position?: unknown }; source: string; from: number; to: number }
export interface WidgetDefinition { nodeType: string; render: (context: WidgetContext) => HTMLElement; destroy?: (element: HTMLElement) => void; onError?: (error: Error) => void }
export interface EditorPlugin { id: string; extensions?: Extension | Extension[]; commands?: Record<string, () => boolean> }
export interface SyntaxPlugin { id: string; remark?: Plugin<[], Root> }
export interface RenderPlugin { id: string; transform?: (tree: Root) => Root; rehype?: Plugin<[], HtmlRoot>; widgets?: WidgetDefinition[] }
export interface NexusPluginBundle { editor?: EditorPlugin[]; syntax?: SyntaxPlugin[]; render?: RenderPlugin[] }
