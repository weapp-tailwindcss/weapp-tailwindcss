import type { PackageResolvingOptions } from '@/tailwindcss/package-options'
import type { UserDefinedOptions } from '@/types'
import { resolveTailwindcssBasedir } from '@/context/tailwindcss'
import { resolveTaroPlatform, resolveUniPlatformsFromEnv } from '@/framework'
import { defuOverrideArray } from '@/utils'
import { omitUndefined } from '@/utils/object'

export interface BasePresetOptions extends Omit<Partial<UserDefinedOptions>, 'cssEntries'> {
  base?: string
  cssEntries?: string | string[]
  resolve?: PackageResolvingOptions
  rawOptions?: UserDefinedOptions
}

export function normalizeCssEntries(entries?: string | string[]) {
  if (!entries) {
    return undefined
  }
  const normalized = Array.isArray(entries) ? entries : [entries]
  return normalized.length > 0 ? normalized : undefined
}

export function shouldEnableWebCompatFromEnv() {
  const { uniPlatform, uniUtsPlatform } = resolveUniPlatformsFromEnv()
  return uniPlatform.isWeb
    || uniUtsPlatform.isWeb
    || resolveTaroPlatform().isWeb
}

export function withWebCompatGeneratorDefaults<T extends { generator?: UserDefinedOptions['generator'] }>(
  options: T,
  enabled = shouldEnableWebCompatFromEnv(),
): T {
  if (!enabled || options.generator === false) {
    return options
  }
  const generatorOptions = (options.generator ?? {}) as Exclude<NonNullable<UserDefinedOptions['generator']>, false>
  return {
    ...options,
    generator: defuOverrideArray<typeof generatorOptions, typeof generatorOptions[]>(
      generatorOptions,
      {
        target: 'web',
        webCompat: true,
      },
    ),
  }
}

export function createBasePreset(options: BasePresetOptions = {}) {
  const {
    base,
    cssEntries,
    resolve,
    rawOptions,
    ...userOptions
  } = options

  const baseDir = resolveTailwindcssBasedir(base)
  const normalizedCssEntries = normalizeCssEntries(cssEntries)

  const tailwindConfig: NonNullable<UserDefinedOptions['tailwindcss']> = {
    v4: omitUndefined({
      base: baseDir,
      cssEntries: normalizedCssEntries,
    }),
  }

  if (normalizedCssEntries && normalizedCssEntries.length > 0) {
    tailwindConfig.version = 4
  }

  const patchTailwindConfig: NonNullable<UserDefinedOptions['tailwindcss']> = resolve
    ? {
        ...tailwindConfig,
        resolve,
      }
    : tailwindConfig

  const preset: Partial<UserDefinedOptions> = {
    tailwindcssBasedir: baseDir,
    tailwindcss: tailwindConfig,
    tailwindcssRuntimeOptions: {
      projectRoot: baseDir,
      tailwindcss: patchTailwindConfig,
    },
  }

  const mergedUserOptions = defuOverrideArray<
    Partial<UserDefinedOptions>,
    Partial<UserDefinedOptions>[]
  >(userOptions, rawOptions ?? {})

  return defuOverrideArray<Partial<UserDefinedOptions>, Partial<UserDefinedOptions>[]>(
    mergedUserOptions,
    preset,
  )
}
