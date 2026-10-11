import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseAsync } from '@babel/core'
import { relativeSpecifier } from './configs.mjs'

export function scriptSidecarOwner(project, styleFile, sourceFiles, paths = path) {
  const style = paths.parse(paths.resolve(project, styleFile))
  const owners = sourceFiles.map(file => paths.resolve(project, file)).filter(file => {
    const source = paths.parse(file)
    return /^\.[jt]sx?$/.test(source.ext) && source.dir === style.dir && source.name === style.name
  })
  assert.equal(owners.length, 1, `注入 sidecar 缺少唯一脚本源码归属：${styleFile}`)
  return owners[0]
}

export async function connectScriptSidecar(result, project, styleFile, sourceFiles) {
  const file = scriptSidecarOwner(project, styleFile, sourceFiles)
  const relative = path.relative(project, file)
  const source = result.get(relative) ?? await readFile(file, 'utf8')
  const ast = await parseAsync(source, { filename: file, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] } })
  const imported = ast.program.body.some(node => node.type === 'ImportDeclaration' && path.resolve(path.dirname(file), node.source.value) === styleFile)
  if (!imported) result.set(relative, `import ${JSON.stringify(relativeSpecifier(file, styleFile))}\n${source}`)
}
