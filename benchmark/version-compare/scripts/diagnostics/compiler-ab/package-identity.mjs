import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const sha256 = value => createHash('sha256').update(value).digest('hex')

export async function fileSha256(file) {
  const digest = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

export function readPackage(from, name, expectedName = name) {
  const require = createRequire(path.join(from, 'package.json'))
  let file
  try { file = require.resolve(`${name}/package.json`) }
  catch {
    // exports-only 数据包可能没有入口；仅沿 Node 给出的模块搜索边界读取 manifest。
    file = require.resolve.paths(name)?.map(directory => path.join(directory, name, 'package.json')).find(candidate => fs.existsSync(candidate))
    let directory = file ? path.dirname(file) : path.dirname(require.resolve(name))
    for (;;) {
      const candidate = path.join(directory, 'package.json')
      if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate, 'utf8')).name === expectedName) {
        file = candidate
        break
      }
      const parent = path.dirname(directory)
      assert.notEqual(parent, directory, `无法定位依赖 manifest：${name}`)
      directory = parent
    }
  }
  const realFile = fs.realpathSync(file)
  const manifest = JSON.parse(fs.readFileSync(realFile, 'utf8'))
  assert.equal(manifest.name, expectedName, `依赖 manifest 身份不符：${name}`)
  return { name: manifest.name, version: manifest.version, directory: path.dirname(realFile), manifestSha256: sha256(fs.readFileSync(realFile)) }
}
