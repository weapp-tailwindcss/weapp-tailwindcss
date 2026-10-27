import type { WebpackStyleInjectorDelegateFactory } from '../types'
import { StyleInjector } from 'weapp-style-injector/webpack/taro'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'

export const createTaroWebpackStyleInjector: WebpackStyleInjectorDelegateFactory = options => StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'appConfigPath') }))
