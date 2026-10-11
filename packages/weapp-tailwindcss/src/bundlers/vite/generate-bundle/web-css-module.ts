import { replaceViteGeneratedCssModule } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '../../shared/module-graph'

export function replaceWebCssModule(source: string, sourceFile: string, generated: string) {
  const sourceKey = normalizeOutputPathKey(sourceFile.replace(/[?#].*$/, ''))
  return replaceViteGeneratedCssModule(source, generated, file => normalizeOutputPathKey(file) === sourceKey)
}
