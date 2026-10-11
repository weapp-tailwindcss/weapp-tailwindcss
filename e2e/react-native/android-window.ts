import type { NativeVisualProbe } from '../../examples/react-native-expo/src/visual-probes'

export interface AndroidWindowTap {
  x: number
  y: number
}

function getNodeAttributes(node: string) {
  const attributes = new Map<string, string>()
  for (const match of node.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes.set(match[1], match[2])
  }
  return attributes
}

function getNodeBounds(node: string): AndroidWindowTap | undefined {
  const bounds = getNodeAttributes(node).get('bounds')?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
  if (!bounds) {
    return
  }
  const [, left, top, right, bottom] = bounds.map(Number)
  if (right <= left || bottom <= top) {
    return
  }
  return {
    x: Math.floor((left + right) / 2),
    y: Math.floor((top + bottom) / 2),
  }
}

export function findAndroidAnrWaitTap(windowXml: string): AndroidWindowTap | undefined {
  const nodes = [...windowXml.matchAll(/<node\b[^>]*>/g)].map(match => match[0])
  const resourceIds = new Set(nodes.map(node => getNodeAttributes(node).get('resource-id')))
  if (!resourceIds.has('android:id/aerr_close') || !resourceIds.has('android:id/aerr_wait')) {
    return
  }
  const waitNode = nodes.find(node => getNodeAttributes(node).get('resource-id') === 'android:id/aerr_wait')
  return waitNode ? getNodeBounds(waitNode) : undefined
}

/** Android 的窗口坐标扣除了系统 inset；截图需使用本轮无障碍树的屏幕坐标。 */
export function androidScreenProbes(windowXml: string, probes: NativeVisualProbe[], pixelRatio: number, marker: string, cssColor: string): NativeVisualProbe[] {
  const nodes = [...windowXml.matchAll(/<node\b[^>]*>/g)].map(match => getNodeAttributes(match[0]))
  const identities = new Map([
    ['theme-card', ['tw-rn-card', 'tw-rn-card']],
    ['tsx-hmr', ['tw-rn-hmr', marker]],
    ['css-hmr', ['tw-rn-css-hmr', `css-hmr-${cssColor}`]],
  ])
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error('Invalid Android screenshot pixel ratio')
  }
  return probes.map((probe) => {
    const identity = identities.get(probe.id)
    const matches = nodes.filter(node => node.get('resource-id') === identity?.[0] && node.get('package') === 'com.weapptailwindcss.rncompat')
    const node = matches[0]
    const bounds = node?.get('bounds')?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
    if (!identity || matches.length !== 1 || node?.get('content-desc') !== identity[1] || !bounds) {
      throw new Error(`Missing current Android visual probe: ${probe.id}`)
    }
    const [, left, top, right, bottom] = bounds.map(Number)
    const width = right - left
    const height = bottom - top
    if (width <= 0 || height <= 0 || Math.abs(width - probe.bounds.width * pixelRatio) > 1 || Math.abs(height - probe.bounds.height * pixelRatio) > 1) {
      throw new Error(`Clipped or inconsistent Android visual probe: ${probe.id}`)
    }
    return { ...probe, bounds: { x: left / pixelRatio, y: top / pixelRatio, width: width / pixelRatio, height: height / pixelRatio } }
  })
}
