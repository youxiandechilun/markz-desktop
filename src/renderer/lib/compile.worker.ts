import { compileMarkdown, renderCompilation } from '../../core'

interface CompileJob { source: string; revision: number; filePath?: string }
self.onmessage = async (event: MessageEvent<CompileJob>) => {
  const { source, revision, filePath } = event.data
  try {
    const compilation = compileMarkdown(source, { revision, filePath })
    const html = await renderCompilation(compilation)
    const { index, diagnostics, hash } = compilation
    self.postMessage({ revision, compilation: { index, diagnostics, hash, revision }, html })
  } catch (error) {
    self.postMessage({ revision, error: error instanceof Error ? error.message : 'COMPILE_FAILED' })
  }
}
