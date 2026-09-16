export type Locale = 'zh-CN' | 'en'
export interface FileDocument { filePath: string; content: string; fingerprint: string }
export interface SaveRequest { filePath?: string; content: string; fingerprint?: string; saveAs?: boolean }
export type EditorFontFamily = 'mono' | 'sans' | 'serif'
export interface Preferences {
  locale: Locale
  theme: 'dark' | 'light'
  autoSave: boolean
  /** Soft-wrap long lines in the source editor instead of scrolling horizontally. */
  wordWrap: boolean
  editorFontSize: number
  editorFontFamily: EditorFontFamily
}
export interface WorkspaceEntry { name: string; path: string; kind: 'file' | 'directory' }
export interface WorkspaceInfo { rootPath: string; entries: WorkspaceEntry[] }
export interface Draft { content: string; filePath?: string; fingerprint?: string; savedContent?: string }
export interface RestoredDraft extends FileDocument { savedContent: string; recovered: boolean }
export type DesktopCommand = 'new' | 'open' | 'save' | 'save-as' | 'export' | 'settings' | 'close'
export interface AppInfo { name: string; version: string; platform: string }
