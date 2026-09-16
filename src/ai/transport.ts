import { endpointFor, normalizeBaseUrl, validateConfig } from './config'
import { modelListEndpoints, type ModelListEndpoint } from './endpoints'
import { AiError, type AiProviderConfig, type AiRequestContext, type AiStreamEvent, type AiUsage, type ModelCapabilities, type ModelInfo } from './types'

const encoder = new TextEncoder()

export function composePrompt(request: AiRequestContext): string {
  const sections = [`用户指令：\n${request.prompt.trim()}`]
  if (request.selection) sections.push(`选中的 Markdown：\n${request.selection}`)
  if (request.sourceText) sections.push(`当前 Markdown 文档：\n${request.sourceText}`)
  if (request.codeBlocks?.length) sections.push(`文档内代码块：\n${request.codeBlocks.join('\n\n')}`)
  sections.push('请只返回可直接写入 Markdown 文档的纯文本结果，不要使用解释、前后缀或 Markdown 围栏。')
  return sections.join('\n\n')
}

export class AiTransport {
  async listModels(input: AiProviderConfig): Promise<ModelInfo[]> {
    const config = validateConfig(input)
    const endpoints = modelListEndpoints(config)
    const attempted: string[] = []
    let unavailable: AiError | undefined
    for (const endpoint of endpoints) {
      attempted.push(endpoint.url)
      const response = await this.fetchWithTimeout(endpoint.url, config, { method: 'GET', headers: listHeaders(endpoint, config.apiKey) })
      if (response.status === 404 || response.status === 405) {
        await response.body?.cancel()
        unavailable = new AiError(modelListMessage(attempted), { code: 'MODEL_LIST_UNAVAILABLE', status: response.status })
        continue
      }
      if (!response.ok) throw await errorFromResponse(response)
      const data = await readJson(response, config.timeoutMs)
      if (!data || typeof data !== 'object') throw new AiError('模型列表格式无效', { code: 'INVALID_RESPONSE' })
      const raw = (data as Record<string, unknown>).data
      if (!Array.isArray(raw)) throw new AiError('模型列表格式无效，请手动输入模型 ID。', { code: 'INVALID_RESPONSE' })
      return raw.flatMap((item): ModelInfo[] => {
        if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).id !== 'string') return []
        const row = item as Record<string, unknown>
        return [{ id: row.id as string, name: typeof row.name === 'string' ? row.name : undefined, contextWindow: contextWindowOf(row) }]
      })
    }
    // The attempted paths stay in the message so a failed click is diagnosable; the
    // settings UI replaces this code with a bilingual explanation.
    throw unavailable ?? new AiError('该服务未提供可用的模型列表接口，请手动填写模型 ID 后测试连接。', { code: 'MODEL_LIST_UNAVAILABLE' })
  }

  async testConnection(input: AiProviderConfig): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: AiError }> {
    try {
      const config = validateConfig(input)
      const model = config.model || config.defaultModel
      if (!model) throw new AiError('请先选择模型', { code: 'MODEL_REQUIRED' })
      // A probe only asks for one short sentence: reasoning effort is dropped so a
      // reasoning model answers instead of spending the whole budget thinking, and
      // the budget stays far above the tiny default that used to truncate it.
      const capabilities: ModelCapabilities = { ...config.capabilities, reasoningEffort: 'none' }
      const probe: AiProviderConfig = { ...config, capabilities, maxTokens: Math.max(config.capabilities.maxOutputTokens ?? 0, 256) }
      try {
        const body = await this.probeJson({ ...probe, capabilities: { ...capabilities, streaming: false } }, model)
        if (!extractText(config.protocol, body)) throw new AiError('服务返回的协议响应无效', { code: 'INVALID_RESPONSE' })
      } catch (error) {
        const failure = toAiError(error)
        // A service that answers only on a stream returns nothing to a buffered probe.
        // One retry keeps streaming-only models testable without a second setup step.
        if (failure.code !== 'INVALID_RESPONSE') throw failure
        await this.probeStream({ ...probe, capabilities: { ...capabilities, streaming: true } }, model)
      }
      return { ok: true, models: [] }
    } catch (error) { return { ok: false, error: toAiError(error) } }
  }

  private async probeJson(config: AiProviderConfig, model: string): Promise<unknown> {
    const response = await this.startRequest(config, model, { prompt: 'Respond with OK.' })
    if (!response.ok) throw await errorFromResponse(response)
    return readJson(response, config.timeoutMs)
  }

  private async probeStream(config: AiProviderConfig, model: string): Promise<void> {
    const response = await this.startRequest(config, model, { prompt: 'Respond with OK.' })
    if (!response.ok) throw await errorFromResponse(response)
    for await (const event of parseSse(response, config.protocol, config.timeoutMs ?? 60_000)) {
      if (event.type === 'delta' && event.text) return
      if (event.type === 'done') return
      if (event.type === 'error') throw event.error
    }
    throw new AiError('服务未返回可用的流式响应', { code: 'INVALID_RESPONSE' })
  }

  async *stream(input: AiRequestContext, providerInput: AiProviderConfig): AsyncGenerator<AiStreamEvent> {
    const config = validateConfig(providerInput)
    const model = input.model?.trim() || config.model || config.defaultModel
    if (!model) { yield { type: 'error', error: new AiError('请先选择模型', { code: 'MODEL_REQUIRED' }) }; return }
    if (input.signal?.aborted) { yield { type: 'error', error: abortedError() }; return }
    try {
      const response = await this.startRequest(config, model, input)
      if (!response.ok) { yield { type: 'error', error: await errorFromResponse(response) }; return }
      if (!config.capabilities.streaming) {
        const body = await readJson(response)
        const text = extractText(config.protocol, body)
        if (text) yield { type: 'delta', text }
        yield { type: 'done', finishReason: extractFinishReason(body), truncated: isTruncated(body) }
        return
      }
      yield* parseSse(response, config.protocol, config.timeoutMs ?? 60_000, input.signal)
    } catch (error) {
      // An aborted read rejects with a DOM AbortError; report the cancel, not a generic failure.
      yield { type: 'error', error: input.signal?.aborted ? abortedError() : toAiError(error) }
    }
  }

  private async startRequest(config: AiProviderConfig, model: string, request: AiRequestContext): Promise<Response> {
    const prompt = composePrompt(request)
    const maxTokens = config.maxTokens ?? config.capabilities.maxOutputTokens ?? 4096
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream' }
    if (config.apiKey) {
      if (config.protocol === 'anthropic-messages') { headers['x-api-key'] = config.apiKey; headers['anthropic-version'] = '2023-06-01' }
      else headers.authorization = `Bearer ${config.apiKey}`
    }
    let body: Record<string, unknown>
    let suffix: string
    if (config.protocol === 'chat-completions') {
      suffix = 'chat/completions'; body = { model, messages: [{ role: 'user', content: prompt }], stream: config.capabilities.streaming, max_tokens: maxTokens }
      if (config.capabilities.reasoning && config.capabilities.reasoningEffort !== 'none') body.reasoning_effort = config.capabilities.reasoningEffort
    } else if (config.protocol === 'responses') {
      suffix = 'responses'; body = { model, input: prompt, stream: config.capabilities.streaming, max_output_tokens: maxTokens }
      if (config.capabilities.reasoning && config.capabilities.reasoningEffort !== 'none') body.reasoning = { effort: config.capabilities.reasoningEffort }
    } else {
      suffix = 'messages'; body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], stream: config.capabilities.streaming }
    }
    return this.fetchWithTimeout(endpointFor(config, suffix), config, { method: 'POST', headers, body: JSON.stringify(body), signal: request.signal })
  }

  private async fetchWithTimeout(url: string, config: AiProviderConfig, init: RequestInit): Promise<Response> {
    normalizeBaseUrl(config.baseUrl)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('timeout'), config.timeoutMs ?? 60_000)
    const signal = init.signal
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    try { return await fetch(url, { ...init, signal: controller.signal }) } catch (error) {
      if (controller.signal.aborted) throw new AiError(signal?.aborted ? '请求已取消' : '请求超时', { code: signal?.aborted ? 'ABORTED' : 'TIMEOUT', retryable: true })
      throw error
    } finally { clearTimeout(timeout) }
  }
}

