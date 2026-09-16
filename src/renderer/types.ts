export type Locale = 'zh-CN' | 'en'
export type ThemeMode = 'dark' | 'light'
export type EditorMode = 'split' | 'source' | 'preview' | 'live'

export interface ToastMessage {
  id: number
  tone: 'success' | 'info' | 'error'
  message: string
}
