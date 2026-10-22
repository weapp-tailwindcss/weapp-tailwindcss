import type { NativeRect } from './protocol'

export interface MeasurableNode {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void
}

export function measure(node: MeasurableNode | null): Promise<NativeRect> {
  if (!node || typeof node.measureInWindow !== 'function') {
    return Promise.reject(new Error('Missing semantic fixture node'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Semantic fixture measurement timed out')), 5_000)
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer)
      resolve({ x, y, width, height })
    })
  })
}
