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

  it('probes with a usable token budget and without reasoning effort', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const url = await customServer(async (req, res) => { let body = ''; for await (const chunk of req) body += String(chunk); bodies.push(JSON.parse(body) as Record<string, unknown>); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })) })
    const base = config(url, 'chat-completions')
    const result = await new AiTransport().testConnection({ ...base, capabilities: { ...base.capabilities, reasoning: true, reasoningEffort: 'high' } })
    expect(result.ok).toBe(true); expect(bodies).toHaveLength(1)
    expect(bodies[0]?.stream).toBe(false); expect(bodies[0]?.max_tokens).toBeGreaterThanOrEqual(256); expect(bodies[0]).not.toHaveProperty('reasoning_effort')
  })

  it('accepts a service that answers only on a stream', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const url = await customServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += String(chunk)
      const payload = JSON.parse(body) as Record<string, unknown>; bodies.push(payload)
      if (payload.stream === true) { res.setHeader('content-type', 'text/event-stream'); res.end('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); return }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: '' } }] }))
    })
    expect((await new AiTransport().testConnection(config(url, 'chat-completions'))).ok).toBe(true)
    expect(bodies.map((body) => body.stream)).toEqual([false, true])
  })

  it('does not retry a probe that already failed on credentials', async () => {
    let calls = 0
    const url = await customServer((_req, res) => { calls++; res.statusCode = 401; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'bad key' } })) })
    const result = await new AiTransport().testConnection(config(url, 'chat-completions'))
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('AUTH_FAILED'); expect(calls).toBe(1)
  })

  it('surfaces rate limiting as its own code', async () => {
    const url = await customServer((_req, res) => { res.statusCode = 429; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'too many requests' } })) })
    const result = await new AiTransport().testConnection(config(url, 'chat-completions'))
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED')
  })

  it('returns an empty proposal instead of an error when a model streams only reasoning', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n') })
    const result = await collectProposal(new AiTransport(), { prompt: 'x' }, config(url, 'chat-completions'))
    expect(result.text).toBe(''); expect(result.truncated).toBe(false)
  })

  it('reports reasoning from every protocol as progress, never as proposal text', async () => {
    const bodies: Record<AiProtocol, string> = {
      'chat-completions': 'data: {"choices":[{"delta":{"reasoning_content":"think "}}]}\n\ndata: {"choices":[{"delta":{"reasoning":"more"}}]}\n\ndata: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      responses: 'data: {"type":"response.reasoning_summary_text.delta","delta":"think "}\n\ndata: {"type":"response.output_text.delta","delta":"answer"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
      'anthropic-messages': 'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"think "}}\n\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}\n\ndata: {"type":"message_stop"}\n\n',
    }
    for (const protocol of ['chat-completions', 'responses', 'anthropic-messages'] as const) {
      const url = await customServer((_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end(bodies[protocol]) })
      const events = []; for await (const e of new AiTransport().stream({ prompt: 'x' }, config(url, protocol))) events.push(e)
      const texts = (type: 'delta' | 'reasoning') => events.flatMap((e) => e.type === type ? [e.text] : [])
      expect(texts('reasoning')).toEqual(protocol === 'chat-completions' ? ['think ', 'more'] : ['think '])
      expect(texts('delta')).toEqual(['answer'])
      expect(await collectProposal(new AiTransport(), { prompt: 'x' }, config(url, protocol))).toMatchObject({ text: 'answer', truncated: false })
    }
  })

  it('delivers deltas while the response is still open instead of buffering the body', async () => {
    let bodyEnded = false
    const url = await customServer((_req, res) => {
      res.setHeader('content-type', 'text/event-stream'); res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')
      setTimeout(() => { bodyEnded = true; res.end('data: {"choices":[{"delta":{"content":"second"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n') }, 60)
    })
    const deltas: Array<{ text: string; bodyEnded: boolean }> = []
    for await (const event of new AiTransport().stream({ prompt: 'x' }, config(url, 'chat-completions'))) if (event.type === 'delta') deltas.push({ text: event.text, bodyEnded })
    expect(deltas).toEqual([{ text: 'first', bodyEnded: false }, { text: 'second', bodyEnded: true }])
  })

  it('reads the context budget under the field names compatible providers use', async () => {
    const url = await customServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'a', context_length: 131072 }, { id: 'b', max_model_len: 8192 }, { id: 'c', context_window: 64000 }, { id: 'd' }] })) })
    const models = await new AiTransport().listModels(config(url, 'chat-completions'))
    expect(models.map((model) => model.contextWindow)).toEqual([131072, 8192, 64000, undefined])
  })
})
