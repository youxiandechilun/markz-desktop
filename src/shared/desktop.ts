export type Locale = 'zh-CN' | 'en'
export interface FileDocument { filePath: string; content: string; fingerprint: string }
export interface SaveRequest { filePath?: string; content: string; fingerprint?: string; saveAs?: boolean }
export interface Preferences { locale: Locale; theme: 'dark' | 'light'; autoSave: boolean }
export interface WorkspaceEntry { name: string; path: string; kind: 'file' | 'directory' }
export interface Draft { content: string; filePath?: string; fingerprint?: string }
export type DesktopCommand = 'new' | 'open' | 'save' | 'save-as' | 'export' | 'settings' | 'close'
export interface AppInfo { name: string; version: string; platform: string }
