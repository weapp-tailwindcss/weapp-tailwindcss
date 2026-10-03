export interface AndroidScreenBounds {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export interface AndroidMarkerSample {
  bounds: AndroidScreenBounds
  contentDescription: string
  text: string
}

interface RgbaImage {
  data: Uint8Array
  height: number
  width: number
}

export function readAndroidMarkerSample(uiHierarchy: string, markerText: string): AndroidMarkerSample | undefined {
  for (const node of uiHierarchy.matchAll(/<node\b([^>]*)>/g)) {
    const attributes = new Map<string, string>()
    for (const attribute of node[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attributes.set(attribute[1]!, attribute[2]!)
    }
    const text = attributes.get('text') ?? ''
    const contentDescription = attributes.get('content-desc') ?? ''
    if (text !== markerText && contentDescription !== markerText) {
      continue
    }
    const match = attributes.get('bounds')?.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/)
    if (!match) {
      continue
    }
    const bounds = {
      minX: Number(match[1]),
      minY: Number(match[2]),
      maxX: Number(match[3]) - 1,
      maxY: Number(match[4]) - 1,
    }
    if (bounds.minX >= 0 && bounds.minY >= 0 && bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY) {
      return { bounds, contentDescription, text }
    }
  }
}

export function isSameAndroidMarker(before: AndroidMarkerSample, after: AndroidMarkerSample | undefined) {
  return after !== undefined
    && before.text === after.text
    && before.contentDescription === after.contentDescription
    && before.bounds.minX === after.bounds.minX
    && before.bounds.minY === after.bounds.minY
    && before.bounds.maxX === after.bounds.maxX
    && before.bounds.maxY === after.bounds.maxY
}

/** 只接受完整可见的 marker 区域；不裁切越界框，也不把区域外变化当作 HMR。 */
export function haveAndroidMarkerPixelsChanged(current: RgbaImage, previous: RgbaImage | undefined, bounds: AndroidScreenBounds) {
  const fits = (image: RgbaImage) => Object.values(bounds).every(Number.isInteger)
    && bounds.minX >= 0 && bounds.minY >= 0
    && bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY
    && bounds.maxX < image.width && bounds.maxY < image.height
    && image.data.length === image.width * image.height * 4
  if (!fits(current) || (previous && (!fits(previous) || current.width !== previous.width || current.height !== previous.height))) {
    return false
  }
  if (!previous) {
    return true
  }
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const offset = (y * current.width + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        if (current.data[offset + channel] !== previous.data[offset + channel]) {
          return true
        }
      }
    }
  }
  return false
}
