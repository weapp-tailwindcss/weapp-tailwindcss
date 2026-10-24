import type { CacheTelemetryCollector } from '@/compiler/cache-telemetry'
import type { UserDefinedOptions } from '@/types'

export type CreateCompilerOptions = UserDefinedOptions & {
  compiler?: {
    /** 长期未使用且没有进行中任务的 root 会话上限。 */
    maxRoots?: number | undefined
    /** root 因超过 maxRoots 被淘汰并释放后触发。 */
    onRootEvicted?: ((id: string) => void) | undefined
    /** 可选的缓存遥测采集器。 */
    cacheTelemetry?: CacheTelemetryCollector | undefined
  } | undefined
}
