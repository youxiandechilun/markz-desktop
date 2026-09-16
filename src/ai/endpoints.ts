import type { AiProviderConfig } from './types'

type EndpointConfig = Pick<AiProviderConfig, 'baseUrl' | 'protocol'>
export interface ModelListEndpoint { url: string; authentication: 'bearer' | 'anthropic' }

function hostOf(config: EndpointConfig): string {
  try { return new URL(config.baseUrl).hostname } catch { return '' }
}
function deepSeekHost(config: EndpointConfig): boolean { return hostOf(config) === 'api.deepseek.com' }

function protocolBase(config: EndpointConfig): string {
  const base = config.baseUrl.replace(/\/$/, '')
  const url = new URL(base)
  if (config.protocol === 'anthropic-messages' && (!url.pathname || url.pathname === '/' || /\/anthropic$/.test(url.pathname))) return `${base}/v1`
  return base
}

/**
 * Keep model discovery separate from generation: some compatible providers expose only
 * messages under their Anthropic prefix. Compatible services also disagree on where the
 * list lives, so several same-origin candidates are tried in order of likelihood.
 */
export function modelListEndpoints(config: EndpointConfig): ModelListEndpoint[] {
  const base = protocolBase(config)
  const url = new URL(base)
  const anthropic = config.protocol === 'anthropic-messages'
  const candidates: ModelListEndpoint[] = []
  const add = (candidateUrl: string, authentication: ModelListEndpoint['authentication']): void => {
    // Exact origin match: credentials never move to another provider.
    if (!candidates.some(item => item.url === candidateUrl)) candidates.push({ url: candidateUrl, authentication })
  }
  if (deepSeekHost(config)) {
    // The documented path stays first; the versioned and Anthropic-prefixed paths are
    // same-origin fallbacks for API generations that move the list.
    add(`${url.origin}/models`, 'bearer')
    add(`${url.origin}/v1/models`, 'bearer')
    if (anthropic) add(`${url.origin}/anthropic/v1/models`, 'anthropic')
    return candidates
  }
  add(`${base}/models`, anthropic ? 'anthropic' : 'bearer')
  // A base URL without any version segment often still serves the OpenAI-style list.
  if (!/\bv\d/.test(url.pathname)) add(`${url.origin}/v1/models`, anthropic ? 'anthropic' : 'bearer')
  return candidates
}

/** Primary discovery endpoint, kept for callers that only need one address. */
export function modelListEndpoint(config: EndpointConfig): ModelListEndpoint {
  return modelListEndpoints(config)[0] ?? { url: `${protocolBase(config)}/models`, authentication: config.protocol === 'anthropic-messages' ? 'anthropic' : 'bearer' }
}

export function generationEndpoint(config: EndpointConfig, suffix: string): string {
  return `${protocolBase(config)}/${suffix}`
}
