import { Editor } from '../src/sdk/react'
import { livePreview } from '../src/sdk'

export function App() {
  return <Editor value={'# Markz\n\nWrite in Markdown.'} extensions={[livePreview()]} style={{ height: '100vh' }} />
}
