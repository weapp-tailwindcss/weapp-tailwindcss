import fs from 'node:fs'
import path from 'node:path'

interface FileIdentity {
  path: string
  inode?: string | undefined
}

/** 按文件系统路径语义解析，不把 Windows 路径当作 POSIX 路径拼接。 */
export function resolveFilePath(file: string, cwd: string, paths = path) {
  return paths.resolve(cwd, file)
}

function identify(file: string): FileIdentity {
  const absolute = path.resolve(file)
  let existing = absolute
  const missing: string[] = []
  while (true) {
    try {
      const canonical = fs.realpathSync.native(existing)
      const stat = missing.length ? undefined : fs.statSync(existing, { bigint: true })
      return {
        path: path.join(canonical, ...missing),
        inode: stat?.ino ? `${stat.dev}:${stat.ino}` : undefined,
      }
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error
      }
      const parent = path.dirname(existing)
      if (parent === existing) {
        throw error
      }
      missing.unshift(path.basename(existing))
      existing = parent
    }
  }
}

function identical(left: FileIdentity, right: FileIdentity) {
  return left.path === right.path || Boolean(left.inode && left.inode === right.inode)
}

export function validateBuildPaths(options: { input?: string | undefined, output?: string | undefined, map: boolean | string }) {
  const entries = [
    ['input', options.input],
    ['output', options.output],
    ['map', typeof options.map === 'string' ? options.map : undefined],
  ].filter((entry): entry is [string, string] => Boolean(entry[1] && entry[1] !== '-'))
  const files = entries.map(([name, file]) => ({ name, file, identity: identify(file) }))
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      if (identical(files[i]!.identity, files[j]!.identity)) {
        throw new Error(`Specified ${files[i]!.name} and ${files[j]!.name} files are identical: ${files[j]!.file}`)
      }
    }
  }
}

/** 每次匹配重新解析身份，兼容尚未创建的产物及后续替换的符号链接。 */
export function isBuildOutput(file: string, outputs: readonly string[]) {
  if (!outputs.length) {
    return false
  }
  const absolute = path.resolve(file)
  if (outputs.some(output => path.resolve(output) === absolute)) {
    return true
  }
  const identity = identify(file)
  return outputs.some(output => identical(identity, identify(output)))
}
