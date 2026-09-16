import { safeStorage } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite, requireText } from './files'
import type { AiProviderConfig } from '../src/ai'
import { validateConfig } from '../src/ai'
import type { Draft, Preferences } from '../src/shared/desktop'

export interface PublicProvider extends Omit<AiProviderConfig, 'apiKey'> { hasApiKey: boolean }
export interface SettingsView { preferences: Preferences; providers: PublicProvider[]; activeProviderId?: string }
interface StoredSettings { preferences: Preferences; providers: AiProviderConfig[]; activeProviderId?: string; keys: Record<string, string> }
const defaults: Preferences = { locale: 'zh-CN', theme: 'light', autoSave: true, wordWrap: true, editorFontSize: 14, editorFontFamily: 'mono' }

export class SettingsService {
  private value: StoredSettings = { preferences: defaults, providers: [], keys: {} }
  private queue: Promise<void> = Promise.resolve()
  private draftQueue: Promise<void> = Promise.resolve()
  constructor(private readonly directory: string) {}
  async load(): Promise<void> {
    let raw: unknown
    try { raw = JSON.parse(await readFile(join(this.directory, 'settings.json'), 'utf8')) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw new Error('SETTINGS_READ: 设置文件无法读取 / Cannot read settings')
    }
    if (!raw || typeof raw !== 'object') throw new Error('SETTINGS_INVALID')
    const preferences = 'preferences' in raw ? parsePreferences(raw.preferences) : defaults
    const providers = 'providers' in raw && Array.isArray(raw.providers) ? raw.providers.map(item => validateConfig(item)) : []
    const keys: Record<string, string> = {}
    if ('keys' in raw && raw.keys && typeof raw.keys === 'object') {
      for (const [id, value] of Object.entries(raw.keys)) if (typeof value === 'string') keys[id] = value
    }
    const activeProviderId = 'activeProviderId' in raw && typeof raw.activeProviderId === 'string' ? raw.activeProviderId : providers[0]?.id
    this.value = { preferences, providers, keys, activeProviderId }
  }
  view(): SettingsView {
    return { preferences: this.value.preferences, providers: this.value.providers.map(provider => ({ ...provider, apiKey: undefined, hasApiKey: Boolean(this.value.keys[provider.id]) })), activeProviderId: this.value.activeProviderId }
  }
  private persist(): Promise<void> {
    const content = JSON.stringify(this.value, null, 2)
    this.queue = this.queue.catch(() => undefined).then(() => atomicWrite(join(this.directory, 'settings.json'), content))
    return this.queue
  }
  async setPreferences(input: unknown): Promise<SettingsView> { this.value.preferences = parsePreferences(input); await this.persist(); return this.view() }
  async saveProvider(input: unknown): Promise<SettingsView> {
    const config = validateConfig(input)
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(config.id)) throw new Error('PROVIDER_ID_INVALID')
    const previous = this.value.providers.find(item => item.id === config.id)
    if (previous && (previous.baseUrl !== config.baseUrl || previous.protocol !== config.protocol)) delete this.value.keys[config.id]
    if (config.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('KEY_STORAGE_UNAVAILABLE: 系统凭据加密不可用 / System encryption unavailable')
      this.value.keys[config.id] = safeStorage.encryptString(config.apiKey).toString('base64')
    }
    const publicConfig = { ...config, apiKey: undefined }
    this.value.providers = [...this.value.providers.filter(item => item.id !== config.id), publicConfig]
    this.value.activeProviderId = config.id
    await this.persist()
    return this.view()
  }
  async removeProvider(id: unknown): Promise<SettingsView> {
    const key = requireText(id, 80)
    this.value.providers = this.value.providers.filter(item => item.id !== key)
    delete this.value.keys[key]
    if (this.value.activeProviderId === key) this.value.activeProviderId = this.value.providers[0]?.id
    await this.persist(); return this.view()
  }
  async activate(id: unknown): Promise<SettingsView> {
    const key = requireText(id, 80)
    if (!this.value.providers.some(item => item.id === key)) throw new Error('PROVIDER_NOT_FOUND')
    this.value.activeProviderId = key; await this.persist(); return this.view()
  }
  resolve(input?: unknown): AiProviderConfig {
    const config = input ? validateConfig(input) : this.value.providers.find(item => item.id === this.value.activeProviderId)
    if (!config) throw new Error('PROVIDER_REQUIRED: 请先配置 AI 服务 / Configure an AI service first')
    const stored = this.value.keys[config.id]
    const original = this.value.providers.find(item => item.id === config.id)
    // A changed endpoint must receive a freshly entered key, never a stored secret.
    if (!config.apiKey && stored && original?.baseUrl === config.baseUrl && original.protocol === config.protocol) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('KEY_STORAGE_UNAVAILABLE')
      return { ...config, apiKey: safeStorage.decryptString(Buffer.from(stored, 'base64')) }
    }
    return config
  }
  async saveDraft(input: unknown): Promise<void> {
    if (!input || typeof input !== 'object' || !('content' in input)) throw new Error('DRAFT_INVALID')
    const draft = parseDraft(input)
    const content = JSON.stringify(draft)
    this.draftQueue = this.draftQueue.catch(() => undefined).then(() => atomicWrite(join(this.directory, 'recovery.json'), content))
    await this.draftQueue
  }
  async readDraft(): Promise<Draft | undefined> {
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.directory, 'recovery.json'), 'utf8'))
      if (!raw || typeof raw !== 'object' || !('content' in raw)) return undefined
      return parseDraft(raw)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw new Error('RECOVERY_READ: 无法读取恢复草稿 / Cannot read recovery draft')
    }
  }
}
export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || !('locale' in value) || !('theme' in value) || !['zh-CN', 'en'].includes(String(value.locale)) || !['light', 'dark'].includes(String(value.theme))) throw new Error('PREFERENCES_INVALID')
  if ('autoSave' in value && typeof value.autoSave !== 'boolean') throw new Error('PREFERENCES_INVALID')
  // Later fields are additive: a missing value keeps the safe default so an existing
  // installation reads and rewrites its settings without a migration step.
  return {
    locale: value.locale === 'en' ? 'en' : 'zh-CN',
    theme: value.theme === 'light' ? 'light' : 'dark',
    autoSave: !('autoSave' in value) || value.autoSave !== false,
    wordWrap: !('wordWrap' in value) || value.wordWrap !== false,
    editorFontSize: parseFontSize(value),
    editorFontFamily: parseFontFamily(value),
  }
}
function parseFontSize(value: object & Record<string, unknown>): number {
  const size = 'editorFontSize' in value ? Number(value.editorFontSize) : Number.NaN
  return Number.isFinite(size) ? Math.max(11, Math.min(22, Math.round(size))) : defaults.editorFontSize
}
function parseFontFamily(value: object & Record<string, unknown>): Preferences['editorFontFamily'] {
  const family = 'editorFontFamily' in value ? value.editorFontFamily : undefined
  return family === 'sans' || family === 'serif' ? family : 'mono'
}
function parseDraft(input: object & Record<'content', unknown>): Draft {
  return {
    content: requireText(input.content),
    filePath: 'filePath' in input && typeof input.filePath === 'string' ? requireText(input.filePath, 32768) : undefined,
    fingerprint: 'fingerprint' in input && typeof input.fingerprint === 'string' ? requireText(input.fingerprint, 128) : undefined,
    savedContent: 'savedContent' in input && typeof input.savedContent === 'string' ? requireText(input.savedContent) : undefined,
  }
}
