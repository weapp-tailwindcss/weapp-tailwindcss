import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { relativeSpecifier } from './configs.mjs'
import { sfcBlocks } from './sfc.mjs'

export function mpxSidecarOwner(project, styleFile, sourceFiles, paths = path) {
  const style = paths.parse(paths.resolve(project, styleFile))
  // 发布版作用域给出 sidecar；从已登记源码中核对同名 Mpx 组件，不推导未知目录。
  const owners = sourceFiles.map(file => paths.resolve(project, file)).filter(file => {
    const source = paths.parse(file)
    return source.ext === '.mpx' && source.dir === style.dir && source.name === style.name
  })
  assert.equal(owners.length, 1, `注入 sidecar 缺少唯一 Mpx 源码归属：${styleFile}`)
  return owners[0]
}

export async function connectMpxSidecar(result, project, styleFile, sourceFiles) {
  const file = mpxSidecarOwner(project, styleFile, sourceFiles)
  const relative = path.relative(project, file)
  const source = result.get(relative) ?? await readFile(file, 'utf8')
  const imported = sfcBlocks(source, file).some(block => block.type === 'style' && typeof block.attrs.src === 'string' && path.resolve(path.dirname(file), block.attrs.src) === styleFile)
  if (!imported) result.set(relative, `${source}\n<style src=${JSON.stringify(relativeSpecifier(file, styleFile))}></style>\n`)
}
