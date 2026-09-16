import { describe, expect, it } from 'vitest'
import { normalizeCapabilities, selectProviderModel, validateConfig } from '../../src/ai/config'

const provider = { id: 'modalities-test', name: 'Test provider', baseUrl: 'https://example.com/v1', protocol: 'chat-completions', defaultModel: 'text-model' }

describe('model modalities', () => {
  it('migrates legacy provider and model settings without discarding transport options or budgets', () => {
    const legacy = { streaming: false, tools: true, structuredOutput: true, reasoning: true, reasoningEffort: 'high', contextWindow: 64_000, maxOutputTokens: 8_192 }
    const config = validateConfig({ ...provider, capabilities: legacy, modelCapabilities: { 'text-model': legacy } })
    expect(config.capabilities).toEqual({ ...legacy, text: true, image: false })
    expect(config.modelCapabilities?.['text-model']).toEqual(config.capabilities)
  })

  it('always enables text and only enables images for an explicit boolean true', () => {
    expect(normalizeCapabilities({ text: false, image: true })).toMatchObject({ text: true, image: true })
    for (const image of [undefined, null, false, 'true', 1]) {
      expect(normalizeCapabilities({ text: false, image })).toMatchObject({ text: true, image: false })
    }
    expect(normalizeCapabilities(undefined)).toMatchObject({ text: true, image: false, streaming: true })
  })

  it('keeps image support and token budgets independent across model changes and save/load', () => {
    const vision = validateConfig({ ...provider, defaultModel: 'vision-model', capabilities: { image: true, contextWindow: 128_000, maxOutputTokens: 16_384 } })
    const text = selectProviderModel(vision, 'text-model')
    expect(text.capabilities).toMatchObject({ text: true, image: false, contextWindow: 32_000, maxOutputTokens: 4_096 })
    expect(text.modelCapabilities?.['vision-model']).toMatchObject({ image: true, contextWindow: 128_000 })

    const backToVision = selectProviderModel(text, 'vision-model')
    expect(backToVision.capabilities).toEqual(vision.capabilities)
    const reloaded = validateConfig(JSON.parse(JSON.stringify(backToVision)))
    expect(selectProviderModel(reloaded, 'text-model').capabilities.image).toBe(false)
    expect(selectProviderModel(selectProviderModel(reloaded, 'text-model'), 'vision-model').capabilities.image).toBe(true)
    expect(vision.modelCapabilities).toBeUndefined()
  })

  it('migrates all saved model entries and does not create a blank model entry', () => {
    const config = validateConfig({ ...provider, defaultModel: '', capabilities: {}, modelCapabilities: { legacy: { text: false }, vision: { text: false, image: true } } })
    expect(config.modelCapabilities?.legacy).toMatchObject({ text: true, image: false })
    expect(config.modelCapabilities?.vision).toMatchObject({ text: true, image: true })
    const selected = selectProviderModel(config, 'vision')
    expect(selected.capabilities.image).toBe(true)
    expect(Object.keys(selected.modelCapabilities ?? {})).not.toContain('')
  })

  it('replaces a legacy model override when the configured model changes', () => {
    const legacy = validateConfig({ ...provider, defaultModel: undefined, model: 'old-model', capabilities: { image: true } })
    const selected = selectProviderModel(legacy, 'new-model')
    expect(selected.model).toBeUndefined()
    expect(selected.defaultModel).toBe('new-model')
    expect(selected.capabilities.image).toBe(false)
    expect(selected.modelCapabilities?.['old-model'].image).toBe(true)
  })
})
