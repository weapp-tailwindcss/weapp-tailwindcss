import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

export function exactIdentity(stats) {
  assert.equal(typeof stats.dev, 'bigint', '设备身份必须使用 BigInt')
  assert.equal(typeof stats.ino, 'bigint', '文件身份必须使用 BigInt')
  assert.ok(stats.ino > 0n, '文件系统没有提供有效 inode，不能验证监听身份')
  return { dev: stats.dev.toString(), ino: stats.ino.toString() }
}

export function captureIdentity(file) {
  const exact = exactIdentity(fs.statSync(file, { bigint: true }))
  const numeric = fs.statSync(file)
  return { exact, numeric: { dev: numeric.dev, ino: numeric.ino, inoSafe: Number.isSafeInteger(numeric.ino) }, mode: numeric.mode }
}

export function assertPublishedIdentity(previous, staged, published) {
  if (previous) {
    assert.notDeepEqual(previous, staged, '同时存在的新旧文件必须具有不同的精确身份')
  }
  assert.deepEqual(published, staged, '发布后的目标必须仍为已核对的临时文件')
}

export async function publishDistinctSourceFile(file, content) {
  let previous
  try {
    previous = captureIdentity(file)
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: previous?.mode })
    const staged = captureIdentity(temporary)
    if (previous) {
      assert.notDeepEqual(previous.exact, staged.exact, '新文件尚未发布时必须与旧文件可区分')
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, file)
        break
      }
      catch (error) {
        // 与矩阵发布器保持相同的 Windows 句柄冲突预算，不重建或替换临时文件。
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) {
          throw error
        }
        await setTimeout(100)
      }
    }
    const published = captureIdentity(file)
    assertPublishedIdentity(previous?.exact, staged.exact, published.exact)
    return { previous, staged, published }
  }
  finally {
    await rm(temporary, { force: true })
  }
}
