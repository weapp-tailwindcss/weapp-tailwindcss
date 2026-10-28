/** CommonJS 测试通过异步边界加载 ESM helper，保留 helper 的源码位置与构建身份。 */
export async function websiteTocPolicy(pathname: string) {
  const policy = await import('./site-policy.mts')
  return policy.websiteTocPolicy(pathname)
}
