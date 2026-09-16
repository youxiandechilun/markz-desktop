import { useEffect, useRef, useState } from 'react'
import type { MarkdownCompilation } from '../../core'

interface CompileResult { revision: number; compilation?: Pick<MarkdownCompilation, 'index' | 'diagnostics' | 'hash' | 'revision'>; html?: string; error?: string }
export function useCompilation(source: string, revision: number, filePath?: string) {
  const [result, setResult] = useState<CompileResult>({ revision: -1 })
  const workerRef = useRef<Worker | null>(null)
  const latest = useRef({ source, revision, filePath })
  latest.current = { source, revision, filePath }
  const busy = useRef(false)
  const dispatch = () => {
    if (busy.current || !workerRef.current) return
    busy.current = true
    workerRef.current.postMessage(latest.current)
  }
  useEffect(() => {
    const worker = new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<CompileResult>) => {
      busy.current = false
      if (event.data.revision === latest.current.revision) setResult(event.data)
      else dispatch()
    }
    worker.onerror = (error) => { busy.current = false; setResult({ revision: latest.current.revision, error: `WORKER_FAILED: ${error.message}` }) }
    dispatch()
    return () => { worker.terminate(); workerRef.current = null; busy.current = false }
  }, [])
  useEffect(() => { const timer = setTimeout(dispatch, 220); return () => clearTimeout(timer) }, [source, revision, filePath])
  return { ...result, pending: result.revision !== revision }
}
