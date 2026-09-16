import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeSlash, FloppyDisk, FolderOpen, GearSix, Key, LinkSimple, PencilSimple, Plugs, Plus, Trash, X } from '@phosphor-icons/react'
import type { AiProtocol, AiProviderConfig, ModelCapabilities, ModelInfo } from '../../ai'
import { normalizeCapabilities } from '../../ai/config'
import type { SettingsView } from '../../../electron/settings'
import type { Locale } from '../types'
import { aiSettingsError } from '../lib/ai-settings-error'

interface Props {
  settings: SettingsView
  onUpdate: (value: SettingsView) => void
  onPreferences?: (value: SettingsView['preferences']) => void
  workspaceRoot?: string
  onShowFolder?: () => void
  onClose: () => void
  locale: Locale
}
interface ModelRow { id: string; capabilities: ModelCapabilities }
interface ModelProbe { state: 'testing' | 'ok' | 'failed'; message?: string; ms?: number }

const protocols: Record<AiProtocol, string> = {
  'chat-completions': 'OpenAI Chat Completions',
  responses: 'OpenAI Responses',
  'anthropic-messages': 'Anthropic Messages',
}
const blank = (): AiProviderConfig => ({
  id: crypto.randomUUID(), name: '', baseUrl: 'https://api.openai.com/v1', protocol: 'chat-completions',
  apiKey: '', defaultModel: '', capabilities: normalizeCapabilities(undefined),
})
const providerDraft = (provider?: AiProviderConfig): AiProviderConfig => provider
  ? { ...provider, defaultModel: provider.model || provider.defaultModel || '', model: undefined, apiKey: '' }
  : blank()
function modelsFor(provider: AiProviderConfig): ModelRow[] {
  const rows = Object.entries(provider.modelCapabilities ?? {}).map(([id, capabilities]) => ({ id, capabilities: normalizeCapabilities(capabilities) }))
  const current = provider.defaultModel?.trim() || provider.model?.trim()
  if (current && !rows.some(row => row.id === current)) rows.unshift({ id: current, capabilities: normalizeCapabilities(provider.capabilities) })
  return rows
}

