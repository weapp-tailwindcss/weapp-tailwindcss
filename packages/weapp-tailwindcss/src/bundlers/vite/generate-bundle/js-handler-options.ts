import type { CreateJsHandlerOptions, InternalUserDefinedOptions } from '@/types'
import { markTrustedJsOptions } from '@/js/options-signature'
import { isUniAppXEnabled } from '@/uni-app-x/options'

interface JsHandlerOptionsFactoryOptions {
  getExperimentalJsFastPath?: () => CreateJsHandlerOptions['experimentalJsFastPath']
  getMajorVersion: () => number | undefined
  moduleGraph: CreateJsHandlerOptions['moduleGraph']
}

export function resolveUniAppXJsTransformEnabled(uniAppX: InternalUserDefinedOptions['uniAppX'] | undefined) {
  return uniAppX === undefined ? true : isUniAppXEnabled(uniAppX)
}

/**
 * generateBundle 里每个 chunk 都会独立转译。
 * 生产构建再走 moduleGraph 只会把已在产物里的 JS 再 Babel 一遍；增量模式才需要它更新被跳过的 clean chunk。
 */
export function resolveGenerateBundleJsFastPath(options: {
  experimentalJsFastPath?: CreateJsHandlerOptions['experimentalJsFastPath']
  useIncrementalMode: boolean
}) {
  return {
    experimentalJsFastPath: options.experimentalJsFastPath ?? 'oxc',
    moduleGraphEnabled: options.useIncrementalMode,
  }
}

export function createJsHandlerOptionsFactory(options: JsHandlerOptionsFactoryOptions) {
  const MAX_STABLE_OPTIONS = 2048
  const stableOptionsByFile = new Map<string, { fastPath: CreateJsHandlerOptions['experimentalJsFastPath'], majorVersion: number | undefined, value: CreateJsHandlerOptions }>()
  return (absoluteFilename: string, extra?: CreateJsHandlerOptions): CreateJsHandlerOptions => {
    const fastPath = options.getExperimentalJsFastPath?.()
    const majorVersion = options.getMajorVersion()
    const canCacheStableOptions = !extra && options.moduleGraph === undefined
    // 无 moduleGraph 的普通 chunk 没有额外覆盖项；在同一轮构建中按文件
    // 复用冻结配置，让 JS handler 的安全指纹可以按对象身份缓存。带覆盖项
    // 的 uni-app x 资产和增量 moduleGraph 路径仍逐次创建，避免延长模块图生命周期。
    if (canCacheStableOptions) {
      const cached = stableOptionsByFile.get(absoluteFilename)
      if (cached && cached.fastPath === fastPath && cached.majorVersion === majorVersion) {
        return cached.value
      }
    }

    const frozenValue = Object.freeze({
      ...extra,
      generateMap: false,
      experimentalJsFastPath: fastPath,
      filename: absoluteFilename,
      tailwindcssMajorVersion: majorVersion,
      moduleGraph: options.moduleGraph,
      babelParserOptions: Object.freeze({
        ...(extra?.babelParserOptions ?? {}),
        sourceFilename: absoluteFilename,
      }),
    })
    const value = extra || options.moduleGraph
      ? frozenValue
      : markTrustedJsOptions(frozenValue)
    if (canCacheStableOptions) {
      if (stableOptionsByFile.size >= MAX_STABLE_OPTIONS) {
        const oldest = stableOptionsByFile.keys().next().value
        if (oldest !== undefined) {
          stableOptionsByFile.delete(oldest)
        }
      }
      stableOptionsByFile.set(absoluteFilename, { fastPath, majorVersion, value })
    }
    return value
  }
}
