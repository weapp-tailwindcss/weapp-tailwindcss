import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const repository = fileURLToPath(new URL('..', import.meta.url))
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

/** 在断言前分别保存原始资产字节和正规化快照；生成成功不代表语义验收通过。 */
export async function saveGeneratorEvidence(options: {
  name: string
  platform: string
  expectedPath: string
  report: string
  files: Array<{ fileName: string, content: string }>
  rawFiles: Array<{ fileName: string, content: Uint8Array }>
}) {
  const root = path.join(repository, 'e2e', '.artifacts', 'apps-generator-mode', 'generated')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'run-'))
  const [{ stdout: sha }, { stdout: diff }, { stdout: untracked }, lock, expected] = await Promise.all([
    execa('git', ['rev-parse', 'HEAD'], { cwd: repository }),
    execa('git', ['diff', '--binary', 'HEAD'], { cwd: repository }),
    execa('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repository }),
    readFile(path.join(repository, 'pnpm-lock.yaml'), 'utf8'),
    readFile(options.expectedPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error
      }
      return undefined
    }),
  ])
  const files = []
  for (const [index, file] of options.files.entries()) {
    // 输出路径按本轮序号生成；原始 bundle asset name 只保存在元数据里。
    const artifact = `${index}.css`
    await writeFile(path.join(directory, artifact), file.content)
    files.push({ fileName: file.fileName, artifact, representation: 'normalized-snapshot', sha256: hash(file.content) })
  }
  const rawFiles = []
  for (const [index, file] of options.rawFiles.entries()) {
    const artifact = `raw-${index}.css`
    await writeFile(path.join(directory, artifact), file.content)
    rawFiles.push({ fileName: file.fileName, artifact, representation: 'bundle-asset-bytes', bytes: file.content.byteLength, sha256: hash(file.content) })
  }
  const untrackedSources = await Promise.all(untracked.split('\0').filter(Boolean).map(async fileName => ({
    fileName,
    sha256: hash(await readFile(path.resolve(repository, fileName))),
  })))
  await writeFile(path.join(directory, 'actual.md'), options.report)
  await writeFile(path.join(directory, 'identity.json'), `${JSON.stringify({
    status: 'generated-unverified',
    schemaVersion: 2,
    name: options.name,
    platform: options.platform,
    sha,
    trackedDiffSha256: hash(diff),
    untrackedSources,
    lockSha256: hash(lock),
    node: process.version,
    expectedSha256: expected === undefined ? null : hash(expected),
    files,
    rawFiles,
  }, null, 2)}\n`)
  process.stdout.write(`[generator-evidence] ${options.name} ${options.platform}: ${directory}\n`)
  return directory
}
