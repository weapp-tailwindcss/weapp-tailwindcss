import type { Page } from 'playwright'
import type { CliOptions, WatchCase, WebHmrConfig } from '../types'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { waitFor, writeWatchedFilePreserveEol } from '../text'
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

function insertDefaultWebIconifyProbe(source: string, sourceFile: string, payload: {
  marker: string
  classLiteral: string
}) {
  const extension = sourceFile.split('?')[0]?.split('#')[0]?.match(/\.[^.\\/]+$/)?.[0]
  if (extension === '.tsx' || extension === '.jsx' || extension === '.ts' || extension === '.js') {
    return `${source}\n// ${payload.marker} ${payload.classLiteral}\n`
  }
  if (source.includes('</template>')) {
    return source.replace(
      '</template>',
      `  <view class="${payload.classLiteral}">${payload.marker}-web-iconify</view>\n</template>`,
    )
  }
  return `${source}\n<!-- ${payload.marker} ${payload.classLiteral} -->\n`
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
  const sourceWithProbe = iconifyConfig.mutate
    ? iconifyConfig.mutate(sourceOriginal, payload)
    : insertDefaultWebIconifyProbe(sourceOriginal, config.sourceFile, payload)
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
    if (missingIcons.length > 0) {
      throw new Error(`[${watchCase.label}] web iconify HMR ${phase} missing icon CSS selectors: ${missingIcons.join(', ')}`)
    }
    const missingContent = contentIncludes.filter(needle => !styleText.includes(needle))
    if (missingContent.length > 0) {
      throw new Error(`[${watchCase.label}] web iconify HMR ${phase} missing content CSS selector: ${missingContent.join(', ')}`)
    }
  }

  await assertStyleExcludes('baseline', [...beforeContentCssIncludes, ...afterContentCssIncludes])
  const injectStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} web iconify-hmr phase=inject icons=${iconClassTokens.join(' | ')}\n`,
  )
  await writeWatchedFilePreserveEol(config.sourceFile, sourceWithProbe, sourceOriginal)
  await waitFor(
    async () => {
      try {
        await assertStyleIncludes('inject', beforeContentCssIncludes)
        return true
      }
      catch {
        return false
      }
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: `[${watchCase.label}] web iconify HMR probe did not generate expected CSS`,
    },
    injectStartedAt,
  )
  await waitForCompileSettled(injectStartedAt, 'iconify inject')
  await assertStyleIncludes('inject after compile settled', beforeContentCssIncludes)

  await assertStyleExcludes('before content update', afterContentCssIncludes)
  const hotUpdateStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} web iconify-hmr phase=content content=${afterContentClass}\n`,
  )
  await writeWatchedFilePreserveEol(config.sourceFile, sourceWithUpdatedContent, sourceOriginal)
  await waitFor(
    async () => {
      try {
        await assertStyleIncludes('content', afterContentCssIncludes)
        return true
      }
      catch {
        return false
      }
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: `[${watchCase.label}] web iconify HMR content update did not preserve icon CSS`,
    },
    hotUpdateStartedAt,
  )
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
