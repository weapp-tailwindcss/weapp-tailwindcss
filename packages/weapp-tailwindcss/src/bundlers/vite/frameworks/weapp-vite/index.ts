import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createGenericViteStyleInjector } from '@/style-injector/vite/generic'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'

export function createWeappVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'weapp-vite',
    runtimeStrategy: { splitGenerateBundlePhases: facts => facts?.mode !== 'production' },
    styleInjectorDelegate: createGenericViteStyleInjector,
  })
}
