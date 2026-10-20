import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

export { RN_ENTRY_SCOPE_VERSION } from './entry-scope-contract'
export const exampleRoot = path.resolve(import.meta.dirname, '../../examples/react-native-expo')

export interface SourceReceipt { file: string, source: string, sha256: string }
export interface RuntimeStyleInput {
  input: string
  sourceGlobs: string[]
  watchFiles: string[]
}

export const sourceHash = (source: string) => createHash('sha256').update(source).digest('hex')

/** 归档经过 JSON 序列化，比较时保留实际值并统一省略 undefined 字段。 */
export function sameArchivedValue(first: unknown, second: unknown) {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)))
}

export async function readSourceReceipt(projectRoot: string, file: string): Promise<SourceReceipt> {
  const source = await readFile(path.resolve(projectRoot, file), 'utf8')
  return { file, source, sha256: sourceHash(source) }
}

/** Metro 与静态归档读取同一份显式入口及扫描选项，不能额外广播候选。 */
export async function readRuntimeStyleInput(projectRoot = exampleRoot) {
  const require = createRequire(path.resolve(projectRoot, 'package.json'))
  const options = require('./tailwind-input.cjs') as RuntimeStyleInput
  const config = await readSourceReceipt(projectRoot, 'tailwind-input.cjs')
  return { options, config }
}
