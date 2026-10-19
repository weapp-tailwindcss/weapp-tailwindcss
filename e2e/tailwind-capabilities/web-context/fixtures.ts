import type { BrowserContextOptions } from 'playwright'

export const contextProfiles = {
  desktop: { javaScriptEnabled: true, hasTouch: false },
  touch: { javaScriptEnabled: true, hasTouch: true },
  noscript: { javaScriptEnabled: false, hasTouch: false },
} satisfies Record<string, BrowserContextOptions>

export type ContextProfile = keyof typeof contextProfiles
export type ContextAction = 'pointer' | 'invalid-input' | 'invalid-submit' | 'valid-input' | 'valid-submit' | 'reset'
export type ContextValues = Record<string, string | number | boolean>

export interface ContextStep {
  name: string
  profile: ContextProfile
  action?: ContextAction
  expected: ContextValues
}

export interface ContextWebProbe {
  id: string
  candidate: string
  features: string[]
  html: string
  steps: ContextStep[]
}

const neutral = 'rgb(1, 2, 3)'
const active = 'rgb(18, 52, 86)'
const element = '<div id="probe" class="CANDIDATE">Context variant</div><div id="control">Classless control</div>'
const form = '<form><input id="probe" class="CANDIDATE" type="email" required autocomplete="off"><button id="submit" type="submit">Submit</button><button id="reset" type="reset">Reset</button></form><div id="control">Classless control</div>'

function expected(id: string, background: string, values: ContextValues = {}): ContextValues {
  return { fixture: id, script: id, background, control: neutral, rendered: true, ...values }
}

function pointerMedia(touch: boolean): ContextValues {
  return Object.fromEntries(['pointer', 'any-pointer'].flatMap(kind => ['coarse', 'fine', 'none'].map(value => [`media/(${kind}: ${value})`, value === (touch ? 'coarse' : 'fine')])))
}

const pointerProbes: ContextWebProbe[] = ['pointer-coarse', 'pointer-fine', 'any-pointer-coarse', 'any-pointer-fine'].map((root) => {
  const id = `context-${root}`
  const coarse = root.endsWith('coarse')
  const pointerStep = (profile: 'desktop' | 'touch', name: string): ContextStep => ({
    name,
    profile,
    action: 'pointer',
    expected: expected(id, coarse === (profile === 'touch') ? active : neutral, { ...pointerMedia(profile === 'touch'), 'native/pointer-mouse': profile === 'desktop', 'native/pointer-touch': profile === 'touch', 'native/untrusted': false }),
  })
  return { id, candidate: `${root}:bg-[#123456]`, features: [`variant/static/${root}`], html: element, steps: [pointerStep('desktop', 'desktop'), pointerStep('touch', 'touch'), pointerStep('desktop', 'desktop-restored')] }
})

const noscriptId = 'context-noscript'
const noscriptProbe: ContextWebProbe = {
  id: noscriptId,
  candidate: 'noscript:bg-[#123456]',
  features: ['variant/static/noscript'],
  html: `${element}<noscript><div id="disabled-content">Native noscript content</div></noscript>`,
  steps: [
    { name: 'enabled', profile: 'desktop', expected: expected(noscriptId, neutral, { 'media/(scripting: none)': false, 'noscript-visible': false }) },
    { name: 'disabled', profile: 'noscript', expected: expected(noscriptId, active, { 'script': '', 'media/(scripting: none)': true, 'noscript-visible': true }) },
    { name: 'enabled-restored', profile: 'desktop', expected: expected(noscriptId, neutral, { 'media/(scripting: none)': false, 'noscript-visible': false }) },
  ],
}

const validityProbes: ContextWebProbe[] = ['user-invalid', 'user-valid'].map((root) => {
  const id = `context-${root}`
  const validStyle = root === 'user-valid'
  const state = (name: string, valid: boolean, interacted: boolean, values: ContextValues = {}, action?: ContextAction): ContextStep => ({
    name,
    profile: 'desktop',
    ...(action ? { action } : {}),
    expected: expected(id, interacted && validStyle === valid ? active : neutral, {
      'supports/user-valid': true,
      'supports/user-invalid': true,
      'input/type': 'email',
      'input/required': true,
      'input/disabled': false,
      'input/read-only': false,
      'input/valid': valid,
      'input/value': interacted ? valid ? 'valid@example.com' : 'invalid' : '',
      'matches/user-valid': interacted && valid,
      'matches/user-invalid': interacted && !valid,
      'native/input-current': interacted,
      'native/change-current': interacted,
      'native/blur-current': interacted,
      'native/invalid': false,
      'native/submit': false,
      'native/reset': false,
      'native/untrusted': false,
      ...values,
    }),
  })
  return {
    id,
    candidate: `${root}:bg-[#123456]`,
    features: [`variant/static/${root}`],
    html: form,
    steps: [
      state('pristine', false, false),
      state('invalid-blurred', false, true, {}, 'invalid-input'),
      state('invalid-submitted', false, true, { 'native/invalid': true }, 'invalid-submit'),
      state('valid-blurred', true, true, { 'native/invalid': true }, 'valid-input'),
      state('valid-submitted', true, true, { 'native/invalid': true, 'native/submit': true }, 'valid-submit'),
      state('reset', false, false, { 'native/invalid': true, 'native/submit': true, 'native/reset': true }, 'reset'),
    ],
  }
})

export const contextWebProbes = [...pointerProbes, noscriptProbe, ...validityProbes]
export const contextWebCandidates = contextWebProbes.map(probe => probe.candidate)
export const contextWebFixtureCss = '@import "tailwindcss" source(none);\n@layer base { html { font-size:16px; } body { margin:24px; } #probe,#control { display:block; width:160px; height:40px; background-color:#010203; color:#040506; transition:none; } }'

export { contextWebCandidates as contextCandidateList, contextWebFixtureCss as contextFixtureCss }

/** 只记录真实事件，不在页面脚本中设置表单值、有效性或匹配状态。 */
export const contextEventJournal = `globalThis.__tailwindContextScript = document.body.dataset.contextFixture;
globalThis.__tailwindContextEvents = [];
for (const type of ['input','change','blur','invalid','submit','reset','pointerdown']) {
  document.addEventListener(type, event => {
    globalThis.__tailwindContextEvents.push({ type, trusted:event.isTrusted, target:event.target.id || event.target.tagName, value:event.target.value || '', pointerType:event.pointerType || '' });
    if (type === 'submit') event.preventDefault();
  }, true);
}`

export function renderContextWebProbe(probe: ContextWebProbe, css: string): string {
  const escaped = probe.candidate.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body data-context-fixture="${probe.id}">${probe.html.replaceAll('CANDIDATE', escaped)}<script>${contextEventJournal}</script></body></html>`
}