async function* parseSse(response: Response, protocol: AiProviderConfig['protocol'], timeoutMs: number, signal?: AbortSignal): AsyncGenerator<AiStreamEvent> {
  if (!response.body) { yield { type: 'error', error: new AiError('服务未返回响应流', { code: 'EMPTY_RESPONSE' }) }; return }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let finish = 'stop'; let usage: AiUsage | undefined; let terminal = false; let drained = false
  try {
    while (true) {
      if (signal?.aborted) { yield { type: 'error', error: abortedError() }; return }
      const part = await readWithTimeout(reader, timeoutMs); if (signal?.aborted) { yield { type: 'error', error: abortedError() }; return }; if (part.done) break
      buffer += decoder.decode(part.value, { stream: true })
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim(); if (!raw) continue; if (raw === '[DONE]') { terminal = true; continue }
        let data: unknown; try { data = JSON.parse(raw) } catch { continue }
        if (data && typeof data === 'object') {
          const record = data as Record<string, unknown>
          if (record.type === 'error' || record.type === 'response.error' || record.error) { yield { type: 'error', error: new AiError('模型服务返回错误', { code: 'AI_STREAM_ERROR', retryable: true }) }; return }
        }
        const reasoning = extractReasoning(protocol, data); if (reasoning) yield { type: 'reasoning', text: reasoning }
        const text = extractDelta(protocol, data); if (text) yield { type: 'delta', text }
        const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
        const choiceReason = protocol === 'chat-completions' && Array.isArray(record.choices) && record.choices[0] && typeof record.choices[0] === 'object' ? (record.choices[0] as Record<string, unknown>).finish_reason : undefined
        const nestedStop = record.delta && typeof record.delta === 'object' ? (record.delta as Record<string, unknown>).stop_reason : undefined
        const reason = typeof record.finish_reason === 'string' ? record.finish_reason : typeof choiceReason === 'string' ? choiceReason : typeof record.stop_reason === 'string' ? record.stop_reason : typeof nestedStop === 'string' ? nestedStop : undefined; if (reason) finish = reason
        const u = record.usage; if (u && typeof u === 'object') usage = parseUsage(u as Record<string, unknown>)
        if (protocol === 'responses' && typeof record.type === 'string' && (record.type === 'response.completed' || record.type === 'response.incomplete')) {
          terminal = true
          const responseObj = record.response; if (responseObj && typeof responseObj === 'object') { const status = (responseObj as Record<string, unknown>).status; if (status === 'incomplete') finish = 'length' }
          if (record.type === 'response.incomplete') finish = 'length'
        }
        if (protocol === 'anthropic-messages' && record.type === 'message_stop') terminal = true
      }
    }
    drained = true
    if (!terminal) { yield { type: 'error', error: new AiError('响应流提前结束', { code: 'INCOMPLETE_STREAM', retryable: true }) }; return }
    yield { type: 'done', finishReason: finish, usage, truncated: finish === 'length' || finish === 'max_tokens' || finish === 'incomplete' }
  } catch (error) { yield { type: 'error', error: signal?.aborted ? abortedError() : toAiError(error) } }
  // An early return (cancel, probe, stream error) leaves the body unread; releasing
  // it here keeps the socket from outliving the request.
  finally { if (!drained) { try { await reader.cancel() } catch { /* reader already closed */ } } }
}

