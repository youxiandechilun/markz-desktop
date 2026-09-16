export * from './types'
export * from './config'
export * from './transport'

import { AiTransport } from './transport'
import type { AiProviderConfig, AiRequestContext } from './types'

/** Convenience factory used by Electron main and integrations. */
export function createAiClient(): AiTransport { return new AiTransport() }
/** Shared client for Electron main IPC. It has no mutable state. */
export const AiClient = new AiTransport()

/** Collect a stream into a proposal while retaining truncation metadata. */
export async function collectProposal(client: AiTransport, request: AiRequestContext, config: AiProviderConfig, onDelta?: (text: string) => void): Promise<{ text: string; finishReason?: string; truncated: boolean }> {
  let text = ''; let finishReason: string | undefined; let truncated = false
  for await (const event of client.stream(request, config)) {
    if (event.type === 'delta') { text += event.text; onDelta?.(event.text) }
    // Reasoning is progress, not document content, so it never enters the proposal.
    else if (event.type === 'reasoning') continue
    else if (event.type === 'done') { finishReason = event.finishReason; truncated = event.truncated }
    else throw event.error
  }
  return { text, finishReason, truncated }
}
