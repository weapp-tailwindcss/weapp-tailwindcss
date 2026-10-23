import type { WebpackStyleInjectorDelegateFactory } from '../types'
import { weappStyleInjectorWebpack } from 'weapp-style-injector/webpack'
import { omitUndefined } from '@/utils/object'

export const createGenericWebpackStyleInjector: WebpackStyleInjectorDelegateFactory = options => weappStyleInjectorWebpack(omitUndefined(options))
