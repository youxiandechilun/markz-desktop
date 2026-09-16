import { createEditor, livePreview } from '../src/sdk'

const host = document.querySelector('#editor')
if (!host) throw new Error('Missing #editor')
const editor = createEditor({ parent: host, value: '# Markz', extensions: [livePreview()] })
editor.onChange((source) => console.log(source))
