import type { Frame, Page } from 'playwright'
import type { AuthoringWebMeasurement } from './contract'
import type { AuthoringWebGroup, AuthoringWebProfile } from './profiles'
import type { AuthoringReference } from './reference'

function attribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

export function authoringFrameHtml(profile: AuthoringWebProfile, group: AuthoringWebGroup, role: 'product' | 'reference' | 'baseline', css: string, active: boolean, reference?: AuthoringReference) {
  const declarations = role === 'reference' && active ? group.declarations.map(declaration => `${declaration.property}:${declaration.value}${declaration.important ? '!important' : ''}`).join(';') : role !== 'reference' ? profile.competingInline ?? '' : ''
  const variables = Object.entries(profile.variables).map(([property, value]) => `${property}:${value}`).join(';')
  const ancestor = role === 'product' && active && profile.action === 'ancestor-class' ? 'catalog-dark' : ''
  const stylesheet = role === 'product' ? css : role === 'reference' ? reference?.css ?? '' : reference?.baselineCss ?? ''
  const className = role === 'product' || (role === 'reference' && reference) ? group.className : ''
  const inline = reference && role === 'reference' ? '' : declarations
  return `<!doctype html><html><head><meta charset="UTF-8"><style>@layer theme,base,components,utilities;@layer base{:where(#probe){${profile.baseline ?? ''}}}html,body{margin:0;font-size:16px;color:rgb(7,8,9)}body{width:240px}</style><style>${stylesheet}</style></head><body style="${attribute(variables)}"><section class="${ancestor}" style="width:240px"><div id="probe" tabindex="0" class="${attribute(className)}" style="${attribute(inline)}">authoring probe</div></section></body></html>`
}

async function read(frame: Frame, group: AuthoringWebGroup) {
  return frame.$eval('#probe', (element, input) => {
    const style = getComputedStyle(element, input.pseudo)
    const values = input.declarations.map(declaration => style.getPropertyValue(declaration.property).trim())
    return { values, supported: input.declarations.map((declaration, index) => CSS.supports(declaration.property, declaration.value ?? values[index]!)) }
  }, { declarations: group.declarations, pseudo: group.pseudo })
}

async function interaction(page: Page, frame: Frame, group: AuthoringWebGroup, active: boolean) {
  if (!group.interaction) {
    return
  }
  await page.mouse.move(950, 0)
  await frame.$eval('#probe', element => (element as HTMLElement).blur())
  if (active) {
    await frame.locator('#probe')[group.interaction]()
  }
}

/** 产品、独立参考和无工具类基线处于不同文档；交互后立刻读取该文档，避免另一个 frame 抢走 hover/focus。 */
export async function observeAuthoring(page: Page, profile: AuthoringWebProfile, css: string, state: string, referenceCss?: AuthoringReference) {
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
        await frameFor(role).setContent(authoringFrameHtml(profile, group, role, css, active, referenceCss))
      }
    }
    else {
      const product = frameFor('product')
      if (profile.action === 'ancestor-class') {
        await product.$eval('section', (element, enabled) => element.classList.toggle('catalog-dark', enabled), active)
      }
      if (!referenceCss) {
        const reference = frameFor('reference')
        await reference.$eval('#probe', (element, input) => {
          const probe = element as HTMLElement
          probe.removeAttribute('style')
          if (input.active) {
            for (const declaration of input.declarations) {
              probe.style.setProperty(declaration.property, declaration.value!, declaration.important ? 'important' : '')
            }
          }
        }, { active, declarations: group.declarations })
      }
    }
    const observations = []
    for (const role of ['product', 'reference', 'baseline']) {
      await interaction(page, frameFor(role), group, role !== 'baseline' && active)
      observations.push(await read(frameFor(role), group))
    }
    const [product, reference, baseline] = observations
    measurements.push({ group: index, properties: group.declarations.map(declaration => declaration.property), product: product!.values, reference: reference!.values, baseline: baseline!.values, referenceSupported: reference!.supported, ...(group.excluded ? { excluded: true } : {}) })
  }
  return measurements
}
