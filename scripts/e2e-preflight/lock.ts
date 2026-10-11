import { createHash } from 'node:crypto'
import { open, readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export async function acquireLock(runId: string, directory = os.tmpdir()) {
  const user = createHash('sha256').update(os.userInfo().username).digest('hex').slice(0, 16)
  const file = path.join(directory, `weapp-full-preflight-${user}.lock`)
  const handle = await open(file, 'wx').catch(async () => {
    const owner = await readFile(file, 'utf8').catch(() => '未知')
    throw new Error(`另一预检或测试会话占用本机工具；不自动接管。锁=${file}，所有者=${owner}`)
  })
  await handle.writeFile(JSON.stringify({ runId, pid: process.pid, createdAt: new Date().toISOString() }))
  await handle.close()
  return async () => {
    const owner = JSON.parse(await readFile(file, 'utf8'))
    if (owner.runId !== runId || owner.pid !== process.pid) {
      throw new Error('锁所有者改变，拒绝清理其他会话。')
    }
    await unlink(file)
  }
}
