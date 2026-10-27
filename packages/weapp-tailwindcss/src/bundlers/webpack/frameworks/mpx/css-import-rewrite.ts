import type { WebpackCssImportRewriteExtension } from '../../shared/css-import-rewrite'
import { ensureMpxTailwindcssAliases, injectMpxCssRewritePreRules, patchMpxLoaderResolve } from './runtime'

export const mpxCssImportRewrite: WebpackCssImportRewriteExtension = {
  configureCompiler(compiler, packageDir) {
    ensureMpxTailwindcssAliases(compiler, packageDir)
  },
  configureRules(compiler, loader, options) {
    // 在框架读取样式前完成 Tailwind 入口重写。
    injectMpxCssRewritePreRules(compiler, loader, options)
  },
  configureLoader(context, packageDir) {
    patchMpxLoaderResolve(context, packageDir, true)
  },
}
