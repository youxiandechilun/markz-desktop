import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { ArrowUp, BracketsCurly, Check, Cpu, Sparkle, Stop, X } from '@phosphor-icons/react'
import type { PublicProvider } from '../../../electron/settings'
import type { AiProposal } from '../lib/useAi'
import type { Locale } from '../types'

interface Props {
  provider?: PublicProvider; providers: PublicProvider[]; onProvider: (id: string) => void
  selectedText: string; proposal: AiProposal | null; isGenerating: boolean; conflict: boolean
  context: 'selection' | 'document'; onContext: (value: 'selection' | 'document') => void
  onGenerate: (prompt: string) => void; onCancel: () => void; onApply: () => void; onDiscard: () => void; onSettings: () => void; locale: Locale
  style?: CSSProperties
}

/** Keeps a stream pinned to its newest text unless the reader scrolled away from it. */
function useFollowStream(ref: RefObject<HTMLElement | null>, length: number): void {
  const pinned = useRef(true)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onScroll = () => { pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 28 }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [ref])
  useEffect(() => { const node = ref.current; if (node && pinned.current) node.scrollTop = node.scrollHeight }, [ref, length])
}

/** Elapsed seconds since the request started, so a long think is visibly alive. */
function useElapsed(startedAt: number, active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active || !startedAt) return
    const timer = setInterval(() => setSeconds((Date.now() - startedAt) / 1000), 200)
    return () => clearInterval(timer)
  }, [active, startedAt])
  return seconds
}

