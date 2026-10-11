import type { Buffer } from 'node:buffer'
import type { NativeHost } from './hbuilderx-native-registry/identity'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { inspect } from 'node:util'
import { runWithCleanup } from './e2e-preflight/cleanup'
import { claimNativeSession } from './hbuilderx-native-registry'
import { cleanupHBuilderXResources } from './hbuilderx-project-resources'

/** 停止边界未确认时冻结当前源码与项目，禁止调用方继续原生调度。 */
export class NativeCleanupBlockedError extends AggregateError {
  constructor(errors: unknown[], readonly recoveryDirectory: string, readonly sessionId: string) {
    super(errors, `原生任务停止未确认；保留源码和项目现场，停止后续调度。恢复资料：${recoveryDirectory}`, { cause: errors[0] })
    this.name = 'NativeCleanupBlockedError'
  }
}

/** 主错误与清理错误可能多层聚合，不能仅检查最外层类型。 */
export function findNativeCleanupBlock(error: unknown, seen = new Set<unknown>()): NativeCleanupBlockedError | undefined {
  if (!error || seen.has(error)) {
    return undefined
  }
  seen.add(error)
  if (error instanceof NativeCleanupBlockedError) {
    return error
  }
  const nested = error instanceof AggregateError ? [...error.errors] : []
  if (error instanceof Error && error.cause !== undefined) {
    nested.push(error.cause)
  }
  for (const value of nested) {
    const blocked = findNativeCleanupBlock(value, seen)
    if (blocked) {
      return blocked
    }
  }
}

interface RecoveryOptions {
  directory: string
  projectRoot: string
  platform: string
  host: NativeHost
  files: Array<{ file: string, optional?: boolean }>
}

interface CleanupOptions {
  failure?: { error: unknown } | undefined
  stop: () => unknown | Promise<unknown>
  nativeStopReason: () => string | undefined
  afterStop: () => unknown | Promise<unknown>
  safe: Array<() => unknown | Promise<unknown>>
  release: Array<() => unknown | Promise<unknown>>
}

/** 在任何源码写入前保存原始字节；CLI 退出不被提升为共享 IDE 的 idle 证明。 */
export async function createNativeSessionRecovery(options: RecoveryOptions) {
  const sessionId = randomUUID()
  const directory = path.resolve(options.directory, `native-session-${sessionId}`)
  const registration = await claimNativeSession({ ...options, directory, sessionId })
  const originals = new Map<string, Buffer | undefined>()
  try {
    for (const entry of options.files) {
      let file = path.resolve(entry.file)
      try {
        file = await fs.realpath(file)
        if (!originals.has(file)) {
          originals.set(file, await fs.readFile(file))
        }
      }
      catch (error) {
        if (!entry.optional || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        originals.set(file, undefined)
      }
    }
    await fs.mkdir(directory, { recursive: true })
    const files = []
    for (const [file, bytes] of originals) {
      const backup: string = `${files.length}.bin`
      if (bytes) {
        await fs.writeFile(path.join(directory, backup), bytes, { flag: 'wx' })
      }
      files.push({ file, existed: bytes !== undefined, ...(bytes ? { backup, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length } : {}) })
    }
    const manifest = {
      sessionId,
      createdAt: new Date().toISOString(),
      owner: { pid: process.pid, hostname: os.hostname() },
      projectRoot: options.projectRoot,
      platform: options.platform,
      host: options.host,
      files,
    }
    await fs.writeFile(path.join(directory, 'recovery.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' })
  }
  catch (error) {
    // 尚未返回恢复对象，源码与原生任务均未开始；只释放自己的领取。
    return await runWithCleanup(async () => {
      throw error
    }, () => registration.release())
  }
  let blocked = false
  let mutationStarted = false
  let cleanupComplete = true
  let cleanupFailed = false
  let finished = false
  const restore = async () => {
    if (blocked || !mutationStarted) {
      return
    }
    await registration.assertOwner()
    await cleanupHBuilderXResources([...originals].map(([file, bytes]) => async () => {
      if (bytes === undefined) {
        await fs.rm(file, { force: true })
      }
      else {
        await fs.writeFile(file, bytes)
        if (!(await fs.readFile(file)).equals(bytes)) {
          throw new Error(`原始字节恢复校验失败：${file}`)
        }
      }
    }))
  }
  return {
    directory,
    sessionId,
    get blocked() { return blocked },
    get cleanupComplete() { return cleanupComplete },
    async beginMutation() {
      await registration.assertOwner()
      if (blocked) {
        throw new NativeCleanupBlockedError([new Error('当前原生会话已冻结。')], directory, sessionId)
      }
      if (cleanupFailed) {
        throw new Error('原生会话未解除：前一轮资源收尾失败。')
      }
      cleanupComplete = false
      mutationStarted = true
    },
    restore,
    async finish() {
      if (finished || blocked) {
        return
      }
      if (!cleanupComplete || cleanupFailed) {
        throw new Error(`HBuilderX 原生会话未解除：收尾未完成，保留持久登记 ${registration.directory}`)
      }
      await registration.release()
      finished = true
    },
    async bindProject(project: { kind: string, projectRoot: string, projectPath: string, launchProject: string }) {
      await registration.assertOwner()
      cleanupComplete = false
      await fs.writeFile(path.join(directory, 'project.json'), JSON.stringify({ sessionId, ...project }, null, 2))
    },
    async cleanup(cleanup: CleanupOptions) {
      const errors: unknown[] = []
      const attempt = async (action: () => unknown | Promise<unknown>) => {
        try {
          await action()
        }
        catch (error) {
          errors.push(error)
        }
      }
      await attempt(cleanup.stop)
      blocked ||= errors.length > 0
      let reason: string | undefined
      await attempt(() => {
        reason = cleanup.nativeStopReason()
      })
      blocked ||= errors.length > 0
      if (reason) {
        blocked = true
        errors.push(new Error(reason))
      }
      const beforeAssertion = errors.length
      await attempt(cleanup.afterStop)
      // restarted 等验收断言仍保留为失败，但不等价于停止或资源收尾未知。
      const assertionErrors = errors.length - beforeAssertion
      for (const action of cleanup.safe) {
        await attempt(action)
      }
      if (blocked) {
        await attempt(() => registration.block(reason ?? '原生任务停止未确认'))
        await attempt(() => fs.writeFile(path.join(directory, 'blocked.json'), JSON.stringify({
          sessionId,
          status: 'blocked',
          reason,
          ...(cleanup.failure ? { primaryError: inspect(cleanup.failure.error, { depth: null, colors: false }) } : {}),
          errors: errors.map(error => inspect(error, { depth: null, colors: false })),
        }, null, 2)))
        throw new NativeCleanupBlockedError(errors, directory, sessionId)
      }
      await attempt(restore)
      for (const action of cleanup.release) {
        await attempt(action)
      }
      cleanupFailed ||= errors.length > assertionErrors
      cleanupComplete = !cleanupFailed
      if (errors.length === 1) {
        throw errors[0]
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, '原生任务资源收尾失败。', { cause: errors[0] })
      }
    },
  }
}
