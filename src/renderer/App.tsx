import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowClockwise, Bell, CheckCircle, DownloadSimple, FileArrowUp, FloppyDisk, GearSix, MagnifyingGlass, Moon, SidebarSimple, Sparkle, Sun, Translate, WarningCircle, X } from '@phosphor-icons/react'
import { AiPanel } from './components/AiPanel'
import { AiSettingsDialog } from './components/AiSettingsDialog'
import { EditorPane, type EditorHandle } from './components/EditorPane'
import { PreviewPane } from './components/PreviewPane'
import { Sidebar } from './components/Sidebar'
import { CommandDialog } from './components/CommandDialog'
import { useCompilation } from './lib/useCompilation'
import { useAi, type SourceSelection } from './lib/useAi'
import { htmlDocument, starterMarkdown } from './lib/content'
import type { EditorMode, ToastMessage } from './types'
import type { SettingsView } from '../../electron/settings'
import type { DesktopCommand } from '../shared/desktop'
import { applyPatch } from '../core/patch'

const emptySettings: SettingsView = { preferences: { locale: 'zh-CN', theme: 'dark' }, providers: [] }
export function App() {
  const [markdown, setMarkdown] = useState(starterMarkdown), [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState(''), [filePath, setFilePath] = useState<string>(), [fingerprint, setFingerprint] = useState<string>()
  const [documentKey, setDocumentKey] = useState(0), [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SettingsView>(emptySettings), [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<EditorMode>('split'), [showSidebar, setShowSidebar] = useState(true), [showAi, setShowAi] = useState(false)
  const [showSettings, setShowSettings] = useState(false), [showCommands, setShowCommands] = useState(false)
  const [search, setSearch] = useState(''), [focusLine, setFocusLine] = useState<number | null>(null)
  const [selection, setSelection] = useState<SourceSelection>({ from: 0, to: 0, text: '' })
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const editor = useRef<EditorHandle>(null)
  const { locale, theme } = settings.preferences, zh = locale === 'zh-CN'
  const dirty = markdown !== saved
  const provider = settings.providers.find(item => item.id === settings.activeProviderId)
  const compiled = useCompilation(markdown, revision, filePath)
  const notify = (message: string, tone: ToastMessage['tone'] = 'error') => setToast({ id: Date.now(), message, tone })
  const ai = useAi({ source: markdown, revision, selection, provider, locale, notify })
  const compilation = compiled.compilation
  const documentMeta = useMemo(() => ({
    title: compilation?.index.headings[0]?.heading.text ?? (zh ? '未命名文档' : 'Untitled'),
    headings: compilation?.index.headings.map(item => ({ id: item.id, depth: item.heading.depth, text: item.heading.text, line: item.position?.start.line ?? 1 })) ?? [],
    wordCount: markdown.length, nodeCount: compilation?.index.nodes.length ?? 0, codeBlocks: compilation?.index.codeBlocks.length ?? 0,
  }), [compilation, markdown.length, zh])
  const change = (text: string) => { setMarkdown(text); setRevision(value => value + 1) }
  useEffect(() => {
    if (!window.nexus) { notify('DESKTOP_REQUIRED: 请通过 Electron 桌面客户端打开 / Open the Electron desktop app'); setLoaded(true); return }
    Promise.all([window.nexus.getSettings(), window.nexus.readDraft()]).then(([config, draft]) => {
      setSettings(config)
      if (draft) { setMarkdown(draft.content); setRevision(value => value + 1); setDocumentKey(value => value + 1) }
      setLoaded(true)
    }).catch(error => { notify(String(error)); setLoaded(true) })
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.lang = locale }, [theme, locale])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 9000 : 3200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { if (window.nexus && loaded) void window.nexus.setDirty(dirty).catch(error => notify(String(error))) }, [dirty, loaded])
  useEffect(() => {
    if (!loaded || !window.nexus) return
    const timer = setTimeout(() => { void window.nexus.saveDraft({ content: markdown, filePath, fingerprint }).catch(error => notify(String(error))) }, 700)
    return () => clearTimeout(timer)
  }, [markdown, filePath, fingerprint, loaded])
  const save = async (saveAs = false) => {
    if (saving || !window.nexus) return
    setSaving(true)
    try {
      const result = await window.nexus.saveMarkdown({ filePath, content: markdown, fingerprint, saveAs })
      if (!result) return
      setFilePath(result.filePath); setFingerprint(result.fingerprint); setSaved(result.content)
      notify(zh ? '文档已保存' : 'Document saved', 'success')
    } catch (error) { notify(String(error)) } finally { setSaving(false) }
  }
  const canSwitch = async () => !dirty || await window.nexus.confirmDiscard()
  const open = async () => {
    try {
      if (!window.nexus || !await canSwitch()) return
      const result = await window.nexus.openMarkdown(); if (!result) return
      ai.cancel(); setFilePath(result.filePath); setFingerprint(result.fingerprint); setSaved(result.content); change(result.content)
      setDocumentKey(value => value + 1); setSelection({ from: 0, to: 0, text: '' })
    } catch (error) { notify(String(error)) }
  }
  const newDocument = async () => {
    if (!window.nexus || !await canSwitch()) return
    ai.cancel(); setFilePath(undefined); setFingerprint(undefined); setSaved(''); change(''); setDocumentKey(value => value + 1); setSelection({ from: 0, to: 0, text: '' })
  }
  const exportHtml = async () => {
    if (compiled.pending || compiled.html === undefined) { notify(zh ? '文档正在解析，请稍后导出。' : 'Document is being parsed. Export when ready.'); return }
    try { const path = await window.nexus.exportHtml(htmlDocument(compiled.html, locale)); if (path) notify(zh ? 'HTML 已导出' : 'HTML exported', 'success') } catch (error) { notify(String(error)) }
  }
  const copyHtml = async () => { try { await navigator.clipboard.writeText(compiled.html ?? ''); notify(zh ? 'HTML 已复制' : 'HTML copied', 'success') } catch (error) { notify(String(error)) } }
  const apply = () => {
    const proposal = ai.proposal
    if (!proposal || proposal.state !== 'ready' || proposal.revision !== revision || markdown.slice(proposal.from, proposal.to) !== proposal.expectedText) { notify(zh ? '文档已修改，请重新生成。' : 'Document changed. Generate again.'); return }
    let replacement = proposal.text
    const codeBlock = compilation?.index.codeBlocks.find(item => item.contentRange?.start === proposal.from && item.contentRange.end === proposal.to)
    if (codeBlock && /\r?\n$/.test(proposal.expectedText) && !/\n$/.test(replacement)) replacement += markdown.includes('\r\n') ? '\r\n' : '\n'
    const checked = applyPatch(markdown, { from: proposal.from, to: proposal.to, replacement, expectedText: proposal.expectedText, expectedRevision: proposal.revision }, revision)
    if (!checked.ok) { notify(checked.error?.message ?? 'PATCH_INVALID'); return }
    editor.current?.apply(proposal.from, proposal.to, replacement); ai.discard(); notify(zh ? '修改已应用，Ctrl + Z 可撤销' : 'Applied. Ctrl + Z to undo.', 'success')
  }
  const preference = async (next: SettingsView['preferences']) => { try { setSettings(await window.nexus.savePreferences(next)) } catch (error) { notify(String(error)) } }
  const commands: Record<DesktopCommand, () => void> = { new: () => void newDocument(), open: () => void open(), save: () => void save(), 'save-as': () => void save(true), export: () => void exportHtml(), settings: () => setShowSettings(true), close: () => { void window.nexus.closeAfterRecovery({ content: markdown, filePath, fingerprint }).catch(error => notify(String(error))) } }
  const latestCommands = useRef(commands); latestCommands.current = commands
  useEffect(() => {
    const off = window.nexus?.onCommand(command => latestCommands.current[command]())
    const keydown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setShowCommands(value => !value) } }
    document.addEventListener('keydown', keydown)
    return () => { off?.(); document.removeEventListener('keydown', keydown) }
  }, [])
  const fileName = filePath?.split(/[\\/]/).pop() ?? (zh ? '未命名.md' : 'Untitled.md')
  const navigate = (line: number) => { if (mode === 'preview') setMode('split'); setFocusLine(null); requestAnimationFrame(() => setFocusLine(line)) }
  return <div className="app-shell" data-theme={theme}>
    <header className="topbar"><div className="topbar-left"><button className="icon-button topbar-control" onClick={() => setShowSidebar(!showSidebar)} aria-label={zh ? '切换侧栏' : 'Toggle sidebar'}><SidebarSimple size={18}/></button><div className="breadcrumb"><span>Markz</span><span>/</span><strong title={filePath}>{fileName}</strong></div></div><div className="topbar-center"><span className={`document-state ${dirty ? 'unsaved' : ''}`}><span className="saved-dot"/>{saving ? (zh ? '保存中…' : 'Saving…') : dirty ? (zh ? '未保存' : 'Unsaved') : (zh ? '已保存' : 'Saved')}</span></div><div className="topbar-right"><div className="mode-switch" role="group" aria-label={zh ? '编辑模式' : 'Editor mode'}>{(['source', 'live', 'split', 'preview'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{({ source: zh ? '源码' : 'Source', live: zh ? '内联' : 'Live', split: zh ? '分栏' : 'Split', preview: zh ? '阅读' : 'Read' })[value]}</button>)}</div><button className="icon-button topbar-control" onClick={() => setShowAi(!showAi)} aria-label={zh ? 'AI 助手' : 'AI assistant'} aria-pressed={showAi}><Sparkle size={18} weight={showAi ? 'fill' : 'regular'}/></button><button className="icon-button topbar-control" onClick={() => setShowSettings(true)} aria-label={zh ? '设置' : 'Settings'}><GearSix size={18}/></button></div></header>
    <div className="app-body">
      {showSidebar && <Sidebar headings={documentMeta.headings} query={search} onQueryChange={setSearch} onNew={() => void newDocument()} onNavigate={navigate} onSettings={() => setShowSettings(true)} fileName={fileName} locale={locale} codeBlocks={compilation?.index.codeBlocks} onSelectCode={(from, to) => { if (compiled.pending) { notify(zh ? '索引正在更新，请稍后选择。' : 'Wait for the index to update.'); return } if (mode === 'preview') setMode('split'); editor.current?.select(from, to); setShowAi(true) }}/ >}
      <main className={`workspace mode-${mode} ${showAi ? 'with-ai' : ''}`}>
        <div className="workspace-toolbar"><div className="toolbar-group"><button className="toolbar-button" onClick={() => void open()}><FileArrowUp size={16}/>{zh ? '打开' : 'Open'}</button><button className="toolbar-button" disabled={saving} onClick={() => void save()}><FloppyDisk size={16}/>{zh ? '保存' : 'Save'}</button><button className="toolbar-button icon-only" title={zh ? '撤销' : 'Undo'} aria-label={zh ? '撤销' : 'Undo'} onClick={() => editor.current?.undo()}><ArrowCounterClockwise size={16}/></button><button className="toolbar-button icon-only" title={zh ? '重做' : 'Redo'} aria-label={zh ? '重做' : 'Redo'} onClick={() => editor.current?.redo()}><ArrowClockwise size={16}/></button></div><button className="toolbar-center-note command-trigger" onClick={() => setShowCommands(true)}><MagnifyingGlass size={14}/><span>{zh ? '命令' : 'Commands'}</span><kbd>Ctrl K</kbd></button><div className="toolbar-group"><button className="toolbar-button" onClick={() => void preference({ ...settings.preferences, locale: zh ? 'en' : 'zh-CN' })}><Translate size={16}/>{zh ? '中文' : 'English'}</button><button className="toolbar-button icon-only" onClick={() => void preference({ ...settings.preferences, theme: theme === 'dark' ? 'light' : 'dark' })} aria-label={zh ? '切换主题' : 'Toggle theme'}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="toolbar-button icon-only" onClick={() => void exportHtml()} title={zh ? '导出 HTML' : 'Export HTML'} aria-label={zh ? '导出 HTML' : 'Export HTML'}><DownloadSimple size={17}/></button></div></div>
        <div className="document-workspace">{loaded && <EditorPane key={documentKey} ref={editor} value={markdown} onChange={change} onSelectionChange={setSelection} focusLine={focusLine} locale={locale} live={mode === 'live'}/>} {(mode === 'split' || mode === 'preview') && <PreviewPane html={compiled.html ?? ''} document={documentMeta} onCopy={() => void copyHtml()} onNavigate={navigate} locale={locale}/>}</div>
        {(compiled.error || Boolean(compilation?.diagnostics.length)) && <div className="diagnostics" role="status">{compiled.error ?? compilation?.diagnostics.map(item => <button key={`${item.code}-${item.position?.start.offset}`} onClick={() => navigate(item.position?.start.line ?? 1)}>{item.code} · {fileName}:{item.position?.start.line ?? 1}:{item.position?.start.column ?? 1} · {zh ? item.message : (item.messageEn ?? item.message)}</button>)}</div>}
        <footer className="statusbar"><div><span className="status-ready"><CheckCircle size={13}/>{compiled.error ? (zh ? '索引失败' : 'Index failed') : compiled.pending ? (zh ? '正在更新索引…' : 'Updating index…') : (zh ? '索引已更新' : 'Index ready')}</span><span>{documentMeta.nodeCount} {zh ? '节点' : 'nodes'}</span><span>{documentMeta.codeBlocks} {zh ? '代码块' : 'code blocks'}</span></div><div><span>UTF-8</span><span>{markdown.includes('\r\n') ? 'CRLF' : 'LF'}</span><span>{documentMeta.wordCount.toLocaleString()} {zh ? '字符' : 'characters'}</span></div></footer>
      </main>
      {showAi && <AiPanel provider={provider} providers={settings.providers} onProvider={id => { void window.nexus.activateProvider(id).then(setSettings).catch(error => notify(String(error))) }} selectedText={selection.text} proposal={ai.proposal} isGenerating={ai.generating} conflict={Boolean(ai.proposal && ai.proposal.revision !== revision)} context={ai.context} onContext={ai.setContext} onGenerate={prompt => void ai.generate(prompt)} onCancel={ai.cancel} onApply={apply} onDiscard={ai.discard} onSettings={() => setShowSettings(true)} locale={locale}/>}
    </div>
    {showSettings && <AiSettingsDialog settings={settings} onUpdate={setSettings} onClose={() => setShowSettings(false)} locale={locale}/>}
    {showCommands && <CommandDialog locale={locale} onClose={() => setShowCommands(false)} actions={[{ label: zh ? '新建文档' : 'New document', run: commands.new }, { label: zh ? '打开文档' : 'Open document', run: commands.open }, { label: zh ? '保存文档' : 'Save document', run: commands.save }, { label: zh ? '另存为' : 'Save as', run: commands['save-as'] }, { label: zh ? '导出 HTML' : 'Export HTML', run: commands.export }, { label: zh ? '查找与替换' : 'Find and replace', run: () => { if (mode === 'preview') setMode('split'); editor.current?.search() } }, { label: zh ? 'AI 服务设置' : 'AI service settings', run: commands.settings }]}/>}
    {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.tone === 'success' ? <CheckCircle size={16}/> : toast.tone === 'error' ? <WarningCircle size={16}/> : <Bell size={16}/>}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label={zh ? '关闭提示' : 'Dismiss'}><X size={14}/></button></div>}
  </div>
}
