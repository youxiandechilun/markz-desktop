import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileService } from './files'
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
describe('native files', () => {
  it('preserves UTF-8 BOM, mixed EOL, trailing spaces and unicode bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markz-file-')); directories.push(dir)
    const path = join(dir, '样本.md'), input = Buffer.from('\uFEFF# 中文😀\r\n\r\nA  \nB\r\n')
    await writeFile(path, input)
    const service = new FileService(), doc = await service.open(path)
    await service.save(doc)
    expect(await readFile(path)).toEqual(input)
  })
  it('rejects external conflicts and paths not admitted by a chooser', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markz-conflict-')); directories.push(dir)
    const path = join(dir, 'note.md'); await writeFile(path, 'old')
    const service = new FileService(), doc = await service.open(path)
    await writeFile(path, 'external')
    await expect(service.save({ ...doc, content: 'new' })).rejects.toThrow('FILE_CONFLICT')
    await expect(service.save({ filePath: join(dir, 'other'), content: 'x' })).rejects.toThrow('FILE_ACCESS')
    expect(await readFile(path, 'utf8')).toBe('external')
  })
})
