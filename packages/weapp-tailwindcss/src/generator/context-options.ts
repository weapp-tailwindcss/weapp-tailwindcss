import type { UserDefinedOptions } from '@/types'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { resolveGeneratorConfiguration } from './options'

/** 内部编译入口复用实例环境，显式配置与阶段覆盖继续在调用时生效。 */
export function resolveContextGeneratorConfiguration(
  options: Pick<UserDefinedOptions, 'appType' | 'generator' | 'platform' | 'cssOptions' | 'uniAppX'>,
  context: Parameters<typeof resolveGeneratorConfiguration>[1] = {},
) {
  return resolveGeneratorConfiguration(options.generator, {
    appType: options.appType,
    platform: context && Object.hasOwn(context, 'platform') ? context.platform : options.cssOptions?.platform ?? options.platform,
    uniAppX: options.uniAppX,
    ...context,
  }, resolveFrameworkEnvironment(options))
}
