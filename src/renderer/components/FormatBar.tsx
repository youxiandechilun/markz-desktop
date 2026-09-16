import type { ReactNode } from 'react'
import { Code, CodeBlock, LinkSimple, ListBullets, ListChecks, ListNumbers, Minus, Quotes, Rows, Table, TextB, TextHOne, TextHThree, TextHTwo, TextItalic, TextStrikethrough } from '@phosphor-icons/react'
import type { EditorFontFamily } from '../../shared/desktop'
import type { FormatAction } from '../lib/format'
import type { Locale } from '../types'

interface Props {
  locale: Locale
  wordWrap: boolean
  fontSize: number
  fontFamily: EditorFontFamily
  onPreference: (patch: { wordWrap?: boolean; editorFontSize?: number; editorFontFamily?: EditorFontFamily }) => void
  onFormat: (action: FormatAction) => void
}
const sizes = [12, 13, 14, 15, 16, 18, 20]
const families: Array<{ value: EditorFontFamily; zh: string; en: string }> = [
  { value: 'mono', zh: '等宽', en: 'Monospace' },
  { value: 'sans', zh: '无衬线', en: 'Sans serif' },
  { value: 'serif', zh: '衬线', en: 'Serif' },
]

/** Markdown formatting for the source editor, plus the editor's own type settings. */
export function FormatBar({ locale, wordWrap, fontSize, fontFamily, onPreference, onFormat }: Props) {
  const zh = locale === 'zh-CN'
  const groups: Array<Array<{ action: FormatAction; icon: ReactNode; label: string }>> = [
    [
      { action: 'bold', icon: <TextB size={16}/>, label: zh ? '加粗' : 'Bold' },
      { action: 'italic', icon: <TextItalic size={16}/>, label: zh ? '斜体' : 'Italic' },
      { action: 'strike', icon: <TextStrikethrough size={16}/>, label: zh ? '删除线' : 'Strikethrough' },
      { action: 'inline-code', icon: <Code size={16}/>, label: zh ? '行内代码' : 'Inline code' },
    ],
    [
      { action: 'heading-1', icon: <TextHOne size={16}/>, label: zh ? '一级标题' : 'Heading 1' },
      { action: 'heading-2', icon: <TextHTwo size={16}/>, label: zh ? '二级标题' : 'Heading 2' },
      { action: 'heading-3', icon: <TextHThree size={16}/>, label: zh ? '三级标题' : 'Heading 3' },
    ],
    [
      { action: 'quote', icon: <Quotes size={16}/>, label: zh ? '引用' : 'Quote' },
      { action: 'bullet-list', icon: <ListBullets size={16}/>, label: zh ? '无序列表' : 'Bulleted list' },
      { action: 'ordered-list', icon: <ListNumbers size={16}/>, label: zh ? '有序列表' : 'Numbered list' },
      { action: 'task-list', icon: <ListChecks size={16}/>, label: zh ? '任务列表' : 'Task list' },
    ],
    [
      { action: 'code-block', icon: <CodeBlock size={16}/>, label: zh ? '代码块' : 'Code block' },
      { action: 'link', icon: <LinkSimple size={16}/>, label: zh ? '链接' : 'Link' },
      { action: 'table', icon: <Table size={16}/>, label: zh ? '表格' : 'Table' },
      { action: 'divider', icon: <Minus size={16}/>, label: zh ? '分隔线' : 'Divider' },
    ],
  ]
  return <div className="format-bar" role="toolbar" aria-label={zh ? 'Markdown 格式' : 'Markdown formatting'}>
    {groups.map((group, index) => <div className="format-group" key={index}>
      {index > 0 && <span className="format-divider" aria-hidden="true"/>}
      {group.map(item => <button key={item.action} type="button" className="format-button" title={item.label} aria-label={item.label} onClick={() => onFormat(item.action)}>{item.icon}</button>)}
    </div>)}
    <div className="format-group format-view">
      <span className="format-divider" aria-hidden="true"/>
      <label className="format-select" title={zh ? '编辑器字体' : 'Editor font'}><select aria-label={zh ? '编辑器字体' : 'Editor font'} value={fontFamily} onChange={event => onPreference({ editorFontFamily: event.target.value as EditorFontFamily })}>{families.map(item => <option key={item.value} value={item.value}>{zh ? item.zh : item.en}</option>)}</select></label>
      <label className="format-select" title={zh ? '字号' : 'Font size'}><select aria-label={zh ? '字号' : 'Font size'} value={fontSize} onChange={event => onPreference({ editorFontSize: Number(event.target.value) })}>{sizes.map(size => <option key={size} value={size}>{size}px</option>)}</select></label>
      <button type="button" className={`format-button ${wordWrap ? 'active' : ''}`} aria-pressed={wordWrap} title={zh ? '自动换行' : 'Word wrap'} aria-label={zh ? '自动换行' : 'Word wrap'} onClick={() => onPreference({ wordWrap: !wordWrap })}><Rows size={16}/></button>
    </div>
  </div>
}
