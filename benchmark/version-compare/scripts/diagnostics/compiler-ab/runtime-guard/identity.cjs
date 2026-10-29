const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { createHash } = require('node:crypto')

function digest(filename) {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
}

function executableCandidates(command, { cwd, env, platform = process.platform }) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (paths.isAbsolute(command) || paths.basename(command) !== command) return [paths.resolve(cwd, command)]
  const environmentPath = platform === 'win32'
    ? env[Object.keys(env).sort().find(key => key.toLowerCase() === 'path')]
    : env.PATH
  const search = environmentPath ?? (platform === 'win32' ? process.env.PATH ?? process.env.Path ?? '' : '/usr/bin:/bin')
  return search.split(paths.delimiter).flatMap(directory => {
    const candidate = paths.resolve(cwd, directory, command)
    // libuv 的 Windows 无 shell 解析只补充原生可执行扩展名。
    return platform === 'win32' && !paths.extname(command) ? [candidate, `${candidate}.com`, `${candidate}.exe`] : [candidate]
  })
}

function createIdentity() {
  const owners = new Map()
  function filename(value) {
    if (typeof value !== 'string' || value.startsWith('node:')) return undefined
    if (value.startsWith('file:')) return fileURLToPath(value)
    return path.isAbsolute(value) ? value : undefined
  }
  function owner(value) {
    const file = filename(value)
    if (!file) return undefined
    let actual
    try { actual = fs.realpathSync(file) }
    catch { return undefined }
    if (owners.has(actual)) return owners.get(actual)
    let directory = path.dirname(actual)
    let type
    let foundManifest = false
    while (true) {
      const manifest = path.join(directory, 'package.json')
      if (fs.existsSync(manifest)) {
        const data = JSON.parse(fs.readFileSync(manifest, 'utf8'))
        if (!foundManifest) { type = data.type; foundManifest = true }
        // 内部 type-only manifest 不改变模块所属的 npm 包身份。
        if (typeof data.name === 'string') {
          const result = { name: data.name, type, root: directory, file: actual }
          owners.set(actual, result)
          return result
        }
      }
      const parent = path.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    owners.set(actual, undefined)
    return undefined
  }
  return { filename, owner }
}

module.exports = { createIdentity, digest, executableCandidates }
