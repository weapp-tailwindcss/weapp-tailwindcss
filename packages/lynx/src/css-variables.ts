interface EncodeArguments {
  encodeData: { sourceContent: { config: Record<string, unknown> } }
}

export interface LynxTemplatePluginApi {
  getLynxTemplatePluginHooks: (compilation: unknown) => {
    beforeEncode: { tap: (name: string, handler: (args: EncodeArguments) => EncodeArguments) => void }
  }
}

interface Compiler {
  hooks: { thisCompilation: { tap: (name: string, handler: (compilation: unknown) => void) => void } }
}

/** 通过模板编码生命周期启用原生递归变量解析，保留显式配置及动态依赖。 */
export class LynxCssVariablesPlugin {
  constructor(private readonly templatePlugin: LynxTemplatePluginApi) {}

  apply(compiler: Compiler) {
    const name = 'weapp-tailwindcss:lynx-css-variables'
    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      const hooks = this.templatePlugin.getLynxTemplatePluginHooks(compilation)
      hooks.beforeEncode.tap(name, (args) => {
        const config = args.encodeData.sourceContent.config
        if (config.enableCSSInlineVariables === undefined) {
          config.enableCSSInlineVariables = true
        }
        return args
      })
    })
  }
}
