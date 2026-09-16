import { Menu, type BrowserWindow } from 'electron'
import type { DesktopCommand, Locale } from '../src/shared/desktop'
export function installMenu(window: BrowserWindow, locale: Locale): void {
  const zh = locale === 'zh-CN'
  const command = (value: DesktopCommand) => () => window.webContents.send('app:command', value)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: zh ? '文件' : 'File', submenu: [
      { label: zh ? '新建' : 'New', accelerator: 'CmdOrCtrl+N', click: command('new') },
      { label: zh ? '打开' : 'Open', accelerator: 'CmdOrCtrl+O', click: command('open') },
      { label: zh ? '保存' : 'Save', accelerator: 'CmdOrCtrl+S', click: command('save') },
      { label: zh ? '另存为' : 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: command('save-as') },
      { label: zh ? '导出 HTML' : 'Export HTML', click: command('export') },
      { type: 'separator' }, { role: 'quit', label: zh ? '退出' : 'Quit' },
    ] },
    { label: zh ? '编辑' : 'Edit', submenu: [
      { role: 'undo', label: zh ? '撤销' : 'Undo' }, { role: 'redo', label: zh ? '重做' : 'Redo' }, { type: 'separator' },
      { role: 'cut', label: zh ? '剪切' : 'Cut' }, { role: 'copy', label: zh ? '复制' : 'Copy' }, { role: 'paste', label: zh ? '粘贴' : 'Paste' }, { role: 'selectAll', label: zh ? '全选' : 'Select All' },
    ] },
    { label: zh ? '视图' : 'View', submenu: [
      { role: 'resetZoom', label: zh ? '实际大小' : 'Actual size' }, { role: 'zoomIn', label: zh ? '放大' : 'Zoom in' }, { role: 'zoomOut', label: zh ? '缩小' : 'Zoom out' },
      { role: 'togglefullscreen', label: zh ? '切换全屏' : 'Toggle full screen' },
      { label: zh ? 'AI 设置' : 'AI Settings', accelerator: 'CmdOrCtrl+,', click: command('settings') },
    ] },
  ]))
}
