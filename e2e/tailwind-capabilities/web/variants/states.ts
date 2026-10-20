import { attribute, variantElement, variantInput, variantProbe } from './shared'

export const stateVariantProbes = [
  variantProbe('controlled-disabled', 'disabled', ['variant/static/disabled'], [attribute('#probe', 'disabled', null, '')], variantInput),
  variantProbe('controlled-enabled', 'enabled', ['variant/static/enabled'], [attribute('#probe', 'disabled', '', null)], variantInput),
  variantProbe('controlled-required', 'required', ['variant/static/required'], [attribute('#probe', 'required', null, '')], variantInput),
  variantProbe('controlled-optional', 'optional', ['variant/static/optional'], [attribute('#probe', 'required', '', null)], variantInput),
  variantProbe('controlled-read-only', 'read-only', ['variant/static/read-only'], [attribute('#probe', 'readonly', null, '')], variantInput),
  variantProbe('controlled-invalid', 'invalid', ['variant/static/invalid'], [{ kind: 'value', selector: '#probe', before: 'valid', after: '' }], variantInput.replace('class=', 'required class=')),
  variantProbe('controlled-valid', 'valid', ['variant/static/valid'], [{ kind: 'value', selector: '#probe', before: '', after: 'valid' }], variantInput.replace('class=', 'required class=')),
  variantProbe('controlled-in-range', 'in-range', ['variant/static/in-range'], [{ kind: 'value', selector: '#probe', before: '11', after: '5' }], variantInput.replace('class=', 'type="number" min="1" max="10" class=')),
  variantProbe('controlled-out-of-range', 'out-of-range', ['variant/static/out-of-range'], [{ kind: 'value', selector: '#probe', before: '5', after: '11' }], variantInput.replace('class=', 'type="number" min="1" max="10" class=')),
  variantProbe('controlled-placeholder-shown', 'placeholder-shown', ['variant/static/placeholder-shown'], [{ kind: 'value', selector: '#probe', before: 'filled', after: '' }], variantInput.replace('class=', 'placeholder="controlled placeholder" class=')),
  variantProbe('controlled-indeterminate', 'indeterminate', ['variant/static/indeterminate'], [{ kind: 'property', selector: '#probe', name: 'indeterminate', before: false, after: true }], variantInput.replace('class=', 'type="checkbox" class=')),
  variantProbe('controlled-open', 'open', ['variant/static/open'], [attribute('#probe', 'open', null, '')], '<details id="probe" class="probe CANDIDATE"><summary>Open state</summary><p>Contents</p></details>'),
  variantProbe('controlled-inert', 'inert', ['variant/static/inert'], [attribute('#scope', 'inert', null, '')], `<section id="scope">${variantElement}</section>`),
  variantProbe('controlled-rtl', 'rtl', ['variant/static/rtl'], [attribute('#scope', 'dir', 'ltr', 'rtl')], `<section id="scope">${variantElement}</section>`),
  variantProbe('controlled-ltr', 'ltr', ['variant/static/ltr'], [attribute('#scope', 'dir', 'rtl', 'ltr')], `<section id="scope">${variantElement}</section>`),
  variantProbe('controlled-focus-within', 'focus-within', ['variant/static/focus-within'], [{ kind: 'focus', selector: '#child', before: false, after: true }], '<div id="probe" class="probe CANDIDATE"><input id="child" aria-label="controlled child focus"></div>'),
  variantProbe('controlled-has', 'has-[:checked]', ['variant/compound/has'], [{ kind: 'checked', selector: '#child', before: false, after: true }], '<div id="probe" class="probe CANDIDATE"><input id="child" type="checkbox"></div>'),
  variantProbe('controlled-in', 'in-[.active]', ['variant/compound/in'], [attribute('#scope', 'class', 'inactive', 'active')], `<section id="scope">${variantElement}</section>`),
  variantProbe('controlled-not', 'not-hover', ['variant/compound/not', 'variant/static/hover'], [{ kind: 'hover', selector: '#probe', before: true, after: false }]),
]
