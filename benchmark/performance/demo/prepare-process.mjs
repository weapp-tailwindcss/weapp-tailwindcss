import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deserialize } from 'node:v8'
import { run } from './process.mjs'

export async function prepareIsolated(item, published, directory, logs, { worker = new URL('./prepare-worker.mjs', import.meta.url), timeout = 3_600_000 } = {}) {
  await mkdir(logs, { recursive: true })
  const request = path.join(directory, 'prepare-request.json')
  const response = path.join(directory, 'prepare-response.bin')
  await writeFile(request, JSON.stringify({ item, published, directory, logs, response }))
  // 发布编译器及原生扩展只在子进程加载；必须等退出后才能删除或重装消费项目。
  await run(process.execPath, [fileURLToPath(worker), request], { logFile: path.join(logs, 'prepare-process.log'), timeout })
  return deserialize(await readFile(response))
}
