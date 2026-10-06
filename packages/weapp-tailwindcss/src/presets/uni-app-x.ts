import type { PackageResolvingOptions } from '@/tailwindcss/package-options'
import type { UniAppXComponentLocalStylesOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { resolveUniPlatformsFromEnv } from '@/framework'
import { logger } from '@/logger'
import { getTailwindcssPackageInfo } from '@/tailwindcss'
import { resolveUniAppXOptions } from '@/uni-app-x/options'
import { defuOverrideArray } from '@/utils'
import { omitUndefined } from '@/utils/object'
import { normalizeCssEntries, withWebCompatGeneratorDefaults } from './shared'

export interface UniAppXOptions {
  /**
   * uni-app x 工程根目录。
   */
  base: string
  /**
   * 指定 Tailwind CSS v4 的入口 CSS。
   */
  cssEntries?: string[]
  /**
   * rem 转 rpx 配置。
   */
  rem2rpx?: UserDefinedOptions['rem2rpx']
  /**
   * Tailwind CSS v4 generator 配置。
   */
  generator?: UserDefinedOptions['generator']
  /**
   * 长度单位转 px 配置。
   */
  unitsToPx?: UserDefinedOptions['unitsToPx']
  /**
   * 任意样式单位转换配置。
   */
  unitConversion?: UserDefinedOptions['unitConversion']
  /**
   * 透传原始插件配置。
   */
  rawOptions?: UserDefinedOptions
  /**
   * 自定义包解析路径。
   */
  resolve?: PackageResolvingOptions
  /**
   * 自定义模板属性转换规则。
   */
  customAttributes?: UserDefinedOptions['customAttributes']
  /**
   * 直接控制 `uniAppX.componentLocalStyles` 的快捷入口。
   *
   * @remarks
   * 默认开启；默认仅在 `manifest.json` 的 `styleIsolationVersion=2` 时启用。
   */
  uniAppX?: UserDefinedOptions['uniAppX']
  /**
   * issue #822 组件局部样式能力的快捷开关。
   *
   * @remarks
   * 等价于设置 `uniAppX.componentLocalStyles`。
   */
  componentLocalStyles?: boolean | UniAppXComponentLocalStylesOptions
  /**
   * uvue 不兼容 utility 的处理策略。
   *
   * @remarks
   * 等价于设置 `uniAppX.uvueUnsupported`。
   */
  uvueUnsupported?: 'error' | 'warn' | 'silent'
}

function resolveTailwindResolveOptions(base: string, resolve?: PackageResolvingOptions): PackageResolvingOptions {
  const currentPaths = Array.isArray(resolve?.paths) ? resolve.paths : []
  return {
    ...(resolve ?? {}),
    paths: [...new Set([path.join(base, 'node_modules'), base, ...currentPaths])],
  }
}

function resolveInstalledTailwindDefaults(resolve?: PackageResolvingOptions) {
  const packageInfo = getTailwindcssPackageInfo(resolve)
  const version = packageInfo?.version
  if (!version) {
    return undefined
  }

  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  if (!Number.isFinite(major)) {
    return undefined
  }

  if (major === 4) {
    return {
      version: 4 as const,
      packageName: 'tailwindcss',
      postcssPlugin: '@tailwindcss/postcss',
    }
  }

  return undefined
}

export function uniAppX(options: UniAppXOptions) {
  logger.info(`UNI_PLATFORM: ${process.env['UNI_PLATFORM']}`)
  const { uniPlatform, uniUtsPlatform } = resolveUniPlatformsFromEnv()

  logger.info(`UNI_UTS_PLATFORM: ${uniUtsPlatform.raw ?? 'undefined'}`)

  const isApp = uniUtsPlatform.isApp || uniPlatform.isApp
  const cssEntries = normalizeCssEntries(options.cssEntries)
  const resolvedResolve = resolveTailwindResolveOptions(options.base, options.resolve)
  const installedTailwindDefaults = resolveInstalledTailwindDefaults(resolvedResolve)
  const resolvedUniAppX = resolveUniAppXOptions({
    enabled: isApp,
    componentLocalStyles: options.componentLocalStyles ?? true,
    uvueUnsupported: options.uvueUnsupported,
    ...(typeof options.uniAppX === 'object' ? options.uniAppX : {}),
  })
  if (typeof options.uniAppX === 'boolean') {
    resolvedUniAppX.enabled = options.uniAppX
  }
  return defuOverrideArray<
    Partial<UserDefinedOptions>,
    Partial<UserDefinedOptions>[]
  >(
    options.rawOptions ?? {},
    {
      uniAppX: resolvedUniAppX,
      ...withWebCompatGeneratorDefaults(
        options.generator !== undefined ? { generator: options.generator } : {},
      ),
      rem2rpx: options.rem2rpx,
      unitsToPx: options.unitsToPx,
      unitConversion: options.unitConversion,
      appType: 'uni-app-x',
      tailwindcssBasedir: options.base,
      tailwindcssRuntimeOptions: {
        projectRoot: options.base,
        tailwindcss: {
          ...(installedTailwindDefaults ?? {}),
          cwd: options.base,
          resolve: resolvedResolve,
          v4: omitUndefined({
            base: options.base,
            cssEntries,
          }),
        },
      },
      tailwindcss: {
        ...(installedTailwindDefaults ?? {}),
        resolve: resolvedResolve,
      },
      cssPreflight: {
        'border-width': '0',
        'border-style': false,
        'border': false,
      },
      cssPresetEnv: {
        features: {
          'custom-properties': {
            preserve: false,
          },
        },
      },
      ...(options.customAttributes ? { customAttributes: options.customAttributes } : {}),
    },
  )
}
