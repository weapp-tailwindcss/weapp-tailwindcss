import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { collectFrameworkIdeDiagnostics } from '../frameworkIdeDiagnostics'

/** Launcher 内已做有界连接等待；外层只补诊断，不吞掉失败收尾后继续启动。 */
export async function launchWithDiagnostics<T>(projectName: string, launch: () => Promise<T>): Promise<T> {
  try {
    return await launch()
  }
  catch (error) {
    return runWithCleanup(() => Promise.reject(error), async () => {
      const diagnostics = await collectFrameworkIdeDiagnostics(projectName)
      if (error instanceof Error) {
        error.message = `${error.message}\n${diagnostics}`
      }
    })
  }
}
