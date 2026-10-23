import type { Compiler } from 'webpack'
import type { CompilerRuntimeState } from '@/compiler/runtime-state'
import { logger as fallbackLogger } from '@weapp-tailwindcss/logger'
import { disposeCompilerOwner } from '@/compiler'
import { pluginName } from '@/constants'

/** Webpack 仅在永久关闭时释放会话；watch 的失败轮次继续保留有效状态。 */
export function createWebpackSessionLifecycle(
  compiler: Compiler,
  runtime: CompilerRuntimeState,
  cleanup: Array<() => void | Promise<void>>,
) {
  let closing: Promise<void> | undefined
  const reportError = (error: unknown) => {
    const logger = compiler.getInfrastructureLogger?.(pluginName)
    if (logger) {
      logger.error(error)
    }
    else {
      fallbackLogger.error(String(error))
    }
  }
  const close = () => closing ??= disposeCompilerOwner(runtime, {
    async beforeDispose() {
      const errors: unknown[] = []
      for (const release of cleanup) {
        try {
          await release()
        }
        catch (error) {
          errors.push(error)
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Webpack 扩展资源释放失败。')
      }
    },
  }).finally(() => runtime.dispose())
  const closeFromSyncHook = () => {
    const completion = close()
    void completion.catch(reportError)
    return completion
  }
  compiler.hooks.watchClose?.tap(pluginName, closeFromSyncHook)
  if (compiler.hooks.shutdown?.tapPromise) {
    compiler.hooks.shutdown.tapPromise(pluginName, close)
  }
  else {
    compiler.hooks.shutdown?.tap(pluginName, closeFromSyncHook)
  }
  return { close, reportError }
}
