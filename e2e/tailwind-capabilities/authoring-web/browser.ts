import type { Frame, Page } from 'playwright'
import type { AuthoringWebMeasurement } from './contract'
import type { AuthoringWebGroup, AuthoringWebProfile } from './profiles'

function attribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

export function authoringFrameHtml(profile: AuthoringWebProfile, group: AuthoringWebGroup, role: 'product' | 'reference' | 'baseline', css: string, active: boolean) {
  const declarations = role === 'reference' && active ? group.declarations.map(declaration => `${declaration.property}:${declaration.value}${declaration.important ? '!important' : ''}`).join(';') : role !== 'reference' ? profile.competingInline ?? '' : ''
  const variables = Object.entries(profile.variables).map(([property, value]) => `${property}:${value}`).join(';')
  const ancestor = role === 'product' && active && profile.action === 'ancestor-class' ? 'catalog-dark' : ''
  return `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;font-size:16px;color:rgb(7,8,9)}body{width:240px}</style>${role === 'product' ? `<style>${css}</style>` : ''}</head><body style="${attribute(variables)}"><section class="${ancestor}" style="width:240px"><div id="probe" class="${role === 'product' ? attribute(group.className) : ''}" style="${attribute(declarations)}">authoring probe</div></section></body></html>`
}

async function read(frame: Frame, group: AuthoringWebGroup) {
  return frame.$eval('#probe', (element, declarations) => {
    const style = getComputedStyle(element)
    return { values: declarations.map(declaration => style.getPropertyValue(declaration.property).trim()), supported: declarations.map(declaration => CSS.supports(declaration.property, declaration.value)) }
  }, group.declarations)
}

/** 产品、独立 inline 参考和无工具类基线处于不同文档，避免参考被产品 CSS 污染。 */
export async function observeAuthoring(page: Page, profile: AuthoringWebProfile, css: string, state: string) {
  const active = state === 'computed' || state === 'after'
  await page.emulateMedia({ colorScheme: profile.action === 'color-scheme' && active ? 'dark' : 'light' })
  const measurements: AuthoringWebMeasurement[] = []
  if (state === 'before' || state === 'computed') {
    const rows = profile.groups.map((_group, index) => `<section style="display:flex">${['product', 'reference', 'baseline'].map(role => `<iframe name="${role}-${index}" style="border:0;width:300px;height:220px"></iframe>`).join('')}</section>`).join('')
    await page.setContent(`<!doctype html><html><body style="margin:0">${rows}</body></html>`)
  }
  for (const [index, group] of profile.groups.entries()) {
    const frameFor = (role: string) => page.frames().find(frame => frame.name() === `${role}-${index}`)!
    if (state === 'before' || state === 'computed') {
      for (const role of ['product', 'reference', 'baseline'] as const) {
        await frameFor(role).setContent(authoringFrameHtml(profile, group, role, css, active))
      }
    }
    else {
      const product = frameFor('product')
      if (profile.action === 'ancestor-class') {
        await product.$eval('section', (element, enabled) => element.classList.toggle('catalog-dark', enabled), active)
      }
      const reference = frameFor('reference')
      await reference.$eval('#probe', (element, input) => {
        const probe = element as HTMLElement
        probe.removeAttribute('style')
        if (input.active) {
          for (const declaration of input.declarations) {
            probe.style.setProperty(declaration.property, declaration.value, declaration.important ? 'important' : '')
          }
        }
      }, { active, declarations: group.declarations })
    }
    const [product, reference, baseline] = await Promise.all(['product', 'reference', 'baseline'].map(role => read(frameFor(role), group)))
    measurements.push({ group: index, properties: group.declarations.map(declaration => declaration.property), product: product!.values, reference: reference!.values, baseline: baseline!.values, referenceSupported: reference!.supported })
  }
  return measurements
}
