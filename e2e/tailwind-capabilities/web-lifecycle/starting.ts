import type { Page } from 'playwright'
import type { CaptureLifecycleScreenshot, LifecycleEvent, LifecycleObservation, StartingFrame } from './types'
import { naturalStartingTimeline } from './contract'
import { captureLifecyclePixels } from './pixels'

interface StartingJournal {
  runId: string
  cycle: number
  phase: string
  frames: StartingFrame[]
  events: LifecycleEvent[]
  raf: number
}

async function insertCycle(page: Page, cycle: number) {
  await page.evaluate(async (cycle) => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    state.phase = 'idle'
    document.querySelector('#host')!.replaceChildren()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    state.cycle = cycle
    state.phase = 'natural'
    document.querySelector('#host')!.append((document.querySelector('#starting-template') as HTMLTemplateElement).content.cloneNode(true))
    state.frames.push({ cycle, time: performance.now(), probe: Number(getComputedStyle(document.querySelector('#probe')!).opacity), control: Number(getComputedStyle(document.querySelector('#control')!).opacity) })
  }, cycle)
}

async function animationSnapshot(page: Page) {
  return page.evaluate(() => {
    const animation = Reflect.get(globalThis, '__tailwindLifecycleAnimation') as CSSTransition
    const target = (animation.effect as KeyframeEffect).target
    return { native: animation instanceof CSSTransition, registered: document.querySelector('#probe')!.getAnimations().includes(animation), target: target instanceof Element ? target.id : '', property: animation.transitionProperty, playState: animation.playState, currentTime: Number(animation.currentTime), duration: Number(animation.effect!.getTiming().duration), playbackRate: animation.playbackRate, probeOpacity: Number(getComputedStyle(document.querySelector('#probe')!).opacity), controlOpacity: Number(getComputedStyle(document.querySelector('#control')!).opacity) }
  })
}

