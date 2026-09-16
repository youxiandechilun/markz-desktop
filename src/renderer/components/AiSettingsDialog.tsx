import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeSlash, FloppyDisk, Key, LinkSimple, Plugs, Plus, Trash, X } from '@phosphor-icons/react'
import type { AiProtocol, AiProviderConfig, ModelInfo } from '../../ai'
import { normalizeCapabilities, selectProviderModel } from '../../ai/config'
import type { SettingsView } from '../../../electron/settings'
import type { Locale } from '../types'
import { aiSettingsError } from '../lib/ai-settings-error'

interface Props { settings: SettingsView; onUpdate: (value: SettingsView) => void; onClose: () => void; locale: Locale }
const protocols: Record<AiProtocol, string> = { 'chat-completions': 'OpenAI Chat Completions', responses: 'OpenAI Responses', 'anthropic-messages': 'Anthropic Messages' }
const blank = (): AiProviderConfig => ({ id: crypto.randomUUID(), name: '', baseUrl: 'https://api.openai.com/v1', protocol: 'chat-completions', apiKey: '', defaultModel: '', capabilities: normalizeCapabilities(undefined) })
const providerDraft = (provider?: AiProviderConfig): AiProviderConfig => provider ? { ...provider, defaultModel: provider.model || provider.defaultModel || '', model: undefined, apiKey: '' } : blank()
export function AiSettingsDialog({ settings, onUpdate, onClose, locale }: Props) {
  const zh = locale === 'zh-CN'
  const [draft, setDraft] = useState<AiProviderConfig>(() => providerDraft(settings.providers.find(item => item.id === settings.activeProviderId)))
  const [showKey, setShowKey] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? [])
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  const update = <K extends keyof AiProviderConfig>(key: K, value: AiProviderConfig[K]) => { setDraft(current => ({ ...current, [key]: value })); setMessage('') }
  const run = async (work: () => Promise<void>) => { setBusy(true); setMessage(''); try { await work() } catch (error) { setMessage(aiSettingsError(error, locale)) } finally { setBusy(false) } }
  const savedKey = settings.providers.find(item => item.id === draft.id)?.hasApiKey
  const chooseModel = (model: string) => { setDraft(current => selectProviderModel(current, model)); setMessage('') }
  return <div className="dialog-backdrop"><section ref={dialog} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div className="dialog-heading"><div><h2 id="settings-title">{zh ? '连接你的 AI 写作服务' : 'Connect your AI writing service'}</h2><p>{zh ? '使用你自己的服务与模型。只有点击生成时，才发送所选上下文。' : 'Use your own provider. Context is sent only when you request a generation.'}</p></div><button className="icon-button" onClick={onClose} aria-label={zh ? '关闭设置' : 'Close settings'}><X size={18}/></button></div>
    <div className="provider-strip"><select aria-label={zh ? '已保存的服务' : 'Saved providers'} value={settings.providers.some(p => p.id === draft.id) ? draft.id : ''} onChange={e => { const item = settings.providers.find(p => p.id === e.target.value); if (item) { setDraft(providerDraft(item)); setModels([]); setMessage('') } }}><option value="">{zh ? '新服务' : 'New provider'}</option>{settings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="ghost-button" onClick={() => { setDraft(blank()); setModels([]); setMessage('') }}><Plus size={15}/>{zh ? '添加服务' : 'Add provider'}</button>{settings.providers.some(p => p.id === draft.id) && <button className="icon-button" disabled={busy} aria-label={zh ? '删除服务' : 'Delete provider'} onClick={() => void run(async () => { const next = await window.nexus.removeProvider(draft.id); onUpdate(next); setDraft(providerDraft(next.providers[0])) })}><Trash size={16}/></button>}</div>
    <div className="settings-grid">
      <label className="field wide"><span>{zh ? '服务名称' : 'Provider name'}</span><input value={draft.name} onChange={e => update('name', e.target.value)} placeholder={zh ? '例如：我的写作服务' : 'My writing provider'}/></label>
      <label className="field wide"><span>{zh ? '服务地址' : 'Base URL'}</span><div className="input-with-icon"><LinkSimple size={15}/><input value={draft.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://api.example.com/v1"/></div><small>{zh ? '支持 Base URL 或完整协议端点；本地服务可使用 HTTP。' : 'Base URL or a full endpoint. Local services may use HTTP.'}</small></label>
      <label className="field wide"><span>{zh ? '请求协议' : 'Protocol'}</span><select value={draft.protocol} onChange={e => { const value = e.target.value; if (value === 'responses' || value === 'chat-completions' || value === 'anthropic-messages') update('protocol', value) }}>{Object.entries(protocols).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field wide"><span>API Key</span><div className="input-with-icon"><Key size={15}/><input autoComplete="off" value={draft.apiKey ?? ''} onChange={e => update('apiKey', e.target.value)} type={showKey ? 'text' : 'password'} placeholder={savedKey ? (zh ? '已安全保存；留空保留原 Key' : 'Stored securely; leave blank to keep') : (zh ? '输入服务商提供的 Key' : 'Enter your provider key')}/><button type="button" className="input-action" onClick={() => setShowKey(!showKey)} aria-label={zh ? '切换密钥可见性' : 'Toggle key visibility'}>{showKey ? <EyeSlash size={15}/> : <Eye size={15}/>}</button></div></label>
      <label className="field"><span>{zh ? '模型 ID' : 'Model ID'}</span><input list="provider-models" value={draft.defaultModel ?? ''} onChange={e => chooseModel(e.target.value)} placeholder="model-id"/><datalist id="provider-models">{models.map(m => <option key={m.id} value={m.id}/>)}</datalist></label>
      <div className="field"><span>{zh ? '模型列表' : 'Available models'}</span><button className="connection-button" disabled={busy} onClick={() => void run(async () => { const result = await window.nexus.listModels(draft); setModels(result); setMessage(zh ? `已获取 ${result.length} 个模型，也可以手动输入 ID。` : `Found ${result.length} models. You can also type an ID.`) })}>{zh ? '获取模型' : 'Fetch models'}</button></div>
    </div>
    <div className="capability-section">
      <div className="section-title"><strong>{zh ? '当前模型能力' : 'Capabilities for this model'}</strong><span>{zh ? '图像能力按模型实际支持设置' : 'Enable images if supported by this model'}</span></div>
      <div className="capability-grid">
        <label className="capability-item"><input type="checkbox" checked disabled/><span className="check-box"><Check size={12}/></span><span>{zh ? '文本（始终开启）' : 'Text (always enabled)'}</span></label>
        <label className="capability-item"><input type="checkbox" checked={draft.capabilities.image} onChange={e => update('capabilities', { ...draft.capabilities, text: true, image: e.target.checked })}/><span className="check-box"><Check size={12}/></span><span>{zh ? '图像' : 'Images'}</span></label>
      </div>
      <div className="settings-grid budget-fields"><label className="field"><span>{zh ? '上下文上限（tokens）' : 'Context limit (tokens)'}</span><input type="number" min="1024" max="2000000" value={draft.capabilities.contextWindow ?? 32000} onChange={e => update('capabilities', { ...draft.capabilities, contextWindow: Number(e.target.value) })}/></label><label className="field"><span>{zh ? '最大输出（tokens）' : 'Max output (tokens)'}</span><input type="number" min="64" max="128000" value={draft.capabilities.maxOutputTokens ?? 4096} onChange={e => update('capabilities', { ...draft.capabilities, maxOutputTokens: Number(e.target.value) })}/></label></div>
    </div>
    <div className="settings-message" role="status">{busy ? (zh ? '正在请求…' : 'Requesting…') : message}</div>
    <div className="dialog-footer"><div className="privacy-note"><Key size={14}/>{zh ? 'Key 使用系统加密，仅在本机保存' : 'Keys are encrypted by your operating system'}</div><div className="dialog-actions"><button className="ghost-button" disabled={busy} onClick={() => void run(async () => { await window.nexus.testConnection(draft); setMessage(zh ? '连接成功，已收到模型响应。' : 'Connected: model response received.') })}><Plugs size={15}/>{zh ? '测试连接' : 'Test connection'}</button><button className="primary-button" disabled={busy || !draft.name.trim() || !draft.defaultModel?.trim()} onClick={() => void run(async () => { const next = await window.nexus.saveProvider({ ...draft, modelCapabilities: { ...draft.modelCapabilities, [draft.defaultModel ?? '']: draft.capabilities } }); onUpdate(next); onClose() })}><FloppyDisk size={15}/>{zh ? '保存并使用' : 'Save & use'}</button></div></div>
  </section></div>
}