export function AiPanel({ provider, providers, onProvider, selectedText, proposal, isGenerating, conflict, context, onContext, onGenerate, onCancel, onApply, onDiscard, onSettings, locale, style }: Props) {
  const zh = locale === 'zh-CN', [prompt, setPrompt] = useState('')
  const reasoningBox = useRef<HTMLDivElement>(null), diffBox = useRef<HTMLDivElement>(null)
  const elapsed = useElapsed(proposal?.startedAt ?? 0, isGenerating)
  useFollowStream(reasoningBox, proposal?.reasoning.length ?? 0)
  useFollowStream(diffBox, proposal?.text.length ?? 0)
  const submit = () => { if (prompt.trim() && !isGenerating) onGenerate(prompt.trim()) }
  const status = proposal
    ? proposal.text.length
      ? (zh ? `已接收 ${proposal.text.length} 字` : `${proposal.text.length} characters received`)
      : proposal.reasoning.length
        ? (zh ? '模型正在思考…' : 'Model is thinking…')
        : (zh ? '等待模型响应…' : 'Waiting for the first token…')
    : ''
  return <aside className="ai-panel" style={style}>
    <div className="ai-panel-header"><div className="ai-title"><div className="ai-orb"><Sparkle size={16}/></div><div><strong>Markz AI</strong><span>{zh ? '与你一起，把文字写好' : 'A little space to think together'}</span></div></div><button className="icon-button subtle" onClick={onSettings} aria-label={zh ? 'AI 设置' : 'AI settings'}><Cpu size={17}/></button></div>
    <div className="ai-model-pill">{providers.length > 0 ? <select value={provider?.id ?? ''} onChange={e => onProvider(e.target.value)} aria-label={zh ? '当前 AI 服务' : 'Active AI provider'}>{providers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.defaultModel}</option>)}</select> : <span>{zh ? '尚未连接 AI 服务' : 'No AI service connected'}</span>}<button onClick={onSettings}>{zh ? '配置' : 'Configure'}</button></div>
    <label className="context-choice"><span>{zh ? '发送的上下文' : 'Context to send'}</span><select value={context} onChange={e => onContext(e.target.value === 'document' ? 'document' : 'selection')}><option value="selection">{zh ? '仅选区与指令' : 'Selection and prompt'}</option><option value="document">{zh ? '当前完整文档' : 'Entire current document'}</option></select></label>
    {selectedText && <div className="selection-context"><div className="context-label"><BracketsCurly size={14}/>{zh ? '已选择文字' : 'Selected text'}</div><p>{selectedText.slice(0, 200)}{selectedText.length > 200 ? '…' : ''}</p></div>}
    <div className="ai-body">{proposal ? <div className="proposal-card">
      <div className="proposal-head"><div><strong>{isGenerating ? (zh ? '正在写作…' : 'Writing…') : (zh ? '审阅修改' : 'Review changes')}</strong>{isGenerating && <span className="proposal-stream" role="status"><i className="stream-pulse" aria-hidden="true"/>{status} · {elapsed.toFixed(1)}s</span>}</div><button className="icon-button subtle" disabled={isGenerating} onClick={onDiscard} aria-label={zh ? '丢弃' : 'Discard'}><X size={16}/></button></div>
      {proposal.reasoning && <details className="reasoning-trace" open={isGenerating}><summary><Sparkle size={12}/>{isGenerating ? (zh ? '模型正在思考' : 'Model reasoning') : (zh ? '查看模型的思考过程' : 'Show the model reasoning')}</summary><div className="reasoning-body" ref={reasoningBox} aria-live="polite">{proposal.reasoning}</div></details>}
      <div className="proposal-diff" ref={diffBox}>{proposal.expectedText && <div className="diff-remove">− {proposal.expectedText}</div>}<div className="diff-add">+ {proposal.text}{isGenerating && <i className="stream-caret" aria-hidden="true"/>}{!proposal.text && !isGenerating && (zh ? '模型没有返回内容' : 'No content returned')}</div></div>
      {conflict && <p className="inline-error">{zh ? '文档已修改。请丢弃此提案并重新生成，避免覆盖当前内容。' : 'The document changed. Discard this proposal and generate again.'}</p>}
      {(proposal.state === 'truncated' || proposal.state === 'failed') && <p className="inline-error">{zh ? '响应未完整结束，不能直接应用。请重试或提高输出上限。' : 'Incomplete response. Retry or raise the output limit.'}</p>}
      <div className="proposal-actions"><button className="ghost-button" disabled={isGenerating} onClick={onDiscard}>{zh ? '丢弃' : 'Discard'}</button><button className="primary-button" disabled={proposal.state !== 'ready' || conflict || !proposal.text} onClick={onApply}><Check size={15}/>{zh ? '应用修改' : 'Apply edit'}</button></div>
    </div> : <div className="ai-empty"><div className="sparkle-line"><Sparkle size={17}/><span>{zh ? '下一段，从哪里开始？' : 'Where does the next paragraph start?'}</span></div><p>{zh ? '起草想法，精简段落，或修改文档中的代码。每一次修改，都由你决定。' : 'Draft an idea, refine a paragraph, or edit code inside your document. Every change is yours to accept.'}</p><div className="suggestion-row">{(zh ? ['续写下一段', '精简选中文字', '翻译成英文', '总结要点', '改进这段代码'] : ['Continue writing', 'Tighten the selection', 'Translate to Chinese', 'Summarize', 'Improve this code']).map(text => <button key={text} onClick={() => setPrompt(text)}>{text}</button>)}</div></div>}</div>
    <div className="ai-composer"><div className="composer-box"><textarea aria-label={zh ? '写作指令' : 'Writing instruction'} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => {
      if (e.key !== 'Enter' || e.shiftKey) return
      // Enter sends; Shift + Enter keeps the newline. An active IME composition
      // owns the Enter key that commits a candidate, so it must never send.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault(); submit()
    }} placeholder={zh ? '描述你想写的内容…' : 'Describe what you want to write…'} rows={4}/><div className="composer-tools"><span>{selectedText ? (zh ? '替换选区' : 'Replace selection') : (zh ? '插入光标处' : 'Insert at cursor')}</span>{isGenerating ? <button className="send-button stop" onClick={onCancel} aria-label={zh ? '停止生成' : 'Stop generation'}><Stop size={15} weight="fill"/></button> : <button className="send-button" onClick={submit} disabled={!prompt.trim()} aria-label={zh ? '发送指令' : 'Send prompt'}><ArrowUp size={16}/></button>}</div></div><span className="composer-note">{zh ? 'Enter 发送 · Shift + Enter 换行 · 应用前可审阅与丢弃' : 'Enter to send · Shift + Enter for a new line · Review before applying'}</span></div>
  </aside>
}
