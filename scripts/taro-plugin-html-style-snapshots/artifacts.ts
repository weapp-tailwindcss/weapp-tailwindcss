import type { Buffer } from 'node:buffer'
import type { ModeResult, PluginHtmlMode } from './report.ts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runWithCleanup } from '../e2e-preflight/cleanup.ts'

export interface PluginHtmlBuildExecution {
  result: ModeResult
  output: Buffer
  exitCode: number | null
  signal: string | null
}

type PathApi = Pick<typeof path, 'resolve' | 'join' | 'relative' | 'isAbsolute'>

/** 项目名是固定标识，不允许用文件系统路径逃出归档根目录。 */
export function resolvePluginHtmlArchiveMode(root: string, project: string, mode: PluginHtmlMode, paths: PathApi = path) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(project) || !['with-plugin-html', 'without-plugin-html'].includes(mode)) {
    throw new Error(`无效的 plugin-html 归档身份：${project}:${mode}`)
  }
  return paths.join(paths.resolve(root), project, mode)
}

function contains(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function errorText(error: unknown) {
  return error instanceof Error ? error.stack ?? error.message : String(error)
}

/** 可选归档保存同次构建的日志和原产物；不参与基线读取或比较。 */
export async function createPluginHtmlArtifactArchive(directory: string | undefined, identifySource: () => Promise<unknown>, outputDirectories: string[] = []) {
  if (!directory) {
    return undefined
  }
  const root = path.resolve(directory)
  if (outputDirectories.some(output => contains(path.resolve(output), root) || contains(root, path.resolve(output)))) {
    throw new Error('plugin-html 归档根目录不能与真实 dist 重叠')
  }
  const source = await identifySource()
  const startedAt = new Date().toISOString()
  const captures: { project: string, mode: PluginHtmlMode, report: string }[] = []
  await fs.mkdir(root, { recursive: true })
  const runFile = path.join(root, 'report.json')
  await fs.writeFile(runFile, `${JSON.stringify({ source, startedAt, status: 'running', captures }, null, 2)}\n`, { flag: 'wx' })
  return {
    async capture(project: string, projectRoot: string, execution: PluginHtmlBuildExecution) {
      const mode = execution.result.mode
      const modeRoot = resolvePluginHtmlArchiveMode(root, project, mode)
      const output = path.resolve(projectRoot, 'dist')
      if (contains(output, modeRoot) || contains(modeRoot, output)) {
        throw new Error('plugin-html 归档目录不能与真实 dist 重叠')
      }
      await fs.mkdir(path.dirname(modeRoot), { recursive: true })
      // 同一运行不能覆盖旧模式证据，避免误消费此前的成功产物。
      await fs.mkdir(modeRoot)
      const reportFile = path.join(modeRoot, 'report.json')
      const report = {
        source,
        project,
        mode,
        command: { file: 'pnpm', args: ['run', 'build:weapp'], cwd: projectRoot, env: { TARO_BUILD_STRICT: '1', WEAPP_TW_TARO_PLUGIN_HTML: mode === 'with-plugin-html' ? '1' : '0' } },
        result: execution.result,
        exitCode: execution.exitCode,
        signal: execution.signal,
        combinedStdoutStderr: 'build.log',
        production: { status: 'pending', directory: 'production' },
      }
      const save = (value: unknown) => fs.writeFile(reportFile, `${JSON.stringify(value, null, 2)}\n`)
      await fs.writeFile(path.join(modeRoot, 'build.log'), execution.output)
      await save(report)
      try {
        const stat = await fs.stat(output).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') {
            throw error
          }
        })
        if (stat) {
          if (!stat.isDirectory()) {
            throw new Error('plugin-html 的真实 dist 不是目录')
          }
          await fs.cp(output, path.join(modeRoot, 'production'), { recursive: true, force: false, errorOnExist: true, dereference: true })
          report.production.status = 'captured'
        }
        else if (execution.result.status === 'passed') {
          throw new Error('plugin-html 构建成功但真实 dist 缺失，无法完成归档')
        }
        else {
          report.production.status = 'absent-after-failed-build'
        }
        await save(report)
        captures.push({ project, mode, report: path.relative(root, reportFile) })
      }
      catch (error) {
        await runWithCleanup(async () => {
          throw error
        }, () => save({ ...report, archiveError: errorText(error) }))
      }
    },
    async finish(status: { passed: boolean, verify: boolean, error?: unknown }) {
      await fs.writeFile(runFile, `${JSON.stringify({ source, startedAt, finishedAt: new Date().toISOString(), status: status.passed ? 'passed' : 'failed', verify: status.verify, captures, ...(status.error !== undefined ? { error: errorText(status.error) } : {}) }, null, 2)}\n`)
    },
  }
}

export type PluginHtmlArtifactArchive = Awaited<ReturnType<typeof createPluginHtmlArtifactArchive>>

/** 暂存清理完成后才记成功；原操作、清理或归档失败均不能互相掩盖。 */
export async function finishPluginHtmlRun<T>(action: () => Promise<T>, cleanup: () => Promise<void>, archive: PluginHtmlArtifactArchive, verify: boolean) {
  let passed = false
  let failure: unknown
  return runWithCleanup(async () => {
    try {
      const result = await runWithCleanup(action, cleanup)
      passed = true
      return result
    }
    catch (error) {
      failure = error
      throw error
    }
  }, () => archive?.finish({ passed, verify, error: failure }))
}
