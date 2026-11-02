import type { HmrSourceMutation, WebHmrStep } from '../cases'
import fs from 'node:fs/promises'
import { readUtf8 } from '../process'
import { applyHmrSourceMutation } from '../source-mutations'

function resolveAnchor(source: string, anchors: string[]) {
  return anchors.find(anchor => source.includes(anchor))
}

export async function rewriteHmrMarker(file: string, anchors: string[], steps: WebHmrStep[], stepIndex: number, mutation?: HmrSourceMutation, writeSource = async (target: string, content: string) => fs.writeFile(target, content, 'utf8')) {
  let source = await readUtf8(file)
  const persistentMarkerRE = /<view class="[^"]*\bhbuilderx-web-hmr-probe\b[^"]*">[^<]*<\/view>/
  const step = steps[stepIndex]
  if (!step) {
    throw new Error(`缺少 Web HMR 步骤：${stepIndex}`)
  }
  if (mutation) {
    source = applyHmrSourceMutation(source, mutation)
  }
  const persistentMarker = `<view class="hbuilderx-web-hmr-probe ${step.markerClass.replace(/\bhbuilderx-web-hmr-probe\b/g, '').trim()}">${step.markerText}</view>`
  if (persistentMarkerRE.test(source)) {
    await writeSource(file, source.replace(persistentMarkerRE, persistentMarker))
    return
  }
  const markerRE = /\n\t\t<view class="[^"]+">hbuilderx-web-hmr-[^<]+<\/view>/g
  const cleaned = source.replace(markerRE, '')
  const anchor = resolveAnchor(cleaned, anchors)
  const index = anchor ? cleaned.indexOf(anchor) : -1
  if (index < 0) {
    throw new Error(`找不到 HMR 插入锚点：${file}`)
  }
  const insertion = persistentMarker
  const next = `${cleaned.slice(0, index)}${insertion}\n\t\t${cleaned.slice(index)}`
  await writeSource(file, next)
}
