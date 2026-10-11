import type { CompilerRootSession } from './root-store'
import type { CompilerGenerateRequest } from './types'
import process from 'node:process'
import { resolveTailwindV4Source } from '@/generator'
import { createCompilerValueFingerprint, createSourceFingerprint } from './source-fingerprint'

export async function resolveCompilerSource(
  entry: CompilerRootSession,
  request: CompilerGenerateRequest,
  invalidation: number,
) {
  if (request.source && request.sourceOptions) {
    throw new Error('generate() 的 source 与 sourceOptions 互斥。')
  }
  if (!request.source && !request.sourceOptions) {
    throw new Error('generate() 必须提供 source 或 sourceOptions。')
  }

  // 来源快照归 compiler 所有，调用方后续修改不能污染已提交的引擎或解析缓存。
  const input = structuredClone(request.source
    ? { source: request.source }
    : { sourceOptions: request.sourceOptions, cwd: process.cwd() })
  const sourceInputFingerprint = createCompilerValueFingerprint(input)
  if (
    entry.source !== undefined
    && entry.sourceFingerprint !== undefined
    && entry.sourceInputFingerprint === sourceInputFingerprint
    && entry.appliedInvalidation === invalidation
  ) {
    return { source: entry.source, sourceFingerprint: entry.sourceFingerprint, sourceInputFingerprint }
  }

  const source = input.source ?? await resolveTailwindV4Source(input.sourceOptions)
  return { source, sourceFingerprint: createSourceFingerprint(source), sourceInputFingerprint }
}
