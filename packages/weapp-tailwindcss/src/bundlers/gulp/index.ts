import type { UserDefinedOptions } from '@/types'
import { createNativeGulpFrameworkPlugins } from './frameworks/native'

/**
 * @name weapp-tw-gulp
 * @description Gulp 入口直接创建 native framework，具体 stream 组合由 frameworks/native 拥有。
 * @link https://tw.weapp.dev/docs/quick-start/frameworks/native
 */
export function createPlugins(options: UserDefinedOptions = {}) {
  return createNativeGulpFrameworkPlugins(options)
}