/** 先保存完整自然进入，再对重插产生的原生 transition 暂停取证并恢复。 */
export async function observeStarting(page: Page, runId: string, capture: CaptureLifecycleScreenshot): Promise<LifecycleObservation> {
  await page.evaluate((runId) => {
    const state: StartingJournal = { runId, cycle: 0, phase: 'idle', frames: [], events: [], raf: 0 }
    Reflect.set(globalThis, '__tailwindLifecycle', state)
    for (const type of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel']) {
      document.addEventListener(type, (raw) => {
        const event = raw as TransitionEvent
        state.events.push({ type, trusted: event.isTrusted, target: (event.target as Element).id, time: performance.now(), cycle: state.cycle, phase: state.phase, property: event.propertyName, elapsedTime: event.elapsedTime, pseudoElement: event.pseudoElement })
      }, true)
    }
    const sampler = {
      tick() {
        const probe = document.querySelector('#probe')
        const control = document.querySelector('#control')
        if (state.phase === 'natural' && probe && control) {
          state.frames.push({ cycle: state.cycle, time: performance.now(), probe: Number(getComputedStyle(probe).opacity), control: Number(getComputedStyle(control).opacity) })
        }
        state.raf = requestAnimationFrame(() => sampler.tick())
      },
    }
    state.raf = requestAnimationFrame(() => sampler.tick())
  }, runId)
  await insertCycle(page, 1)
  await page.waitForFunction(() => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    return state.events.some(event => event.cycle === 1 && event.phase === 'natural' && event.target === 'probe' && event.type === 'transitionend') && state.frames.at(-1)?.probe === 1
  }, undefined, { polling: 'raf', timeout: 6_000 })
  await insertCycle(page, 2)
  await page.waitForFunction(() => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    const frames = state.frames.filter(frame => frame.cycle === 2)
    return frames.length >= 4 && frames.at(-1)!.probe >= 0.15 && frames.at(-1)!.probe < 0.7
  }, undefined, { polling: 'raf', timeout: 6_000 })
  const paused = await page.evaluate(async () => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    const transitions = document.querySelector('#probe')!.getAnimations().filter(animation => animation instanceof CSSTransition && animation.transitionProperty === 'opacity') as CSSTransition[]
    if (transitions.length !== 1) {
      throw new Error('没有唯一的原生 opacity CSSTransition，禁止创建替代动画')
    }
    const animation = transitions[0]!
    state.phase = 'evidence'
    animation.pause()
    await animation.ready
    const duration = Number(animation.effect!.getTiming().duration)
    const currentTime = Number(animation.currentTime)
    if (!Number.isFinite(duration) || duration <= 0 || currentTime <= 0 || currentTime >= duration) {
      throw new Error('真实 transition 缺少可恢复的自然时间点')
    }
    Reflect.set(globalThis, '__tailwindLifecycleAnimation', animation)
    return { duration, currentTime, cycle: state.cycle, phase: state.phase }
  })
  const values: LifecycleObservation['values'] = {}
  const pixels: LifecycleObservation['pixels'] = {}
  const snapshots: unknown[] = []
  let pausedExisting = true
  for (const [stage, progress] of [['start', 0], ['middle', 0.5]] as const) {
    await page.evaluate(async (time) => {
      const animation = Reflect.get(globalThis, '__tailwindLifecycleAnimation') as CSSTransition
      animation.currentTime = time
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }, paused.duration * progress)
    const before = await animationSnapshot(page)
    const image = await captureLifecyclePixels(page, capture, stage, ['probe', 'control'].map(id => ({ id, selector: `#${id}`, x: 0.5, y: 0.5 })))
    const after = await animationSnapshot(page)
    snapshots.push({ stage, progress, before, after, geometry: image.geometry })
    pausedExisting &&= [before, after].every(snapshot => snapshot.native && snapshot.registered && snapshot.target === 'probe' && snapshot.property === 'opacity' && snapshot.playState === 'paused' && Math.abs(snapshot.currentTime - paused.duration * progress) < 0.1)
    Object.assign(values, image.values, { [`${stage}/probe-opacity`]: after.probeOpacity, [`${stage}/control-opacity`]: after.controlOpacity })
    pixels[stage] = image.pixels
  }
  await page.evaluate((time) => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    const animation = Reflect.get(globalThis, '__tailwindLifecycleAnimation') as CSSTransition
    animation.currentTime = time
    state.phase = 'restoration'
    animation.play()
  }, paused.currentTime)
  await page.waitForFunction(() => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    return state.events.some(event => event.cycle === 2 && event.phase === 'restoration' && event.type === 'transitionend' && event.target === 'probe') && getComputedStyle(document.querySelector('#probe')!).opacity === '1'
  }, undefined, { polling: 'raf', timeout: 6_000 })
  const beforeEnd = await animationSnapshot(page)
  const endImage = await captureLifecyclePixels(page, capture, 'end', ['probe', 'control'].map(id => ({ id, selector: `#${id}`, x: 0.5, y: 0.5 })))
  const afterEnd = await animationSnapshot(page)
  snapshots.push({ stage: 'end', progress: 1, before: beforeEnd, after: afterEnd, geometry: endImage.geometry })
  Object.assign(values, endImage.values, { 'end/probe-opacity': afterEnd.probeOpacity, 'end/control-opacity': afterEnd.controlOpacity })
  pixels.end = endImage.pixels
  const journal = await page.evaluate(() => {
    const state = Reflect.get(globalThis, '__tailwindLifecycle') as StartingJournal
    cancelAnimationFrame(state.raf)
    return { frames: state.frames, events: state.events, url: location.href, id: document.body.dataset.lifecycleFixture, runId: document.body.dataset.runId, finalOpacity: Number(getComputedStyle(document.querySelector('#probe')!).opacity) }
  })
  Object.assign(values, {
    'natural/first': naturalStartingTimeline(journal.frames, 1, true),
    'natural/reinserted': naturalStartingTimeline(journal.frames, 2, false),
    'native/transition-events': [1, 2].every(cycle => ['transitionrun', 'transitionstart', 'transitionend'].every(type => journal.events.some(event => event.trusted && event.cycle === cycle && event.target === 'probe' && event.property === 'opacity' && event.type === type && event.phase === (type === 'transitionend' && cycle === 2 ? 'restoration' : 'natural')))),
    'native/control-no-transition': !journal.events.some(event => event.target === 'control'),
    'native/paused-existing-transition': pausedExisting,
    'natural/control-opacity': journal.frames.every(frame => frame.control === 1),
    'restored': journal.finalOpacity === 1,
  })
  return { runId: journal.runId ?? '', id: journal.id as 'lifecycle-starting', url: journal.url, values, events: journal.events, frames: journal.frames, pixels, restoration: { restoredFrom: paused, snapshots, finalOpacity: journal.finalOpacity, finalSnapshot: afterEnd } }
}

export function startingObserverDefinition() {
  return [observeStarting, insertCycle, animationSnapshot].map(fn => fn.toString())
}
