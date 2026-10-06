import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface NativeHost {
  path: string
  host?: string
  version?: string
}

/** realpath 之后仅在 Windows 折叠文件系统大小写；不把 URL/module id 作为路径。 */
export function normalizeNativePath(value: string, cwd: string, windows = process.platform === 'win32') {
  const api = windows ? path.win32 : path.posix
  const result = api.resolve(cwd, value)
  return windows ? result.toLowerCase() : result
}

async function canonical(value: string) {
  return normalizeNativePath(await fs.realpath(value), process.cwd())
}

/** 工作树的 .git 文件与 commondir 均按各自所在目录解析。 */
export async function nativeRegistryRoot(projectRoot: string) {
  let directory = await canonical(projectRoot)
  while (true) {
    const marker = path.join(directory, '.git')
    try {
      const stat = await fs.stat(marker)
      let gitDirectory: string
      if (stat.isDirectory()) {
        gitDirectory = await canonical(marker)
      }
      else {
        const match = /^gitdir: ([^\r\n]+)\r?\n?$/u.exec(await fs.readFile(marker, 'utf8'))
        if (!match?.[1]) {
          throw new Error(`无法解析 Git 工作树标记：${marker}`)
        }
        gitDirectory = await canonical(path.resolve(directory, match[1]))
      }
      let common = gitDirectory
      let value: string | undefined
      try {
        value = (await fs.readFile(path.join(gitDirectory, 'commondir'), 'utf8')).trim()
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        if (await fs.lstat(path.join(gitDirectory, 'commondir')).then(() => true, (error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false
          }
          throw error
        })) {
          throw new Error(`无法解析 Git common dir：${gitDirectory}`, { cause: error })
        }
      }
      if (value !== undefined) {
        if (!value || /[\r\n]/u.test(value)) {
          throw new Error(`无法解析 Git common dir：${gitDirectory}`)
        }
        common = await canonical(path.resolve(gitDirectory, value))
      }
      else if (await fs.lstat(path.join(gitDirectory, 'gitdir')).then(() => true, (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false
        }
        throw error
      })) {
        throw new Error(`关联 Git 工作树缺少 commondir，禁止改用私有登记：${gitDirectory}`)
      }
      return path.join(common, 'weapp-tailwindcss-native-sessions', 'v1')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`原生会话持久目录不可解析：${marker}`, { cause: error })
      }
      // 已存在但指向缺失位置的工作树标记不能回退到父仓库。
      if (await fs.lstat(marker).then(() => true, (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false
        }
        throw error
      })) {
        throw new Error(`原生会话持久目录不可解析：${marker}`, { cause: error })
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`原生会话需要可解析的 Git common dir：${projectRoot}`)
    }
    directory = parent
  }
}

export async function nativeHostIdentity(host: NativeHost) {
  if (!host.path || !host.host?.trim()) {
    throw new Error('原生会话需要明确的 HBuilderX 安装路径与 host。')
  }
  return { installation: await canonical(host.path), host: host.host, machine: os.hostname(), platform: process.platform }
}

export function nativeHostKey(identity: Awaited<ReturnType<typeof nativeHostIdentity>>) {
  return createHash('sha256').update(JSON.stringify([identity.installation, identity.host, identity.machine, identity.platform])).digest('hex')
}
