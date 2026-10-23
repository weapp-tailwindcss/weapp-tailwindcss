import type {
  ClassMutationMetrics,
  CliOptions,
  SubPackageMutationConfig,
  SubPackageMutationMetrics,
  WatchCase,
  WatchSession,
} from '../types'
import { promises as fs } from 'node:fs'
import process from 'node:process'
import { sleep } from '../session'
import { writeFilePreserveEol } from '../text'
import { runClassMutation } from './class'
import { runMainStyleHotUpdate } from './main-style'
import { waitForOutputsReady } from './shared'
import { runStyleMutation } from './style'

export function createSubPackageWatchCase(watchCase: WatchCase, mutation: SubPackageMutationConfig): WatchCase {
  return {
    ...watchCase,
    label: `${watchCase.label}/${mutation.root}${mutation.independent ? ':independent' : ''}`,
    minGlobalStyleEscapedClasses: mutation.minGlobalStyleEscapedClasses ?? watchCase.minGlobalStyleEscapedClasses,
    outputWxml: mutation.outputWxml,
    outputJs: mutation.outputJs,
    outputStyleCandidates: mutation.outputStyleCandidates,
    globalStyleCandidates: mutation.globalStyleCandidates,
    templateMutation: mutation.templateMutation,
    scriptMutation: mutation.templateMutation,
    styleMutation: mutation.styleMutation,
    contentMutation: undefined,
    subPackageMutations: undefined,
  }
}

function assertSubPackageTemplateMetric(
  watchCase: WatchCase,
  mutation: SubPackageMutationConfig,
  metric: ClassMutationMetrics,
) {
  expectMetric(
    metric.rounds.length > 0,
    `[${watchCase.label}] ${mutation.root} should produce template HMR rounds`,
  )
  for (const round of metric.rounds) {
    expectMetric(
      round.escapedClasses.some(escaped => metric.verifiedGlobalStyleEscapedClasses.includes(escaped)),
      `[${watchCase.label}] ${mutation.root} should verify generated wxss for ${round.roundName}`,
    )
  }

  if (mutation.independent) {
    expectMetric(
      metric.sourceFile.includes('sub-independent'),
      `[${watchCase.label}] independent subpackage mutation should use sub-independent source`,
    )
  }
}

function expectMetric(value: boolean, message: string) {
  if (!value) {
    throw new Error(message)
  }
}

export function collectSubPackageStyleOutputs(mutation: SubPackageMutationConfig) {
  return [...new Set([
    ...mutation.outputStyleCandidates,
    ...mutation.globalStyleCandidates,
  ])]
}

/** CSS 语义只消费已声明的样式入口；JS 载体继续由 marker 与回滚链路验证。 */
export function collectSubPackageCssOutputs(mutation: SubPackageMutationConfig) {
  return [...new Set(mutation.globalStyleCandidates)]
}

export async function runSubPackageMutation(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  mutation: SubPackageMutationConfig,
  sourceOriginals: Map<string, string>,
): Promise<SubPackageMutationMetrics> {
  const subWatchCase = createSubPackageWatchCase(watchCase, mutation)

  const templateSourceOriginal = sourceOriginals.get(mutation.templateMutation.sourceFile)
    ?? await fs.readFile(mutation.templateMutation.sourceFile, 'utf8')
  sourceOriginals.set(mutation.templateMutation.sourceFile, templateSourceOriginal)

  const styleSourceOriginal = sourceOriginals.get(mutation.styleMutation.sourceFile)
    ?? (
      mutation.skipStyleMutation
        ? undefined
        : await fs.readFile(mutation.styleMutation.sourceFile, 'utf8')
    )
  if (!mutation.skipStyleMutation && styleSourceOriginal == null) {
    throw new Error(`[${subWatchCase.label}] missing style mutation source original`)
  }
  if (styleSourceOriginal != null) {
    sourceOriginals.set(mutation.styleMutation.sourceFile, styleSourceOriginal)
  }

  const attachWrites = [
    writeFilePreserveEol(mutation.templateMutation.sourceFile, templateSourceOriginal, templateSourceOriginal),
  ]
  if (!mutation.skipStyleMutation && styleSourceOriginal != null) {
    attachWrites.push(
      writeFilePreserveEol(mutation.styleMutation.sourceFile, styleSourceOriginal, styleSourceOriginal),
    )
  }
  await Promise.all(attachWrites)
  const attachWrittenAt = Date.now()

  await waitForOutputsReady(watchCase, options, session, attachWrittenAt, {
    wxml: mutation.outputWxml,
    js: mutation.outputJs,
    label: subWatchCase.label,
  })
  // 这里的 attach 写入只用于确保分包源文件已被 watch 工具链订阅，内容没有变化。
  // 部分框架会复用已有产物且不再输出新的 compile success，真正的 HMR 行为由后续 mutation 断言覆盖。
  // Gulp/Chokidar 偶发会把 attach 写入和紧随其后的 mutation 合并，导致变更事件被上一轮消费。
  // 给事件队列一个很短的稳定窗口，避免全量 e2e 中分包用例抖动。
  await sleep(Math.min(Math.max(options.pollMs * 2, 600), 1500))
  session.ensureRunning()

  const globalStyleOutputs = collectSubPackageCssOutputs(mutation)
  const template = await runClassMutation(
    subWatchCase,
    options,
    session,
    'template',
    mutation.templateMutation,
    templateSourceOriginal,
    globalStyleOutputs,
  )
  assertSubPackageTemplateMetric(watchCase, mutation, template)

  const style = mutation.skipStyleMutation
    ? undefined
    : await runStyleMutation(
        subWatchCase,
        options,
        session,
        mutation.styleMutation,
        styleSourceOriginal!,
        collectSubPackageStyleOutputs(mutation),
      )

  let mainStyleHotUpdate
  if (mutation.mainStyleMutation) {
    const mainStyleSourcePath = mutation.mainStyleMutation.sourceFile
    const mainStyleSourceOriginal = sourceOriginals.get(mainStyleSourcePath)
      ?? await fs.readFile(mainStyleSourcePath, 'utf8')
    sourceOriginals.set(mainStyleSourcePath, mainStyleSourceOriginal)
    mainStyleHotUpdate = await runMainStyleHotUpdate(
      subWatchCase,
      options,
      session,
      'template',
      mutation.mainStyleMutation,
      mainStyleSourceOriginal,
      globalStyleOutputs,
    )
  }

  process.stdout.write(
    `[watch-hmr] ${subWatchCase.label} mutation=subpackage passed (template=${template.hotUpdateEffectiveMs}ms${style ? `, style=${style.hotUpdateEffectiveMs}ms` : ''}${mainStyleHotUpdate ? `, main-style=${mainStyleHotUpdate.hotUpdateEffectiveMs}ms` : ''})\n`,
  )

  return {
    root: mutation.root,
    independent: mutation.independent,
    outputWxml: mutation.outputWxml,
    outputJs: mutation.outputJs,
    globalStyleOutputs,
    ...(mainStyleHotUpdate ? { mainStyleHotUpdate } : {}),
    template,
    style,
  }
}
