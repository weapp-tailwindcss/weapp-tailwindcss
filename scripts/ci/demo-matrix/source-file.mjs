import { randomUUID } from 'node:crypto'
import { rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

async function publishSourceFile(temporary, file) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, file)
      return
    }
    catch (error) {
      if (os.platform() !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) {
        throw error
      }
      // Windows 读取句柄可能短暂阻止替换；保留旧源码和同一份完整临时文件。
      await setTimeout(100)
    }
  }
}

export async function replaceSourceFile(file, content) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  const mode = await stat(file).then(info => info.mode, (error) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
  })
  try {
    // watcher 只能观察完整源码，不能读到 writeFile 截断后的中间状态。
    await writeFile(temporary, content, { flag: 'wx', mode })
    await publishSourceFile(temporary, file)
  }
  finally {
    await rm(temporary, { force: true })
  }
}
