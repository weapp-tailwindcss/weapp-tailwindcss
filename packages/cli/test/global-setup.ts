import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function isReadable(file: string) {
  try {
    await access(file, constants.R_OK)
    return true
  }
  catch {
    return false
  }
}

export default async function setup() {
  const outputs = [
    path.join(packageRoot, 'dist/bin.cjs'),
    path.join(packageRoot, 'dist/index.js'),
  ]
  if ((await Promise.all(outputs.map(isReadable))).every(Boolean)) {
    return
  }

  // 根级 Vitest 分片不会执行包级 test 脚本，需要在干净工作区补齐子进程测试依赖的产物。
  await build({ cwd: packageRoot })
}
