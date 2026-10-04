import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { writeFile } from 'node:fs/promises'
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
  return runWithCleanup(async () => {
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
  }, () => closeWechatProject(options.projectPath, miniProgram, options.closeTimeoutMs))
}
