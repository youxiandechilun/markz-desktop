import type { SourcePoint, SourcePosition } from './types'
function lineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 13) { if (source.charCodeAt(index + 1) === 10) index++; starts.push(index + 1) }
    else if (source.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}
export function offsetToPoint(source: string, offset: number): SourcePoint {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) throw new RangeError('POSITION_OUT_OF_RANGE')
  const starts = lineStarts(source)
  let low = 0, high = starts.length - 1
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (starts[middle] <= offset) low = middle; else high = middle - 1 }
  return { offset, line: low + 1, column: offset - starts[low] + 1 }
}
export function pointToOffset(source: string, line: number, column: number): number {
  const starts = lineStarts(source)
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || line > starts.length || column < 1) throw new RangeError('POSITION_OUT_OF_RANGE')
  const start = starts[line - 1]
  let end = line < starts.length ? starts[line] : source.length
  if (line < starts.length) { if (source[end - 1] === '\n') end--; if (source[end - 1] === '\r') end-- }
  if (column - 1 > end - start) throw new RangeError('POSITION_OUT_OF_RANGE')
  return start + column - 1
}
export function rangeToPosition(source: string, from: number, to: number): SourcePosition {
  if (to < from) throw new RangeError('POSITION_OUT_OF_RANGE')
  return { start: offsetToPoint(source, from), end: offsetToPoint(source, to) }
}