export function AiSettingsDialog({ settings, onUpdate, onPreferences, workspaceRoot, onShowFolder, onClose, locale }: Props) {
  const zh = locale === 'zh-CN'
  const firstProvider = settings.providers.find(item => item.id === settings.activeProviderId) ?? settings.providers[0]
  const initialDraft = providerDraft(firstProvider)
  const [draft, setDraft] = useState<AiProviderConfig>(initialDraft)
  const [selectedModel, setSelectedModel] = useState(initialDraft.defaultModel ?? '')
  const [modelRows, setModelRows] = useState<ModelRow[]>(() => modelsFor(initialDraft))
  const [showKey, setShowKey] = useState(false)
  const [tab, setTab] = useState<'general' | 'ai'>('ai')
  const [newProviders, setNewProviders] = useState<AiProviderConfig[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [probes, setProbes] = useState<Record<string, ModelProbe>>({})
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

  const update = <K extends keyof AiProviderConfig>(key: K, value: AiProviderConfig[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setMessage('')
  }
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await work() } catch (error) { setMessage(aiSettingsError(error, locale)) } finally { setBusy(false) }
  }
  const savedKey = settings.providers.find(item => item.id === draft.id)?.hasApiKey
  const providerItems = [...settings.providers, ...newProviders]
  const draftIsSaved = settings.providers.some(item => item.id === draft.id)
  const draftCanDelete = draftIsSaved || newProviders.some(item => item.id === draft.id)

  const cacheCurrentProvider = () => {
    if (draftIsSaved) return
    const map: Record<string, ModelCapabilities> = { ...(draft.modelCapabilities ?? {}) }
    for (const row of modelRows) if (row.id.trim()) map[row.id.trim()] = normalizeCapabilities(row.capabilities)
    if (selectedModel.trim()) map[selectedModel.trim()] = normalizeCapabilities(draft.capabilities)
    setNewProviders(current => current.map(item => item.id === draft.id ? { ...draft, defaultModel: selectedModel, modelCapabilities: map } : item))
  }

  const loadProvider = (provider?: AiProviderConfig) => {
    const next = providerDraft(provider)
    setDraft(next); setSelectedModel(next.defaultModel ?? ''); setModelRows(modelsFor(next)); setModels([]); setProbes({}); setMessage(''); setShowKey(false)
  }
  const chooseModel = (model: string) => {
    const previous = selectedModel.trim()
    if (previous && previous !== model.trim()) setModelRows(rows => rows.map(row => row.id === previous ? { ...row, capabilities: normalizeCapabilities(draft.capabilities) } : row))
    const row = modelRows.find(item => item.id === model.trim())
    setSelectedModel(model)
    setDraft(current => ({ ...current, model: undefined, defaultModel: model, capabilities: row ? normalizeCapabilities(row.capabilities) : (current.defaultModel === model ? current.capabilities : normalizeCapabilities(undefined)) }))
    setMessage('')
  }
  const addModel = () => {
    const current = selectedModel.trim()
    if (current) setModelRows(rows => rows.some(row => row.id === current) ? rows.map(row => row.id === current ? { ...row, capabilities: normalizeCapabilities(draft.capabilities) } : row) : [...rows, { id: current, capabilities: normalizeCapabilities(draft.capabilities) }])
    setSelectedModel('')
    setDraft(current => ({ ...current, defaultModel: '', model: undefined, capabilities: normalizeCapabilities(undefined) }))
    setMessage(zh ? '输入模型 ID 后保存，即可加入模型列表。' : 'Enter a model ID and save to add it to this provider.')
  }
  const removeModel = (id: string) => {
    const remaining = modelRows.filter(item => item.id !== id)
    setModelRows(remaining)
    setProbes(current => { const next = { ...current }; delete next[id]; return next })
    if (selectedModel.trim() === id) chooseModel(remaining[0]?.id ?? '')
  }
  /** Fetched rows inherit the budget the service publishes, so new entries are usable as-is. */
  const fetchedCapabilities = (model: ModelInfo): ModelCapabilities => {
    const capabilities = normalizeCapabilities(undefined)
    return model.contextWindow ? { ...capabilities, contextWindow: model.contextWindow } : capabilities
  }
  const selectRow = (rows: ModelRow[], id: string) => {
    const row = rows.find(item => item.id === id)
    setSelectedModel(id)
    setDraft(current => ({ ...current, model: undefined, defaultModel: id, capabilities: row ? normalizeCapabilities(row.capabilities) : normalizeCapabilities(undefined) }))
  }
  // Discovery is one step, not two: every model the service reports lands in the list
  // and the first one becomes current when nothing was chosen yet.
  const fetchModels = () => void run(async () => {
    const fetched = await window.nexus.listModels(draft)
    setModels(fetched)
    if (!fetched.length) { setMessage(zh ? 'MODEL_LIST_UNAVAILABLE · 服务未提供列表接口，请手动填写模型 ID。' : 'MODEL_LIST_UNAVAILABLE · Enter a model ID manually.'); return }
    const known = new Set(modelRows.map(row => row.id))
    const added = fetched.filter(model => !known.has(model.id))
    const rows = [...modelRows, ...added.map(model => ({ id: model.id, capabilities: fetchedCapabilities(model) }))]
    setModelRows(rows)
    const next = selectedModel.trim() || rows[0]?.id || ''
    if (next !== selectedModel) selectRow(rows, next)
    setMessage(added.length
      ? (zh ? `已获取 ${fetched.length} 个模型，新增 ${added.length} 个已加入列表。` : `Fetched ${fetched.length} models; ${added.length} added to the list.`)
      : (zh ? `已获取 ${fetched.length} 个模型，列表已包含全部。` : `Fetched ${fetched.length} models; the list already has them all.`))
  })
  // Every model is probed on its own, so one broken entry cannot hide the others.
  const probeModels = (ids: string[], successMessage?: string) => void run(async () => {
    const queue = [...new Set(ids.map(id => id.trim()).filter(Boolean))]
    if (!queue.length) throw new Error('MODEL_REQUIRED: 请先填写模型 ID / Enter a model ID')
    setProbes(current => { const next = { ...current }; for (const id of queue) next[id] = { state: 'testing' }; return next })
    const failures: Array<{ id: string; message: string }> = []
    let tested = 0
    for (const id of queue) {
      const started = Date.now()
      const failure = await window.nexus.testConnection({ ...draft, defaultModel: id }).then(() => undefined, error => aiSettingsError(error, locale))
      tested++
      if (!failure) { setProbes(current => ({ ...current, [id]: { state: 'ok', ms: Date.now() - started } })); continue }
      setProbes(current => ({ ...current, [id]: { state: 'failed', message: failure, ms: Date.now() - started } }))
      failures.push({ id, message: failure })
      // A rejected key or an unreachable address fails every model the same way.
      if (/AUTH_FAILED|TIMEOUT|HTTP 404/.test(failure)) break
    }
    const reachable = tested - failures.length
    const skipped = queue.length - tested
    if (successMessage && !failures.length && !skipped) { setMessage(successMessage); return }
    const summary = failures.length
      ? (zh ? `${reachable} 个可用，${failures.length} 个失败：${failures.map(item => `${item.id} · ${item.message}`).join('；')}` : `${reachable} reachable, ${failures.length} failed: ${failures.map(item => `${item.id} · ${item.message}`).join('; ')}`)
      : (zh ? `${reachable} 个模型全部可用。` : `All ${reachable} models are reachable.`)
    setMessage(skipped ? summary + (zh ? `（已跳过 ${skipped} 个）` : ` (${skipped} skipped)`) : summary)
  })
  const save = async (close: boolean) => run(async () => {
    const model = selectedModel.trim()
    if (!draft.name.trim()) throw new Error(zh ? '请填写服务名称。' : 'Enter a provider name.')
    if (!model) throw new Error('MODEL_REQUIRED: 请先填写模型 ID / Enter a model ID')
    const capabilities: Record<string, ModelCapabilities> = {}
    for (const row of modelRows) if (row.id.trim()) capabilities[row.id.trim()] = normalizeCapabilities(row.capabilities)
    capabilities[model] = normalizeCapabilities(draft.capabilities)
    const next = await window.nexus.saveProvider({ ...draft, name: draft.name.trim(), defaultModel: model, model: undefined, modelCapabilities: capabilities })
    onUpdate(next)
    setNewProviders(current => current.filter(item => item.id !== draft.id))
    loadProvider(next.providers.find(item => item.id === draft.id))
    setMessage(zh ? '已保存。' : 'Saved.')
    if (close) onClose()
  })

  return <div className="dialog-backdrop"><section ref={dialog} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div className="dialog-heading"><div><div className="dialog-eyebrow"><GearSix size={14}/>{zh ? 'MARKZ 设置' : 'MARKZ SETTINGS'}</div><h2 id="settings-title">{zh ? '设置' : 'Settings'}</h2><p>{zh ? '管理编辑体验、本地文件位置和 AI 写作服务。' : 'Manage your editor, local files, and AI writing services.'}</p></div><button className="dialog-close" onClick={onClose} aria-label={zh ? '关闭设置' : 'Close settings'}><X size={18}/></button></div>
    <div className="settings-tabs" role="tablist" aria-label={zh ? '设置分类' : 'Settings categories'}><button role="tab" aria-selected={tab === 'general'} className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>{zh ? '通用' : 'General'}</button><button role="tab" aria-selected={tab === 'ai'} className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>{zh ? 'AI 服务' : 'AI providers'}</button></div>
    <div className="settings-content">
    {tab === 'general' && <><div className="settings-section-heading"><strong>{zh ? '通用设置' : 'General'}</strong><span>{zh ? '修改后自动保存' : 'Changes are saved automatically'}</span></div>
    <div className="general-settings-grid">
      <label className="preference-row"><span><b>{zh ? '自动保存' : 'Auto-save'}</b><small>{zh ? '编辑后自动写回当前 Markdown 文件' : 'Write changes to the current Markdown file automatically'}</small></span><input type="checkbox" role="switch" aria-label={zh ? '自动保存' : 'Auto-save'} checked={settings.preferences.autoSave} onChange={event => onPreferences?.({ ...settings.preferences, autoSave: event.target.checked })}/><i className="preference-switch" /></label>
      <label className="preference-row"><span><b>{zh ? '自动换行' : 'Word wrap'}</b><small>{zh ? '长行在编辑区内折行显示，关闭后改为左右滚动' : 'Wrap long lines in the editor, or scroll horizontally instead'}</small></span><input type="checkbox" role="switch" aria-label={zh ? '自动换行' : 'Word wrap'} checked={settings.preferences.wordWrap} onChange={event => onPreferences?.({ ...settings.preferences, wordWrap: event.target.checked })}/><i className="preference-switch" /></label>
      <label className="field"><span>{zh ? '编辑器字体' : 'Editor font'}</span><select value={settings.preferences.editorFontFamily} onChange={event => onPreferences?.({ ...settings.preferences, editorFontFamily: event.target.value === 'sans' ? 'sans' : event.target.value === 'serif' ? 'serif' : 'mono' })}><option value="mono">{zh ? '等宽' : 'Monospace'}</option><option value="sans">{zh ? '无衬线' : 'Sans serif'}</option><option value="serif">{zh ? '衬线' : 'Serif'}</option></select></label>
      <label className="field"><span>{zh ? '编辑器字号' : 'Editor font size'}</span><select value={settings.preferences.editorFontSize} onChange={event => onPreferences?.({ ...settings.preferences, editorFontSize: Number(event.target.value) })}>{[12, 13, 14, 15, 16, 18, 20].map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
      <label className="field"><span>{zh ? '界面语言' : 'Interface language'}</span><select value={settings.preferences.locale} onChange={event => onPreferences?.({ ...settings.preferences, locale: event.target.value === 'en' ? 'en' : 'zh-CN' })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
      <label className="field"><span>{zh ? '主题' : 'Theme'}</span><select value={settings.preferences.theme} onChange={event => onPreferences?.({ ...settings.preferences, theme: event.target.value === 'light' ? 'light' : 'dark' })}><option value="light">{zh ? '浅色' : 'Light'}</option><option value="dark">{zh ? '深色' : 'Dark'}</option></select></label>
      <div className="field wide"><span>{zh ? '默认文档目录' : 'Default document folder'}</span><div className="folder-setting"><code title={workspaceRoot}>{workspaceRoot || (zh ? '正在读取…' : 'Loading…')}</code><button className="ghost-button" onClick={onShowFolder}><FolderOpen size={15}/>{zh ? '打开目录' : 'Open folder'}</button></div></div>
    </div></>}
    {tab === 'ai' && <><div className="settings-section-heading ai-settings-heading"><strong>{zh ? 'AI 写作服务' : 'AI writing service'}</strong><span>{zh ? '一个服务对应一个地址和密钥，可添加多个模型。' : 'Each service has one URL and key, with multiple models.'}</span></div>

    <div className="ai-service-layout">
      <aside className="provider-list" aria-label={zh ? 'AI 服务列表' : 'AI providers'}>
        <div className="provider-list-heading"><strong>{zh ? '自定义供应商' : 'Providers'}</strong><span>{providerItems.length}</span></div>
        <div className="provider-list-items">
          {providerItems.map(provider => <button key={provider.id} type="button" className={'provider-list-item ' + (provider.id === draft.id ? 'active' : '')} onClick={() => { cacheCurrentProvider(); loadProvider(provider) }}><span className="provider-status"/><span className="provider-list-name">{provider.name || (zh ? '未命名服务' : 'Unnamed provider')}</span><span className="provider-list-model">{provider.defaultModel || provider.model || (newProviders.some(item => item.id === provider.id) ? (zh ? '未保存' : 'Unsaved') : '—')}</span></button>)}
          {!providerItems.length && <p className="provider-list-empty">{zh ? '还没有服务，先添加一个。' : 'No providers yet. Add one to begin.'}</p>}
        </div>
        <button type="button" className="provider-add" onClick={() => { cacheCurrentProvider(); const next = { ...blank(), name: zh ? '新服务' : 'New provider' }; setNewProviders(current => [...current.filter(item => item.id !== next.id), next]); loadProvider(next) }}><Plus size={16}/>{zh ? '添加服务' : 'Add provider'}</button>
      </aside>

      <div className="provider-editor">
        <div className="provider-editor-heading"><div><span className="eyebrow">{draftIsSaved ? (zh ? '当前服务' : 'CURRENT PROVIDER') : (zh ? '新服务' : 'NEW PROVIDER')}</span><h3>{draft.name || (zh ? '新服务' : 'New provider')}</h3></div>{draftCanDelete && <button className="icon-button" disabled={busy} aria-label={zh ? '删除服务' : 'Delete provider'} onClick={() => void run(async () => { if (!draftIsSaved) { setNewProviders(current => current.filter(item => item.id !== draft.id)); loadProvider(settings.providers[0]) } else { const next = await window.nexus.removeProvider(draft.id); onUpdate(next); loadProvider(next.providers[0]) } })}><Trash size={16}/></button>}</div>
        <div className="settings-grid provider-fields">
          <label className="field wide"><span>{zh ? '服务名称' : 'Provider name'}</span><input aria-label={zh ? '服务名称' : 'Provider name'} value={draft.name} onChange={e => update('name', e.target.value)} placeholder={zh ? '例如：我的写作服务' : 'My writing provider'}/></label>
          <label className="field wide"><span>{zh ? '服务地址' : 'Base URL'}</span><div className="input-with-icon"><LinkSimple size={15}/><input value={draft.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://api.example.com/v1"/></div><small>{zh ? '支持 Base URL 或完整协议端点；本地服务可使用 HTTP。' : 'Base URL or a full endpoint. Local services may use HTTP.'}</small></label>
          <label className="field wide"><span>{zh ? '请求协议' : 'Protocol'}</span><select aria-label={zh ? '请求协议' : 'Protocol'} value={draft.protocol} onChange={e => { const value = e.target.value; if (value === 'responses' || value === 'chat-completions' || value === 'anthropic-messages') update('protocol', value) }}>{Object.entries(protocols).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field wide"><span>API Key</span><div className="input-with-icon"><Key size={15}/><input autoComplete="off" value={draft.apiKey ?? ''} onChange={e => update('apiKey', e.target.value)} type={showKey ? 'text' : 'password'} placeholder={savedKey ? (zh ? '已安全保存；留空保留原 Key' : 'Stored securely; leave blank to keep') : (zh ? '输入服务商提供的 Key' : 'Enter your provider key')}/><button type="button" className="input-action" onClick={() => setShowKey(!showKey)} aria-label={zh ? '切换密钥可见性' : 'Toggle key visibility'}>{showKey ? <EyeSlash size={15}/> : <Eye size={15}/>}</button></div></label>
        </div>

        <div className="model-section">
          <div className="model-section-heading"><div><strong>{zh ? '模型列表' : 'Models'}</strong><span>{zh ? '选择模型后可单独设置图像能力。' : 'Configure image support for each model.'}</span></div><button type="button" className="ghost-button small-button" onClick={addModel}><Plus size={14}/>{zh ? '添加模型' : 'Add model'}</button></div>
          <div className="model-list">
            {modelRows.map(row => {
              const probe = probes[row.id]
              return <div className={'model-row ' + (row.id === selectedModel.trim() ? 'selected' : '')} key={row.id}><button type="button" className="model-row-main" onClick={() => chooseModel(row.id)}><span className="model-row-name">{row.id}</span><span className="model-row-badges">{row.capabilities.image && <span className="model-badge"><Eye size={12}/>{zh ? '视觉' : 'Vision'}</span>}<span className="model-badge muted">{row.capabilities.contextWindow ? String(Math.round(row.capabilities.contextWindow / 1000)) + 'K' : '32K'}</span>{probe && <span className={'model-badge probe-' + probe.state} title={probe.message ?? (probe.ms ? probe.ms + ' ms' : undefined)}>{probe.state === 'testing' ? (zh ? '测试中' : 'Testing') : probe.state === 'ok' ? (zh ? '可用' : 'Reachable') : (zh ? '失败' : 'Failed')}</span>}</span></button><button type="button" className="model-row-action" disabled={busy} aria-label={(zh ? '测试模型 ' : 'Test model ') + row.id} onClick={() => probeModels([row.id])}><Plugs size={15}/></button><button type="button" className="model-row-action" aria-label={(zh ? '编辑模型 ' : 'Edit model ') + row.id} onClick={() => chooseModel(row.id)}><PencilSimple size={15}/></button><button type="button" className="model-row-action danger" aria-label={(zh ? '删除模型 ' : 'Delete model ') + row.id} onClick={() => removeModel(row.id)}><Trash size={15}/></button></div>
            })}
            {!modelRows.length && <div className="model-list-empty">{zh ? '还没有模型，点击“获取模型”自动加入，或手动填写模型 ID。' : 'No models yet. Fetch models to add them, or enter a model ID.'}</div>}
          </div>
          <div className="model-editor">
            <label className="field"><span>{zh ? '模型 ID' : 'Model ID'}</span><input list="provider-models" aria-label={zh ? '模型 ID' : 'Model ID'} value={selectedModel} onChange={e => chooseModel(e.target.value)} placeholder="model-id"/><datalist id="provider-models">{models.map(model => <option key={model.id} value={model.id}/>)}</datalist></label>
            <div className="model-fetch"><span className="field-label">{zh ? '远程模型列表' : 'Remote model list'}</span><div className="model-fetch-actions"><button type="button" className="connection-button" disabled={busy} onClick={fetchModels}>{zh ? '获取模型' : 'Fetch models'}</button><button type="button" className="connection-button" disabled={busy || !modelRows.length} onClick={() => probeModels(modelRows.map(row => row.id))}>{zh ? '测试全部模型' : 'Test all models'}</button></div></div>
          </div>
          <div className="capability-section model-capability-section">
            <div className="section-title"><div><strong>{zh ? '当前模型能力' : 'Capabilities for this model'}</strong><span>{zh ? '每个模型可以独立设置视觉能力。' : 'Each model can have its own vision setting.'}</span></div></div>
            <div className="capability-grid"><label className="capability-item"><input type="checkbox" aria-label={zh ? '文本（始终开启）' : 'Text (always enabled)'} checked disabled/><span className="check-box"><Check size={12}/></span><span>{zh ? '文本（始终开启）' : 'Text (always enabled)'}</span></label><label className="capability-item"><input type="checkbox" aria-label={zh ? '图像' : 'Images'} checked={draft.capabilities.image} onChange={e => update('capabilities', { ...draft.capabilities, text: true, image: e.target.checked })}/><span className="check-box"><Check size={12}/></span><span>{zh ? '图像' : 'Images'}</span></label></div>
            <div className="settings-grid budget-fields"><label className="field"><span>{zh ? '上下文上限（tokens）' : 'Context limit (tokens)'}</span><input type="number" min="1024" max="2000000" value={draft.capabilities.contextWindow ?? 32000} onChange={e => update('capabilities', { ...draft.capabilities, contextWindow: Number(e.target.value) })}/></label><label className="field"><span>{zh ? '最大输出（tokens）' : 'Max output (tokens)'}</span><input type="number" min="64" max="128000" value={draft.capabilities.maxOutputTokens ?? 4096} onChange={e => update('capabilities', { ...draft.capabilities, maxOutputTokens: Number(e.target.value) })}/></label></div>
          </div>
        </div>
      </div>
    </div></>}
    </div>
    <div className="settings-message" role="status">{busy ? (zh ? '正在请求…' : 'Requesting…') : message}</div>
    <div className="dialog-footer"><div className="privacy-note">{tab === 'ai' ? <><Key size={14}/>{zh ? 'Key 使用系统加密，仅在本机保存' : 'Keys are encrypted by your operating system'}</> : <span>{zh ? '通用设置会即时保存' : 'General preferences save instantly'}</span>}</div>{tab === 'ai' ? <div className="dialog-actions"><button className="ghost-button" disabled={busy} onClick={() => probeModels([selectedModel], zh ? '连接成功，已收到模型响应。' : 'Connected: model response received.')}><Plugs size={15}/>{zh ? '测试连接' : 'Test connection'}</button><button className="ghost-button save-button" disabled={busy || !draft.name.trim() || !selectedModel.trim()} onClick={() => void save(false)}><FloppyDisk size={15}/>{zh ? '保存' : 'Save'}</button><button className="primary-button" disabled={busy || !draft.name.trim() || !selectedModel.trim()} onClick={() => void save(true)}><FloppyDisk size={15}/>{zh ? '保存并使用' : 'Save & use'}</button></div> : <button className="primary-button" onClick={onClose}>{zh ? '完成' : 'Done'}</button>}</div>
  </section></div>
}

