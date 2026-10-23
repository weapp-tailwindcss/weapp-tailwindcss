import type { ViteStyleInjectorDelegateFactory } from '../types'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'
import { toPluginArray } from './plugins'

export const createUniViteStyleInjector: ViteStyleInjectorDelegateFactory = options => toPluginArray(StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'pagesJsonPath') })))
