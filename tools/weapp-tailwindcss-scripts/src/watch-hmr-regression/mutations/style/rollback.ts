import type { CliOptions, WatchCase, WatchSession } from '../../types'
import process from 'node:process'
import { formatPath } from '../../cli'
import { expandOutputFileEntries } from '../../outputs/file-entries'
import { getOutputMtimeOnce, readOutputFileOnce } from '../../outputs/read'
import { waitFor } from '../../text'
import { getLatestCompileSignalAt, resolveCompileStableWindowMs, waitForCompileSettled } from '../shared'

export async function captureStyleRollbackCandidates(candidates: string[], session: WatchSession) {
  const required: string[] = []
  const ensureActive = () => {
    session.signal?.throwIfAborted()
    session.ensureRunning()
  }
  for (const candidate of candidates) {
    const entries = await expandOutputFileEntries([candidate], { presenceOnly: true, ensureActive })
    if (entries.length > 0) {
      // 保留消费表达式，允许 content-hash glob 在下一次编译中更换文件名。
      required.push(candidate)
    }
  }
  return required
}

export async function waitForStyleRollback(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  startedAt: number,
  candidates: string[],
  requiredCandidates: string[],
  needles: string[],
) {
  const rollbackDeadlineAt = startedAt + options.timeoutMs
  await waitForCompileSettled(watchCase, options, session, startedAt, candidates, rollbackDeadlineAt)

  // 编译稳定后再开始原 30 秒语义窗口；窗口与本轮截止取较早值，后续扫描不续借预算。
  const markerTimeoutMs = Math.min(options.timeoutMs, 30_000)
  const markerDeadlineAt = Math.min(rollbackDeadlineAt, Date.now() + markerTimeoutMs)
  const message = `[${watchCase.label}] style output candidates still contain rollback needles ${needles.join(', ')} or are missing/unreadable: ${candidates.map(formatPath).join(', ')}`
  const ensureActive = () => {
    session.signal?.throwIfAborted()
    session.ensureRunning()
    if (Date.now() > markerDeadlineAt) {
      throw new Error(message)
    }
  }
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=style waiting rollback marker clear (timeout=${markerTimeoutMs}ms)\n`,
  )
  const captureOutputs = async () => {
    const compileSignalAt = getLatestCompileSignalAt(session, startedAt)
    const resolved = new Set<string>()
    for (const candidate of candidates) {
      const entries = await expandOutputFileEntries([candidate], { presenceOnly: true, ensureActive })
      if (requiredCandidates.includes(candidate) && entries.length === 0) {
        return undefined
      }
      for (const entry of entries) {
        resolved.add(entry)
      }
    }
    if (resolved.size === 0) {
      return undefined
    }
    const snapshot = new Map<string, { content: string, mtime: number }>()
    for (const candidate of resolved) {
      const beforeMtime = await getOutputMtimeOnce(candidate, ensureActive)
      // 文件暂缺或被锁时由外层轮询重试，避免每个路径再启动一轮内部等待。
      const content = await readOutputFileOnce(candidate, { signal: session.signal, ensureActive })
      const afterMtime = await getOutputMtimeOnce(candidate, ensureActive)
      if (content == null || beforeMtime <= 0 || beforeMtime !== afterMtime || needles.some(needle => content.includes(needle))) {
        return undefined
      }
      snapshot.set(candidate, { content, mtime: afterMtime })
    }
    const currentCompileSignalAt = getLatestCompileSignalAt(session, startedAt)
    if (currentCompileSignalAt !== compileSignalAt || Date.now() - currentCompileSignalAt < resolveCompileStableWindowMs(options)) {
      return undefined
    }
    return { files: snapshot, compileSignalAt }
  }
  return waitFor(
    async () => {
      await waitForCompileSettled(watchCase, options, session, startedAt, candidates, markerDeadlineAt)
      const before = await captureOutputs()
      if (!before) {
        return false
      }
      // 读取期间若重新编译，须再次稳定且重新读 marker，不能把旧清理快照当作新状态。
      await waitForCompileSettled(watchCase, options, session, startedAt, candidates, markerDeadlineAt)
      const after = await captureOutputs()
      return after != null && before.compileSignalAt === after.compileSignalAt
        && before.files.size === after.files.size && [...before.files].every(([file, state]) => {
        const current = after.files.get(file)
        return current?.mtime === state.mtime && current.content === state.content
      })
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message,
      onTick: ensureActive,
      signal: session.signal,
      deadlineAt: markerDeadlineAt,
    },
    startedAt,
  )
}
