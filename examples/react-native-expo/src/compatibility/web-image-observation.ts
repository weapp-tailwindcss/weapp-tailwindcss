import type { NativeImageSide } from './image-fixture'

interface ImageNode {
  tagName: string
  isConnected: boolean
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  currentSrc?: string
  src: string
  decode: () => Promise<void>
}
interface ImageHost { isConnected: boolean, querySelectorAll: (selector: string) => ArrayLike<ImageNode> }
export type WebImageHost = (side: NativeImageSide) => unknown

function currentImage(resolveHost: () => unknown) {
  const host = resolveHost() as Partial<ImageHost> | null
  if (!host || host.isConnected !== true || typeof host.querySelectorAll !== 'function') {
    throw new Error('Image 缺少当前已挂载的 Web 宿主')
  }
  const nodes = host.querySelectorAll('img')
  const node = nodes[0]
  if (nodes.length !== 1 || !node || node.tagName !== 'IMG' || node.isConnected !== true) {
    throw new Error('Image Web 宿主必须包含唯一已挂载图片')
  }
  const uri = node.currentSrc || node.src
  const src = node.src
  if (typeof uri !== 'string' || !uri || typeof src !== 'string' || !src) {
    throw new Error('Image Web 图片缺少实际源 URI')
  }
  return { host, node, uri, src }
}

/** RN Web 的延迟 load 事件不能保留 DOM target；只观测同一个被测组件中的真实图片。 */
export async function observeWebImage(resolveHost: () => unknown, expectedUri: string) {
  const original = currentImage(resolveHost)
  if (original.uri !== expectedUri || original.src !== expectedUri || typeof original.node.decode !== 'function') {
    throw new Error('Image Web 图片源或 decode 能力不符')
  }
  const decoding = original.node.decode()
  if (!decoding || typeof decoding.then !== 'function') {
    throw new Error('Image Web decode 未返回加载 Promise')
  }
  await decoding
  const assertCurrent = () => {
    const current = currentImage(resolveHost)
    if (current.host !== original.host || current.node !== original.node || current.uri !== original.uri || current.src !== original.src) {
      throw new Error('Image Web 解码期间被测宿主、图片或源已变更')
    }
  }
  assertCurrent()
  const { naturalWidth: width, naturalHeight: height, complete } = original.node
  if (complete !== true || original.node.currentSrc !== expectedUri || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Image Web 图片未完成真实解码')
  }
  assertCurrent()
  return { origin: 'web-node' as const, decoder: 'decode' as const, complete: true as const, width, height, uri: original.uri }
}
