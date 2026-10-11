import type { Page } from 'playwright'
import type { CliOptions, WatchCase, WebHmrConfig } from '../types'
import type { WebIconifyStyleEvidence } from './iconify/style-evidence'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { formatPath } from '../cli'
import { createIconifyProbeSource } from '../mutations/iconify/probe'
import { waitFor, writeWatchedFilePreserveEol } from '../text'
import { writeWebIconifyStyleEvidence } from './iconify/style-evidence'
import { collectStyleText } from './style-text'

const DEFAULT_ICON_CLASS_TOKENS = [
  'i-[mdi--github-circle]',
  'i-[mdi--star]',
  'i-[svg-spinners--180-ring-with-bg]',
]
const DEFAULT_BEFORE_CONTENT_CLASS = 'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！\']'
const DEFAULT_AFTER_CONTENT_CLASS = 'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！\']'

type WaitForCompileSettled = (phaseStartedAt: number, phase: string) => Promise<void>

function createFreshContentClass(contentClass: string, marker: string) {
  const match = /^(.*content-\[)(['"])([\s\S]*)\2\]$/u.exec(contentClass)
  if (!match) {
    throw new Error(`web iconify HMR requires a quoted content literal: ${contentClass}`)
  }
  return `${match[1]}${match[2]}${match[3]}_${marker}${match[2]}]`
}

async function createCssClassSelectorIncludes(page: Page, classTokens: string[]) {
  return await page.evaluate((tokens) => {
    const css = (globalThis as any).CSS
    return tokens.map(token => `.${css.escape(token)}`)
  }, classTokens)
}

export async function runWebIconifyHmr(
  watchCase: WatchCase,
  options: CliOptions,
  page: Page,
  config: WebHmrConfig,
  sourceOriginal: string,
  waitForCompileSettled: WaitForCompileSettled,
) {
  const iconifyConfig = config.iconifyHmr
  if (!iconifyConfig) {
    return undefined
  }

  const iconClassTokens = iconifyConfig.iconClassTokens ?? DEFAULT_ICON_CLASS_TOKENS
  const runId = randomUUID()
  const runMarker = `tw-watch-web-iconify-${runId}`
  const marker = `tw-watch-web-iconify-${watchCase.name}-${runId}`
  // 固定内容类可能已被 safelist 生成；每轮两个阶段分别携带只来自本次源码保存的标识。
  const beforeContentClass = createFreshContentClass(iconifyConfig.beforeContentClass ?? DEFAULT_BEFORE_CONTENT_CLASS, `${runMarker}-inject`)
  const afterContentClass = createFreshContentClass(iconifyConfig.afterContentClass ?? DEFAULT_AFTER_CONTENT_CLASS, `${runMarker}-content`)
  const classLiteral = [...iconClassTokens, beforeContentClass].join(' ')
  const payload = {
    marker,
    classLiteral,
    iconClassTokens,
    beforeContentClass,
    afterContentClass,
  }
  // 默认复用框架的真实模板消费插入器；JS 注释不能成为增量候选来源。
  const sourceWithProbe = createIconifyProbeSource(watchCase, {
    ...iconifyConfig,
    sourceFile: config.sourceFile,
  }, sourceOriginal, payload)
  if (sourceWithProbe === sourceOriginal) {
    throw new Error(`[${watchCase.label}] web iconify HMR probe mutation produced no source change`)
  }
  if (!sourceWithProbe.includes(beforeContentClass) || sourceWithProbe.includes(afterContentClass)) {
    throw new Error(`[${watchCase.label}] web iconify HMR probe must contain only the inject content class`)
  }
  const sourceWithUpdatedContent = sourceWithProbe.replace(beforeContentClass, afterContentClass)
  if (sourceWithUpdatedContent === sourceWithProbe) {
    throw new Error(`[${watchCase.label}] web iconify HMR content replacement produced no source change`)
  }

  const iconCssIncludes = await createCssClassSelectorIncludes(page, iconClassTokens)
  const beforeContentCssIncludes = await createCssClassSelectorIncludes(page, [beforeContentClass])
  const afterContentCssIncludes = await createCssClassSelectorIncludes(page, [afterContentClass])
  let latestStyleEvidence: WebIconifyStyleEvidence | undefined
  const assertStyleExcludes = async (phase: string, contentIncludes: string[]) => {
    const styleText = await collectStyleText(page)
    const existingContent = contentIncludes.filter(needle => styleText.includes(needle))
    if (existingContent.length > 0) {
      throw new Error(`[${watchCase.label}] web iconify HMR ${phase} already contains this run's content CSS: ${existingContent.join(', ')}`)
    }
  }
  const assertStyleIncludes = async (phase: string, contentIncludes: string[]) => {
    const styleText = await collectStyleText(page)
    const missingIcons = iconCssIncludes.filter(needle => !styleText.includes(needle))
    const missingContent = contentIncludes.filter(needle => !styleText.includes(needle))
    latestStyleEvidence = {
      phase,
      styleText,
      expectedIconCssIncludes: iconCssIncludes,
      expectedContentCssIncludes: contentIncludes,
      missingIcons,
      missingContent,
    }
    if (missingIcons.length > 0) {
      throw new Error(`[${watchCase.label}] web iconify HMR ${phase} missing icon CSS selectors: ${missingIcons.join(', ')}`)
    }
    if (missingContent.length > 0) {
      throw new Error(`[${watchCase.label}] web iconify HMR ${phase} missing content CSS selector: ${missingContent.join(', ')}`)
    }
  }
  const waitForStyleIncludes = async (phase: string, includes: string[], phaseStartedAt: number, message: string) => {
    let lastError: unknown
    try {
      await waitFor(async () => {
        try {
          await assertStyleIncludes(phase, includes)
          return true
        }
        catch (error) {
          lastError = error
          return false
        }
      }, { timeoutMs: options.timeoutMs, pollMs: options.pollMs, message }, phaseStartedAt)
    }
    catch (error) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError)
      throw new Error(`${message}\n${detail}`, { cause: error })
    }
  }

  try {
    await assertStyleExcludes('baseline', [...beforeContentCssIncludes, ...afterContentCssIncludes])
    const injectStartedAt = Date.now()
    process.stdout.write(
      `[watch-hmr] ${watchCase.label} web iconify-hmr phase=inject icons=${iconClassTokens.join(' | ')}\n`,
    )
    await writeWatchedFilePreserveEol(config.sourceFile, sourceWithProbe, sourceOriginal)
    await waitForStyleIncludes('inject', beforeContentCssIncludes, injectStartedAt, `[${watchCase.label}] web iconify HMR probe did not generate expected CSS`)
    await waitForCompileSettled(injectStartedAt, 'iconify inject')
    await assertStyleIncludes('inject after compile settled', beforeContentCssIncludes)

    await assertStyleExcludes('before content update', afterContentCssIncludes)
    const hotUpdateStartedAt = Date.now()
    process.stdout.write(
      `[watch-hmr] ${watchCase.label} web iconify-hmr phase=content content=${afterContentClass}\n`,
    )
    await writeWatchedFilePreserveEol(config.sourceFile, sourceWithUpdatedContent, sourceOriginal)
    await waitForStyleIncludes('content', afterContentCssIncludes, hotUpdateStartedAt, `[${watchCase.label}] web iconify HMR content update did not generate expected CSS`)
    await waitForCompileSettled(hotUpdateStartedAt, 'iconify content')
    await assertStyleIncludes('content after compile settled', afterContentCssIncludes)
    const hotUpdateEffectiveMs = Date.now() - hotUpdateStartedAt

    return {
      marker,
      beforeContentClass,
      afterContentClass,
      iconClassTokens,
      contentClassTokens: [beforeContentClass, afterContentClass],
      preservedIconCssIncludes: iconCssIncludes,
      verifiedContentCssIncludes: afterContentCssIncludes,
      hotUpdateEffectiveMs,
    }
  }
  catch (error) {
    if (!latestStyleEvidence) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    let directory: string
    try {
      directory = await writeWebIconifyStyleEvidence(watchCase, config.sourceFile, marker, latestStyleEvidence)
    }
    catch (evidenceError) {
      throw new AggregateError([error, evidenceError], `${message}\nWeb Iconify 样式证据保存失败。`)
    }
    throw new Error(`${message}\n[${watchCase.label}] live style evidence: ${formatPath(directory)}`, { cause: error })
  }
}