function extractDelta(protocol: AiProviderConfig['protocol'], data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const r = data as Record<string, unknown>
  if (protocol === 'chat-completions') { const choices = r.choices; if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') { const delta = (choices[0] as Record<string, unknown>).delta; return delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).content === 'string' ? (delta as Record<string, unknown>).content as string : '' } }
  if (protocol === 'responses') return r.type === 'response.output_text.delta' && typeof r.delta === 'string' ? r.delta : ''
  const delta = r.delta; return delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).text === 'string' ? (delta as Record<string, unknown>).text as string : ''
}

/**
 * Reasoning models stream their thinking before any answer text. Reporting it keeps
 * the interface alive during a long think instead of looking stalled; it is never
 * treated as document content.
 */
function extractReasoning(protocol: AiProviderConfig['protocol'], data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const r = data as Record<string, unknown>
  if (protocol === 'chat-completions') {
    const choices = r.choices
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
    const delta = (choices[0] as Record<string, unknown>).delta
    if (!delta || typeof delta !== 'object') return ''
    for (const key of ['reasoning_content', 'reasoning']) {
      const value = (delta as Record<string, unknown>)[key]
      if (typeof value === 'string' && value) return value
    }
    return ''
  }
  // The Responses API reports reasoning under several event names across versions.
  if (protocol === 'responses') return (r.type === 'response.reasoning_summary_text.delta' || r.type === 'response.reasoning_text.delta') && typeof r.delta === 'string' ? r.delta : ''
  const delta = r.delta
  if (r.type !== 'content_block_delta' || !delta || typeof delta !== 'object') return ''
  const block = delta as Record<string, unknown>
  return block.type === 'thinking_delta' && typeof block.thinking === 'string' ? block.thinking : ''
}

