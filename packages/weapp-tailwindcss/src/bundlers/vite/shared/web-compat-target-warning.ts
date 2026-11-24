import type { WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/types'
import type { BuildOptions } from 'vite'

const LEGACY_WEB_CHROMIUM_BASELINE = 91
const CHROMIUM_TARGET_PATTERN = /^(?:chrome|edge|and_chr)(\d+)(?:\.\d+)*$/i

function usesLegacyWebCompat(webCompat: WebCssCompatUserOptions | undefined) {
  if (webCompat === true) {
    return true
  }
  if (!webCompat || typeof webCompat !== 'object') {
    return false
  }
  return (webCompat.preset ?? 'legacy-web') === 'legacy-web'
}

function getConfiguredCssTargets(build: Pick<BuildOptions, 'target' | 'cssTarget'>) {
  if (build.cssTarget === false) {
    return []
  }

  const target = build.cssTarget ?? build.target
  return Array.isArray(target) ? target : [target]
}

export function getLegacyWebCompatTargetWarning(
  build: Pick<BuildOptions, 'target' | 'cssTarget'>,
  webCompat: WebCssCompatUserOptions | undefined,
) {
  if (!usesLegacyWebCompat(webCompat)) {
    return undefined
  }

  const unsupportedTargets = getConfiguredCssTargets(build).flatMap((target) => {
    if (typeof target !== 'string') {
      return []
    }

    const match = CHROMIUM_TARGET_PATTERN.exec(target.trim())
    if (!match || Number(match[1]) >= LEGACY_WEB_CHROMIUM_BASELINE) {
      return []
    }
    return [target]
  })

  if (unsupportedTargets.length === 0) {
    return undefined
  }

  return `generator.webCompat 的 legacy-web 基线为 Chrome 91 / AppleWebKit 537.36，Vite CSS 目标 ${unsupportedTargets.join(', ')} 低于该基线。可静态计算的 Tailwind CSS v4 数值除法会降级，其他 CSS 语法仍需满足 Vite CSS 目标。`
}
