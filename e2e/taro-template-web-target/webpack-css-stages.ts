import type { Compiler, Configuration } from 'webpack'
import type { WebpackPluginInstance } from './template-config'

export function createWebpackCssCompilation(webpack: typeof import('webpack'), plugins: WebpackPluginInstance[], options: Configuration = {}) {
  const compiler = webpack({ mode: 'none', ...options })
  // 配置隔离在 VM 中执行；直接调用真实 apply，避免 Webpack schema 的跨 realm instanceof 检查。
  for (const plugin of plugins) {
    plugin.apply(compiler)
  }
  const compilation = compiler.newCompilation(compiler.newCompilationParams())
  return { compiler, compilation }
}

export async function closeWebpackCompiler(compiler: Compiler) {
  await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
}

// 仅验证真实 hook 调度与资产边界；完整 Taro 构建由独立复制模板矩阵覆盖。
export async function runWebpackCssStages(webpack: typeof import('webpack'), plugins: WebpackPluginInstance[], generatedCss: string) {
  const { compiler, compilation } = createWebpackCssCompilation(webpack, plugins)
  const assetName = 'assets/generated.css'
  try {
    compilation.hooks.processAssets.tap({
      name: 'TemplateGeneratedCssFixture',
      stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
    }, () => {
      compilation.emitAsset(assetName, new webpack.sources.RawSource(generatedCss))
    })
    await compilation.hooks.processAssets.promise(compilation.assets)
    return compilation.getAsset(assetName)!.source.source().toString()
  }
  finally {
    await closeWebpackCompiler(compiler)
  }
}
