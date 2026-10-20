import type { Page } from 'playwright'
import type { CaptureLifecycleScreenshot, LifecycleEvent, LifecycleObservation } from './types'
import { captureLifecyclePixels } from './pixels'

interface DetailsJournal { runId: string, step: string, events: LifecycleEvent[] }

/** 两个 details 使用相同可信交互；每步等待各自新的 toggle，避免旧事件放行。 */
export async function observeDetailsContent(page: Page, runId: string, capture: CaptureLifecycleScreenshot): Promise<LifecycleObservation> {
  await page.evaluate((runId) => {
    const state: DetailsJournal = { runId, step: 'initial', events: [] }
    Reflect.set(globalThis, '__tailwindLifecycle', state)
    for (const type of ['pointerdown', 'click', 'keydown', 'toggle']) {
      document.addEventListener(type, (event) => {
        state.events.push({ type, trusted: event.isTrusted, target: (event.target as Element).id, time: performance.now(), step: state.step, key: Reflect.get(event, 'key') ?? '', oldState: Reflect.get(event, 'oldState') ?? '', newState: Reflect.get(event, 'newState') ?? '' })
      }, true)
    }
  }, runId)
  const values: LifecycleObservation['values'] = { 'supports/details-content': await page.evaluate(() => CSS.supports('selector(::details-content)')) }
  const pixels: LifecycleObservation['pixels'] = {}
  const steps: unknown[] = []
  for (const [stage, open, input] of [['initial', false, 'none'], ['click-open', true, 'click'], ['click-close', false, 'click'], ['keyboard-open', true, 'keyboard'], ['restored', false, 'keyboard']] as const) {
    await page.evaluate(stage => (Reflect.get(globalThis, '__tailwindLifecycle') as DetailsJournal).step = stage, stage)
    if (input !== 'none') {
      for (const id of ['probe', 'control']) {
        const target = page.locator(`#${id}-summary`)
        if (input === 'click') {
          await target.click()
        }
        else {
          await target.press('Enter')
        }
        await page.waitForFunction(({ id, stage, open }) => {
          const state = Reflect.get(globalThis, '__tailwindLifecycle') as DetailsJournal
          return (document.querySelector(`#${id}`) as HTMLDetailsElement).open === open && state.events.some(event => event.type === 'toggle' && event.target === id && event.step === stage && event.newState === (open ? 'open' : 'closed'))
        }, { id, stage, open }, { polling: 'raf', timeout: 3_000 })
      }
    }
    const observed = await page.evaluate(({ stage, input, open }) => {
      const state = Reflect.get(globalThis, '__tailwindLifecycle') as DetailsJournal
      const probe = document.querySelector<HTMLDetailsElement>('#probe')!
      const control = document.querySelector<HTMLDetailsElement>('#control')!
      const pseudo = getComputedStyle(probe, '::details-content')
      const events = state.events.filter(event => event.step === stage)
      const nativeInput = input === 'none' ? 'none' : ['probe', 'control'].every(id => events.some(event => event.trusted && event.target === `${id}-summary` && event.type === (input === 'click' ? 'pointerdown' : 'keydown') && (input === 'click' || event.key === 'Enter')) && events.some(event => event.trusted && event.target === `${id}-summary` && event.type === 'click')) ? input : 'missing'
      const nativeToggle = ['probe', 'control'].every(id => events.some(event => event.trusted && event.target === id && event.type === 'toggle' && event.oldState === (open ? 'closed' : 'open') && event.newState === (open ? 'open' : 'closed')))
      return { values: { [`${stage}/open`]: probe.open, [`${stage}/control-open`]: control.open, [`${stage}/pseudo-background`]: pseudo.backgroundColor, [`${stage}/pseudo-content-visibility`]: pseudo.contentVisibility, [`${stage}/content-background`]: getComputedStyle(document.querySelector('#probe-content')!).backgroundColor, [`${stage}/control-pseudo-background`]: getComputedStyle(control, '::details-content').backgroundColor, [`${stage}/native-input`]: nativeInput, [`${stage}/native-toggle`]: nativeToggle }, events, probeRect: probe.getBoundingClientRect().toJSON(), controlRect: control.getBoundingClientRect().toJSON() }
    }, { stage, input, open })
    const image = await captureLifecyclePixels(page, capture, stage, ['probe', 'control'].flatMap(id => [{ id: `${id}-content`, selector: `#${id}-slot`, x: 0.5, y: 0.4 }, { id: `${id}-summary`, selector: `#${id}-summary`, x: 0.9, y: 0.5 }]))
    Object.assign(values, observed.values, image.values)
    pixels[stage] = image.pixels
    steps.push({ stage, ...observed, geometry: image.geometry })
  }
  const journal = await page.evaluate(() => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as DetailsJournal
    return { events: state.events, url: location.href, id: document.body.dataset.lifecycleFixture, runId: document.body.dataset.runId, restored: !document.querySelector<HTMLDetailsElement>('#probe')!.open && !document.querySelector<HTMLDetailsElement>('#control')!.open }
  })
  values.restored = journal.restored
  return { runId: journal.runId ?? '', id: journal.id as 'lifecycle-details-content', url: journal.url, values, events: journal.events, pixels, restoration: { restored: journal.restored, steps } }
}
