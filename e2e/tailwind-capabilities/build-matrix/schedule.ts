import { findEnvironmentBlock } from '../environment-block'

/** 宿主身份失效后不再启动任何provider，保留首个异常给最终终态回执。 */
export class BuildMatrixSchedule {
  blocked: unknown
  private active: Promise<unknown> | undefined

  async settle() {
    await this.active?.catch(() => {})
  }

  execute<T>(run: () => Promise<T>): Promise<T | undefined> {
    const previous = this.active
    const operation = (async () => {
      await previous?.catch(() => {})
      if (this.blocked) {
        return
      }
      try {
        return await run()
      }
      catch (error) {
        if (findEnvironmentBlock(error)) {
          this.blocked = error
        }
        throw error
      }
    })()
    this.active = operation
    return operation.finally(() => {
      if (this.active === operation) {
        this.active = undefined
      }
    })
  }
}
