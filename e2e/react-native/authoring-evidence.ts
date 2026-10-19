import type { NativeStylesheetEvidence } from '../../packages/react-native/src/tailwind/generate'
import type { SourceReceipt } from './generation-input'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { compileNativeStylesheet } from '../../packages/react-native/src/compiler'
import { generateNativeStylesheetEvidence } from '../../packages/react-native/src/tailwind/generate'
import { generatedRules, matchGeneratedDeclaration } from './declarations'
import { authoringScopes } from './entry-scope-contract'
import { exampleRoot, readSourceReceipt, RN_ENTRY_SCOPE_VERSION, sameArchivedValue, sourceHash } from './generation-input'

export { authoringCaseScopes } from './entry-scope-contract'

export interface AuthoringScopeEvidence extends NativeStylesheetEvidence {
  id: string
  entry: string
  candidates: string[]
  sources: SourceReceipt[]
}

export interface NativeAuthoringEvidence {
  version: number
  scopes: AuthoringScopeEvidence[]
}

/** 配置、prefix 与 reference 各自生成，产物只属于指令证据，不进入应用 manifest。 */
export async function collectAuthoringEvidence(projectRoot = exampleRoot): Promise<NativeAuthoringEvidence> {
  const scopes: AuthoringScopeEvidence[] = []
  for (const scope of authoringScopes) {
    const generated = await generateNativeStylesheetEvidence({
      projectRoot,
      cssEntries: [path.resolve(projectRoot, scope.entry)],
      candidates: scope.candidates,
      sourceGlobs: [],
    })
    scopes.push({ ...generated, id: scope.id, entry: scope.entry, candidates: [...scope.candidates], sources: await Promise.all(scope.files.map(file => readSourceReceipt(projectRoot, file))) })
  }
  return { version: RN_ENTRY_SCOPE_VERSION, scopes }
}

/** 重读原始输入与生成 CSS，并独立编码回放；不能手改归档标志或混入其他入口候选。 */
export async function validateAuthoringEvidence(value: NativeAuthoringEvidence, projectRoot = exampleRoot) {
  if (value?.version !== RN_ENTRY_SCOPE_VERSION || !Array.isArray(value.scopes) || value.scopes.length !== authoringScopes.length) {
    throw new Error('React Native authoring 缺少独立入口版本或完整作用域')
  }
  for (const contract of authoringScopes) {
    const scopes = value.scopes.filter(scope => scope.id === contract.id)
    const scope = scopes[0]
    if (scopes.length !== 1 || !scope || scope.entry !== contract.entry || !isDeepStrictEqual(scope.candidates, [...contract.candidates])
      || !Array.isArray(scope.sources) || scope.sources.length !== contract.files.length
      || !Array.isArray(scope.generatedClassSet) || scope.generatedClassSet.some(candidate => !(contract.candidates as readonly string[]).includes(candidate))) {
      throw new Error(`React Native authoring 入口或候选越界：${contract.id}`)
    }
    for (const file of contract.files) {
      const sources = scope.sources.filter(source => source.file === file)
      const source = sources[0]
      if (sources.length !== 1 || !source || source.sha256 !== sourceHash(source.source)
        || !isDeepStrictEqual(source, await readSourceReceipt(projectRoot, file))) {
        throw new Error(`React Native authoring 原始输入不符：${contract.id}/${file}`)
      }
    }
    const rules = generatedRules(scope.rawCss)
    if (rules.some(rule => rule.classes.some(candidate => !(contract.candidates as readonly string[]).includes(candidate)))
      || !sameArchivedValue(compileNativeStylesheet(scope.rawCss), scope.manifest)) {
      throw new Error(`React Native authoring 原始 CSS 与独立 manifest 回放不符：${contract.id}`)
    }
    const expected = contract.id === 'legacy'
      ? [{ candidate: 'p-legacy', declaration: { property: 'padding', value: '19px', important: true } }, { candidate: 'lynx-plugin-utility', declaration: { property: 'opacity', value: '0.73' } }]
      : contract.id === 'prefix'
        ? [{ candidate: 'tw:flex', declaration: { property: 'display', value: 'flex' } }]
        : [{ candidate: 'lynx-reference', declaration: { property: 'padding', value: '16px' } }]
    if (expected.some(({ candidate, declaration }) => !matchGeneratedDeclaration(rules.filter(rule => rule.classes.includes(candidate)), declaration))) {
      throw new Error(`React Native authoring 生成不满足独立指令 oracle：${contract.id}`)
    }
  }
}
