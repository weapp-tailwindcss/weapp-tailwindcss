import { materializeErrorStack } from '../../shared/materialize-error-stack'

type GulpSession = Record<string, (...args: any[]) => unknown> & { dispose: () => Promise<void> }

/** 公开方法只保留可释放的实例槽；宿主保留插件对象不再保留已关闭服务。 */
export function createGulpPluginFacade<Session extends GulpSession>(initial: Session): Session {
  let active: Session | undefined = initial
  let closing: Promise<void> | undefined
  const requireSession = () => {
    if (!active) {
      throw new Error('Gulp 编译实例已释放，不再接收任务。')
    }
    return active
  }
  const methods = Object.fromEntries(Object.keys(initial).filter(name => name !== 'dispose').map(name => [name, (...args: unknown[]) => {
    const session = requireSession()
    return Reflect.apply(session[name]!, session, args)
  }]))
  return {
    ...methods,
    dispose() {
      if (!closing) {
        closing = requireSession().dispose().catch((error) => {
          materializeErrorStack(error)
          throw error
        }).finally(() => { active = undefined })
      }
      return closing
    },
  } as Session
}
