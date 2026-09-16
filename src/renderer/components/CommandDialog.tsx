import { useEffect, useRef, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { Locale } from '../types'
interface Props { actions: Array<{ label: string; run: () => void }>; locale: Locale; onClose: () => void }
export function CommandDialog({ actions, locale, onClose }: Props) {
  const [query, setQuery] = useState(''), [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const items = actions.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => { const previous = document.activeElement; input.current?.focus(); return () => { if (previous instanceof HTMLElement) previous.focus() } }, [])
  const choose = (index: number) => { const item = items[index]; if (item) { onClose(); item.run() } }
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label={locale === 'zh-CN' ? '命令' : 'Commands'} onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') { event.preventDefault(); input.current?.focus() }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(items.length - 1, value + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, value - 1)) }
    if (event.key === 'Enter') choose(active)
  }}><label><MagnifyingGlass size={18}/><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} placeholder={locale === 'zh-CN' ? '输入命令名称…' : 'Find a command…'}/><kbd>Esc</kbd></label><div role="listbox">{items.map((item, index) => <button role="option" aria-selected={index === active} className={index === active ? 'active' : ''} key={item.label} onClick={() => choose(index)}>{item.label}<span>↵</span></button>)}{!items.length && <p>{locale === 'zh-CN' ? '没有匹配的命令' : 'No matching commands'}</p>}</div></section></div>
}
