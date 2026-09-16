import type { AiProviderConfig } from './types'

type EndpointConfig = Pick<AiProviderConfig, 'baseUrl' | 'protocol'>
export interface ModelListEndpoint { url: string; authentication: 'bearer' | 'anthropic' }

function deepSeekAnthropic(config: EndpointConfig): boolean {
  const url = new URL(config.baseUrl)
  return config.protocol === 'anthropic-messages' && url.hostname === 'api.deepseek.com' && /^\/anthropic(?:\/v1)?$/.test(url.pathname)
}

function protocolBase(config: EndpointConfig): string {
  const base = config.baseUrl.replace(/\/$/, '')
  const url = new URL(base)
  if (config.protocol === 'anthropic-messages' && (!url.pathname || url.pathname === '/' || /\/anthropic$/.test(url.pathname))) return `${base}/v1`
  return base
}

/** Keep model discovery separate from generation: some compatible providers expose only messages under their Anthropic prefix. */
export function modelListEndpoint(config: EndpointConfig): ModelListEndpoint {
  if (deepSeekAnthropic(config)) {
    // Exact host match and same origin: credentials never move to another provider.
    return { url: `${new URL(config.baseUrl).origin}/models`, authentication: 'bearer' }
  }
  return { url: `${protocolBase(config)}/models`, authentication: config.protocol === 'anthropic-messages' ? 'anthropic' : 'bearer' }
}

export function generationEndpoint(config: EndpointConfig, suffix: string): string {
  return `${protocolBase(config)}/${suffix}`
}
