import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { reactNativeVersions } from './catalog'
import { exampleRoot, sameArchivedValue } from './generation-input'

type StaticInput = Awaited<ReturnType<typeof readStaticInput>>

async function readStaticInput(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as {
    report: { versions: Record<string, string>, verifiedAt: string, environment: unknown }
    [key: string]: unknown
  }
}

/** 发布版本号属于本轮 provenance；基线的生成内容和外部依赖必须仍然一致。 */
export function assertRuntimeStaticBaseline(baseline: StaticInput, generated: StaticInput) {
  const semanticInput = (input: StaticInput) => {
    const { compiler, ...dependencies } = input.report.versions
    if (typeof compiler !== 'string' || !compiler.trim()) {
      throw new Error('React Native static 输入缺少编译器版本')
    }
    return { ...input, report: { ...input.report, versions: dependencies, verifiedAt: undefined, environment: undefined } }
  }
  if (!sameArchivedValue(semanticInput(baseline), semanticInput(generated))) {
    throw new Error('React Native static 基线与本轮真实生成或外部依赖不符，必须单独审查并更新基线')
  }
}

/** 运行时读取独立生成的模块，普通验收不改写已提交的 static 快照。 */
export async function prepareRuntimeStaticEvidence(directory: string) {
  const { writeStaticEvidence } = await import('./static-evidence')
  const baselineFile = path.join(exampleRoot, 'src', 'compatibility', 'static-evidence.json')
  const file = path.join(directory, 'runtime-input', 'static-evidence.json')
  await mkdir(path.dirname(file), { recursive: true })
  await writeStaticEvidence(file)
  const baseline = await readStaticInput(baselineFile)
  const generated = await readStaticInput(file)
  assertRuntimeStaticBaseline(baseline, generated)
  const digest = (source: Uint8Array) => createHash('sha256').update(source).digest('hex')
  const sha256 = digest(await readFile(file))
  await writeFile(path.join(directory, 'runtime-static-input.json'), `${JSON.stringify({
    version: 1,
    baselineSha256: digest(await readFile(baselineFile)),
    generatedSha256: sha256,
    versions: generated.report.versions,
  }, null, 2)}\n`, { flag: 'wx' })
  return { file, environment: { RN_RUNTIME_STATIC_EVIDENCE: file, RN_RUNTIME_STATIC_EVIDENCE_SHA256: sha256 } }
}

/** 子进程成功退出后重新验证固定路径原件；不接受子进程返回的任意文件或环境变量。 */
export async function readPreparedRuntimeStaticEvidence(directory: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const file = path.join(directory, 'runtime-input', 'static-evidence.json')
  const baselineFile = path.join(exampleRoot, 'src', 'compatibility', 'static-evidence.json')
  const baselineBytes = await readFile(baselineFile, { signal })
  const generatedBytes = await readFile(file, { signal })
  const receiptBytes = await readFile(path.join(directory, 'runtime-static-input.json'), { signal })
  signal?.throwIfAborted()
  const baseline = JSON.parse(baselineBytes.toString()) as StaticInput
  const generated = JSON.parse(generatedBytes.toString()) as StaticInput
  const receipt = JSON.parse(receiptBytes.toString())
  assertRuntimeStaticBaseline(baseline, generated)
  const digest = (source: Uint8Array) => createHash('sha256').update(source).digest('hex')
  const sha256 = digest(generatedBytes)
  if (receipt.version !== 1
    || receipt.baselineSha256 !== digest(baselineBytes)
    || receipt.generatedSha256 !== sha256
    || !sameArchivedValue(receipt.versions, generated.report.versions)
    || !sameArchivedValue(generated.report.versions, reactNativeVersions())) {
    throw new Error('运行时 static 子进程原件、摘要或当前依赖不符')
  }
  signal?.throwIfAborted()
  return { file, environment: { RN_RUNTIME_STATIC_EVIDENCE: file, RN_RUNTIME_STATIC_EVIDENCE_SHA256: sha256 } }
}
