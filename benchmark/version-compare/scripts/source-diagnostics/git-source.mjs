import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileReceipt, fromLogical, inside, limits, logical, readBounded, sha256, unsafePathCharacters, walkFiles, writeJson } from './files.mjs'
import { assertEmptyGitlinks } from './gitlinks.mjs'

export function assertCommit(commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('来源必须为完整、小写的 40 位 commit SHA')
  }
}
export async function readGitIdentity(run, repository, commit) {
  assertCommit(commit)
  const actual = (await run('commit', 'git', ['rev-parse', '--verify', `${commit}^{commit}`], repository)).stdout.trim()
  if (actual !== commit) {
    throw new Error('准确 commit 身份不匹配')
  }
  const tree = (await run('tree', 'git', ['show', '-s', '--format=%T', commit], repository)).stdout.trim()
  const objectFormat = (await run('object-format', 'git', ['rev-parse', '--show-object-format'], repository)).stdout.trim()
  if (!/^[a-f0-9]{40}$/.test(tree) || objectFormat !== 'sha1') {
    throw new Error('本版仅接受明确 SHA1 commit/tree 仓库')
  }
  const raw = (await run('ls-tree', 'git', ['ls-tree', '-rz', '--full-tree', commit], repository, {
    stdoutLimit: limits.manifestBytes,
  })).stdout
  const files = []
  const gitlinks = []
  for (const row of raw.split('\0').filter(Boolean)) {
    const match = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(row)
    if (!match || (match[1] === '160000') !== (match[2] === 'commit')) {
      throw new Error('不支持的 Git tree mode/type 组合')
    }
    const entry = { logical: logical(match[4]), mode: match[1] }
    if (entry.mode === '160000') {
      gitlinks.push({ ...entry, gitCommit: match[3] })
    }
    else {
      files.push({ ...entry, gitBlob: match[3] })
    }
  }
  const names = [...files, ...gitlinks].map(file => file.logical)
  if (!files.length || names.length > limits.entries || new Set(names).size !== names.length) {
    throw new Error('Git 文件清单为空、重复或超限')
  }
  return {
    sourceCommit: commit,
    sourceTree: tree,
    objectFormat,
    files,
    gitlinks,
  }
}
export async function assertDriverClean(run, repository, expectedCommit) {
  const top = await fs.realpath((await run('git-root', 'git', ['rev-parse', '--show-toplevel'], repository)).stdout.trim())
  if (top !== repository) {
    throw new Error('sourceRepository 必须是实际 Git 根目录')
  }
  const head = (await run('head', 'git', ['rev-parse', 'HEAD'], repository)).stdout.trim()
  const status = (await run('status', 'git', ['status', '--porcelain=v1', '--untracked-files=all'], repository)).stdout
  if (head !== expectedCommit || status !== '') {
    throw new Error('driverCommit 必须等于干净 sourceRepository HEAD')
  }
}
function safeArchivePath(entry) {
  const name = entry.type === 'Directory' ? entry.path.replace(/\/$/, '') : entry.path
  return logical(name)
}
export async function extractArchive({
  archive,
  root,
  identity,
  tar,
  manifestFile,
}) {
  const archiveReceipt = await fileReceipt(archive, {
    maximum: limits.archiveBytes,
    kind: 'source-archive',
  })
  const assertArchiveUnchanged = async () => {
    const current = await fileReceipt(archive, {
      maximum: limits.archiveBytes,
      kind: 'source-archive',
    })
    if (current.physical !== archiveReceipt.physical || current.sha256 !== archiveReceipt.sha256 || current.bytes !== archiveReceipt.bytes) {
      throw new Error('归档在列举/解包之间变化')
    }
  }
  const expected = new Map(identity.files.map(file => [file.logical, file]))
  const gitlinks = new Map(identity.gitlinks.map(entry => [entry.logical, entry]))
  const seenGitlinks = new Set()
  const entries = []
  const seen = new Set()
  let firstError
  await tar.t({
    file: archive,
    strict: true,
    onReadEntry(entry) {
      try {
        const name = safeArchivePath(entry)
        const item = {
          logical: name,
          type: entry.type,
          bytes: entry.size,
          mode: entry.mode,
        }
        if (entry.type === 'Directory') {
          if (gitlinks.has(name)) {
            if (seenGitlinks.has(name) || entry.size !== 0) {
              throw new Error(`归档 gitlink 必须为唯一空目录：${name}`)
            }
            seenGitlinks.add(name)
          }
          else if (![...expected.keys(), ...gitlinks.keys()].some(file => file.startsWith(`${name}/`))) {
            throw new Error(`归档含未知目录：${name}`)
          }
        }
        else {
          const source = expected.get(name)
          if (!source || seen.has(name) || entry.size > limits.fileBytes) {
            throw new Error(`归档项未知、重复或超限：${name}`)
          }
          if (entry.type !== (source.mode === '120000' ? 'SymbolicLink' : 'File')) {
            throw new Error(`归档类型与 Git 不一致：${name}`)
          }
          if (entry.type === 'SymbolicLink') {
            if (typeof entry.linkpath !== 'string' || unsafePathCharacters(entry.linkpath) || path.isAbsolute(entry.linkpath) || /^[a-z]:/i.test(entry.linkpath)) {
              throw new Error('符号链接目标不安全')
            }
            const target = path.resolve(path.dirname(fromLogical(root, name)), entry.linkpath)
            if (!inside(root, target)) {
              throw new Error('符号链接越过产品根')
            }
            const blob = createHash('sha1').update(`blob ${Buffer.byteLength(entry.linkpath)}\0`).update(entry.linkpath).digest('hex')
            if (blob !== source.gitBlob) {
              throw new Error('符号链接与 Git blob 不一致')
            }
            item.linkpath = entry.linkpath
          }
          seen.add(name)
        }
        entries.push(item)
        if (entries.length > limits.entries * 2) {
          throw new Error('归档项数量超限')
        }
      }
      catch (error) {
        firstError ??= error
      }
      entry.resume()
    },
  })
  if (firstError) {
    throw firstError
  }
  if (seen.size !== expected.size || seenGitlinks.size !== gitlinks.size) {
    throw new Error('git archive 未覆盖全部 ls-tree 文件，可能有 export-ignore/subst')
  }
  await assertArchiveUnchanged()
  await fs.mkdir(root)
  let extractedEntries = 0
  await tar.x({
    file: archive,
    cwd: root,
    strict: true,
    preservePaths: false,
    noMtime: true,
    filter(_name, entry) {
      const actual = {
        logical: safeArchivePath(entry),
        type: entry.type,
        bytes: entry.size,
        mode: entry.mode,
        ...(entry.type === 'SymbolicLink'
          ? {
              linkpath: entry.linkpath,
            }
          : {}),
      }
      if (JSON.stringify(actual) !== JSON.stringify(entries[extractedEntries++])) {
        throw new Error('解包 entry 与已审查完整归档清单不一致')
      }
      return true
    },
  })
  if (extractedEntries !== entries.length) {
    throw new Error('解包 entry 数量不完整')
  }
  await assertArchiveUnchanged()
  const actual = await walkFiles(root)
  if (actual.length !== expected.size || actual.some(file => !expected.has(file))) {
    throw new Error('解包文件集与 ls-tree 不一致')
  }
  const snapshot = await snapshotTracked(root, identity)
  const manifest = await writeJson(manifestFile, {
    schemaVersion: 1,
    sourceCommit: identity.sourceCommit,
    sourceTree: identity.sourceTree,
    gitlinks: identity.gitlinks,
    entries,
  })
  return {
    snapshot,
    manifest,
    archiveReceipt,
  }
}
export async function snapshotTracked(root, identity, expectedSnapshot) {
  try {
    await fs.lstat(path.join(root, '.git'))
    throw new Error('准备副本不能含根 .git')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  await assertEmptyGitlinks(root, identity.gitlinks)
  const previous = expectedSnapshot && new Map(expectedSnapshot.map(file => [file.logical, file]))
  const files = []
  for (const source of identity.files) {
    const file = fromLogical(root, source.logical)
    const stat = await fs.lstat(file)
    let bytes
    let symlinkTarget
    if (source.mode === '120000') {
      if (!stat.isSymbolicLink()) {
        throw new Error(`Git symlink 类型变化：${source.logical}`)
      }
      symlinkTarget = await fs.readlink(file)
      const physical = await fs.realpath(file)
      if (!inside(root, physical)) {
        throw new Error(`Git symlink 物理目标越界：${source.logical}`)
      }
      bytes = Buffer.from(symlinkTarget)
    }
    else {
      if (!stat.isFile() || stat.isSymbolicLink() || !inside(root, await fs.realpath(file))) {
        throw new Error(`Git 文件类型或物理归属变化：${source.logical}`)
      }
      bytes = await readBounded(file)
      if (process.platform !== 'win32' && Boolean(stat.mode & 0o111) !== (source.mode === '100755')) {
        throw new Error(`Git executable mode 变化：${source.logical}`)
      }
    }
    const gitBlob = createHash(identity.objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (gitBlob !== source.gitBlob) {
      throw new Error(`tracked 源文件与准确 Git tree 不一致：${source.logical}`)
    }
    const item = {
      ...source,
      bytes: bytes.length,
      sha256: sha256(bytes),
      ...(symlinkTarget === undefined
        ? {}
        : {
            symlinkTarget,
          }),
    }
    if (previous && JSON.stringify(previous.get(source.logical)) !== JSON.stringify(item)) {
      throw new Error(`安装/构建改写 tracked 输入：${source.logical}`)
    }
    files.push(item)
  }
  return files
}
