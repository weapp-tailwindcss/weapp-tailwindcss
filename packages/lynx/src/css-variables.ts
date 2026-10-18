import type { LynxDiagnosticsOptions } from './diagnostics'
import { createLynxDiagnosticsReport, formatLynxDiagnosticsSummary, hasStrictLynxDiagnosticFailure } from './diagnostics'

interface EncodeArguments {
  encodeData: { sourceContent: { config: Record<string, unknown> } }
}

interface BeforeEmitArguments {
  finalEncodeOptions: { css?: unknown, compilerOptions?: Record<string, string | boolean> }
  cssDiagnostics?: string | undefined
}

export interface LynxTemplatePluginApi {
  getLynxTemplatePluginHooks: (compilation: unknown) => {
    beforeEncode: { tap: (name: string, handler: (args: EncodeArguments) => EncodeArguments) => void }
    beforeEmit?: { tap: (name: string, handler: (args: BeforeEmitArguments) => BeforeEmitArguments) => void }
  }
}

interface Compiler {
  hooks: { thisCompilation: { tap: (name: string, handler: (compilation: unknown) => void) => void } }
}

/** 通过模板编码生命周期启用原生递归变量解析，保留显式配置及动态依赖。 */
export class LynxCssVariablesPlugin {
  constructor(
    private readonly templatePlugin: LynxTemplatePluginApi,
    private readonly diagnostics: LynxDiagnosticsOptions = {},
  ) {}

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
      hooks.beforeEmit?.tap(name, (args) => {
        const report = createLynxDiagnosticsReport(
          args.cssDiagnostics,
          args.finalEncodeOptions.css,
          this.diagnostics,
          args.finalEncodeOptions.compilerOptions,
        )
        this.diagnostics.onReport?.(report)
        if (report.diagnostics.length > 0) {
          const target = compilation as { warnings?: unknown[], errors?: unknown[] }
          const summary = new Error(formatLynxDiagnosticsSummary(report))
          if (hasStrictLynxDiagnosticFailure(report, this.diagnostics)) {
            target.errors?.push(summary)
          }
          else {
            target.warnings?.push(summary)
          }
        }
        return args
      })
    })
  }
}
