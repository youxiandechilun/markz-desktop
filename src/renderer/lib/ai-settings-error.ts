import type { Locale } from '../types'

const messages = {
  MODEL_LIST_UNAVAILABLE: ['服务未提供可用的模型列表接口。可以手动填写模型 ID，再点击“测试连接”。', 'The model list endpoint is unavailable. Enter a model ID manually, then test the connection.'],
  MODEL_REQUIRED: ['请先填写模型 ID，再测试连接。', 'Enter a model ID before testing the connection.'],
  AUTH_FAILED: ['鉴权失败，请检查 API Key 及其权限。', 'Authentication failed. Check your API key and its permissions.'],
  RATE_LIMITED: ['服务限流或额度不足，请稍后重试或检查账户余额。', 'The service is rate limited or out of quota. Retry later or check your balance.'],
  TIMEOUT: ['请求超时，请检查服务地址和网络后重试。', 'The request timed out. Check the service address and connection, then retry.'],
  INVALID_RESPONSE: ['服务返回的数据不符合所选协议，请检查服务地址和协议。', 'The response does not match the selected protocol. Check the service URL and protocol.'],
  INCOMPLETE_STREAM: ['响应流在中途结束，可能是网络中断或服务提前断开。请重试。', 'The response stream ended early. Retry, or check the connection.'],
  AI_STREAM_ERROR: ['模型服务在生成过程中返回了错误。请重试。', 'The model service reported an error while generating. Retry.'],
  KEY_STORAGE_UNAVAILABLE: ['系统凭据加密不可用，无法安全保存 Key。', 'System credential encryption is unavailable, so the key cannot be stored safely.'],
  PROVIDER_REQUIRED: ['请先配置 AI 服务。', 'Configure an AI service first.'],
} as const

export function aiSettingsError(error: unknown, locale: Locale): string {
  const message = error instanceof Error ? error.message : String(error)
  const zh = locale === 'zh-CN'
  for (const [code, translated] of Object.entries(messages)) {
    if (message.includes(`${code}:`)) return `${code} · ${translated[zh ? 0 : 1]}`
  }
  if (/HTTP 404/.test(message)) return zh ? 'HTTP 404 · 请求地址不存在，请检查服务地址与所选协议。' : 'HTTP 404 · The endpoint was not found. Check the URL and protocol.'
  // Electron invoke prefixes expose plumbing and make errors hard to read.
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:\w*Error:\s*)?/, '')
}
