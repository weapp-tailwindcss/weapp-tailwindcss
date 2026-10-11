import type { ViteCapabilityProfile } from '../capability-profile'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'

/** 适配器之间传递的启动信息，不属于用户公开配置。 */
export type ViteFrameworkRuntimeOptions = (UserDefinedOptions | InternalUserDefinedOptions) & {
  __internalViteCapabilityProfile?: ViteCapabilityProfile | undefined
  __internalViteRawOptions?: UserDefinedOptions | undefined
  __internalViteRawExplicitAppType?: boolean | undefined
  __internalViteRawExplicitTailwindcssBasedir?: boolean | undefined
  __internalViteRawExplicitGeneratorTarget?: boolean | undefined
}

export function sameStringList(first?: readonly string[], second?: readonly string[]) {
  if (first === second) {
    return true
  }
  if (!first || !second || first.length !== second.length) {
    return false
  }
  return first.every((item, index) => item === second[index])
}
