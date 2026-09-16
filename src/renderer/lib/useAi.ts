import { useEffect, useRef, useState } from 'react'
import type { PublicProvider } from '../../../electron/settings'
export interface SourceSelection { from: number; to: number; text: string }
export interface AiProposal { from: number; to: number; expectedText: string; revision: number; text: string; reasoning: string; startedAt: number; state: 'streaming' | 'ready' | 'truncated' | 'failed' }
interface AiInput { source: string; revision: number; selection: SourceSelection; provider?: PublicProvider; locale: string; notify: (message: string) => void }
export function useAi(input: AiInput) {
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const [generating, setGenerating] = useState(false)
  const [context, setContext] = useState<'selection' | 'document'>('selection')
  const active = useRef<string | null>(null)
  const streamed = useRef('')
  const latest = useRef(input); latest.current = input
  // A token can arrive every few milliseconds. Painting one React update per token
  // starves the frame loop and makes the stream look stuck, so deltas are batched
  // into one render per tick. A timer is used rather than a frame callback because
  // an unfocused window throttles animation frames.
  const pendingText = useRef(''), pendingReasoning = useRef(''), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = () => {
    timer.current = null
    const text = pendingText.current, reasoning = pendingReasoning.current
    if (!text && !reasoning) return
    pendingText.current = ''; pendingReasoning.current = ''
    setProposal(current => current ? { ...current, text: current.text + text, reasoning: current.reasoning + reasoning } : null)
  }
  const append = (field: 'text' | 'reasoning', value: string) => {
    if (field === 'text') pendingText.current += value; else pendingReasoning.current += value
    if (timer.current === null) timer.current = setTimeout(flush, 40)
  }
  const clearPending = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null } pendingText.current = ''; pendingReasoning.current = '' }
  useEffect(() => {
    if (!window.nexus) return
    const off = window.nexus.onAiEvent(({ id, event }) => {
      if (active.current !== id) return
      if (event.type === 'delta') { streamed.current += event.text; append('text', event.text) }
      if (event.type === 'reasoning') append('reasoning', event.text)
      if (event.type === 'done') {
        const text = streamed.current
        streamed.current = ''
        active.current = null; setGenerating(false)
        flush(); clearPending()
        // A reasoning model can stream only its thinking and never a body. That is not
        // an applicable proposal, so report it instead of showing an empty card.
        if (!text.trim()) {
          setProposal(null)
          latest.current.notify(latest.current.locale === 'zh-CN' ? '模型没有返回正文（只有推理过程或空内容）。请更换模型，或检查该模型的推理设置。' : 'The model returned no text: reasoning only, or empty content. Switch models or check its reasoning settings.')
          return
        }
        setProposal(current => current ? { ...current, state: event.truncated ? 'truncated' : 'ready' } : null)
      }
      if (event.type === 'error') {
        streamed.current = ''; clearPending()
        active.current = null; setGenerating(false)
        setProposal(null)
        latest.current.notify(`${event.error.code}: ${event.error.message}`)
      }
    })
    return () => { off(); clearPending(); if (active.current) void window.nexus.cancelGeneration(active.current) }
  }, [])
  const generate = async (prompt: string) => {
    const { source, revision, selection, provider, locale, notify } = latest.current
    if (!provider || !window.nexus) { notify(locale === 'zh-CN' ? '请先配置 AI 服务与模型。' : 'Configure an AI provider and model first.'); return }
    const selected = selection.to > selection.from
    const sourceText = context === 'document' ? source : selection.text
    const budget = (provider.capabilities.contextWindow ?? 32000) - (provider.capabilities.maxOutputTokens ?? 4096)
    // Conservative estimate supports Chinese and code; never silently truncates context.
    if ([...sourceText + prompt].length + 500 > budget) { notify(locale === 'zh-CN' ? '上下文超过模型预算，请缩小选区或提高上下文设置。' : 'Context exceeds the model budget. Select less text or increase the limit.'); return }
    const id = crypto.randomUUID(); active.current = id; streamed.current = ''; clearPending()
    const from = selection.from, to = selection.to
    setProposal({ from, to, expectedText: source.slice(from, to), revision, text: '', reasoning: '', startedAt: Date.now(), state: 'streaming' }); setGenerating(true)
    const instruction = selected
      ? `Replace only the selected Markdown source below. Return only replacement text without an outer Markdown fence. Preserve its language unless translation is requested. Selected source:\n${selection.text}\n\nTask: ${prompt}`
      : `Write new Markdown to insert at the cursor (UTF-16 offset ${from}). Return only the new content, without explaining or repeating the existing document. Task: ${prompt}`
    try { await window.nexus.generate({ id, prompt: instruction, sourceText }) }
    catch (error) {
      if (active.current !== id) return
      active.current = null; setGenerating(false); clearPending()
      setProposal(current => current ? { ...current, state: 'failed' } : null)
      notify(error instanceof Error ? error.message : 'AI_REQUEST_FAILED')
    }
  }
  const cancel = () => {
    const id = active.current; active.current = null; streamed.current = ''; clearPending(); setGenerating(false); setProposal(null)
    if (id) void window.nexus.cancelGeneration(id).catch(error => latest.current.notify(String(error)))
  }
  return { proposal, generating, generate, cancel, discard: () => setProposal(null), context, setContext }
}
