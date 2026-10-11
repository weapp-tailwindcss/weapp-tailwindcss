import type {
  CliOptions,
  IconifyHotUpdateConfig,
  IconifyHotUpdateMetrics,
  IconifyHotUpdatePayload,
  PluginProcessSample,
  WatchCase,
  WatchSession,
} from '../types'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { replaceWxml } from '../../core/replace-wxml'
import { formatPath } from '../cli'
import {
  getMtime,
  readFileIfExists,
  writeFilePreserveEol,
} from '../text'
import { assertIconifyConsumer } from './iconify/evidence'
import { createIconifyProbeSource } from './iconify/probe'
import {
  collectPluginProcessMetrics,
  expandOutputFileEntries,
  readJoinedOutputFiles,
  waitForClassOutputBaseline,
  waitForCompileSettled,
  waitForOutputFilesUpdatedWithDiagnostics,
} from './shared'

const DEFAULT_ICON_CLASS_TOKENS = [
  'i-[mdi--github-circle]',
  'i-[mdi--star]',
  'i-[svg-spinners--180-ring-with-bg]',
]
const DEFAULT_BEFORE_CONTENT_CLASS = 'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！\']'
const DEFAULT_AFTER_CONTENT_CLASS = 'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！\']'

interface IconifyOutputs {
  wxml: string
  js: string
  globalStyle: string
}

async function collectOutputMtimes(files: string[]) {
  const resolvedFiles = await expandOutputFileEntries(files)
  const entries = await Promise.all(
    resolvedFiles.map(async file => [file, await getMtime(file)] as const),
  )
  return new Map(entries)
}

async function loadOutputs(watchCase: WatchCase, globalStyleOutputs: string[]): Promise<IconifyOutputs> {
  const [wxml, js, globalStyle] = await Promise.all([
    readFileIfExists(watchCase.outputWxml),
    readFileIfExists(watchCase.outputJs),
    readJoinedOutputFiles(globalStyleOutputs),
  ])
  return {
    wxml: wxml ?? '',
    js: js ?? '',
    globalStyle,
  }
}

function resolveConfig(config: IconifyHotUpdateConfig) {
  const iconClassTokens = config.iconClassTokens ?? DEFAULT_ICON_CLASS_TOKENS
  const beforeContentClass = config.beforeContentClass ?? DEFAULT_BEFORE_CONTENT_CLASS
  const afterContentClass = config.afterContentClass ?? DEFAULT_AFTER_CONTENT_CLASS
  return {
    iconClassTokens,
    beforeContentClass,
    afterContentClass,
  }
}

function assertIconifyStyleOutput(
  watchCase: WatchCase,
  phase: string,
  outputs: IconifyOutputs,
  params: {
    marker: string
    previousMarker?: string
    classTokens: string[]
    iconEscapedClasses: string[]
    contentEscapedClass: string
    globalStyleOutputs: string[]
  },
) {
  if (params.previousMarker && (outputs.wxml.includes(params.previousMarker) || outputs.js.includes(params.previousMarker))) {
    throw new Error(`[${watchCase.label}] iconify HMR ${phase} retained previous phase ${params.previousMarker}`)
  }
  assertIconifyConsumer(outputs, watchCase.templateMutation.verifyEscapedIn, params.marker, params.classTokens, [...params.iconEscapedClasses, params.contentEscapedClass], `[${watchCase.label}] iconify HMR ${phase}`)
  const preservedIconEscapedClasses = params.iconEscapedClasses.filter(escaped => outputs.globalStyle.includes(escaped))
  if (preservedIconEscapedClasses.length !== params.iconEscapedClasses.length) {
    const missing = params.iconEscapedClasses.filter(escaped => !preservedIconEscapedClasses.includes(escaped))
    throw new Error(
      `[${watchCase.label}] iconify HMR ${phase} missing icon selectors in global style outputs: ${missing.join(', ')}, outputs=${params.globalStyleOutputs.map(formatPath).join(', ')}`,
    )
  }

  const verifiedContentEscapedClasses = outputs.globalStyle.includes(params.contentEscapedClass)
    ? [params.contentEscapedClass]
    : []
  if (verifiedContentEscapedClasses.length === 0) {
    throw new Error(
      `[${watchCase.label}] iconify HMR ${phase} missing content selector in global style outputs: ${params.contentEscapedClass}, outputs=${params.globalStyleOutputs.map(formatPath).join(', ')}`,
    )
  }

  return {
    preservedIconEscapedClasses,
    verifiedContentEscapedClasses,
  }
}

