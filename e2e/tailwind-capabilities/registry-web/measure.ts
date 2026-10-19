import type { Frame } from 'playwright'
import type { RegistryWebProfile } from './profiles'

export interface RegistryObservation {
  id: string
  styles: Record<string, string>
  childStyles: Array<Record<string, string>>
  pseudoStyles: Record<string, string>
  geometry: number[]
  unavailableProperties: string[]
}

export async function observeRegistry(frame: Frame, profiles: readonly RegistryWebProfile[]): Promise<RegistryObservation[]> {
  return frame.evaluate((definitions) => {
    document.getAnimations().forEach((animation) => {
      animation.pause()
      animation.currentTime = 137
    })
    return definitions.map((profile) => {
      const section = document.querySelector(`[data-case="${profile.index}"]`)!
      const probe = section.querySelector('[data-probe]')!
      const origin = section.getBoundingClientRect()
      const children = Array.from(section.querySelectorAll('[data-child]'))
      // 序列化到浏览器的函数不能捕获 tsx 为具名局部函数生成的模块级 helper。
      const readings = [{ element: probe, pseudo: undefined }, ...children.map(element => ({ element, pseudo: undefined })), ...(profile.properties.includes('content') ? [{ element: probe, pseudo: '::before' }] : [])].map(({ element, pseudo }) => {
        const style = window.getComputedStyle(element, pseudo)
        return Object.fromEntries(profile.properties.map(property => [property, style.getPropertyValue(property).trim().replace(/\s+/g, ' ')]))
      })
      const styles = readings[0]!
      const geometry = [probe, ...children, ...section.querySelectorAll('[data-sibling]')].flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height, element.scrollWidth, element.scrollHeight]
      })
      return { id: profile.id, styles, childStyles: readings.slice(1, children.length + 1), pseudoStyles: profile.properties.includes('content') ? readings.at(-1)! : {}, geometry, unavailableProperties: profile.properties.filter(property => !styles[property] && !property.startsWith('--')) }
    })
  }, profiles.map(({ id, index, properties }) => ({ id, index, properties })))
}

export function registryStyleEqual(left: RegistryObservation, right: RegistryObservation) {
  return JSON.stringify([left.styles, left.childStyles, left.pseudoStyles]) === JSON.stringify([right.styles, right.childStyles, right.pseudoStyles])
}

export function registryGeometryEqual(left: RegistryObservation, right: RegistryObservation, tolerance = 0.25) {
  return left.geometry.length === right.geometry.length && left.geometry.every((value, index) => Number.isFinite(value) && Number.isFinite(right.geometry[index]) && Math.abs(value - right.geometry[index]!) <= tolerance)
}

export function registryReferenceEffective(reference: RegistryObservation, baseline: RegistryObservation) {
  return !registryStyleEqual(reference, baseline) || !registryGeometryEqual(reference, baseline)
}
