import type { TailwindV4ResolvedSource } from '@/generator'
import { md5Hash } from '@/cache/md5'
import { stableSerialize } from '@/utils/stable-serialize'

export function createSourceFingerprint(source: TailwindV4ResolvedSource) {
  return createCompilerValueFingerprint(source)
}

export function createCompilerValueFingerprint(value: unknown) {
  return md5Hash(stableSerialize(value))
}
