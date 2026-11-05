import type { CreateOptions } from '@weapp-tailwindcss/runtime'
import type {
  CnOptions,
  CnReturn,
  TVCustomConfig as TVConfig,
  TWMCustomConfig as TWMConfig,
  TWMergeConfig,
  TwMergeFn,
  TV as UpstreamTV,
} from 'tailwind-variants'
import { create as createMergeRuntime } from '@weapp-tailwindcss/merge'
import { createRpxLengthTransform, resolveTransformers, wrapRuntimeAggregator } from '@weapp-tailwindcss/runtime'
import {
  createTV as tailwindVariantsCreateTV,
  cx as tailwindVariantsCx,
  tv as tailwindVariantsTv,
  defaultConfig as upstreamDefaultConfig,
} from 'tailwind-variants'

type TV = UpstreamTV<TVConfig>

const defaultConfig: TVConfig = upstreamDefaultConfig

type TailwindVariantsCn = <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn

type TailwindVariantsComponent = ((props?: unknown) => unknown) & Record<PropertyKey, unknown>

type TailwindVariantsResult<TComponent extends TailwindVariantsComponent> = ReturnType<TComponent>

type TailwindVariantsOptions = Parameters<typeof tailwindVariantsTv>[0]

type TailwindVariantsConfig = TVConfig

function mergeConfigs(...configs: (TVConfig | undefined)[]): TVConfig {
  const baseTwMergeConfig = defaultConfig.twMergeConfig
    ? { ...defaultConfig.twMergeConfig }
    : undefined

  const baseConfig: TVConfig = {
    ...defaultConfig,
    ...(baseTwMergeConfig ? { twMergeConfig: baseTwMergeConfig } : {}),
  }

  return configs.reduce<TVConfig>((acc, config) => {
    if (!config) {
      return acc
    }

    const { twMergeConfig: configTwMergeConfig, ...configRest } = config
    const { twMergeConfig: accTwMergeConfig, ...accRest } = acc

    const nextTwMergeConfig = configTwMergeConfig
      ? {
          ...(accTwMergeConfig ?? {}),
          ...configTwMergeConfig,
        }
      : accTwMergeConfig

    return {
      ...accRest,
      ...configRest,
      ...(nextTwMergeConfig ? { twMergeConfig: nextTwMergeConfig } : {}),
    }
  }, baseConfig)
}

function disableTailwindMerge(config?: TVConfig): TVConfig {
  if (!config) {
    return { twMerge: false }
  }

  const { twMergeConfig: _ignored, ...rest } = config
  return {
    ...rest,
    twMerge: false,
  }
}

function copyComponentMetadata(target: TailwindVariantsComponent, source: TailwindVariantsComponent) {
  const descriptors = Object.getOwnPropertyDescriptors(source)

  Reflect.deleteProperty(descriptors, 'length')
  Reflect.deleteProperty(descriptors, 'name')
  Reflect.deleteProperty(descriptors, 'prototype')

  Object.defineProperties(target, descriptors)
}

function wrapComponent<TComponent extends TailwindVariantsComponent>(
  component: TComponent,
  config: TVConfig,
  mergeClassList: (value: CnReturn, config?: TWMConfig) => CnReturn,
): TComponent {
  const wrapped = ((props?: unknown) => {
    const result = component(props) as TailwindVariantsResult<TComponent>

    if (result == null || typeof result === 'string') {
      return mergeClassList(result as CnReturn, config)
    }

    const slotEntries = Reflect.ownKeys(result) as Array<keyof TailwindVariantsResult<TComponent>>
    const slots: Record<PropertyKey, any> = {}

    for (const key of slotEntries) {
      const slotFn = (result as Record<PropertyKey, any>)[key]
      if (typeof slotFn !== 'function') {
        slots[key] = slotFn
        continue
      }

      slots[key] = (...slotArgs: any[]) => {
        return mergeClassList(slotFn(...slotArgs), config)
      }
    }

    return slots as TailwindVariantsResult<TComponent>
  }) as TComponent

  copyComponentMetadata(wrapped, component)

  return wrapped
}

