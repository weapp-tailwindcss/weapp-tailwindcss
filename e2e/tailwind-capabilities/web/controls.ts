import type { Page } from 'playwright'

type MediaOptions = Parameters<Page['emulateMedia']>[0]
interface Viewport { width: number, height: number }

export type WebControl
  = { kind: 'attribute', selector: string, name: string, before: string | null, after: string | null }
    | { kind: 'property', selector: string, name: 'indeterminate', before: boolean, after: boolean }
    | { kind: 'value', selector: string, before: string, after: string }
    | { kind: 'text', selector: string, before: string, after: string }
    | { kind: 'siblings', selector: string, key: string, tag: string, position: 'before' | 'after', before: number, after: number }
    | { kind: 'viewport', before: Viewport, after: Viewport }
    | { kind: 'media', before: MediaOptions, after: MediaOptions }
    | { kind: 'move', selector: string, before: string, after: string }
    | { kind: 'hash', before: string, after: string }
    | { kind: 'selection' | 'dialog', selector: string, before: boolean, after: boolean }
    | { kind: 'keyboard-focus', selector: string, start: string, before: boolean, after: boolean }
    | { kind: 'hover' | 'active' | 'checked' | 'focus', selector: string, before: boolean, after: boolean, position?: { x: number, y: number } }

export async function applyControl(page: Page, control: WebControl, active: boolean) {
  switch (control.kind) {
    case 'attribute':
      return page.locator(control.selector).evaluate((element, { name, value }) => {
        if (value === null) {
          element.removeAttribute(name)
        }
        else {
          element.setAttribute(name, value)
        }
      }, { name: control.name, value: active ? control.after : control.before })
    case 'property':
      return page.locator(control.selector).evaluate((element, { name, value }) => {
        (element as HTMLInputElement)[name] = value
      }, { name: control.name, value: active ? control.after : control.before })
    case 'value':
      return page.locator(control.selector).fill(active ? control.after : control.before)
    case 'text':
      return page.locator(control.selector).evaluate((element, value) => {
        element.textContent = value
      }, active ? control.after : control.before)
    case 'siblings':
      return page.locator(control.selector).evaluate((element, definition) => {
        const attribute = 'data-tailwind-variant-sibling'
        for (const sibling of Array.from(element.parentElement!.children)) {
          if (sibling.getAttribute(attribute) === definition.key) {
            sibling.remove()
          }
        }
        for (let index = 0; index < definition.count; index++) {
          const sibling = document.createElement(definition.tag)
          sibling.setAttribute(attribute, definition.key)
          sibling.textContent = 'controlled sibling'
          element[definition.position](sibling)
        }
      }, { key: control.key, tag: control.tag, position: control.position, count: active ? control.after : control.before })
    case 'viewport':
      return page.setViewportSize(active ? control.after : control.before)
    case 'media':
      return page.emulateMedia(active ? control.after : control.before)
    case 'move':
      return page.locator(control.selector).evaluate((element, parent) => {
        document.querySelector(parent)!.append(element)
      }, active ? control.after : control.before)
    case 'hash':
      await page.evaluate((hash) => {
        window.location.hash = hash
      }, active ? control.after : control.before)
      return page.waitForFunction(hash => window.location.hash === hash, active ? control.after : control.before).then(handle => handle.dispose())
    case 'selection':
      return page.locator(control.selector).evaluate((element, selected) => {
        const selection = window.getSelection()!
        selection.removeAllRanges()
        if (selected) {
          const range = document.createRange()
          range.selectNodeContents(element)
          selection.addRange(range)
        }
      }, active ? control.after : control.before)
    case 'dialog':
      return page.locator(control.selector).evaluate((element, open) => {
        const dialog = element as HTMLDialogElement
        if (open && !dialog.open) {
          dialog.showModal()
        }
        else if (!open && dialog.open) {
          dialog.close()
        }
      }, active ? control.after : control.before)
    case 'keyboard-focus':
      if (active ? control.after : control.before) {
        await page.locator(control.start).focus()
        return page.keyboard.press('Tab')
      }
      return page.locator(control.selector).blur()
    case 'hover':
      if (active ? control.after : control.before) {
        return page.locator(control.selector).hover({ position: control.position })
      }
      return page.mouse.move(0, 0)
    case 'active':
      if (active ? control.after : control.before) {
        await page.locator(control.selector).hover({ position: control.position })
        return page.mouse.down()
      }
      await page.mouse.up()
      return page.mouse.move(0, 0)
    case 'checked':
      return page.locator(control.selector).setChecked(active ? control.after : control.before)
    case 'focus':
      if (active ? control.after : control.before) {
        return page.locator(control.selector).focus()
      }
      return page.locator(control.selector).blur()
  }
}

export async function restoreControls(page: Page, controls: readonly WebControl[]) {
  const errors: unknown[] = []
  for (const control of [...controls].reverse()) {
    try {
      await applyControl(page, control, false)
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, 'variant 受控环境恢复失败')
  }
}
