import type { Page } from 'playwright'
import type { ContextStep, ContextValues } from './fixtures'

export interface NativeContextEvent {
  type: string
  trusted: boolean
  target: string
  value: string
  pointerType: string
}

export interface ContextObservation {
  values: ContextValues
  events: NativeContextEvent[]
}

/** 读取环境与状态，不用 evaluate 设置 value、派发事件或伪造媒体查询。 */
export async function observeContextState(page: Page, step: ContextStep): Promise<ContextObservation> {
  const queries = Object.keys(step.expected).filter(key => key.startsWith('media/')).map(key => key.slice('media/'.length))
  return page.evaluate(({ queries }) => {
    const target = document.querySelector<HTMLElement>('#probe')!
    const control = document.querySelector<HTMLElement>('#control')!
    const raw = Reflect.get(globalThis, '__tailwindContextEvents')
    const events: NativeContextEvent[] = Array.isArray(raw) ? raw : []
    const input = target instanceof HTMLInputElement ? target : undefined
    const native = new Set(events.filter(event => event.trusted).map(event => event.type))
    const edited = new Set(events.filter(event => event.trusted && event.target === 'probe' && event.value === input?.value).map(event => event.type))
    const disabledContent = document.querySelector<HTMLElement>('#disabled-content')
    const values: ContextValues = {
      'fixture': document.body.dataset.contextFixture ?? '',
      'script': Reflect.get(globalThis, '__tailwindContextScript') ?? '',
      'background': getComputedStyle(target).backgroundColor,
      'control': getComputedStyle(control).backgroundColor,
      'rendered': target.getClientRects().length > 0 && target.getBoundingClientRect().width > 0 && target.getBoundingClientRect().height > 0,
      'noscript-visible': Boolean(disabledContent && disabledContent.getClientRects().length && disabledContent.getBoundingClientRect().width > 0 && disabledContent.getBoundingClientRect().height > 0),
      'native/untrusted': events.some(event => !event.trusted),
      'native/pointer-mouse': events.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === 'mouse' && event.target === 'probe'),
      'native/pointer-touch': events.some(event => event.type === 'pointerdown' && event.trusted && event.pointerType === 'touch' && event.target === 'probe'),
      ...Object.fromEntries(queries.map(query => [`media/${query}`, matchMedia(query).matches])),
    }
    if (input) {
      Object.assign(values, {
        'supports/user-valid': CSS.supports('selector(:user-valid)'),
        'supports/user-invalid': CSS.supports('selector(:user-invalid)'),
        'input/type': input.type,
        'input/required': input.required,
        'input/disabled': input.disabled,
        'input/read-only': input.readOnly,
        'input/valid': input.validity.valid,
        'input/value': input.value,
        'matches/user-valid': input.matches(':user-valid'),
        'matches/user-invalid': input.matches(':user-invalid'),
        'native/input-current': edited.has('input'),
        'native/change-current': edited.has('change'),
        'native/blur-current': edited.has('blur'),
        'native/invalid': native.has('invalid'),
        'native/submit': native.has('submit'),
        'native/reset': native.has('reset'),
      })
    }
    return { values, events }
  }, { queries })
}
