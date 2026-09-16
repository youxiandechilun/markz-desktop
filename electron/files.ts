import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink, stat, mkdir, readdir, realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
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

const isMissing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT'
function documentName(name: string): string {
  const value = name.trim()
  if (!value || /[\\/:*?"<>|\u0000-\u001f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new Error('FILE_NAME_INVALID: 请输入有效的文件名 / Enter a valid file name')
  const result = /\.(md|markdown)$/i.test(value) ? value : `${value}.md`
  if (result.length > 200) throw new Error('FILE_NAME_INVALID: 文件名过长 / File name is too long')
  return result
}

/** Workspace files and paths returned by a native chooser are admitted by the host. */
export class FileService {
  readonly workspaceRoot: string
  private readonly authorized = new Map<string, { fingerprint: string; bom: boolean }>()
  constructor(documentsRoot = join(homedir(), 'Documents')) { this.workspaceRoot = join(documentsRoot, 'Markz') }
  private workspacePath(filePath: string): string {
    const full = resolve(filePath)
    const root = resolve(this.workspaceRoot)
    const local = relative(root, full)
    if (!local || local === '..' || local.startsWith(`..\\`) || local.startsWith('../') || isAbsolute(local)) throw new Error('FILE_ACCESS: 只能操作 Markz 文档目录 / Only Markz workspace files are allowed')
    return full
  }
  private async workspaceFile(filePath: string): Promise<string> {
    const path = this.workspacePath(filePath)
    this.workspacePath(await realpath(path))
    if (!(await stat(path)).isFile() || !/\.(md|markdown)$/i.test(path)) throw new Error('FILE_ACCESS: 请选择 Markdown 文档 / Choose a Markdown document')
    return path
  }
  async openWorkspace(filePath: string): Promise<FileDocument> { return this.open(await this.workspaceFile(filePath)) }
  async ensureWorkspace(): Promise<void> { await mkdir(this.workspaceRoot, { recursive: true }) }
  async listWorkspace(): Promise<WorkspaceEntry[]> {
    await this.ensureWorkspace()
    const walk = async (directory: string): Promise<WorkspaceEntry[]> => {
      const entries = await readdir(directory, { withFileTypes: true }); const result: WorkspaceEntry[] = []
      for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))) {
        if (entry.name.startsWith('.')) continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) result.push({ name: entry.name, path, kind: 'directory' }, ...(await walk(path)))
        else if (/\.(md|markdown)$/i.test(entry.name)) result.push({ name: entry.name, path, kind: 'file' })
      }
      return result
    }
    return walk(this.workspaceRoot)
  }
  async createWorkspaceDocument(name = '未命名.md', content = ''): Promise<FileDocument> {
    await this.ensureWorkspace()
    const safe = documentName(name), text = requireText(content)
    let path = join(this.workspaceRoot, safe), index = 2
    while (true) {
      try { await writeFile(path, text, { flag: 'wx' }); break }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
        path = join(this.workspaceRoot, `${safe.replace(/\.(md|markdown)$/i, '')}-${index++}.md`)
      }
    }
    return this.open(path)
  }
  async renameWorkspace(filePath: string, name: string): Promise<string> {
    const source = await this.workspaceFile(filePath)
    const safe = documentName(name)
    const target = this.workspacePath(join(dirname(source), safe))
    if (target === source) return source
    if (!(process.platform === 'win32' && target.toLowerCase() === source.toLowerCase())) {
      try { await stat(target); throw new Error('FILE_EXISTS: 目标文档已存在 / Target document already exists') }
      catch (error) { if (!isMissing(error)) throw error }
    }
    await rename(source, target)
    const record = this.authorized.get(source)
    this.authorized.delete(source)
    if (record) this.authorized.set(target, record)
    return target
  }
  async deleteWorkspace(filePath: string, remove: (path: string) => Promise<void> = unlink): Promise<void> {
    const target = await this.workspaceFile(filePath)
    await remove(target)
    this.authorized.delete(target)
  }
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
