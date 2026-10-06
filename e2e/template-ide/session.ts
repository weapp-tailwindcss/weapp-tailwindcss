import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { Launcher } from '../../scripts/wechat/automator'

interface TemplateIdeSessionOptions {
  projectPath: string
  cliPath?: string | undefined
  artifactDir: string
  launchTimeoutMs: number
  closeTimeoutMs: number
  failureScreenshotTimeoutMs?: number
}

/** 每次运行使用独立目录，启动失败时不能混入上一轮成功图片。 */
export async function createTemplateIdeArtifacts(root: string) {
  await mkdir(root, { recursive: true })
  return mkdtemp(path.join(root, 'run-'))
}

/** 诊断失败也必须留在异常链中，且不能阻止另一个诊断或项目收尾。 */
async function recordFailure(error: unknown, miniProgram: MiniProgram | undefined, options: TemplateIdeSessionOptions) {
  await runWithCleanup(
    () => writeFile(path.join(options.artifactDir, 'error.txt'), formatWorkflowError(error)),
    async () => {
      await miniProgram?.screenshot({
        path: path.join(options.artifactDir, 'failure.png'),
        timeout: options.failureScreenshotTimeoutMs ?? 5000,
      })
    },
  )
}

/** 启动失败、探针失败与诊断/收尾失败共同保留；只关闭本轮绑定的项目。 */
export async function withTemplateIdeSession<T>(options: TemplateIdeSessionOptions, run: (miniProgram: MiniProgram) => Promise<T>): Promise<T> {
  let miniProgram: MiniProgram | undefined
  try {
    return await runWithCleanup(async () => {
      try {
        miniProgram = await new Launcher().launch({
          ...(options.cliPath === undefined ? {} : { cliPath: options.cliPath }),
          projectPath: options.projectPath,
          timeout: options.launchTimeoutMs,
        })
        return await run(miniProgram)
      }
      catch (error) {
        return runWithCleanup(() => Promise.reject(error), () => recordFailure(error, miniProgram, options))
      }
    }, async () => {
      // launch 成功返回才移交清理责任；失败由 Launcher 原服务路径收尾。
      if (miniProgram) {
        await closeWechatProject(options.projectPath, miniProgram, options.closeTimeoutMs)
      }
    })
  }
  catch (error) {
    // 默认测试报告只展开一层 AggregateError；收尾后落盘完整链，避免诊断次因不可见。
    return runWithCleanup(
      () => Promise.reject(error),
      () => writeFile(path.join(options.artifactDir, 'error.txt'), formatWorkflowError(error)),
    )
  }
}
