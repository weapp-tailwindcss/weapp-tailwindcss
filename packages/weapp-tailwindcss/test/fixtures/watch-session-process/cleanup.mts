import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readProcessSubset } from '../../../../../scripts/demo-e2e-workflow/process-table'
/** fixture 只用本轮 UUID 文件请求自行退出；查询失败或元数据缺失都不能算空集。 */
export async function cleanupFixture(directory: string, token: string, requestCleanup: boolean, rootClosed?: () => boolean) {
  const errors: string[] = []
  const result = { verified: false, errors, pids: [] as number[], live: [] as number[] }
  if (requestCleanup) {
    try {
      await writeFile(path.join(directory, 'cleanup'), token)
    }
    catch (error) {
      errors.push(String(error))
    }
  }
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    let complete = true
    const pids: number[] = []
    for (const name of ['spawned', 'root', 'worker']) {
      try {
        const value = JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8'))
        if (value.token !== token || !Number.isInteger(value.pid) || value.pid <= 0) {
          throw new Error(`invalid ${name} identity`)
        }
        pids.push(value.pid)
      }
      catch (error) {
        complete = false
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          errors.push(String(error))
          return result
        }
      }
    }
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
      if (manifest.token !== token || !Array.isArray(manifest.registered)) {
        throw new Error('invalid ownership manifest')
      }
      pids.push(...manifest.registered.map((row: { pid: number }) => row.pid))
    }
    catch (error) {
      complete = false
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push(String(error))
        return result
      }
    }
    result.pids = pids
    if (complete) {
      try {
        result.live = (await readProcessSubset(undefined, pids, 1000)).filter(row => !row.zombie).map(row => row.pid)
      }
      catch (error) {
        errors.push(String(error))
        return result
      }
      if (!result.live.length && (!rootClosed || rootClosed())) {
        result.verified = true
        return result
      }
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  errors.push('fixture metadata or process exit not confirmed within cleanup deadline')
  return result
}
