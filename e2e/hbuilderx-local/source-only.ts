import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

export interface SourceOnlyUpdate<T> {
  name: string
  file: string
  source: string
  verifyRuntime: (evidence: T) => boolean | Promise<boolean>
}

export interface SourceOnlyRuntime<T> {
  updateSourceOnly: (update: SourceOnlyUpdate<T>) => Promise<void>
}

export interface SourceOnlyLifecycle<T> {
  assertNoFallback: () => void
  snapshot: () => unknown
  waitForCompletion: (timeoutMs: number, ensureRunning: () => void, verifyRuntime: (remainingMs: number, transfer: string) => Promise<T>) => Promise<T | undefined>
}

interface SourceOnlyHost<T> {
  projectRoot: string
  sourceFile: string
  outputRoot: string
  sourceFiles: string[]
  timeoutMs: number
  ensureRunning: () => void
  begin: () => SourceOnlyLifecycle<T>
  capture: (name: string, attempt: number, remainingMs: number, transfer: string) => Promise<T>
  publish: (name: string, evidence: T, lifecycle: unknown, products: Record<string, string>) => void
}

type PathOperations = Pick<typeof path, 'relative' | 'resolve' | 'isAbsolute' | 'sep'>

function inside(root: string, file: string, paths: PathOperations = path) {
  const relative = paths.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}

/** 只接受提前登记的项目内外部来源，marker 所在 SFC 始终由原 runner 管理。 */
export function resolveSourceOnlyFiles(root: string, sourceFile: string, files: string[], paths: PathOperations = path) {
  return files.map((file) => {
    const target = paths.resolve(root, file)
    if (!inside(root, target, paths) || paths.relative(paths.resolve(root, sourceFile), target) === '') {
      throw new Error(`独立来源更新不允许改写 marker SFC 或项目外文件：${file}`)
    }
    return target
  })
}

/** 在每步稳定运行态取证时读取原生产物，保存内容身份而非依赖文件时间戳。 */
export async function snapshotSourceOnlyProducts(root: string) {
  const result: Record<string, string> = {}
  async function visit(folder: string) {
    const entries = await fs.readdir(folder, { withFileTypes: true })
    for (const entry of entries) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) {
        await visit(file)
      }
      else if (entry.isFile()) {
        result[path.relative(root, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex')
      }
    }
  }
  await visit(root)
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

/** 外部样式更新保持父 SFC 字节不变；生命周期、原生停止和恢复仍归原 runner 所有。 */
export async function createSourceOnlyRuntime<T>(host: SourceOnlyHost<T>) {
  const root = await fs.realpath(host.projectRoot)
  const sourcePath = await fs.realpath(host.sourceFile)
  const source = await fs.readFile(host.sourceFile)
  const allowed = new Set(await Promise.all(resolveSourceOnlyFiles(host.projectRoot, host.sourceFile, host.sourceFiles).map(async (file) => {
    const actual = await fs.realpath(file)
    if (!inside(root, actual) || path.relative(sourcePath, actual) === '') {
      throw new Error(`独立来源软链超出项目或指向 marker SFC：${file}`)
    }
    return actual
  })))
  let active = true
  let pending: Promise<void> | undefined
  let failure: { error: unknown } | undefined
  let busy = false
  const names = new Set<string>()
  const assertSource = async () => {
    if (!(await fs.readFile(host.sourceFile)).equals(source)) {
      throw new Error('独立来源更新期间父 SFC 已改变，不能计为外部 CSS-only 验收')
    }
  }
  async function update(update: SourceOnlyUpdate<T>) {
    let failed: { error: unknown } | undefined
    try {
      host.ensureRunning()
      await assertSource()
      const requested = path.resolve(host.projectRoot, update.file)
      const target = await fs.realpath(requested)
      if (!allowed.has(target)) {
        throw new Error(`外部来源未登记到原生恢复清单：${update.file}`)
      }
      const before = await snapshotSourceOnlyProducts(host.outputRoot)
      const lifecycle = host.begin()
      host.ensureRunning()
      lifecycle.assertNoFallback()
      await fs.writeFile(requested, update.source, 'utf8')
      const evidence = await lifecycle.waitForCompletion(host.timeoutMs, host.ensureRunning, async (remainingMs, transfer) => {
        const startedAt = Date.now()
        let attempt = 0
        while (Date.now() - startedAt < remainingMs) {
          host.ensureRunning()
          lifecycle.assertNoFallback()
          const value = await host.capture(update.name, ++attempt, Math.max(1, remainingMs - (Date.now() - startedAt)), transfer)
          host.ensureRunning()
          lifecycle.assertNoFallback()
          if (await update.verifyRuntime(value)) {
            return value
          }
          await setTimeout(100)
        }
        throw new Error(`外部样式的当轮实际节点未更新：${update.name}`)
      })
      host.ensureRunning()
      lifecycle.assertNoFallback()
      if (evidence === undefined) {
        throw new Error('外部样式缺少本轮原生运行态证据')
      }
      const products = await snapshotSourceOnlyProducts(host.outputRoot)
      if (JSON.stringify(products) === JSON.stringify(before)) {
        throw new Error('外部样式未改变任何原生产物，不能以旧运行态通过')
      }
      await assertSource()
      host.publish(update.name, evidence, lifecycle.snapshot(), products)
    }
    catch (error) { failed = { error } }
    try {
      await assertSource()
    }
    catch (error) { failed = { error: failed ? new AggregateError([failed.error, error], '外部样式验证与父 SFC 身份检查均失败') : error } }
    if (failed) {
      throw failed.error
    }
  }
  return {
    runtime: {
      updateSourceOnly(update: SourceOnlyUpdate<T>) {
        if (!active || busy || failure) {
          const error = failure ? failure.error : new Error(!active ? '外部来源运行窗口已结束' : '外部来源更新必须串行等待完成')
          failure ??= { error }
          return Promise.reject(error)
        }
        if (!/^[a-z\d][\w-]*$/i.test(update.name) || names.has(update.name)) {
          const error = new Error(`外部来源步骤名不合法或已经使用，保留首次证据：${update.name}`)
          failure = { error }
          return Promise.reject(error)
        }
        names.add(update.name)
        busy = true
        pending = updateSource(update)
        // 即使调用方遗漏 await，finish 仍等待并传播同一失败，避免异步更新逃出原生清理边界。
        void pending.catch(() => {})
        return pending
      },
    } satisfies SourceOnlyRuntime<T>,
    async finish() {
      active = false
      await pending?.catch(() => {})
      try {
        await assertSource()
      }
      catch (error) { failure = { error: failure ? new AggregateError([failure.error, error], '外部来源失败与父 SFC 身份检查均失败') : error } }
      if (failure) {
        throw failure.error
      }
    },
  }
  async function updateSource(input: SourceOnlyUpdate<T>) {
    try {
      await update(input)
    }
    catch (error) {
      failure ??= { error }
      throw error
    }
    finally { busy = false }
  }
}
