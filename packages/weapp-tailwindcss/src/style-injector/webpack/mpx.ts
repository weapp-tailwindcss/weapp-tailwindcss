import type { WebpackStyleInjectorDelegateFactory } from '../types'
import { StyleInjector } from 'weapp-style-injector/webpack/mpx'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'

export const createMpxWebpackStyleInjector: WebpackStyleInjectorDelegateFactory = options => StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'appPath') }))
