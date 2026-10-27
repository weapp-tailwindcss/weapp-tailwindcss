import type { HBuilderXCommandOptions, SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import type { DeploymentTarget } from '../../config/deploymentTarget'
import type { LocalWorkerResponse } from './http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { includeWorkflowCancellation } from '../../../scripts/demo-e2e-workflow/cancellation'
import { availablePort } from '../../../scripts/e2e-preflight/probes/port'
import { resolveWranglerCommand } from './command'
import { requestWorker } from './http'
import { withLocalCommand } from './lifecycle'

export interface LocalWorkerContext {
  websiteRoot: string
  baseUrl: URL
  signal: AbortSignal
  request: (pathname: string) => Promise<LocalWorkerResponse>
}

export interface LocalWorkerOptions {
  websiteRoot: string
  target?: DeploymentTarget
  signal?: AbortSignal
  readyTimeoutMs?: number
  requestTimeoutMs?: number
  /** 仅替换本轮启动命令，供合成服务验证生命周期，不复用外部服务。 */
  createCommand?: (websiteRoot: string, port: number) => Promise<HBuilderXCommandOptions>
}

function workerError(command: SpawnedHBuilderXCommand, message: string) {
  return new Error(`${message}\ncommand=${command.command} ${command.args.join(' ')}\ncwd=${command.cwd} pid=${command.child.pid ?? 'unknown'}\n${command.logs.join('')}`)
}

async function waitForWorker(command: SpawnedHBuilderXCommand, context: LocalWorkerContext, expectedHtml: string, readyTimeoutMs: number, requestTimeoutMs: number) {
  const deadline = Date.now() + readyTimeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    context.signal.throwIfAborted()
    const announced = [...stripVTControlCharacters(command.logs.join('')).matchAll(/Ready on (https?:\/\/\S+)/g)].at(-1)?.[1]
    if (announced) {
      if (new URL(announced).origin !== context.baseUrl.origin) {
        throw workerError(command, `Worker 启动 URL 不匹配：${announced}，预期 ${context.baseUrl.origin}`)
      }
      let response: LocalWorkerResponse | undefined
      try {
        response = await requestWorker(context.baseUrl, context.signal, Math.min(requestTimeoutMs, deadline - Date.now()))
      }
      catch (error) {
        context.signal.throwIfAborted()
        lastError = error
      }
      if (response?.status === 200) {
        if (response.text !== expectedHtml) {
          throw workerError(command, `Worker 根 HTML 与本轮 ${path.join(context.websiteRoot, 'build', 'index.html')} 不匹配，拒绝复用旧实例。`)
        }
        context.signal.throwIfAborted()
        return
      }
      if (response) {
        lastError = new Error(`Worker 根页面 HTTP ${response.status}`)
      }
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) {
      try {
        await delay(Math.min(100, remaining), undefined, { signal: context.signal })
      }
      catch (error) {
        context.signal.throwIfAborted()
        throw error
      }
    }
  }
  throw new Error(workerError(command, `Worker 本地服务未就绪，预算=${readyTimeoutMs}ms`).message, { cause: lastError })
}

/** 绑定本轮构建与独立进程；任何提前退出和取消均停止动作并确认服务收尾。 */
export async function withLocalWorker<T>(action: (context: LocalWorkerContext) => Promise<T>, options: LocalWorkerOptions): Promise<T> {
  const controller = new AbortController()
  const cancelled = () => controller.abort(options.signal?.reason)
  const handlers = {
    SIGINT: () => controller.abort(new Error('网站本地验收收到 SIGINT，停止本轮动作。')),
    SIGTERM: () => controller.abort(new Error('网站本地验收收到 SIGTERM，停止本轮动作。')),
  }
  options.signal?.addEventListener('abort', cancelled, { once: true })
  process.on('SIGINT', handlers.SIGINT)
  process.on('SIGTERM', handlers.SIGTERM)
  let command: SpawnedHBuilderXCommand | undefined
  let exited: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined
  let spawnFailed: ((error: Error) => void) | undefined
  try {
    if (options.signal?.aborted) {
      cancelled()
    }
    controller.signal.throwIfAborted()
    const expectedHtml = await readFile(path.join(options.websiteRoot, 'build', 'index.html'), 'utf8')
    const port = await availablePort()
    const invocation = await (options.createCommand ? options.createCommand(options.websiteRoot, port) : resolveWranglerCommand(options.websiteRoot, port, options.target))
    controller.signal.throwIfAborted()
    const trackWorker = (worker: SpawnedHBuilderXCommand, isStopping: () => boolean) => {
      command = worker
      exited = (code, signal) => {
        if (!isStopping()) {
          controller.abort(workerError(worker, `Worker 提前退出：exit=${code} signal=${signal}`))
        }
      }
      spawnFailed = error => controller.abort(workerError(worker, `Worker 启动失败：${error.message}`))
      // 根进程 exit 可早于后代关闭管道的 close，必须立即停止浏览器动作。
      worker.child.once('exit', exited)
      worker.child.once('error', spawnFailed)
      void worker.closed.then((exit) => {
        if (!isStopping()) {
          controller.abort(workerError(worker, `Worker 提前退出：exit=${exit.code} signal=${exit.signal}`))
        }
      })
    }
    const result = await withLocalCommand(invocation, controller.signal, async (worker, signal) => {
      const context: LocalWorkerContext = {
        websiteRoot: options.websiteRoot,
        baseUrl: new URL(`http://127.0.0.1:${port}/`),
        signal,
        request: pathname => requestWorker(new URL(pathname, context.baseUrl), signal, options.requestTimeoutMs ?? 5000),
      }
      await waitForWorker(worker, context, expectedHtml, options.readyTimeoutMs ?? 30_000, options.requestTimeoutMs ?? 5000)
      signal.throwIfAborted()
      const result = await action(context)
      signal.throwIfAborted()
      return result
    }, trackWorker)
    controller.signal.throwIfAborted()
    return result
  }
  catch (error) {
    throw includeWorkflowCancellation(error, controller.signal)
  }
  finally {
    if (exited) {
      command?.child.removeListener('exit', exited)
    }
    if (spawnFailed) {
      command?.child.removeListener('error', spawnFailed)
    }
    options.signal?.removeEventListener('abort', cancelled)
    process.removeListener('SIGINT', handlers.SIGINT)
    process.removeListener('SIGTERM', handlers.SIGTERM)
  }
}