function createVariantsRuntime(options?: CreateOptions, runtimeConfig?: TVConfig) {
  const transformers = resolveTransformers(options)
  const tailwindMergeRuntime = createMergeRuntime(options)
  const rpxTransform = createRpxLengthTransform()
  const customMergeFns = new WeakMap<TwMergeFn, typeof tailwindMergeRuntime.twMerge>()

  let cachedConfig: TWMConfig['twMergeConfig']
  let cachedMergeFn = tailwindMergeRuntime.twMerge

  const getMergeFn = (config?: TWMConfig) => {
    if (typeof config?.twMerge === 'function') {
      let mergeFn = customMergeFns.get(config.twMerge)
      if (!mergeFn) {
        mergeFn = wrapRuntimeAggregator(
          config.twMerge,
          transformers,
          rpxTransform.prepareValue,
          rpxTransform.restoreValue,
        )
        customMergeFns.set(config.twMerge, mergeFn)
      }
      return mergeFn
    }

    const twMergeConfig = config?.twMergeConfig
    if (!twMergeConfig) {
      return tailwindMergeRuntime.twMerge
    }

    if (twMergeConfig === cachedConfig) {
      return cachedMergeFn
    }

    cachedConfig = twMergeConfig
    cachedMergeFn = tailwindMergeRuntime.extendTailwindMerge(twMergeConfig)
    return cachedMergeFn
  }

  const mergeClassList = (value: CnReturn, config?: TWMConfig): CnReturn => {
    if (!value) {
      return value
    }

    if (config?.twMerge === false) {
      return transformers.escape(value)
    }

    const mergeFn = getMergeFn(config)
    return mergeFn(value)
  }

  const resolveConfig = (...configs: (TVConfig | undefined)[]) => mergeConfigs(runtimeConfig, ...configs)

  const cn: TailwindVariantsCn = (...classes) => {
    const aggregated = tailwindVariantsCx(...classes)

    return (config?: TWMConfig) => mergeClassList(aggregated, resolveConfig(config as TVConfig))
  }

  const cnBase = (...classes: Parameters<typeof tailwindVariantsCx>) => {
    const aggregated = tailwindVariantsCx(...classes)
    return transformers.escape(aggregated)
  }

  const tv = ((options: TailwindVariantsOptions, config?: TailwindVariantsConfig) => {
    const mergedConfig = resolveConfig(config)
    const upstreamConfig = disableTailwindMerge(mergedConfig)
    const component = tailwindVariantsTv(
      options as TailwindVariantsOptions,
      upstreamConfig as TailwindVariantsConfig,
    ) as unknown as TailwindVariantsComponent
    return wrapComponent(component, mergedConfig, mergeClassList)
  }) as unknown as TV

  const createTVRuntime = (configProp?: TVConfig): TV => {
    const mergedBaseConfig = resolveConfig(configProp)
    const tailwindCreate = tailwindVariantsCreateTV(disableTailwindMerge(mergedBaseConfig))

    return ((options: TailwindVariantsOptions, config?: TailwindVariantsConfig) => {
      const mergedConfig = resolveConfig(configProp, config)
      const component = (config
        ? tailwindCreate(
            options as TailwindVariantsOptions,
            disableTailwindMerge(config) as TailwindVariantsConfig,
          )
        : tailwindCreate(options as TailwindVariantsOptions)) as unknown as TailwindVariantsComponent
      return wrapComponent(component, mergedConfig, mergeClassList)
    }) as unknown as TV
  }

  return {
    cnBase,
    cn,
    tv,
    createTV: createTVRuntime,
  }
}

function isRuntimeConfig(value: unknown): value is TVConfig {
  return !!value
    && typeof value === 'object'
    && ('twMerge' in value
      || 'twMergeConfig' in value
      || 'debug' in value
      || 'twMergeAdapter' in value
      || 'responsiveVariants' in value)
}

function create(options?: CreateOptions | TVConfig, config?: TVConfig) {
  if (isRuntimeConfig(options)) {
    return createVariantsRuntime(undefined, options)
  }

  return createVariantsRuntime(options as CreateOptions | undefined, config)
}

const variantsRuntime = create()

const {
  cnBase,
  cn,
  tv,
  createTV,
} = variantsRuntime

export {
  cn,
  cnBase,
  create,
  createTV,
  defaultConfig,
  tv,
}

export type {
  CnOptions,
  CnReturn,
  TV,
  TVConfig,
  TWMConfig,
  TWMergeConfig,
}
export type { VariantProps } from 'tailwind-variants'
