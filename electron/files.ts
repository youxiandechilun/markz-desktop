import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink, stat, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { FileDocument, SaveRequest, WorkspaceEntry } from '../src/shared/desktop'

const MAX_BYTES = 32 * 1024 * 1024
export const fingerprint = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
export function requireText(value: unknown, max = MAX_BYTES): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > max) throw new Error('INPUT_INVALID: 文本无效或超过 32 MiB / Invalid or oversized text')
  return value
}
export function parseSave(value: unknown): SaveRequest {
  if (!value || typeof value !== 'object' || !('content' in value)) throw new Error('INPUT_INVALID')
  const content = requireText(value.content)
  const filePath = 'filePath' in value && value.filePath !== undefined ? requireText(value.filePath, 32768) : undefined
  const hash = 'fingerprint' in value && value.fingerprint !== undefined ? requireText(value.fingerprint, 128) : undefined
  return { content, filePath, fingerprint: hash, saveAs: 'saveAs' in value && value.saveAs === true }
}

/** Only paths returned by a native chooser are admitted by the host. */
export class FileService {
  readonly workspaceRoot: string
  private readonly authorized = new Map<string, { fingerprint: string; bom: boolean }>()
  constructor(documentsRoot: string) { this.workspaceRoot = join(documentsRoot, 'Markz') }
  private workspacePath(filePath: string): string {
    const full = resolve(filePath)
    const root = resolve(this.workspaceRoot)
    if (full !== root && !full.startsWith(`${root}${sep}`)) throw new Error('FILE_ACCESS: 只能操作 Markz 文档目录 / Only Markz workspace files are allowed')
    return full
  }
  async ensureWorkspace(): Promise<void> { await mkdir(this.workspaceRoot, { recursive: true }) }
  async listWorkspace(): Promise<WorkspaceEntry[]> {
    await this.ensureWorkspace()
    const walk = async (directory: string): Promise<WorkspaceEntry[]> => {
      const entries = await readdir(directory, { withFileTypes: true }); const result: WorkspaceEntry[] = []
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
        if (entry.name.startsWith('.')) continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) result.push({ name: entry.name, path, kind: 'directory' }, ...(await walk(path)))
        else if (/\.(md|markdown)$/i.test(entry.name)) result.push({ name: entry.name, path, kind: 'file' })
      }
      return result
    }
    return walk(this.workspaceRoot)
  }
  async createWorkspaceDocument(name = '未命名.md'): Promise<FileDocument> {
    await this.ensureWorkspace(); let safe = name.trim() || '未命名.md'; if (!/\.(md|markdown)$/i.test(safe)) safe += '.md'
    safe = safe.replace(/[\\/:*?"<>|]/g, '-'); let path = join(this.workspaceRoot, safe); let index = 2
    while (true) { try { await stat(path); path = join(this.workspaceRoot, `${safe.replace(/\.(md|markdown)$/i, '')}-${index++}.md`) } catch { break } }
    this.authorizeNew(path); await this.save({ filePath: path, content: '', fingerprint: '' }); return { filePath: path, content: '', fingerprint: fingerprint(Buffer.from('', 'utf8')) }
  }
  async renameWorkspace(filePath: string, name: string): Promise<string> { const source = this.workspacePath(filePath); let safe = name.trim().replace(/[\\/:*?"<>|]/g, '-'); if (!/\.(md|markdown)$/i.test(safe)) safe += '.md'; const target = this.workspacePath(join(dirname(source), safe)); await rename(source, target); this.authorized.delete(source); return target }
  async deleteWorkspace(filePath: string): Promise<void> { const target = this.workspacePath(filePath); await unlink(target); this.authorized.delete(target) }
  async open(filePath: string): Promise<FileDocument> {
    if ((await stat(filePath)).size > MAX_BYTES) throw new Error('FILE_TOO_LARGE: 文件超过 32 MiB / File exceeds 32 MiB')
    const bytes = await readFile(filePath)
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes)
    const hash = fingerprint(bytes)
    this.authorized.set(filePath, { fingerprint: hash, bom })
    return { filePath, content, fingerprint: hash }
  }
  authorizeNew(filePath: string): void { this.authorized.set(filePath, { fingerprint: '', bom: false }) }
  async save(request: SaveRequest & { filePath: string }): Promise<FileDocument> {
    const record = this.authorized.get(request.filePath)
    if (!record) throw new Error('FILE_ACCESS: 请通过文件对话框选择文档 / Choose the file in the open dialog')
    if (record.fingerprint) {
      let actual: string
      try { actual = fingerprint(await readFile(request.filePath)) } catch { throw new Error('FILE_CONFLICT: 文件已被删除或移动，请另存为 / File moved or deleted; use Save As') }
      if (actual !== record.fingerprint || request.fingerprint !== record.fingerprint) throw new Error('FILE_CONFLICT: 文件已在外部修改，请重新打开或另存为 / File changed externally; reopen or Save As')
    }
    const bytes = Buffer.from(`${record.bom ? '\uFEFF' : ''}${requireText(request.content)}`, 'utf8')
    await atomicWrite(request.filePath, bytes)
    const hash = fingerprint(bytes)
    this.authorized.set(request.filePath, { ...record, fingerprint: hash })
    return { filePath: request.filePath, content: request.content, fingerprint: hash }
  }
}

export async function atomicWrite(filePath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = join(dirname(filePath), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { flag: 'wx' })
    await rename(temporary, filePath)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
