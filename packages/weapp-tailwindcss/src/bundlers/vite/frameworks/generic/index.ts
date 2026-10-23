import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createGenericViteStyleInjector } from '@/style-injector/vite/generic'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'
import { genericViteRuntimeStrategy } from './runtime-strategy'

export function createGenericVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'generic',
    runtimeStrategy: genericViteRuntimeStrategy,
    styleInjectorDelegate: createGenericViteStyleInjector,
  })
}
