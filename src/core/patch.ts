import type { SourcePosition, MarkdownCompilation } from './types'

export interface TextPatch {
  from: number
  to: number
  replacement: string
  expectedText?: string
  expectedHash?: string
  expectedRevision?: number
}

export type PatchFailureCode = 'INVALID_RANGE' | 'STALE_REVISION' | 'STALE_HASH' | 'TEXT_MISMATCH' | 'OVERLAPPING_PATCHES'

export interface PatchResult {
  ok: boolean
  source: string
  revision: number
  hash: string
  error?: { code: PatchFailureCode; message: string }
}

function hashSource(source: string): string {
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function applyPatch(source: string, patch: TextPatch, revision = 0): PatchResult {
  if (!Number.isInteger(patch.from) || !Number.isInteger(patch.to) || patch.from < 0 || patch.to < patch.from || patch.to > source.length || splitsPair(source, patch.from) || splitsPair(source, patch.to)) {
    return { ok: false, source, revision, hash: hashSource(source), error: { code: 'INVALID_RANGE', message: 'Patch range is outside the source document.' } }
  }
  if (patch.expectedRevision !== undefined && patch.expectedRevision !== revision) {
    return { ok: false, source, revision, hash: hashSource(source), error: { code: 'STALE_REVISION', message: 'Document changed since this patch was created.' } }
  }
  const currentSlice = source.slice(patch.from, patch.to)
  if (patch.expectedHash !== undefined && hashSource(currentSlice) !== patch.expectedHash) {
    return { ok: false, source, revision, hash: hashSource(source), error: { code: 'STALE_HASH', message: 'Selected source no longer matches the generated patch.' } }
  }
  if (patch.expectedText !== undefined && currentSlice !== patch.expectedText) {
    return { ok: false, source, revision, hash: hashSource(source), error: { code: 'TEXT_MISMATCH', message: 'Selected source no longer matches the generated patch.' } }
  }
  const nextSource = source.slice(0, patch.from) + patch.replacement + source.slice(patch.to)
  return { ok: true, source: nextSource, revision: revision + 1, hash: hashSource(nextSource) }
}

function splitsPair(source: string, offset: number): boolean {
  const before = source.charCodeAt(offset - 1), after = source.charCodeAt(offset)
  return (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) || (before === 13 && after === 10)
}
export function applyPatches(source: string, patches: TextPatch[], revision = 0): PatchResult {
  const ordered = [...patches].sort((a, b) => a.from - b.from)
  for (let index = 0; index < ordered.length; index++) {
    const patch = ordered[index], previous = ordered[index - 1]
    if (previous && (patch.from < previous.to || patch.from === previous.from)) return { ok: false, source, revision, hash: hashSource(source), error: { code: 'OVERLAPPING_PATCHES', message: 'Overlapping changes are not allowed.' } }
    const validation = applyPatch(source, patch, revision)
    if (!validation.ok) return validation
  }
  let result = source
  for (const patch of ordered.reverse()) result = result.slice(0, patch.from) + patch.replacement + result.slice(patch.to)
  return { ok: true, source: result, revision: revision + (patches.length ? 1 : 0), hash: hashSource(result) }
}

export function patchForNode(compilation: MarkdownCompilation, nodeId: string, replacement: string): TextPatch | undefined {
  const node = compilation.index.byId[nodeId]
  const position: SourcePosition | undefined = node?.position
  if (!position) return undefined
  const from = position.start.offset
  const to = position.end.offset
  const expectedText = compilation.source.slice(from, to)
  return { from, to, replacement, expectedText, expectedHash: hashSource(expectedText), expectedRevision: compilation.revision }
}

export function sourceHash(source: string): string {
  return hashSource(source)
}
