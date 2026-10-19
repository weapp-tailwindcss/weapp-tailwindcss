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
      const read = (element: Element, pseudo?: string) => {
        const style = window.getComputedStyle(element, pseudo)
        return Object.fromEntries(profile.properties.map(property => [property, style.getPropertyValue(property).trim().replace(/\s+/g, ' ')]))
      }
      const children = Array.from(section.querySelectorAll('[data-child]'))
      const styles = read(probe)
      const geometry = [probe, ...children, ...section.querySelectorAll('[data-sibling]')].flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height, element.scrollWidth, element.scrollHeight]
      })
      return { id: profile.id, styles, childStyles: children.map(element => read(element)), pseudoStyles: profile.properties.includes('content') ? read(probe, '::before') : {}, geometry, unavailableProperties: profile.properties.filter(property => !styles[property] && !property.startsWith('--')) }
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
