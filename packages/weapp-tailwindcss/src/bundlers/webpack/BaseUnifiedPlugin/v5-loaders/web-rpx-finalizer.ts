import type { NormalModule } from 'webpack'
import fs from 'node:fs'

/** 从右向左执行：等待所有框架 PostCSS，随后在 CSS 消费 loader 前兜底。 */
export function injectWebRpxFinalizer(entries: NormalModule['loaders'], loader: string, runtimeKey: string) {
  if (!fs.existsSync(loader) || entries.some(entry => entry.loader === loader)) {
    return
  }
  const index = entries.findIndex(entry => entry.loader.includes('postcss-loader'))
  if (index < 0) {
    return
  }
  entries.splice(index, 0, {
    loader,
    options: { tailwindcssImportRewriteRuntimeKey: runtimeKey },
    ident: null,
    type: null,
  })
}
