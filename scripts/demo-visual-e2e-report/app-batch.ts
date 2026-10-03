import type { AppCase } from '../../e2e/hbuilderx-local/cases'
import type { CaseResult, RuntimeContext } from './types'
import { runWithCleanup } from '../e2e-preflight/cleanup'
import { runAppCase } from './app'
import { writeReport } from './report'

/** 原生清理阻塞必须穿透 case 循环，同时保存已经取得的失败证据。 */
export async function runNativeVisualCases(items: AppCase[], context: RuntimeContext, results: CaseResult[]) {
  for (const item of items) {
    try {
      await runAppCase(item, context, results)
    }
    catch (error) {
      await runWithCleanup(async () => {
        throw error
      }, () => writeReport(results, context))
    }
  }
}
