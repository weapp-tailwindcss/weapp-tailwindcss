import { createReadStream, createWriteStream } from 'node:fs'
import { cp, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

export async function snapshotOutput(source, destination) {
  await mkdir(destination, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const input = path.join(source, entry.name)
    const output = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      await snapshotOutput(input, output)
    }
    else if (entry.isFile()) {
      // Windows CopyFileW 会排斥源文件写入；普通读取句柄允许编译器继续写入或替换产物。
      await pipeline(createReadStream(input), createWriteStream(output))
    }
    else if (entry.isSymbolicLink()) {
      // 只复制链接本身，不通过 CopyFileW 读取其目标文件。
      await cp(input, output, { dereference: false })
    }
    else {
      throw new Error(`Unsupported build output: ${input}`)
    }
  }
}
