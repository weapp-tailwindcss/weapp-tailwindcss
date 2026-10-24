import type { WebpackStyleInjectorDelegateFactory } from '../types'
import { StyleInjector } from 'weapp-style-injector/webpack/uni-app'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'

export const createUniAppWebpackStyleInjector: WebpackStyleInjectorDelegateFactory = options => StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'pagesJsonPath') }))
