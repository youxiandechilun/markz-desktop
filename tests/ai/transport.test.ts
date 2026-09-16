import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeBaseUrl, validateConfig } from '../../src/ai/config'
import { AiError, AiTransport, collectProposal, type AiProtocol } from '../../src/ai'

const servers: Server[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

function mockServer(protocol: AiProtocol, status = 200): Promise<{ url: string; requests: Array<{ headers: IncomingMessage['headers']; body: string }> }> {
  const requests: Array<{ headers: IncomingMessage['headers']; body: string }> = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    requests.push({ headers: req.headers, body })
    if (req.url?.endsWith('/models') && status === 200) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'mock-model' }] })); return }
    res.statusCode = status
    if (status !== 200) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'bad key' } })); return }
    res.setHeader('content-type', 'text/event-stream'); res.setHeader('cache-control', 'no-cache'); res.flushHeaders()
    const events = protocol === 'chat-completions' ? ['data: {"choices":[{"delta":{"content":"你好"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"，世界"},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n'] : protocol === 'responses' ? ['event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}\n\n', 'data: {"type":"response.output_text.delta","delta":"，世界"}\n\n', 'data: {"type":"response.completed","response":{"status":"completed"}}\n\n'] : ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"，世界"}}\n\n', 'data: {"type":"message_stop"}\n\n']
    for (const event of events) { res.write(event); await new Promise((resolve) => setTimeout(resolve, 2)) }
    res.end()
  })
  servers.push(server)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0; resolve({ url: `http://localhost:${port}/v1`, requests }) }))
}

function config(url: string, protocol: AiProtocol) { return validateConfig({ id: 'test', name: 'Test', baseUrl: url, protocol, apiKey: 'secret', model: 'mock-model', capabilities: { streaming: true, tools: false, structuredOutput: false, reasoning: false } }) }
function customServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler); servers.push(server)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { const a = server.address(); resolve(`http://localhost:${typeof a === 'object' && a ? a.port : 0}/v1`) }))
}

describe('AI transport', () => {
  it('normalizes and validates local URLs while rejecting insecure remote HTTP', () => {
    expect(normalizeBaseUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1')
    expect(() => normalizeBaseUrl('http://example.com')).toThrow()
    expect(() => normalizeBaseUrl('https://example.com/a/')).not.toThrow()
  })

  for (const protocol of ['chat-completions', 'responses', 'anthropic-messages'] as const) {
    it(`streams ${protocol} deltas and sends its protocol payload`, async () => {
      const mock = await mockServer(protocol); const transport = new AiTransport(); const result = await collectProposal(transport, { prompt: '写一句话' }, config(mock.url, protocol))
      expect(result.text).toBe('你好，世界'); expect(result.truncated).toBe(false)
      const payload = JSON.parse(mock.requests.find((request) => request.body.includes('mock-model'))?.body ?? '{}') as Record<string, unknown>
      expect(payload.model).toBe('mock-model'); expect(payload.stream).toBe(true)
      if (protocol === 'chat-completions') expect(payload.messages).toBeDefined()
      if (protocol === 'responses') expect(payload.input).toBeDefined()
      if (protocol === 'anthropic-messages') expect(mock.requests[0]?.headers['x-api-key']).toBe('secret')
    })
  }

  it('returns model discovery and a typed HTTP error', async () => {
    const mock = await mockServer('responses', 401); const transport = new AiTransport(); const result = await transport.testConnection(config(mock.url, 'responses'))
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('AUTH_FAILED')
  })

  it('uses auth for model discovery and rejects a missing model endpoint', async () => {
    const mock = await mockServer('chat-completions'); const transport = new AiTransport(); const models = await transport.listModels(config(mock.url, 'chat-completions'))
    expect(models[0]?.id).toBe('mock-model'); expect(mock.requests[0]?.headers.authorization).toBe('Bearer secret')
  })

  it('honors cancellation', async () => {
    const mock = await mockServer('responses'); const controller = new AbortController(); controller.abort(); const transport = new AiTransport(); const events = []
    for await (const event of transport.stream({ prompt: 'x', signal: controller.signal }, config(mock.url, 'responses'))) events.push(event)
    expect(events[0]?.type).toBe('error'); expect(events[0]?.type === 'error' && events[0].error).toBeInstanceOf(AiError)
  })

  it('parses non-stream Responses output content and reports truncation reasons', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'OK' }] }], status: 'completed' })) })
    const transport = new AiTransport(); const result = await collectProposal(transport, { prompt: 'x' }, { ...config(url, 'responses'), capabilities: { ...config(url, 'responses').capabilities, streaming: false } }); expect(result.text).toBe('OK')
  })

  it('handles UTF-8 split SSE bytes and stream errors/incomplete terminal', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'); res.write(bytes.slice(0, 12)); setTimeout(() => { res.write(bytes.slice(12)); res.end() }, 3) })
    const events = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, config(url, 'chat-completions'))) events.push(e); expect(events.some((e) => e.type === 'delta' && e.text === '你')).toBe(true); expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true })
    const bad = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.write('data: {"type":"error"}\n\n'); res.end() }); const badEvents = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, config(bad, 'responses'))) badEvents.push(e); expect(badEvents[0]?.type).toBe('error')
    const incomplete = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.write('data: {"type":"response.output_text.delta","delta":"x"}\n\n'); res.end() }); const ie = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, config(incomplete, 'responses'))) ie.push(e); expect(ie.at(-1)).toMatchObject({ type: 'error' })
  })

  it('does not leak credentials in HTTP errors and rejects HTML probe responses', async () => {
    const url = await customServer((_req, res) => { res.statusCode = 401; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'invalid key sk-supersecret123456' } })) }); const result = await new AiTransport().testConnection(config(url, 'responses')); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.message).not.toContain('sk-supersecret')
    const html = await customServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html>ok</html>') }); const probe = await new AiTransport().testConnection(config(html, 'responses')); expect(probe.ok).toBe(false)
  })

  it('times out while waiting for stream body after headers', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.flushHeaders(); setTimeout(() => res.end('data: [DONE]\n\n'), 40) })
    const c = { ...config(url, 'responses'), timeoutMs: 10 }; const events = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, c)) events.push(e); expect(events.at(-1)).toMatchObject({ type: 'error' })
  })

  it('reads Anthropic nested stop_reason and redacts arbitrary token formats', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end('data: {"type":"content_block_delta","delta":{"text":"x","stop_reason":"max_tokens"}}\n\ndata: {"type":"message_stop"}\n\n') })
    const events = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, config(url, 'anthropic-messages'))) events.push(e); expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: 'max_tokens', truncated: true })
    const bad = await customServer((_req, res) => { res.statusCode = 401; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'bad secret-token-123456789' } })) }); const result = await new AiTransport().testConnection(config(bad, 'responses')); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.message).not.toContain('secret-token-123456789')
  })

  it('cancels after response headers before the first body chunk', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.flushHeaders(); setTimeout(() => res.end('data: [DONE]\n\n'), 60) })
    const controller = new AbortController(); setTimeout(() => controller.abort(), 8); const events = []; for await (const e of new AiTransport().stream({ prompt: 'x', signal: controller.signal }, config(url, 'responses'))) events.push(e); expect(events.some((e) => e.type === 'error')).toBe(true)
  })
})
