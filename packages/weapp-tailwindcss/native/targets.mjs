export const nativeTargets = {
  'aarch64-apple-darwin': { suffix: 'darwin-arm64', artifact: 'libweapp_tailwindcss_native.dylib' },
  'x86_64-apple-darwin': { suffix: 'darwin-x64', artifact: 'libweapp_tailwindcss_native.dylib' },
  'aarch64-unknown-linux-gnu': { suffix: 'linux-arm64-gnu', artifact: 'libweapp_tailwindcss_native.so' },
  'x86_64-unknown-linux-gnu': { suffix: 'linux-x64-gnu', artifact: 'libweapp_tailwindcss_native.so' },
  'aarch64-unknown-linux-musl': { suffix: 'linux-arm64-musl', artifact: 'libweapp_tailwindcss_native.so' },
  'x86_64-unknown-linux-musl': { suffix: 'linux-x64-musl', artifact: 'libweapp_tailwindcss_native.so' },
  'aarch64-pc-windows-msvc': { suffix: 'win32-arm64-msvc', artifact: 'weapp_tailwindcss_native.dll' },
  'x86_64-pc-windows-msvc': { suffix: 'win32-x64-msvc', artifact: 'weapp_tailwindcss_native.dll' },
}

export const nativePackagePrefix = '@weapp-tailwindcss/native-'

export function bindingFileName(suffix, kernel = 'core') {
  return `${kernel === 'core' ? 'weapp-tailwindcss-native' : 'weapp-tailwindcss-postcss'}.${suffix}.node`
}
