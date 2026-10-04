import { satisfies } from 'semver'

/** 保留已修复页面空 JSON 的主版本，防止模板依赖维护倒退到 6.x。 */
export async function resolveWeappViteTemplateVersion(resolveMajor: (name: string, major: number) => Promise<string>) {
  const version = await resolveMajor('weapp-vite', 7)
  if (!satisfies(version, '>=7.1.0 <8.0.0')) {
    throw new Error(`weapp-vite 模板要求已修复页面 JSON 的 7.1.0 及以上 7.x，实际为 ${version}`)
  }
  return version
}
