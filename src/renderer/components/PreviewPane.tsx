import { CheckCircle, Copy, Eye, LinkSimple } from '@phosphor-icons/react'
import type { MarkdownDocument } from '../lib/markdown'
import type { Locale } from '../types'

interface PreviewPaneProps {
  html: string
  document: MarkdownDocument
  onCopy: () => void
  onNavigate: (line: number) => void
  locale: Locale
}

export function PreviewPane({ html, document, onCopy, onNavigate, locale }: PreviewPaneProps) {
  const ui = locale === 'zh-CN' ? { preview: '实时预览', copy: '复制 HTML', open: '打开预览', compiled: '本地编译', mapped: '源码已映射 · 可以编辑' } : { preview: 'Live preview', copy: 'Copy rendered HTML', open: 'Open preview', compiled: 'Compiled locally', mapped: 'Source mapped · Ready to edit' }
  return (
    <section className="preview-pane" aria-label={locale === 'zh-CN' ? '文档预览' : 'Rendered preview'}>
      <div className="pane-heading">
        <div className="pane-title"><Eye size={15} weight="bold" /> <span>{ui.preview}</span></div>
        <div className="pane-actions">
          <button className="icon-button subtle" aria-label={ui.copy} title={ui.copy} onClick={onCopy}><Copy size={15} /></button>
        </div>
      </div>
      <article className="markdown-preview">
        <div className="preview-content" onDoubleClick={event => { const target = event.target; if (target instanceof HTMLElement) { const line = target.closest('[data-source-line]')?.getAttribute('data-source-line'); if (line) onNavigate(Number(line)) } }} dangerouslySetInnerHTML={{ __html: html }} />
        <div className="preview-footer"><CheckCircle size={14} weight="fill" /> {ui.mapped} <LinkSimple size={13} /></div>
      </article>
    </section>
  )
}
