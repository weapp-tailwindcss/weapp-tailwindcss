/** 顺序收尾本轮资源；单步失败不能阻止其它资源恢复。 */
export async function cleanupHBuilderXResources(steps: Array<() => unknown | Promise<unknown>>): Promise<void> {
  const errors: unknown[] = []
  for (const step of steps) {
    try {
      await step()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'HBuilderX 资源收尾失败。', { cause: errors[0] })
  }
}
