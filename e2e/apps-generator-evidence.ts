import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const repository = fileURLToPath(new URL('..', import.meta.url))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** 在断言前保存本轮完整 CSS；生成成功不代表快照或语义验收通过。 */
export async function saveGeneratorEvidence(options: {
  name: string
  platform: string
  expectedPath: string
  report: string
  files: Array<{ fileName: string, content: string }>
}) {
  const root = path.join(repository, 'e2e', '.artifacts', 'apps-generator-mode', 'generated')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'run-'))
  const [{ stdout: sha }, { stdout: diff }, lock, expected] = await Promise.all([
    execa('git', ['rev-parse', 'HEAD'], { cwd: repository }),
    execa('git', ['diff', '--binary', 'HEAD'], { cwd: repository }),
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
    files.push({ fileName: file.fileName, artifact, sha256: hash(file.content) })
  }
  await writeFile(path.join(directory, 'actual.md'), options.report)
  await writeFile(path.join(directory, 'identity.json'), `${JSON.stringify({
    status: 'generated-unverified',
    name: options.name,
    platform: options.platform,
    sha,
    trackedDiffSha256: hash(diff),
    lockSha256: hash(lock),
    node: process.version,
    expectedSha256: expected === undefined ? null : hash(expected),
    files,
  }, null, 2)}\n`)
  process.stdout.write(`[generator-evidence] ${options.name} ${options.platform}: ${directory}\n`)
}
