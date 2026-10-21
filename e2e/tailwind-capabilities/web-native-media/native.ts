import type { CDPSession, Page } from 'playwright'
import type { MediaCommand, MediaObservation, MediaParameters } from './types'
import { bounded } from './deadline'
import { mediaValue, nativeMediaElements, nativeMediaQueries, nativeMediaStates } from './fixtures'
import { identityColors } from './identity'

export function contrastParameters(value: 'less' | 'more' | 'custom' | 'no-preference'): MediaParameters {
  return { media: 'screen', features: [{ name: 'prefers-contrast', value }, { name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'forced-colors', value: 'none' }] }
}

async function sendMedia(session: CDPSession, command: MediaCommand) {
  try {
    command.response = await bounded('媒体原生协议', () => session.send(command.method, command.params))
  }
  catch (error) {
    command.error = String(error)
    throw error
  }
}

/** 只使用本 page 的 Chromium 原生协议；清理异常和原始异常一起保留。 */
export async function observeNativeContrast(page: Page, observation: MediaObservation, capture: (state: string) => Promise<string>, documentRunId: string, cssHash: string) {
  const session = await bounded('创建媒体协议连接', () => page.context().newCDPSession(page))
  const errors: unknown[] = []
  try {
    for (const name of nativeMediaStates) {
      const command: MediaCommand = { method: 'Emulation.setEmulatedMedia', params: contrastParameters(mediaValue(name)) }
      await sendMedia(session, command)
      const raw = await bounded('媒体绘制观察', () => page.evaluate(async ({ elements, queries, colors }) => {
        document.querySelectorAll<HTMLElement>('#identity i').forEach((node, i) => {
          node.style.backgroundColor = `rgb(${colors[i]!.join(',')})`
        })
        const frames: number[] = []
        for (let i = 0; i < 2; i++) {
          frames.push(await new Promise<number>(resolve => requestAnimationFrame(resolve)))
        }
        const nodes = elements.map(id => [id, document.getElementById(id)!] as const)
        return {
          id: document.body.dataset['fixture'] ?? '',
          runId: document.body.dataset['runId'] ?? '',
          url: location.href,
          frames,
          queries: Object.fromEntries(queries.map(value => [value, matchMedia(`(prefers-contrast: ${value})`).matches])),
          backgrounds: Object.fromEntries(nodes.map(([id, node]) => [id, getComputedStyle(node).backgroundColor])),
          rects: Object.fromEntries(nodes.map(([id, node]) => {
            const { left, top, width, height } = node.getBoundingClientRect()
            return [id, { left, top, width, height }]
          })),
        }
      }, { elements: nativeMediaElements, queries: nativeMediaQueries, colors: identityColors(documentRunId, name, cssHash) }))
      const state = { name, command, ...raw, screenshot: '' }
      observation.states.push(state)
      state.screenshot = await bounded('媒体状态截图', () => capture(name))
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    observation.cleanup.reset = { method: 'Emulation.setEmulatedMedia', params: { media: '', features: [] } }
    try {
      await sendMedia(session, observation.cleanup.reset)
    }
    catch (error) {
      observation.cleanup.errors.push(`媒体恢复失败：${String(error)}`)
      errors.push(error)
    }
    try {
      await bounded('释放媒体协议连接', () => session.detach())
      observation.cleanup.detached = true
    }
    catch (error) {
      observation.cleanup.errors.push(`协议连接释放失败：${String(error)}`)
      errors.push(error)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map(String).join('；'))
  }
}