export async function runIconifyHotUpdate(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  config: IconifyHotUpdateConfig,
  sourceOriginal: string,
  globalStyleOutputs: string[],
): Promise<IconifyHotUpdateMetrics> {
  await waitForClassOutputBaseline(watchCase, options, session, 'content', globalStyleOutputs)

  const resolved = resolveConfig(config)
  const marker = `tw-watch-iconify-${watchCase.name}-${randomUUID()}`
  const consumerMarker = replaceWxml(marker)
  const injectMarker = `${consumerMarker}-inject`
  const contentMarker = `${consumerMarker}-content`
  const mutate = (phaseMarker: string, contentClass: string) => {
    const payload: IconifyHotUpdatePayload = {
      marker: phaseMarker,
      classLiteral: [phaseMarker, ...resolved.iconClassTokens, contentClass].join(' '),
      iconClassTokens: resolved.iconClassTokens,
      beforeContentClass: resolved.beforeContentClass,
      afterContentClass: resolved.afterContentClass,
    }
    return createIconifyProbeSource(watchCase, config, sourceOriginal, payload)
  }
  const sourceWithProbe = mutate(injectMarker, resolved.beforeContentClass)
  if (sourceWithProbe === sourceOriginal) {
    throw new Error(`[${watchCase.label}] iconify HMR probe mutation produced no source change`)
  }
  if (!sourceWithProbe.includes(resolved.beforeContentClass)) {
    throw new Error(`[${watchCase.label}] iconify HMR probe source is missing before content class`)
  }
  const sourceWithUpdatedContent = mutate(contentMarker, resolved.afterContentClass)
  if (sourceWithUpdatedContent === sourceWithProbe) {
    throw new Error(`[${watchCase.label}] iconify HMR content replacement produced no source change`)
  }

  const iconEscapedClasses = resolved.iconClassTokens.map(token => replaceWxml(token))
  const beforeContentEscapedClass = replaceWxml(resolved.beforeContentClass)
  const afterContentEscapedClass = replaceWxml(resolved.afterContentClass)
  const outputFiles = [watchCase.outputWxml, watchCase.outputJs, ...globalStyleOutputs]

  const baselineOutputMtimes = await collectOutputMtimes(outputFiles)
  const injectStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} iconify-hmr phase=inject dirty=${formatPath(config.sourceFile)} icons=${resolved.iconClassTokens.join(' | ')}\n`,
  )
  await writeFilePreserveEol(config.sourceFile, sourceWithProbe, sourceOriginal)
  await waitForOutputFilesUpdatedWithDiagnostics(
    watchCase,
    outputFiles,
    baselineOutputMtimes,
    options,
    session,
    injectStartedAt,
    async () => {
      assertIconifyStyleOutput(watchCase, 'inject', await loadOutputs(watchCase, globalStyleOutputs), {
        marker: injectMarker,
        classTokens: [...resolved.iconClassTokens, resolved.beforeContentClass],
        iconEscapedClasses,
        contentEscapedClass: beforeContentEscapedClass,
        globalStyleOutputs,
      })
      return true
    },
    {
      label: `iconify-hmr phase=inject source=${formatPath(config.sourceFile)}`,
    },
  )
  await waitForCompileSettled(watchCase, options, session, injectStartedAt)
  assertIconifyStyleOutput(watchCase, 'inject settled', await loadOutputs(watchCase, globalStyleOutputs), {
    marker: injectMarker,
    classTokens: [...resolved.iconClassTokens, resolved.beforeContentClass],
    iconEscapedClasses,
    contentEscapedClass: beforeContentEscapedClass,
    globalStyleOutputs,
  })

  const injectedOutputMtimes = await collectOutputMtimes(outputFiles)
  const hotUpdateStartedAt = Date.now()
  let preservedIconEscapedClasses: string[] = []
  let verifiedContentEscapedClasses: string[] = []
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} iconify-hmr phase=content dirty=${formatPath(config.sourceFile)} content=${resolved.afterContentClass}\n`,
  )
  await writeFilePreserveEol(config.sourceFile, sourceWithUpdatedContent, sourceOriginal)
  const hotUpdateOutputDiagnostics = await waitForOutputFilesUpdatedWithDiagnostics(
    watchCase,
    outputFiles,
    injectedOutputMtimes,
    options,
    session,
    hotUpdateStartedAt,
    async () => {
      const result = assertIconifyStyleOutput(watchCase, 'content', await loadOutputs(watchCase, globalStyleOutputs), {
        marker: contentMarker,
        previousMarker: injectMarker,
        classTokens: [...resolved.iconClassTokens, resolved.afterContentClass],
        iconEscapedClasses,
        contentEscapedClass: afterContentEscapedClass,
        globalStyleOutputs,
      })
      preservedIconEscapedClasses = result.preservedIconEscapedClasses
      verifiedContentEscapedClasses = result.verifiedContentEscapedClasses
      return true
    },
    {
      label: `iconify-hmr phase=content source=${formatPath(config.sourceFile)}`,
    },
  )
  await waitForCompileSettled(watchCase, options, session, hotUpdateStartedAt)
  assertIconifyStyleOutput(watchCase, 'content settled', await loadOutputs(watchCase, globalStyleOutputs), {
    marker: contentMarker,
    previousMarker: injectMarker,
    classTokens: [...resolved.iconClassTokens, resolved.afterContentClass],
    iconEscapedClasses,
    contentEscapedClass: afterContentEscapedClass,
    globalStyleOutputs,
  })
  const hotUpdateEffectiveMs = Date.now() - hotUpdateStartedAt
  const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateStartedAt)

  const updatedOutputMtimes = await collectOutputMtimes(outputFiles)
  const rollbackStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} iconify-hmr phase=rollback dirty=${formatPath(config.sourceFile)}\n`,
  )
  await writeFilePreserveEol(config.sourceFile, sourceOriginal, sourceOriginal)
  const rollbackOutputDiagnostics = await waitForOutputFilesUpdatedWithDiagnostics(
    watchCase,
    outputFiles,
    updatedOutputMtimes,
    options,
    session,
    rollbackStartedAt,
    async () => {
      const outputs = await loadOutputs(watchCase, globalStyleOutputs)
      return !outputs.wxml.includes(consumerMarker) && !outputs.js.includes(consumerMarker)
    },
    {
      label: `iconify-hmr phase=rollback source=${formatPath(config.sourceFile)}`,
    },
  )
  await waitForCompileSettled(watchCase, options, session, rollbackStartedAt)
  const rollbackOutputs = await loadOutputs(watchCase, globalStyleOutputs)
  if (rollbackOutputs.wxml.includes(consumerMarker) || rollbackOutputs.js.includes(consumerMarker)) {
    throw new Error(`[${watchCase.label}] iconify HMR rollback retained current probe ${marker}`)
  }
  const rollbackEffectiveMs = Date.now() - rollbackStartedAt
  const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

  return {
    sourceFile: config.sourceFile,
    marker,
    beforeContentClass: resolved.beforeContentClass,
    afterContentClass: resolved.afterContentClass,
    iconClassTokens: resolved.iconClassTokens,
    contentClassTokens: [resolved.beforeContentClass, resolved.afterContentClass],
    preservedIconEscapedClasses,
    verifiedContentEscapedClasses,
    globalStyleOutputs,
    hotUpdateOutputMs: hotUpdateOutputDiagnostics.elapsedMs,
    hotUpdateEffectiveMs,
    hotUpdateOutputDiagnostics,
    hotUpdatePluginProcessMs: hotUpdatePluginMetrics.totalMs,
    hotUpdatePluginProcessSamples: hotUpdatePluginMetrics.samples as PluginProcessSample[],
    rollbackOutputMs: rollbackOutputDiagnostics.elapsedMs,
    rollbackEffectiveMs,
    rollbackOutputDiagnostics,
    rollbackPluginProcessMs: rollbackPluginMetrics.totalMs,
    rollbackPluginProcessSamples: rollbackPluginMetrics.samples as PluginProcessSample[],
  }
}
