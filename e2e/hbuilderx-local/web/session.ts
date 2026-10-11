import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { AttachedWebServer } from './attached'
import { appendFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { collectProcessOutput, findFreePort, killProcessTree, runPnpm, serverTimeoutMs } from '../process'
import { checkAttachedIdentity, readAttachedLog } from './attached'
import { clearDevProcess, createDevServer, createHBuilderXDevServer } from './dev-server'

export interface WebServerSession {
  baseUrl: string
  logs: string[]
  ensureRunning: () => Promise<void>
  readLogs: () => Promise<string>
  stop: () => Promise<void>
  closeProject: () => Promise<void>
}

/** 外部服务只校验身份；关闭操作始终只作用于本测试创建的进程。 */
export async function createWebSession(projectRoot: string, launchWithHBuilderX: boolean, logFile: string, attached?: AttachedWebServer, identityPath?: string): Promise<WebServerSession> {
  if (attached) {
    if (!identityPath) {
      throw new Error('连接已有服务必须配置身份端点')
    }
    const logs: string[] = []
    return {
      baseUrl: attached.baseUrl,
      logs,
      async ensureRunning() {
        await attached.assertOwned()
        await checkAttachedIdentity(attached, await fs.realpath(projectRoot), identityPath)
      },
      async readLogs() {
        await checkAttachedIdentity(attached, await fs.realpath(projectRoot), `${identityPath}?complete=${encodeURIComponent(attached.runId)}`)
        console.log(`浏览器断言已完成，请将本次 IDE 完整控制台日志导出到：${attached.logFile}（等待最多 5 分钟）`)
        const deadline = Date.now() + 300_000
        let error: unknown
        while (Date.now() < deadline) {
          await attached.assertOwned()
          try {
            const output = await readAttachedLog(attached)
            if (!output.includes(`[wt-acceptance-complete] ${attached.runId}`)) {
              throw new Error('IDE 日志尚未包含本轮验收结束标识')
            }
            await fs.writeFile(logFile, output)
            logs.push(output)
            return output
          }
          catch (cause) { error = cause }
          await delay(250)
        }
        throw new Error('等待完整 IDE 日志超时', { cause: error })
      },
      async stop() {},
      async closeProject() {},
    }
  }
  await runPnpm(projectRoot, ['run', 'predev:h5'], serverTimeoutMs)
  const port = await findFreePort()
  const launch = launchWithHBuilderX ? await createHBuilderXDevServer(projectRoot) : undefined
  const child: ChildProcess = launch?.child ?? createDevServer(projectRoot, port)
  const logs = launch?.logs ?? collectProcessOutput(child)
  let bytes = 0
  let logError: unknown
  const capture = (chunk: Buffer) => {
    if (logError) {
      return
    }
    try {
      bytes += chunk.length
      if (bytes > 32 * 1024 * 1024) {
        throw new Error('Web 验证日志超过 32 MiB，停止以避免不完整证据')
      }
      appendFileSync(logFile, chunk)
    }
    catch (error) { logError = error }
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    logs,
    async ensureRunning() {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Web 服务提前退出：${child.signalCode ?? child.exitCode}\n${logs.join('')}`)
      }
      if (logError) {
        throw logError
      }
    },
    async readLogs() {
      if (logError) {
        throw logError
      }
      return fs.readFile(logFile, 'utf8')
    },
    async stop() {
      try {
        if (launch) {
          await launch.stop()
        }
        else {
          killProcessTree(child)
        }
      }
      finally { clearDevProcess() }
    },
    async closeProject() { await launch?.cleanup() },
  }
}
