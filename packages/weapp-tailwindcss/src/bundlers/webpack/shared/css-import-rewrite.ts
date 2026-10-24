import type { Compiler, LoaderContext } from 'webpack'

/** 框架在共享 CSS loader 安装阶段提供的定向扩展。 */
export interface WebpackCssImportRewriteExtension {
  configureCompiler?: (compiler: Compiler, packageDir: string) => void
  configureRules?: (compiler: Compiler, loader: string, options: {
    generateCss: boolean
    tailwindcssImportRewriteRuntimeKey: string
  }) => void
  configureLoader?: (context: LoaderContext<unknown>, packageDir: string) => void
}
