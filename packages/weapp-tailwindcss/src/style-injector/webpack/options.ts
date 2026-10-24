import type { WebpackWeappStyleInjectorOptions } from 'weapp-style-injector/webpack'
import type { WeappTailwindcssStyleInjectorUserOptions } from '../options'
import { normalizeStyleInjectorOptions } from '../options'

export function normalizeWebpackStyleInjectorOptions(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
) {
  const normalized = normalizeStyleInjectorOptions(options)
  if (!normalized) {
    return undefined
  }
  const {
    generateSubpackageStyle,
    loadSubpackageTargetStyle,
    ...rest
  } = normalized
  const webpackOptions: typeof rest & Pick<WebpackWeappStyleInjectorOptions, 'generateSubpackageStyle' | 'loadSubpackageTargetStyle'> = {
    ...rest,
  }
  if (generateSubpackageStyle) {
    webpackOptions.generateSubpackageStyle = (context) => {
      const generated = generateSubpackageStyle(context)
      if (generated && typeof (generated as Promise<unknown>).then === 'function') {
        throw new TypeError('[weapp-style-injector] Webpack subpackage style generators must return synchronously.')
      }
      return generated as string | Uint8Array | null | undefined
    }
  }
  if (loadSubpackageTargetStyle) {
    webpackOptions.loadSubpackageTargetStyle = (fileName, sourceAbsolutePath) => {
      const loaded = loadSubpackageTargetStyle(fileName, sourceAbsolutePath)
      if (loaded && typeof (loaded as Promise<unknown>).then === 'function') {
        throw new TypeError('[weapp-style-injector] Webpack subpackage target style loaders must return synchronously.')
      }
      return loaded as string | Uint8Array | null | undefined
    }
  }
  return webpackOptions
}
