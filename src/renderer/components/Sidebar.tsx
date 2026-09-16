import { useState, type CSSProperties } from 'react'
import { Check, FileText, Folder, FolderOpen, MagnifyingGlass, PencilSimple, Plus, SlidersHorizontal, Trash, TreeStructure, X } from '@phosphor-icons/react'
import type { OutlineItem } from '../lib/markdown'
import type { Locale } from '../types'
import type { IndexedNode } from '../../core'
import type { WorkspaceEntry } from '../../shared/desktop'
import logoUrl from '../assets/logo.png'

interface SidebarProps {
  headings: OutlineItem[]
  query: string
  onQueryChange: (value: string) => void
  onNew: () => void
  onNavigate: (line: number) => void
  onSettings: () => void
  fileName: string
  locale: Locale
  codeBlocks?: IndexedNode[]
  onSelectCode?: (from: number, to: number) => void
  workspaceEntries?: WorkspaceEntry[]
  workspaceRoot?: string
  activeFilePath?: string
  onOpenFile?: (filePath: string) => void
  onRenameFile?: (entry: WorkspaceEntry, name: string) => Promise<boolean> | boolean | void
  onDeleteFile?: (entry: WorkspaceEntry) => void
  style?: CSSProperties
}

export function Sidebar({ headings, query, onQueryChange, onNew, onNavigate, onSettings, fileName, locale, codeBlocks = [], onSelectCode, workspaceEntries = [], workspaceRoot = '', activeFilePath, onOpenFile, onRenameFile, onDeleteFile, style }: SidebarProps) {
  const [tab, setTab] = useState<'files' | 'outline'>('files')
  const [editingPath, setEditingPath] = useState<string>(), [editingName, setEditingName] = useState('')
  const ui = locale === 'zh-CN' ? { newDocument: '新建文档', search: '搜索文件或大纲', onPage: '本页内容', files: '文档文件', empty: '没有匹配的内容' } : { newDocument: 'New document', search: 'Search files or outline', onPage: 'ON THIS PAGE', files: 'DOCUMENTS', empty: 'No matching content' }
  const filtered = headings.filter((item) => item.text.toLowerCase().includes(query.toLowerCase()))
  const filteredEntries = workspaceEntries.filter(entry => !query || entry.name.toLowerCase().includes(query.toLowerCase()))
  const depth = (entry: WorkspaceEntry) => Math.max(0, entry.path.split(/[\\/]/).filter(Boolean).length - workspaceRoot.split(/[\\/]/).filter(Boolean).length - 1)
  const beginRename = (entry: WorkspaceEntry) => { setEditingPath(entry.path); setEditingName(entry.name.replace(/\.(md|markdown)$/i, '')) }
  const cancelRename = () => { setEditingPath(undefined); setEditingName('') }
  const commitRename = async (entry: WorkspaceEntry) => {
    if (!editingName.trim()) return
    const result = await onRenameFile?.(entry, editingName.trim())
    if (result !== false) cancelRename()
  }
  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-brand"><img className="brand-logo" src={logoUrl} alt="Markz"/><div className="brand-wordmark"><strong>MARKZ</strong><span>DESKTOP</span></div></div>
      <div className="sidebar-actions"><button className="new-document" onClick={onNew}><Plus size={16} weight="bold" /> {ui.newDocument}</button><button className="icon-button" onClick={onSettings} aria-label={locale === 'zh-CN' ? '打开设置' : 'Open settings'} title={locale === 'zh-CN' ? '设置' : 'Settings'}><SlidersHorizontal size={17} /></button></div>
      <label className="search-field"><MagnifyingGlass size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={ui.search} aria-label={ui.search} /></label>
      <div className="sidebar-tabs" role="tablist"><button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')} role="tab" aria-selected={tab === 'files'}><Folder size={14}/>{ui.files}</button><button className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')} role="tab" aria-selected={tab === 'outline'}><TreeStructure size={14}/>{ui.onPage}</button></div>
      {tab === 'files' ? <nav className="outline-list file-tree" aria-label={locale === 'zh-CN' ? '本地文档文件树' : 'Local document tree'}>
        {filteredEntries.length === 0 ? <div className="empty-outline">{ui.empty}</div> : filteredEntries.map(entry => entry.kind === 'directory' ? <div className="tree-folder" key={entry.path} style={{ paddingLeft: 8 + depth(entry) * 14 }}><FolderOpen size={14}/><span>{entry.name}</span></div> : <div key={entry.path} className={`tree-file ${entry.path === activeFilePath ? 'active' : ''}`} style={{ paddingLeft: 8 + depth(entry) * 14 }}>
          {editingPath === entry.path ? <div className="tree-rename"><PencilSimple size={13}/><input autoFocus value={editingName} onChange={event => setEditingName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void commitRename(entry); if (event.key === 'Escape') cancelRename() }} /><span>.md</span><button onClick={() => void commitRename(entry)} aria-label={locale === 'zh-CN' ? '确认重命名' : 'Confirm rename'}><Check size={14}/></button><button onClick={cancelRename} aria-label={locale === 'zh-CN' ? '取消重命名' : 'Cancel rename'}><X size={14}/></button></div> : <><button onClick={() => onOpenFile?.(entry.path)}><FileText size={14}/><span>{entry.name}</span></button><span className="tree-actions"><button onClick={() => beginRename(entry)} aria-label={locale === 'zh-CN' ? '重命名' : 'Rename'}><PencilSimple size={13}/></button><button onClick={() => onDeleteFile?.(entry)} aria-label={locale === 'zh-CN' ? '删除' : 'Delete'}><Trash size={13}/></button></span></>}
        </div>)}
      </nav> : <><div className="side-section-label"><span>{ui.onPage}</span><span className="count-badge">{headings.length}</span></div><nav className="outline-list" aria-label={locale === 'zh-CN' ? '文档大纲' : 'Document outline'}>
        {filtered.length === 0 ? <div className="empty-outline">{ui.empty}</div> : filtered.map((item) => <button key={item.id} className={`outline-item depth-${Math.min(item.depth, 3)}`} onClick={() => onNavigate(item.line)}><TreeStructure size={13} /><span>{item.text}</span></button>)}
      </nav>{codeBlocks.length > 0 && <><div className="side-section-label"><span>{locale === 'zh-CN' ? '代码块' : 'CODE BLOCKS'}</span><span className="count-badge">{codeBlocks.length}</span></div><nav className="outline-list" aria-label={locale === 'zh-CN' ? '代码块索引' : 'Code block index'}>{codeBlocks.filter(item => !query || item.text?.toLowerCase().includes(query.toLowerCase()) || item.language?.includes(query)).map((item, index) => <button className="outline-item" key={item.id} onClick={() => { if (item.contentRange) onSelectCode?.(item.contentRange.start, item.contentRange.end) }}><FileText size={13}/><span>{item.language || 'Code'} · {locale === 'zh-CN' ? '行' : 'L'} {item.position?.start.line ?? index + 1}</span></button>)}</nav></>}</>}
      <div className="sidebar-bottom"><div className="file-row"><FileText size={15} /><span>{fileName}</span><span className="saved-dot" /></div></div>
    </aside>
  )
}
