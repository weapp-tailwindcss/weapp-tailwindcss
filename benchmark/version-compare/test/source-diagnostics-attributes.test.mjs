import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import * as tar from 'tar'
import { afterEach, expect, it } from 'vitest'
import { archiveGitArgs, archiveGitOptions, readArchiveSource } from '../scripts/source-diagnostics/archive-attributes.mjs'
import { extractArchive, readGitIdentity, snapshotTracked } from '../scripts/source-diagnostics/git-source.mjs'
import { sourceByteIdentity } from '../scripts/source-diagnostics/source-bytes.mjs'

const exec = promisify(execFile)
const temporary = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
const hash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const lf = Buffer.from('alpha\nbeta\n')
const crlf = Buffer.from('alpha\r\nbeta\r\n')
const source = { logical: 'script.ps1', mode: '100644', gitBlob: hash(lf), archiveAttributes: { text: 'set', eol: 'crlf' } }

it('显式 CRLF 策略同时记录 canonical 与实际导出字节', () => {
  expect(sourceByteIdentity(source, crlf, 'sha1')).toEqual({
    gitBytes: lf.length,
    gitSha256: createHash('sha256').update(lf).digest('hex'),
    archiveTransform: 'lf-to-crlf',
    bytes: crlf.length,
    sha256: createHash('sha256').update(crlf).digest('hex'),
  })
})
it.each([lf, Buffer.from('alpha\r\nbeta\n'), Buffer.from('alpha\r\rbeta\r\n'), Buffer.from('other\r\nbeta\r\n')])('初始导出不是声明的精确转换时失败 %#', (bytes) => {
  expect(() => sourceByteIdentity(source, bytes, 'sha1')).toThrow()
})
it('已有实际摘要后，改回 canonical LF 仍是 tracked 改写', () => {
  const previous = sourceByteIdentity(source, crlf, 'sha1')
  expect(() => sourceByteIdentity(source, lf, 'sha1', previous)).toThrow('改写')
})
it('未声明转换的路径拒绝 CRLF，symlink 目标保持原始 Git blob', () => {
  expect(() => sourceByteIdentity({ ...source, archiveAttributes: { text: 'set', eol: 'lf' } }, crlf, 'sha1')).toThrow('Git tree')
  expect(sourceByteIdentity({ ...source, mode: '120000' }, lf, 'sha1').archiveTransform).toBe('identity')
})

async function fixture(attributes = '* text=auto eol=lf\n*.ps1 text eol=crlf\n') {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'source-archive-attrs-')))
  temporary.push(parent)
  const repository = path.join(parent, 'source')
  await fs.mkdir(repository)
  const git = async args => (await exec('git', ['--no-replace-objects', ...args], { cwd: repository, shell: false, encoding: 'utf8' })).stdout.trim()
  await git(['init'])
  await fs.writeFile(path.join(repository, '.gitattributes'), '* text=auto eol=lf\n*.ps1 text eol=crlf\n')
  await fs.writeFile(path.join(repository, 'script.ps1'), lf)
  await fs.writeFile(path.join(repository, 'plain.txt'), lf)
  await git(['-c', 'core.autocrlf=false', 'add', '.'])
  if (attributes !== '* text=auto eol=lf\n*.ps1 text eol=crlf\n') {
    const file = path.join(parent, 'attributes.txt')
    await fs.writeFile(file, attributes)
    const blob = await git(['hash-object', '-w', '--no-filters', file])
    await git(['update-index', '--cacheinfo', `100644,${blob},.gitattributes`])
    await fs.writeFile(path.join(repository, '.gitattributes'), attributes)
  }
  await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'canonical fixture'])
  const commit = await git(['rev-parse', 'HEAD'])
  const calls = []
  const run = async (label, executable, args, cwd, options = {}) => {
    calls.push({ label, args, environment: options.environment })
    return exec(executable, ['--no-replace-objects', ...args], { cwd, shell: false, encoding: 'utf8', env: { ...process.env, ...options.environment } })
  }
  const canonical = await readGitIdentity(run, repository, commit)
  return { parent, repository, commit, canonical, run, calls }
}

it.skipIf(process.platform === 'win32')('真实 Git/tar 使用产品提交属性，工作树不同属性不能污染导出', async () => {
  const context = await fixture()
  await fs.writeFile(path.join(context.repository, '.gitattributes'), '*.ps1 -text\n')
  const identity = await readArchiveSource(context.run, context.repository, context.canonical)
  const canonicalFile = context.canonical.files.find(file => file.logical === 'script.ps1')
  expect(canonicalFile.gitBlob).toBe(hash(lf))
  expect(canonicalFile).not.toHaveProperty('archiveAttributes')
  expect(identity.files.find(file => file.logical === 'script.ps1').archiveAttributes).toEqual({ text: 'set', eol: 'crlf' })
  const archive = path.join(context.parent, 'source.tar')
  const { stdout } = await exec('git', ['--no-replace-objects', ...archiveGitArgs(['archive', '--format=tar', context.commit])], { cwd: context.repository, shell: false, encoding: 'buffer', env: { ...process.env, ...archiveGitOptions(context.commit).environment } })
  await fs.writeFile(archive, stdout)
  const root = path.join(context.parent, 'product')
  const extracted = await extractArchive({ archive, root, identity, tar, manifestFile: path.join(context.parent, 'archive-manifest.json') })
  expect(await fs.readFile(path.join(root, 'script.ps1'))).toEqual(crlf)
  const item = extracted.snapshot.find(file => file.logical === 'script.ps1')
  expect(item).toMatchObject({ gitBlob: hash(lf), gitBytes: lf.length, bytes: crlf.length, archiveTransform: 'lf-to-crlf' })
  expect(JSON.parse(await fs.readFile(extracted.manifest.physical, 'utf8')).exportPolicy).toEqual(identity.exportPolicy)
  await expect(snapshotTracked(root, identity, extracted.snapshot)).resolves.toEqual(extracted.snapshot)
  await fs.writeFile(path.join(root, 'script.ps1'), lf)
  await expect(snapshotTracked(root, identity, extracted.snapshot)).rejects.toThrow('改写')
  await expect(snapshotTracked(root, identity)).rejects.toThrow('LF')
})
it.skipIf(process.platform === 'win32').each(['filter=unknown', 'filter=unset', 'filter=unspecified', '-filter', 'working-tree-encoding=UTF-16', 'working-tree-encoding=unspecified', 'export-subst', 'export-subst=unspecified', 'export-ignore', 'ident', 'ident=unset', 'crlf', 'text=auto eol=crlf'])('不支持的来源转换属性提前失败：%s', async (attribute) => {
  const context = await fixture(`* text eol=lf\n*.ps1 ${attribute}\n`)
  await expect(readArchiveSource(context.run, context.repository, context.canonical)).rejects.toThrow(/属性|CRLF/)
})
it.skipIf(process.platform === 'win32')('非空 info/attributes 不能冒充准确产品 tree 的属性', async () => {
  const context = await fixture()
  await fs.writeFile(path.join(context.repository, '.git', 'info', 'attributes'), '*.ps1 text eol=lf\n')
  await expect(readArchiveSource(context.run, context.repository, context.canonical)).rejects.toThrow('info/attributes')
})
