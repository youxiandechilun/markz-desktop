import type { AiProviderConfig, AiProtocol, ModelCapabilities } from './types'
import { generationEndpoint } from './endpoints'

const protocols: readonly AiProtocol[] = ['chat-completions', 'responses', 'anthropic-messages']
const defaults: ModelCapabilities = { text: true, image: false, streaming: true, tools: false, structuredOutput: false, reasoning: false, contextWindow: 32_000, maxOutputTokens: 4_096, reasoningEffort: 'none' }

export function normalizeBaseUrl(value: string): string {
  const raw = value.trim().replace(/\\/g, '/')
  if (!raw) throw new Error('服务地址不能为空')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('服务地址必须是有效的 HTTPS 或 localhost HTTP URL') }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) throw new Error('仅允许 HTTPS；HTTP 仅用于 localhost')
  if (url.username || url.password) throw new Error('服务地址不能包含账号或密码')
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '')
  url.pathname = url.pathname.replace(/\/(?:chat\/completions|responses|messages)$/i, '')
  return url.toString().replace(/\/$/, '')
}

export function validateConfig(input: unknown): AiProviderConfig {
  if (!input || typeof input !== 'object') throw new Error('AI 配置必须是对象')
  const value = input as Record<string, unknown>
  const protocol = value.protocol
  if (typeof protocol !== 'string' || !protocols.includes(protocol as AiProtocol)) throw new Error('不支持的请求协议')
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : crypto.randomUUID()
  const baseUrl = typeof value.baseUrl === 'string' ? normalizeBaseUrl(value.baseUrl) : ''
  if (!baseUrl) throw new Error('服务地址不能为空')
  const capabilities = normalizeCapabilities(value.capabilities)
  const timeoutMs = finitePositive(value.timeoutMs, 60_000)
  const maxTokens = finitePositive(value.maxTokens, capabilities.maxOutputTokens ?? 4_096)
  return { id, name, baseUrl, protocol: protocol as AiProtocol, apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined, model: typeof value.model === 'string' ? value.model.trim() : undefined, defaultModel: typeof value.defaultModel === 'string' ? value.defaultModel.trim() : undefined, modelCapabilities: normalizeModelCapabilities(value.modelCapabilities), capabilities, timeoutMs, maxTokens }
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 10_000_000) : fallback
}

/** Normalize saved capabilities, including configurations from before modality settings. */
export function normalizeCapabilities(value: unknown): ModelCapabilities {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    text: true,
    image: raw.image === true,
    streaming: raw.streaming !== false,
    tools: raw.tools === true,
    structuredOutput: raw.structuredOutput === true,
    reasoning: raw.reasoning === true,
    contextWindow: finitePositive(raw.contextWindow, defaults.contextWindow ?? 32_000),
    maxOutputTokens: finitePositive(raw.maxOutputTokens, defaults.maxOutputTokens ?? 4_096),
    reasoningEffort: raw.reasoningEffort === 'low' || raw.reasoningEffort === 'medium' || raw.reasoningEffort === 'high' ? raw.reasoningEffort : 'none',
  }
}

/** Keep each model's settings independent when the user changes the selected model. */
export function selectProviderModel(config: AiProviderConfig, model: string): AiProviderConfig {
  const previousModel = config.defaultModel?.trim() || config.model?.trim()
  const nextModel = model.trim()
  if (previousModel === nextModel) return { ...config, model: undefined, defaultModel: model }
  const modelCapabilities = { ...config.modelCapabilities }
  if (previousModel) modelCapabilities[previousModel] = { ...config.capabilities }
  return {
    ...config,
    model: undefined,
    defaultModel: model,
    modelCapabilities,
    capabilities: normalizeCapabilities(modelCapabilities[nextModel]),
  }
}

function normalizeModelCapabilities(value: unknown): Record<string, ModelCapabilities> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const result: Record<string, ModelCapabilities> = {}
  for (const [model, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw && typeof raw === 'object') {
      result[model] = normalizeCapabilities(raw)
    }
  }
  return Object.keys(result).length ? result : undefined
}

export function endpointFor(config: AiProviderConfig, suffix: string): string {
  return generationEndpoint(config, suffix)
}
