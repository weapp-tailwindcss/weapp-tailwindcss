/** 保留具体 hook 的参数及 this 类型，兼容函数和对象形式。 */
export function getViteHookHandler<T extends (...args: never[]) => unknown>(hook: T | { handler: T } | undefined): T | undefined {
  return typeof hook === 'function' ? hook : hook?.handler
}
