import type { IconifyHotUpdateConfig, IconifyHotUpdatePayload, WatchCase } from '../../types'
import path from 'node:path'

/** 默认沿用框架已有的模板消费插入器；独立源文件必须提供自己的 mutate。 */
export function createIconifyProbeSource(watchCase: WatchCase, config: IconifyHotUpdateConfig, source: string, payload: IconifyHotUpdatePayload) {
  if (config.mutate) {
    return config.mutate(source, payload)
  }
  if (path.resolve(config.sourceFile) !== path.resolve(watchCase.templateMutation.sourceFile)) {
    throw new Error(`[${watchCase.label}] iconify HMR requires mutate for a separate source file`)
  }
  return watchCase.templateMutation.mutate(source, { ...payload, classVariableName: '__twWatchIconifyHmr' })
}
