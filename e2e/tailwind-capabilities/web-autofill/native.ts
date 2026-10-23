import type { CDPSession, Page } from 'playwright'
import type { AutofillCommand, AutofillEvent, AutofillObservation } from './types'
import { waitForFrameProgress } from '../browser/frames'
import { bounded } from '../web-native-media/deadline'
import { addressFields, autofillAddress, autofillColors, autofillIds, autofillProbe, autofillStates } from './fixtures'

async function send(session: CDPSession, command: AutofillCommand) {
  try {
    command.response = await bounded(command.method, () => session.send(command.method, command.params))
  }
  catch (error) {
    command.error = String(error)
    throw error
  }
}

/** 地址为虚构数据；trigger 不保存地址，临时 context 不消费用户 profile。 */
export async function observeAutofill(page: Page, observation: AutofillObservation, capture: (state: string) => Promise<string>, runId: string, cssHash: string) {
  const session = await bounded('创建 Autofill 协议连接', () => page.context().newCDPSession(page))
  let filled: (() => void) | undefined
  const event = (value: AutofillEvent) => {
    observation.events.push(value)
    observation.timeline.push(`native-event/${observation.events.length - 1}`)
    filled?.()
  }
  session.on('Autofill.addressFormFilled', event)
  const errors: unknown[] = []
  let documentTimeOrigin: number | undefined
  try {
    const enable: AutofillCommand = { method: 'Autofill.enable', params: {} }
    observation.commands.push(enable)
    await send(session, enable)
    observation.timeline.push('enable')
    const { frameId, backendIds } = await bounded('识别本页 frame 和字段', async () => {
      const { root } = await session.send('DOM.getDocument')
      const { frameTree } = await session.send('Page.getFrameTree')
      const backendIds: Record<string, number> = {}
      for (const id of autofillIds) {
        const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
        const { node } = await session.send('DOM.describeNode', { nodeId })
        backendIds[id] = node.backendNodeId
      }
      return { frameId: frameTree.frame.id, backendIds }
    })
    observation.identity = { frameId, backendIds }
    for (const state of autofillStates) {
      if (state === 'filled') {
        await page.locator('#probe').click()
        const notified = new Promise<void>((resolve) => {
          filled = resolve
        })
        const trigger: AutofillCommand = { method: 'Autofill.trigger', params: { fieldId: backendIds['probe'], frameId, address: autofillAddress } }
        observation.commands.push(trigger)
        observation.timeline.push('trigger')
        await send(session, trigger)
        // 原生事件的 value 可能来自 profile；仍需等待 renderer 的标准伪类和真实字段值。
        await bounded('等待原生填充事件', () => notified)
        await page.waitForFunction(fields => fields.every(({ id, value }) => {
          const input = document.getElementById(id) as HTMLInputElement
          return input.value === value && input.matches(':autofill')
        }), addressFields)
      }
      if (state === 'restored') {
        for (const { id } of addressFields) {
          await page.locator(`#${id}`).click()
          await page.locator(`#${id}`).press('ControlOrMeta+A')
          await page.locator(`#${id}`).press('Backspace')
          await page.locator(`#${id}`).pressSequentially('Edited')
        }
      }
      const raw = await bounded('Autofill 绘制观察', async () => {
        const deadline = performance.now() + 5_000
        const timeOrigin = await page.evaluate((colors) => {
          document.querySelectorAll<HTMLElement>('#identity i').forEach((node, index) => {
            node.style.backgroundColor = `rgb(${colors[index]!.join(',')})`
          })
          return performance.timeOrigin
        }, autofillColors(runId, state, cssHash))
        documentTimeOrigin ??= timeOrigin
        if (timeOrigin !== documentTimeOrigin) {
          throw new Error('Autofill 观察期间文档已变化')
        }
        const frames = await page.evaluate(waitForFrameProgress, { after: observation.states.at(-1)?.frames[1] ?? -1, timeOrigin, timeoutMs: Math.max(1, deadline - performance.now()) })
        return page.evaluate(({ ids, frames, timeOrigin }) => {
          if (performance.timeOrigin !== timeOrigin) {
            throw new Error('Autofill 采样的文档已变化')
          }
          return {
            id: document.body.dataset['fixture'] ?? '',
            runId: document.body.dataset['runId'] ?? '',
            url: location.href,
            frames,
            fields: Object.fromEntries(ids.map((id) => {
              const node = document.getElementById(id) as HTMLInputElement
              const style = getComputedStyle(node)
              const { left, top, width, height } = node.getBoundingClientRect()
              return [id, { value: node.value, autofill: node.matches(':autofill'), outline: { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor }, rect: { left, top, width, height } }]
            })),
            journal: (globalThis as typeof globalThis & { __autofillJournal: AutofillObservation['states'][number]['journal'] }).__autofillJournal,
          }
        }, { ids: autofillIds, frames, timeOrigin })
      })
      const result = { name: state, ...raw, screenshot: '' }
      observation.states.push(result)
      observation.timeline.push(`state/${state}`)
      if (result.id !== autofillProbe.id) {
        throw new Error('自动填充页面身份不符')
      }
      result.screenshot = await bounded('Autofill 状态截图', () => capture(state))
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    observation.cleanup.disable = { method: 'Autofill.disable', params: {} }
    observation.timeline.push('disable')
    try {
      await send(session, observation.cleanup.disable)
    }
    catch (error) {
      observation.cleanup.errors.push(String(error))
      errors.push(error)
    }
    session.off('Autofill.addressFormFilled', event)
    try {
      await bounded('释放 Autofill 协议连接', () => session.detach())
      observation.cleanup.detached = true
    }
    catch (error) {
      observation.cleanup.errors.push(String(error))
      errors.push(error)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map(String).join('；'))
  }
}
