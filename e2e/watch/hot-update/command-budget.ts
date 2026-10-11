import type { WatchCase } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'

export interface WatchCommandProfile {
  miniProgramScope?: string
  miniProgramOnly?: boolean
  webOnly?: boolean
  mainStyleOnly?: boolean
  mainStyleSubPackageLimit?: number
}

function countSurfaces(watchCase: WatchCase, profile: WatchCommandProfile) {
  const subpackages = watchCase.subPackageMutations?.length ?? 0
  if (profile.miniProgramScope === 'subpackages') {
    return subpackages
  }
  if (profile.mainStyleOnly) {
    const limit = profile.mainStyleSubPackageLimit
    return 1 + (limit === undefined || !Number.isFinite(limit) ? subpackages : Math.min(subpackages, Math.max(0, Math.floor(limit))))
  }
  if (profile.webOnly) {
    return 1
  }
  return 1
    + (profile.miniProgramScope === 'main-package' ? 0 : subpackages)
    + (watchCase.webHmr && !watchCase.skipWebHmrInFullRun && !profile.miniProgramOnly ? 1 : 0)
}

/** 总命令覆盖串行的主包、分包和 Web 验收，不能只按 demo 数量分配单段预算。 */
export function resolveWatchCommandTimeoutMs(cases: WatchCase[], timeoutMs: number, profile: WatchCommandProfile = {}) {
  const surfaces = cases.reduce((total, watchCase) => total + countSurfaces(watchCase, profile), 0)
  return Math.max(timeoutMs * Math.max(1, surfaces) + 180_000, 240_000)
}
