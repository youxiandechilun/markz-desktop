import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowClockwise, Bell, CheckCircle, DownloadSimple, FileArrowUp, FloppyDisk, GearSix, Moon, SidebarSimple, Sparkle, Sun, ToggleLeft, ToggleRight, Translate, WarningCircle, X } from '@phosphor-icons/react'
import { AiPanel } from './components/AiPanel'
import { AiSettingsDialog } from './components/AiSettingsDialog'
import { EditorPane, type EditorHandle } from './components/EditorPane'
import { PreviewPane } from './components/PreviewPane'
import { Sidebar } from './components/Sidebar'
import { useCompilation } from './lib/useCompilation'
import { useAi, type SourceSelection } from './lib/useAi'
import { htmlDocument } from './lib/content'
import { useDocuments } from './lib/useDocuments'
import type { EditorMode, ToastMessage } from './types'
import type { SettingsView } from '../../electron/settings'
import type { DesktopCommand } from '../shared/desktop'
import { applyPatch } from '../core/patch'

const emptySettings: SettingsView = { preferences: { locale: 'zh-CN', theme: 'light', autoSave: true, wordWrap: true, editorFontSize: 14, editorFontFamily: 'mono' }, providers: [] }
function layoutValue(key: string, fallback: number, min: number, max: number): number {
  try { const value = Number(JSON.parse(localStorage.getItem('markz-layout') ?? '{}')[key]); return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback } catch { return fallback }
}
export function App() {
  const [settings, setSettings] = useState<SettingsView>(emptySettings), [settingsLoaded, setSettingsLoaded] = useState(false)
  const [mode, setMode] = useState<EditorMode>('split'), [showSidebar, setShowSidebar] = useState(true), [showAi, setShowAi] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState(''), [focusLine, setFocusLine] = useState<number | null>(null)
  const [selection, setSelection] = useState<SourceSelection>({ from: 0, to: 0, text: '' })
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => layoutValue('sidebarWidth', 238, 180, 420)), [contentSplit, setContentSplit] = useState(() => layoutValue('contentSplit', 50, 25, 75)), [aiWidth, setAiWidth] = useState(() => layoutValue('aiWidth', 322, 260, 520))
  const resize = useRef<{ kind: 'sidebar' | 'content' | 'ai'; startX: number; value: number; span: number } | undefined>(undefined)
  const editor = useRef<EditorHandle>(null)
  const { locale, theme, autoSave, wordWrap, editorFontSize, editorFontFamily } = settings.preferences, zh = locale === 'zh-CN'
  const notify = (message: string, tone: ToastMessage['tone'] = 'error') => setToast({ id: Date.now(), message, tone })
  const documents = useDocuments({ enabled: settingsLoaded, autoSave, zh, notify })
  const { content: markdown, revision, filePath, key: documentKey, saving, loaded, dirty, change } = documents
  const provider = settings.providers.find(item => item.id === settings.activeProviderId)
  const compiled = useCompilation(markdown, revision, filePath)
  const ai = useAi({ source: markdown, revision, selection, provider, locale, notify })
  const compilation = compiled.compilation
  const documentMeta = useMemo(() => ({
    title: compilation?.index.headings[0]?.heading.text ?? (zh ? '未命名文档' : 'Untitled'),
    headings: compilation?.index.headings.map(item => ({ id: item.id, depth: item.heading.depth, text: item.heading.text, line: item.position?.start.line ?? 1 })) ?? [],
    wordCount: markdown.length, nodeCount: compilation?.index.nodes.length ?? 0, codeBlocks: compilation?.index.codeBlocks.length ?? 0,
  }), [compilation, markdown.length, zh])
  useEffect(() => {
    if (!window.nexus) { notify('DESKTOP_REQUIRED: 请通过 Electron 桌面客户端打开 / Open the Electron desktop app'); return }
    void window.nexus.getSettings().then(setSettings).catch(error => notify(String(error))).finally(() => setSettingsLoaded(true))
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.lang = locale }, [theme, locale])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 9000 : 3200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { ai.cancel(); setSelection({ from: 0, to: 0, text: '' }); setFocusLine(null) }, [documentKey])
  const save = documents.save, open = documents.open, newDocument = documents.create
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
  /** Editor controls write one preference at a time without clobbering the rest. */
  const editorPreference = (patch: { wordWrap?: boolean; editorFontSize?: number; editorFontFamily?: SettingsView['preferences']['editorFontFamily'] }) => { void preference({ ...settings.preferences, ...patch }) }
  const beginResize = (kind: 'sidebar' | 'content' | 'ai', event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    resize.current = { kind, startX: event.clientX, value: kind === 'sidebar' ? sidebarWidth : kind === 'content' ? contentSplit : aiWidth, span: event.currentTarget.parentElement?.clientWidth ?? window.innerWidth }
    document.body.classList.add('is-resizing')
  }
  useEffect(() => { try { localStorage.setItem('markz-layout', JSON.stringify({ sidebarWidth, contentSplit, aiWidth })) } catch { /* Layout preferences are optional. */ } }, [sidebarWidth, contentSplit, aiWidth])
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = resize.current; if (!active) return
      const delta = event.clientX - active.startX
      if (active.kind === 'sidebar') setSidebarWidth(Math.max(180, Math.min(420, window.innerWidth - (showAi ? aiWidth : 0) - 460, active.value + delta)))
      else if (active.kind === 'ai') setAiWidth(Math.max(260, Math.min(520, window.innerWidth - (showSidebar ? sidebarWidth : 0) - 460, active.value - delta)))
      else setContentSplit(Math.max(25, Math.min(75, active.value + (delta / Math.max(active.span, 1)) * 100)))
    }
    const end = () => { resize.current = undefined; document.body.classList.remove('is-resizing') }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end) }
  }, [sidebarWidth, aiWidth, showSidebar, showAi])
  const commands: Record<DesktopCommand, () => void> = { new: () => void newDocument(), open: () => void open(), save: () => void save(), 'save-as': () => void save(true), export: () => void exportHtml(), settings: () => setShowSettings(true), close: () => { void documents.close().catch(error => notify(String(error))) } }
  const latestCommands = useRef(commands); latestCommands.current = commands
  useEffect(() => {
    const off = window.nexus?.onCommand(command => latestCommands.current[command]())
    return () => { off?.() }
  }, [])
  const fileName = filePath?.split(/[\\/]/).pop() ?? (zh ? '未命名.md' : 'Untitled.md')
  const navigate = (line: number) => { if (mode === 'preview') setMode('split'); setFocusLine(null); requestAnimationFrame(() => setFocusLine(line)) }
  return <div className="app-shell" data-theme={theme}>
    <header className="topbar"><div className="topbar-left"><button className="icon-button topbar-control" onClick={() => setShowSidebar(!showSidebar)} aria-label={zh ? '切换侧栏' : 'Toggle sidebar'}><SidebarSimple size={18}/></button><div className="breadcrumb"><span>Markz</span><span>/</span><strong title={filePath}>{fileName}</strong></div></div><div className="topbar-center"><span className={`document-state ${dirty ? 'unsaved' : ''}`}><span className="saved-dot"/>{saving ? (zh ? '保存中…' : 'Saving…') : dirty ? (zh ? '未保存' : 'Unsaved') : (zh ? '已保存' : 'Saved')}</span></div><div className="topbar-right"><div className="mode-switch" role="group" aria-label={zh ? '编辑模式' : 'Editor mode'}>{(['source', 'live', 'split', 'preview'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{({ source: zh ? '源码' : 'Source', live: zh ? '内联' : 'Live', split: zh ? '分栏' : 'Split', preview: zh ? '阅读' : 'Read' })[value]}</button>)}</div><button className="icon-button topbar-control" onClick={() => setShowAi(!showAi)} aria-label={zh ? 'AI 助手' : 'AI assistant'} aria-pressed={showAi}><Sparkle size={18} weight={showAi ? 'fill' : 'regular'}/></button><button className="icon-button topbar-control" onClick={() => setShowSettings(true)} aria-label={zh ? '设置' : 'Settings'}><GearSix size={18}/></button></div></header>
    <div className="app-body">
      {showSidebar && <><Sidebar style={{ width: sidebarWidth, minWidth: sidebarWidth }} headings={documentMeta.headings} query={search} onQueryChange={setSearch} onNew={() => void newDocument()} onNavigate={navigate} onSettings={() => setShowSettings(true)} fileName={fileName} locale={locale} codeBlocks={compilation?.index.codeBlocks} workspaceEntries={documents.workspace.entries} workspaceRoot={documents.workspace.rootPath} activeFilePath={filePath} onOpenFile={path => void open(path)} onRenameFile={async (entry, name) => { const ok = await documents.rename(entry.path, name); if (!ok) notify(zh ? '重命名失败，请检查文件名或文件状态。' : 'Rename failed. Check the file name and state.'); return ok }} onDeleteFile={entry => { void documents.remove(entry.path).then(ok => { if (!ok) notify(zh ? '删除失败，请稍后重试。' : 'Delete failed. Try again.') }) }} onSelectCode={(from, to) => { if (compiled.pending) { notify(zh ? '索引正在更新，请稍后选择。' : 'Wait for the index to update.'); return } if (mode === 'preview') setMode('split'); editor.current?.select(from, to); setShowAi(true) }}/ > <div className="resize-handle sidebar-resize" role="separator" aria-orientation="vertical" aria-label={zh ? '调整侧栏宽度' : 'Resize sidebar'} tabIndex={0} onPointerDown={event => beginResize('sidebar', event)} onDoubleClick={() => setSidebarWidth(238)}/></>}
      <main className={`workspace mode-${mode} ${showAi ? 'with-ai' : ''}`}>
        <div className="workspace-toolbar"><div className="toolbar-group"><button className="toolbar-button" onClick={() => void open()}><FileArrowUp size={16}/>{zh ? '打开' : 'Open'}</button><button className="toolbar-button" disabled={saving} onClick={() => void save()}><FloppyDisk size={16}/>{zh ? '保存' : 'Save'}</button><button className={`toolbar-button auto-save-button ${autoSave ? 'active' : ''}`} aria-pressed={autoSave} onClick={() => void preference({ ...settings.preferences, autoSave: !autoSave })}>{autoSave ? <ToggleRight size={17}/> : <ToggleLeft size={17}/>}<span>{zh ? `自动保存 ${autoSave ? '开启' : '关闭'}` : `Auto-save ${autoSave ? 'On' : 'Off'}`}</span></button><button className="toolbar-button icon-only" title={zh ? '撤销' : 'Undo'} aria-label={zh ? '撤销' : 'Undo'} onClick={() => editor.current?.undo()}><ArrowCounterClockwise size={16}/></button><button className="toolbar-button icon-only" title={zh ? '重做' : 'Redo'} aria-label={zh ? '重做' : 'Redo'} onClick={() => editor.current?.redo()}><ArrowClockwise size={16}/></button></div><div className="toolbar-group"><button className="toolbar-button" onClick={() => void preference({ ...settings.preferences, locale: zh ? 'en' : 'zh-CN' })}><Translate size={16}/>{zh ? '中文' : 'English'}</button><button className="toolbar-button icon-only" onClick={() => void preference({ ...settings.preferences, theme: theme === 'dark' ? 'light' : 'dark' })} aria-label={zh ? '切换主题' : 'Toggle theme'}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="toolbar-button icon-only" onClick={() => void exportHtml()} title={zh ? '导出 HTML' : 'Export HTML'} aria-label={zh ? '导出 HTML' : 'Export HTML'}><DownloadSimple size={17}/></button></div></div>
        <div className={`document-workspace ${mode === 'split' ? 'resizable-split' : ''}`}>{loaded && <EditorPane key={documentKey} ref={editor} value={markdown} onChange={change} onSelectionChange={setSelection} focusLine={focusLine} locale={locale} live={mode === 'live'} wordWrap={wordWrap} fontSize={editorFontSize} fontFamily={editorFontFamily} onPreference={editorPreference} style={mode === 'split' ? { flex: `0 0 ${contentSplit}%` } : undefined}/>} {mode === 'split' && <div className="resize-handle content-resize" role="separator" aria-orientation="vertical" aria-label={zh ? '调整编辑区和预览区' : 'Resize editor and preview'} tabIndex={0} onPointerDown={event => beginResize('content', event)} onDoubleClick={() => setContentSplit(50)}/>} {(mode === 'split' || mode === 'preview') && <PreviewPane html={compiled.html ?? ''} document={documentMeta} onCopy={() => void copyHtml()} onNavigate={navigate} locale={locale}/>}</div>
        {(compiled.error || Boolean(compilation?.diagnostics.length)) && <div className="diagnostics" role="status">{compiled.error ?? compilation?.diagnostics.map(item => <button key={`${item.code}-${item.position?.start.offset}`} onClick={() => navigate(item.position?.start.line ?? 1)}>{item.code} · {fileName}:{item.position?.start.line ?? 1}:{item.position?.start.column ?? 1} · {zh ? item.message : (item.messageEn ?? item.message)}</button>)}</div>}
        <footer className="statusbar"><div><span className="status-ready"><CheckCircle size={13}/>{compiled.error ? (zh ? '索引失败' : 'Index failed') : compiled.pending ? (zh ? '正在更新索引…' : 'Updating index…') : (zh ? '索引已更新' : 'Index ready')}</span><span>{documentMeta.nodeCount} {zh ? '节点' : 'nodes'}</span><span>{documentMeta.codeBlocks} {zh ? '代码块' : 'code blocks'}</span></div><div><span>UTF-8</span><span>{markdown.includes('\r\n') ? 'CRLF' : 'LF'}</span><span>{documentMeta.wordCount.toLocaleString()} {zh ? '字符' : 'characters'}</span></div></footer>
      </main>
      {showAi && <><div className="resize-handle ai-resize" role="separator" aria-orientation="vertical" aria-label={zh ? '调整 AI 面板宽度' : 'Resize AI panel'} tabIndex={0} onPointerDown={event => beginResize('ai', event)} onDoubleClick={() => setAiWidth(322)}/><AiPanel style={{ width: aiWidth, minWidth: aiWidth }} provider={provider} providers={settings.providers} onProvider={id => { void window.nexus.activateProvider(id).then(setSettings).catch(error => notify(String(error))) }} selectedText={selection.text} proposal={ai.proposal} isGenerating={ai.generating} conflict={Boolean(ai.proposal && ai.proposal.revision !== revision)} context={ai.context} onContext={ai.setContext} onGenerate={prompt => void ai.generate(prompt)} onCancel={ai.cancel} onApply={apply} onDiscard={ai.discard} onSettings={() => setShowSettings(true)} locale={locale}/></>}
    </div>
    {showSettings && <AiSettingsDialog settings={settings} onUpdate={setSettings} onPreferences={next => void preference(next)} workspaceRoot={documents.workspace.rootPath} onShowFolder={documents.showFolder} onClose={() => setShowSettings(false)} locale={locale}/>}
    {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.tone === 'success' ? <CheckCircle size={16}/> : toast.tone === 'error' ? <WarningCircle size={16}/> : <Bell size={16}/>}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label={zh ? '关闭提示' : 'Dismiss'}><X size={14}/></button></div>}
  </div>
}
