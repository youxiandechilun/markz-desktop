import { FileText, MagnifyingGlass, Plus, SlidersHorizontal, TreeStructure } from '@phosphor-icons/react'
import type { OutlineItem } from '../lib/markdown'
import type { Locale } from '../types'
import type { IndexedNode } from '../../core'

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
}

export function Sidebar({ headings, query, onQueryChange, onNew, onNavigate, onSettings, fileName, locale, codeBlocks = [], onSelectCode }: SidebarProps) {
  const ui = locale === 'zh-CN' ? { workspace: '写作空间', local: '本地文档', newDocument: '新建文档', search: '搜索大纲', onPage: '本页内容', empty: '没有匹配的章节', footnote: '本地优先 · UTF-8 Markdown' } : { workspace: 'Writing workspace', local: 'Local documents', newDocument: 'New document', search: 'Search outline', onPage: 'ON THIS PAGE', empty: 'No matching sections', footnote: 'Local-first · UTF-8 Markdown' }
  const filtered = headings.filter((item) => item.text.toLowerCase().includes(query.toLowerCase()))
  return (
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-mark">M</div><span>MARKZ</span><span className="brand-beta">DESKTOP</span></div>
      <div className="workspace-row"><div className="workspace-avatar"><FileText size={15}/></div><div><strong>{ui.workspace}</strong><span>{ui.local}</span></div></div>
      <div className="sidebar-actions"><button className="new-document" onClick={onNew}><Plus size={16} weight="bold" /> {ui.newDocument}</button><button className="icon-button" onClick={onSettings} aria-label={locale === 'zh-CN' ? '打开设置' : 'Open settings'} title={locale === 'zh-CN' ? '设置' : 'Settings'}><SlidersHorizontal size={17} /></button></div>
      <label className="search-field"><MagnifyingGlass size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={ui.search} aria-label={ui.search} /></label>
      <div className="side-section-label"><span>{ui.onPage}</span><span className="count-badge">{headings.length}</span></div>
      <nav className="outline-list" aria-label={locale === 'zh-CN' ? '文档大纲' : 'Document outline'}>
        {filtered.length === 0 ? <div className="empty-outline">{ui.empty}</div> : filtered.map((item) => (
          <button key={item.id} className={`outline-item depth-${Math.min(item.depth, 3)}`} onClick={() => onNavigate(item.line)}><TreeStructure size={13} /><span>{item.text}</span></button>
        ))}
      </nav>
      {codeBlocks.length > 0 && <><div className="side-section-label"><span>{locale === 'zh-CN' ? '代码块' : 'CODE BLOCKS'}</span><span className="count-badge">{codeBlocks.length}</span></div><nav className="outline-list" aria-label={locale === 'zh-CN' ? '代码块索引' : 'Code block index'}>{codeBlocks.filter(item => !query || item.text?.toLowerCase().includes(query.toLowerCase()) || item.language?.includes(query)).map((item, index) => <button className="outline-item" key={item.id} onClick={() => { if (item.contentRange) onSelectCode?.(item.contentRange.start, item.contentRange.end) }}><FileText size={13}/><span>{item.language || 'Code'} · {locale === 'zh-CN' ? '行' : 'L'} {item.position?.start.line ?? index + 1}</span></button>)}</nav></>}
      <div className="sidebar-bottom"><div className="file-row"><FileText size={15} /><span>{fileName}</span><span className="saved-dot" /></div><div className="sidebar-footnote">{ui.footnote}</div></div>
    </aside>
  )
}
