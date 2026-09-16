import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiTransport } from '../../src/ai/transport'
import { endpointFor, validateConfig } from '../../src/ai/config'
import { modelListEndpoint } from '../../src/ai/endpoints'
import { aiSettingsError } from '../../src/renderer/lib/ai-settings-error'

afterEach(() => vi.restoreAllMocks())
const config = (baseUrl: string) => validateConfig({ id: 'fixture', name: 'fixture', baseUrl, protocol: 'anthropic-messages', apiKey: 'test-only-key', defaultModel: 'fixture-model', capabilities: {} })

describe('provider endpoint contracts', () => {
  it.each(['https://api.deepseek.com/anthropic', 'https://api.deepseek.com/anthropic/', 'https://api.deepseek.com/anthropic/v1', 'https://api.deepseek.com/anthropic/v1/messages'])('separates DeepSeek discovery and generation for %s', async baseUrl => {
    const provider = config(baseUrl)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'fixture-model' }] })))
    const models = await new AiTransport().listModels(provider)
    expect(models).toMatchObject([{ id: 'fixture-model' }])
    // The documented discovery path is unchanged; fallbacks only run when it is missing.
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/models')
    const discoveryHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(discoveryHeaders.get('authorization')).toBe('Bearer test-only-key')
    expect(discoveryHeaders.has('x-api-key')).toBe(false)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] })))
    expect(await new AiTransport().testConnection(provider)).toMatchObject({ ok: true })
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.deepseek.com/anthropic/v1/messages')
    const messageHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers)
    expect(messageHeaders.get('x-api-key')).toBe('test-only-key')
    expect(messageHeaders.get('anthropic-version')).toBe('2023-06-01')
  })

  it('falls through to the next same-origin discovery path when one is missing', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] })))
    expect(await new AiTransport().listModels(config('https://api.deepseek.com'))).toMatchObject([{ id: 'deepseek-flash' }])
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://api.deepseek.com/models', 'https://api.deepseek.com/v1/models'])
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('authorization')).toBe('Bearer test-only-key')
  })

  it('reports every attempted discovery path when none of them exist', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 404 }))
    await expect(new AiTransport().listModels(config('https://api.deepseek.com'))).rejects.toMatchObject({ code: 'MODEL_LIST_UNAVAILABLE', status: 404 })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('keeps native Anthropic v1 and custom gateway prefixes without moving credentials', () => {
    expect(modelListEndpoint(config('https://api.anthropic.com')).url).toBe('https://api.anthropic.com/v1/models')
    expect(endpointFor(config('https://api.anthropic.com/v1'), 'messages')).toBe('https://api.anthropic.com/v1/messages')
    expect(modelListEndpoint(config('https://gateway.example/proxy/v1')).url).toBe('https://gateway.example/proxy/v1/models')
    expect(modelListEndpoint(config('https://api.deepseek.com.evil.example/anthropic'))).toEqual({ url: 'https://api.deepseek.com.evil.example/anthropic/v1/models', authentication: 'anthropic' })
  })

  it.each([404, 405])('reports unsupported discovery (%s), while allowing manual model connection tests', async status => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('private provider body', { status }))
    const transport = new AiTransport(), provider = config('https://gateway.example/v1')
    await expect(transport.listModels(provider)).rejects.toMatchObject({ code: 'MODEL_LIST_UNAVAILABLE', status })
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] })))
    expect(await transport.testConnection(provider)).toMatchObject({ ok: true })
  })

  it('distinguishes an empty model list from an invalid response', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
    expect(await new AiTransport().listModels(config('https://gateway.example/v1'))).toEqual([])
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'not models' })))
    await expect(new AiTransport().listModels(config('https://gateway.example/v1'))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('presents a bilingual recovery message without the Electron invoke prefix', () => {
    const error = new Error("Error invoking remote method 'ai:models': Error: MODEL_LIST_UNAVAILABLE: service body")
    expect(aiSettingsError(error, 'zh-CN')).toContain('手动填写模型 ID')
    expect(aiSettingsError(error, 'en')).toContain('Enter a model ID manually')
    expect(aiSettingsError(error, 'zh-CN')).not.toContain('remote method')
    expect(aiSettingsError(error, 'en')).not.toContain('service body')
  })
})
