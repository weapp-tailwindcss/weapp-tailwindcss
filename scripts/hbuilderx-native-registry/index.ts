import type { NativeHost } from './identity'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { nativeHostIdentity, nativeHostKey, nativeRegistryRoot } from './identity'

interface Registration {
  schema: 'hbuilderx-native-session/v1'
  sessionId: string
  identity: Awaited<ReturnType<typeof nativeHostIdentity>>
  projectRoot: string
  directory: string
  pid: number
  createdAt: string
}

function unresolved(directory: string, cause?: unknown) {
  return new Error(`HBuilderX 原生会话未解除；禁止后续原生调度。持久登记：${directory}`, { cause })
}

async function readRegistration(directory: string): Promise<Registration> {
  try {
    const record = JSON.parse(await fs.readFile(path.join(directory, 'registration.json'), 'utf8')) as Registration
    if (record.schema !== 'hbuilderx-native-session/v1' || typeof record.sessionId !== 'string' || !record.sessionId
      || typeof record.projectRoot !== 'string' || !path.isAbsolute(record.projectRoot)
      || typeof record.directory !== 'string' || !path.isAbsolute(record.directory)
      || !Number.isSafeInteger(record.pid) || typeof record.createdAt !== 'string'
      || typeof record.identity?.installation !== 'string' || !path.isAbsolute(record.identity.installation)
      || typeof record.identity.host !== 'string' || !record.identity.host
      || typeof record.identity.machine !== 'string' || !record.identity.machine
      || typeof record.identity.platform !== 'string' || !record.identity.platform
      || nativeHostKey(record.identity) !== path.basename(directory)) {
      throw new Error('原生会话登记损坏或身份不匹配。')
    }
    return record
  }
  catch (error) {
    throw unresolved(directory, error)
  }
}

/** 预检只读共享 Git 目录；损坏、active 与 blocked 均不能自动回收。 */
export async function assertNativeSessionsAvailable(projectRoot: string, host: NativeHost) {
  const root = await nativeRegistryRoot(projectRoot)
  const identity = await nativeHostIdentity(host)
  const entries = await fs.readdir(root).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' && !await fs.lstat(root).then(() => true, (failure) => {
      if ((failure as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw failure
    })) {
      return []
    }
    throw new Error(`原生会话持久目录不可读取：${root}`, { cause: error })
  })
  for (const entry of entries) {
    const directory = path.join(root, entry)
    const record = await readRegistration(directory)
    if (nativeHostKey(record.identity) === nativeHostKey(identity)) {
      throw unresolved(directory)
    }
  }
}

/** mkdir 为同一安装、机器及 host 提供原子领取；项目身份写入登记但不能换项目绕过。 */
export async function claimNativeSession(options: { projectRoot: string, host: NativeHost, sessionId: string, directory: string }) {
  await assertNativeSessionsAvailable(options.projectRoot, options.host)
  const root = await nativeRegistryRoot(options.projectRoot)
  const identity = await nativeHostIdentity(options.host)
  const directory = path.join(root, nativeHostKey(identity))
  const record: Registration = {
    schema: 'hbuilderx-native-session/v1',
    sessionId: options.sessionId,
    identity,
    projectRoot: await fs.realpath(options.projectRoot),
    directory: path.resolve(options.directory),
    pid: process.pid,
    createdAt: new Date().toISOString(),
  }
  try {
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(directory)
  }
  catch (error) {
    throw unresolved(directory, error)
  }
  // 若登记落盘失败，保留已领取目录并 fail closed，不制造看似可用的空闲状态。
  await fs.writeFile(path.join(directory, 'registration.json'), JSON.stringify(record, null, 2), { flag: 'wx' })
  let released = false
  const assertOwner = async () => {
    if (released || (await readRegistration(directory)).sessionId !== options.sessionId) {
      throw unresolved(directory, new Error('当前会话已释放或不再拥有登记。'))
    }
  }
  return {
    directory,
    assertOwner,
    async block(reason: string) {
      await assertOwner()
      await fs.writeFile(path.join(directory, 'blocked.json'), JSON.stringify({ sessionId: options.sessionId, reason }, null, 2), { flag: 'wx' })
    },
    async release() {
      await assertOwner()
      // 领取者只有在目录移除后才可能出现，删除前逐项核对自己的登记。
      const entries = await fs.readdir(directory)
      if (entries.length !== 1 || entries[0] !== 'registration.json') {
        throw unresolved(directory, new Error('会话包含阻塞或未知登记，不能释放。'))
      }
      await fs.unlink(path.join(directory, 'registration.json'))
      await fs.rmdir(directory)
      released = true
    },
  }
}
