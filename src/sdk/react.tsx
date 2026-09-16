import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react'
import { NexusEditor, type NexusEditorOptions } from './editor'

export interface EditorProps extends Omit<NexusEditorOptions, 'parent'> {
  className?: string
  style?: CSSProperties
  onReady?: (editor: NexusEditor) => void
}

export function Editor({ className, style, onReady, ...options }: EditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<NexusEditor | null>(null)
  useEffect(() => {
    if (!hostRef.current) return undefined
    const editor = new NexusEditor({ ...options, parent: hostRef.current })
    editorRef.current = editor
    onReady?.(editor)
    return () => { editor.destroy(); editorRef.current = null }
  }, [])
  useEffect(() => { const editor = editorRef.current; if (!editor) return; editor.setCallbacks({ onChange: options.onChange, onFocus: options.onFocus, onBlur: options.onBlur }) }, [options.onChange, options.onFocus, options.onBlur])
  useEffect(() => { const editor = editorRef.current; if (!editor || options.value === undefined || options.value === editor.value) return; editor.setValue(options.value) }, [options.value])
  useEffect(() => { editorRef.current?.setReadOnly(Boolean(options.readOnly)) }, [options.readOnly])
  useEffect(() => { editorRef.current?.setLivePreview(Boolean(options.livePreview)) }, [options.livePreview])
  return <div ref={hostRef} className={className} style={style} />
}
