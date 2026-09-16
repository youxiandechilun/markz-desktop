export type AiProtocol = 'chat-completions' | 'responses' | 'anthropic-messages'

export interface ModelCapabilities {
  /** Every configured model supports text. */
  text: true
  /** User-declared image input support; does not enable image uploads. */
  image: boolean
  streaming: boolean
  tools: boolean
  structuredOutput: boolean
  reasoning: boolean
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export interface AiProviderConfig {
  id: string
  name: string
  baseUrl: string
  protocol: AiProtocol
  apiKey?: string
  model?: string
  defaultModel?: string
  modelCapabilities?: Record<string, ModelCapabilities>
  capabilities: ModelCapabilities
  timeoutMs?: number
  maxTokens?: number
}

export interface AiRequestContext {
  prompt: string
  sourceText?: string
  selection?: string
  codeBlocks?: string[]
  model?: string
  signal?: AbortSignal
}

export interface AiUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; finishReason?: string; usage?: AiUsage; truncated: boolean }
  | { type: 'error'; error: AiError }

export class AiError extends Error {
  readonly code: string
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, options: { code?: string; status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'AiError'
    this.code = options.code ?? 'AI_REQUEST_FAILED'
    this.status = options.status
    this.retryable = options.retryable ?? ((options.status ?? 0) >= 500)
  }
}

export interface ModelInfo { id: string; name?: string; contextWindow?: number }
