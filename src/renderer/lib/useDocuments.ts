import { useEffect, useRef, useState } from 'react'
import type { Draft, FileDocument, WorkspaceInfo } from '../../shared/desktop'
import type { ToastMessage } from '../types'
import { starterMarkdown } from './content'

interface DocumentState { content: string; saved: string; filePath?: string; fingerprint?: string; key: number; revision: number }
interface Options { enabled: boolean; autoSave: boolean; zh: boolean; notify: (message: string, tone?: ToastMessage['tone']) => void }
const initial: DocumentState = { content: '', saved: '', key: 0, revision: 0 }
const recovery = (doc: DocumentState): Draft => ({ content: doc.content, savedContent: doc.saved, filePath: doc.filePath, fingerprint: doc.fingerprint })
const errorText = (error: unknown) => String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')

export function useDocuments(options: Options) {
  const latest = useRef(options); latest.current = options
  const [document, setDocument] = useState<DocumentState>(initial)
  const current = useRef(initial)
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ rootPath: '', entries: [] })
  const [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false), [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const pendingSave = useRef<Promise<boolean> | undefined>(undefined), action = useRef(false)
  const initialization = useRef<Promise<{ workspace: WorkspaceInfo; doc: FileDocument; saved: string; recovered: boolean }> | undefined>(undefined)
  const update = (fn: (doc: DocumentState) => DocumentState) => { current.current = fn(current.current); setDocument(current.current) }
  const refresh = async () => {
    const next = await window.nexus.getWorkspace()
    setWorkspace(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    return next
  }
  const report = (error: unknown) => latest.current.notify(errorText(error), 'error')
  const install = async (doc?: FileDocument) => {
    update(previous => ({ content: doc?.content ?? '', saved: doc?.content ?? '', filePath: doc?.filePath, fingerprint: doc?.fingerprint, key: previous.key + 1, revision: previous.revision + 1 }))
    setSaveError(false)
    await window.nexus.saveDraft(recovery(current.current))
  }

  useEffect(() => {
    if (!options.enabled || !window.nexus) return
    let active = true
    initialization.current ??= (async () => {
      const restored = await window.nexus.restoreDraft()
      let info = await window.nexus.getWorkspace()
      let doc: FileDocument
      if (restored) doc = restored
      else {
        const first = info.entries.find(entry => entry.kind === 'file')
        doc = first ? await window.nexus.openWorkspaceDocument(first.path) : await window.nexus.createWorkspaceDocument(latest.current.zh ? '欢迎使用 Markz.md' : 'Welcome to Markz.md', starterMarkdown)
        info = await window.nexus.getWorkspace()
      }
      return { workspace: info, doc, saved: restored?.savedContent ?? doc.content, recovered: restored?.recovered ?? false }
    })()
    void initialization.current.then(result => {
      if (!active) return
      setWorkspace(result.workspace)
      update(previous => ({ content: result.doc.content, saved: result.saved, filePath: result.doc.filePath, fingerprint: result.doc.fingerprint, key: previous.key + 1, revision: previous.revision + 1 }))
      if (result.recovered) latest.current.notify(latest.current.zh ? '已将恢复内容保存为独立文档，原文件保持不变。' : 'Recovery text was saved as a separate document.', 'info')
      setLoaded(true)
    }).catch(error => { if (active) { report(error); setLoaded(true) } })
    return () => { active = false }
  }, [options.enabled])

  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => { void window.nexus.saveDraft(recovery(document)).catch(report) }, 500)
    return () => clearTimeout(timer)
  }, [document.content, document.saved, document.filePath, document.fingerprint, loaded])
  useEffect(() => {
    if (!loaded) return
    void window.nexus.setDirty(document.content !== document.saved).catch(report)
  }, [document.content, document.saved, loaded])
  useEffect(() => {
    if (!loaded) return
    const onFocus = () => { void refresh().catch(report) }
    window.addEventListener('focus', onFocus)
    const timer = setInterval(() => { if (globalThis.document.visibilityState === 'visible') void refresh().catch(() => undefined) }, 5000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(timer) }
  }, [loaded])

  const persist = async (saveAs = false, quiet = false): Promise<boolean> => {
    if (pendingSave.current && !await pendingSave.current) return false
    const snapshot = current.current
    if (!saveAs && snapshot.filePath && snapshot.content === snapshot.saved) return true
    setSaving(true); setSaveError(false)
    const work = (async () => {
      try {
        const result = !snapshot.filePath && !saveAs
          ? await window.nexus.createWorkspaceDocument(latest.current.zh ? '未命名.md' : 'Untitled.md', snapshot.content)
          : await window.nexus.saveMarkdown({ filePath: snapshot.filePath, content: snapshot.content, fingerprint: snapshot.fingerprint, saveAs })
        if (!result) return false
        if (current.current.key === snapshot.key) update(doc => ({ ...doc, filePath: result.filePath, fingerprint: result.fingerprint, saved: result.content }))
        await window.nexus.saveDraft(recovery(current.current))
        if (result.filePath !== snapshot.filePath) await refresh()
        if (!quiet) latest.current.notify(latest.current.zh ? '文档已保存' : 'Document saved', 'success')
        return true
      } catch (error) { setSaveError(true); report(error); return false }
    })()
    pendingSave.current = work
    try { return await work } finally { if (pendingSave.current === work) pendingSave.current = undefined; setSaving(false) }
  }
  useEffect(() => { setSaveError(false) }, [options.autoSave])
  useEffect(() => {
    if (!loaded || !options.autoSave || busy || saving || saveError || document.content === document.saved) return
    const timer = setTimeout(() => { void persist(false, true) }, 900)
    return () => clearTimeout(timer)
  }, [loaded, options.autoSave, document.content, document.saved, document.filePath, busy, saving, saveError])

  const canSwitch = async () => {
    if (pendingSave.current && !await pendingSave.current) return false
    if (current.current.content === current.current.saved) return true
    const choice = latest.current.autoSave ? 'save' : await window.nexus.confirmDocumentSwitch()
    if (choice === 'cancel') return false
    if (choice === 'discard') return true
    while (current.current.content !== current.current.saved) if (!await persist(false, true)) return false
    return true
  }
  const operate = async (work: () => Promise<boolean>) => {
    if (action.current || !loaded) return false
    action.current = true; setBusy(true)
    try { return await work() } catch (error) { report(error); return false }
    finally { action.current = false; setBusy(false) }
  }
  return {
    ...document, workspace, loaded, saving, busy, saveError,
    dirty: document.content !== document.saved,
    change: (content: string) => update(doc => ({ ...doc, content, revision: doc.revision + 1 })),
    refresh: () => void refresh().catch(report),
    showFolder: () => void window.nexus.showWorkspaceFolder().catch(report),
    save: (saveAs = false) => action.current ? Promise.resolve(false) : persist(saveAs),
    create: () => operate(async () => {
      if (!await canSwitch()) return false
      await install(await window.nexus.createWorkspaceDocument(latest.current.zh ? '未命名.md' : 'Untitled.md'))
      await refresh(); return true
    }),
    open: (filePath?: string) => operate(async () => {
      if (filePath === current.current.filePath && filePath) return true
      if (!await canSwitch()) return false
      const doc = filePath ? await window.nexus.openWorkspaceDocument(filePath) : await window.nexus.openMarkdown()
      if (!doc) return false
      await install(doc); await refresh(); return true
    }),
    rename: (filePath: string, name: string) => operate(async () => {
      if (pendingSave.current && !await pendingSave.current) return false
      const nextPath = await window.nexus.renameWorkspaceDocument(filePath, name)
      if (current.current.filePath === filePath) {
        update(doc => ({ ...doc, filePath: nextPath }))
        await window.nexus.saveDraft(recovery(current.current))
      }
      await refresh(); return true
    }),
    remove: (filePath: string) => operate(async () => {
      if (pendingSave.current) await pendingSave.current
      await window.nexus.deleteWorkspaceDocument(filePath)
      const next = await refresh()
      if (current.current.filePath === filePath) {
        const first = next.entries.find(entry => entry.kind === 'file')
        let doc: FileDocument | undefined
        try { if (first) doc = await window.nexus.openWorkspaceDocument(first.path) } catch (error) { report(error) }
        await install(doc)
      }
      return true
    }),
    close: async () => { if (pendingSave.current) await pendingSave.current; await window.nexus.closeAfterRecovery(recovery(current.current)) },
  }
}
