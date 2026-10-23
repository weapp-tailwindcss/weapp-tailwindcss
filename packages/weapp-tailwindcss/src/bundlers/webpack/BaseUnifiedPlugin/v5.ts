// webpack 5
import type { Compiler } from 'webpack'
import type { AppType, IBaseWebpackPlugin, InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createCompilerContext } from '@/context'
import { requireFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { resolveWebpackFrameworkProfile } from '../../framework-selector'
import { createWebpackFrameworkPlugin } from '../frameworks'

export { weappTailwindcssPackageDir } from '../shared/create-framework-plugin'

/**
 * @name WeappTailwindcss
 * @description Webpack 入口只负责早期识别框架分支，具体 hook 由 framework 目录下的插件拥有。
 * @link https://tw.weapp.dev/docs/intro
 */
export class WeappTailwindcss implements IBaseWebpackPlugin {
  options: InternalUserDefinedOptions
  appType: AppType | undefined
  private readonly sourceOptions: UserDefinedOptions
  private applied = false

  constructor(options: UserDefinedOptions = {}) {
    this.sourceOptions = { ...options }
    this.options = createCompilerContext({
      ...options,
      __internalDeferMissingCssEntriesWarning: true,
    } as UserDefinedOptions)
    this.appType = this.options.appType
  }

  apply(compiler: Compiler) {
    if (this.applied) {
      this.options = createCompilerContext({ ...this.sourceOptions, __internalDeferMissingCssEntriesWarning: true } as UserDefinedOptions)
      this.appType = this.options.appType
    }
    this.applied = true
    const profile = resolveWebpackFrameworkProfile({
      appType: this.appType,
      detectEnv: true,
      env: requireFrameworkEnvironment(this.options).values,
      root: compiler.options?.context ?? compiler.context,
      uniAppX: this.options.uniAppX,
    })
    const plugin = createWebpackFrameworkPlugin(profile.frameworkName, this.options)
    plugin.apply(compiler)
    this.options = plugin.options
    this.appType = plugin.appType
  }
}