function extractText(protocol: AiProviderConfig['protocol'], data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const r = data as Record<string, unknown>
  if (protocol === 'chat-completions') { const c = r.choices; const msg = Array.isArray(c) && c[0] && typeof c[0] === 'object' ? (c[0] as Record<string, unknown>).message : undefined; return msg && typeof msg === 'object' && typeof (msg as Record<string, unknown>).content === 'string' ? (msg as Record<string, unknown>).content as string : '' }
  if (protocol === 'responses') {
    if (typeof r.output_text === 'string') return r.output_text
    const output = r.output
    if (Array.isArray(output)) return output.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = (item as Record<string, unknown>).content
      return Array.isArray(content) ? content.flatMap((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? [(part as Record<string, unknown>).text as string] : []) : []
    }).join('')
  }
  const content = r.content; if (Array.isArray(content)) return content.flatMap((x) => x && typeof x === 'object' && typeof (x as Record<string, unknown>).text === 'string' ? [(x as Record<string, unknown>).text as string] : []).join('')
  return ''
}

function extractFinishReason(data: unknown): string | undefined { if (!data || typeof data !== 'object') return undefined; const r = data as Record<string, unknown>; const c = r.choices; const d = r.delta; return Array.isArray(c) && c[0] && typeof c[0] === 'object' && typeof (c[0] as Record<string, unknown>).finish_reason === 'string' ? (c[0] as Record<string, unknown>).finish_reason as string : typeof r.stop_reason === 'string' ? r.stop_reason : d && typeof d === 'object' && typeof (d as Record<string, unknown>).stop_reason === 'string' ? (d as Record<string, unknown>).stop_reason as string : typeof r.status === 'string' ? r.status as string : undefined }
function isTruncated(data: unknown): boolean { const reason = extractFinishReason(data); return reason === 'length' || reason === 'max_tokens' || reason === 'incomplete' }
function parseUsage(r: Record<string, unknown>): AiUsage { return { inputTokens: number(r.prompt_tokens ?? r.input_tokens), outputTokens: number(r.completion_tokens ?? r.output_tokens), totalTokens: number(r.total_tokens) } }
function abortedError(): AiError { return new AiError('请求已取消', { code: 'ABORTED', retryable: true }) }
function listHeaders(endpoint: ModelListEndpoint, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (endpoint.authentication === 'anthropic') headers['anthropic-version'] = '2023-06-01'
  if (apiKey) {
    if (endpoint.authentication === 'anthropic') headers['x-api-key'] = apiKey
    else headers.authorization = `Bearer ${apiKey}`
  }
  return headers
}
/** Names the paths that were tried so a failed discovery click is diagnosable from the log. */
function modelListMessage(attempted: string[]): string {
  const paths = attempted.map(url => { try { return new URL(url).pathname } catch { return url } })
  return `该服务未提供可用的模型列表接口（已尝试 ${paths.join('、')}），请手动填写模型 ID 后测试连接。`
}
/** Compatible providers disagree on the field name that carries a model's context budget. */
function contextWindowOf(row: Record<string, unknown>): number | undefined {
  for (const key of ['context_window', 'context_length', 'max_model_len']) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  }
  return undefined
}
function number(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined }
async function readJson(response: Response, timeoutMs = 60_000): Promise<unknown> { let timer: ReturnType<typeof setTimeout> | undefined; try { const text = await Promise.race([response.text(), new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new AiError('请求超时', { code: 'TIMEOUT', retryable: true })), timeoutMs) })]); try { return JSON.parse(text) as unknown } catch { throw new AiError('服务返回的 JSON 无效', { code: 'INVALID_RESPONSE', status: response.status }) } } finally { if (timer) clearTimeout(timer) } }
async function errorFromResponse(response: Response): Promise<AiError> { const text = await response.text(); let message = `服务请求失败（HTTP ${response.status}）`; try { const data = JSON.parse(text) as unknown; if (data && typeof data === 'object') { const e = (data as Record<string, unknown>).error; if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string') message = (e as Record<string, unknown>).message as string; else if (typeof (data as Record<string, unknown>).message === 'string') message = (data as Record<string, unknown>).message as string } } catch { /* plain text intentionally omitted to avoid leaking provider data */ } message = message.replace(/(sk-|secret[-_]?token[-_]?|api[_-]?key\s*[:=]|Bearer\s+|x-api-key\s*[:=])\S+/gi, '[已隐藏凭据]').slice(0, 300); const code = response.status === 401 ? 'AUTH_FAILED' : response.status === 429 ? 'RATE_LIMITED' : 'AI_HTTP_ERROR'; return new AiError(message, { status: response.status, code }) }
function toAiError(error: unknown): AiError { if (error instanceof AiError) return error; if (error instanceof Error) return new AiError(error.message); return new AiError('AI 请求失败') }
async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([reader.read(), new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => { timer = setTimeout(() => reject(new AiError('请求超时', { code: 'TIMEOUT', retryable: true })), timeoutMs) })]) }
  finally { if (timer) clearTimeout(timer) }
}

export { encoder }
