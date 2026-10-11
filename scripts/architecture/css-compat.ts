import fs from 'node:fs'
import path from 'node:path'
import { readImports } from './imports'
import { inside, sourceFiles } from './workspace'

const allowed = new Set(['postcss', '@csstools/css-tokenizer', '@csstools/selector-specificity', 'postcss-selector-parser', 'postcss-value-parser'])

/** 对轻量内核检查安装边界和生产源码；开发期生成器不进入此闭包。 */
export function auditCssCompat(root: string): string[] {
  const directory = path.join(root, 'packages', 'css-compat')
  const manifestFile = path.join(directory, 'package.json')
  if (!fs.existsSync(manifestFile)) {
    return []
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const errors: string[] = []
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
    if (!allowed.has(name)) {
      errors.push(`css-compat 安装边界违规：${name}`)
    }
  }
  for (const file of sourceFiles(path.join(directory, 'src'))) {
    for (const edge of readImports(file, fs.readFileSync(file, 'utf8'))) {
      if (edge.specifier.startsWith('.')) {
        if (!inside(directory, path.resolve(path.dirname(file), edge.specifier))) {
          errors.push(`css-compat 源码越界：${path.relative(root, file)} -> ${edge.specifier}`)
        }
      }
      else if (!allowed.has(edge.specifier)) {
        errors.push(`css-compat 源码依赖违规：${path.relative(root, file)} -> ${edge.specifier}`)
      }
    }
  }
  return errors
}
