import { createEditor } from '../src/sdk/editor'
import { livePreview } from '../src/sdk/live-preview'
import { widgetExtension } from '../src/sdk/widgets'

const a = document.querySelector('#a') as HTMLElement
const b = document.querySelector('#b') as HTMLElement
const first = createEditor({ parent: a, value: '# A\r\n\r\ntext', livePreview: true })
const second = createEditor({ parent: b, value: '# B' })
const checks: Record<string, boolean> = {}
checks.twoInstances = a.querySelector('.cm-editor') !== null && b.querySelector('.cm-editor') !== null
first.setValue('# A\r\n\r\nchanged')
checks.crlf = first.value.includes('\r\n')
first.setReadOnly(true)
checks.readOnly = first.view.state.readOnly
first.setReadOnly(false)
first.view.dispatch({ changes: { from: first.view.state.doc.length, insert: '\nmore' } })
first.view.dispatch({ changes: { from: first.view.state.doc.length, insert: 'x' } })
first.view.dispatch({})
checks.undoAvailable = first.view.state.doc.toString().includes('more')
const previewHost = document.createElement('div'); document.body.appendChild(previewHost)
const preview = createEditor({ parent: previewHost, value: '# Preview', extensions: [livePreview()] })
const before = preview.value
checks.livePreviewPreservesText = before === '# Preview' && previewHost.querySelector('.cm-editor') !== null
preview.view.dispatch({ selection: { anchor: 2 } })
checks.livePreviewSelectionUpdate = preview.value === before
let destroyed = false
const widgetHost = document.createElement('div'); document.body.appendChild(widgetHost)
const widget = createEditor({ parent: widgetHost, value: '```\nhello\n```', plugins: { render: [{ id: 'w', widgets: [{ nodeType: 'FencedCode', render: () => { const el = document.createElement('span'); el.textContent = 'W'; return el }, destroy: () => { destroyed = true } }] }] } })
checks.widgetRender = widgetHost.textContent?.includes('W') ?? false
widget.setValue('```\nworld\n```'); checks.widgetUpdate = widgetHost.textContent?.includes('W') ?? false
widget.destroy(); checks.widgetDestroy = destroyed
preview.destroy(); previewHost.remove(); widgetHost.remove()
first.destroy(); second.destroy()
checks.destroy = a.querySelector('.cm-editor') === null && b.querySelector('.cm-editor') === null
;(window as unknown as { __SDK_CHECKS__: typeof checks }).__SDK_CHECKS__ = checks
