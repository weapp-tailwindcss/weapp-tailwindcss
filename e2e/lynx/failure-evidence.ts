import type { NativeEvidenceContext } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { mediaGateArtifactNames } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { validateEvidenceContext } from './evidence'

export interface NativeFailureReaders {
  failure: () => Promise<Uint8Array | undefined>
  artifact: (name: string) => Promise<Uint8Array | undefined>
}

async function collectFailureEvidence(artifactDir: string, context: NativeEvidenceContext, read: NativeFailureReaders) {
  const parent = path.join(artifactDir, 'native-failure')
  const directory = path.join(parent, context.runId)
  await fs.mkdir(parent, { recursive: true })
  await fs.mkdir(directory)
  await fs.mkdir(path.join(directory, 'artifacts'))
  const requests = [
    { name: 'failure.json', read: read.failure, output: path.join(directory, 'failure.json') },
    ...mediaGateArtifactNames().map(name => ({ name, read: () => read.artifact(name), output: path.join(directory, 'artifacts', name) })),
  ]
  const errors: unknown[] = []
  const files = await Promise.all(requests.map(async (request) => {
    try {
      const bytes = await request.read()
      if (bytes === undefined) {
        return { name: request.name, status: 'missing' }
      }
      await fs.writeFile(request.output, bytes, { flag: 'wx' })
      return { name: request.name, status: 'copied', byteLength: bytes.byteLength }
    }
    catch (error) {
      errors.push(error)
      return { name: request.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
  }))
  try {
    await fs.writeFile(path.join(directory, 'collection.json'), `${JSON.stringify({ version: 1, source: 'lynx-native-failure-diagnostics', acceptance: 'diagnostic-only', context, files }, null, 2)}\n`, { flag: 'wx' })
  }
  catch (error) {
    errors.push(error)
  }
  if (errors.length) {
    throw new AggregateError(errors, '部分原生失败诊断无法导出')
  }
}

/** 失败时仅导出固定白名单的原始文件；独立目录永远不能作为通过回执或 crops。 */
export async function withNativeFailureEvidence<T>(artifactDir: string, context: NativeEvidenceContext, read: NativeFailureReaders, run: () => Promise<T>): Promise<T> {
  validateEvidenceContext(context)
  try {
    return await run()
  }
  catch (failure) {
    try {
      await collectFailureEvidence(artifactDir, context, read)
    }
    catch (diagnosticFailure) {
      throw new AggregateError([failure, diagnosticFailure], '原生执行失败，且部分失败证据无法导出')
    }
    throw failure
  }
}
