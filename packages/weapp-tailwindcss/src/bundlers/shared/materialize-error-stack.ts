/** 在错误跨越实例释放边界前固定诊断文本，避免延迟 stack 保留调用帧。 */
export function materializeErrorStack(error: unknown, seen = new WeakSet<Error>()) {
  if (!(error instanceof Error) || seen.has(error)) {
    return
  }
  seen.add(error)
  try {
    void error.stack
  }
  catch {
    // 用户自定义 stack getter 失败不能遮蔽原始清理错误。
  }
  try {
    materializeErrorStack(error.cause, seen)
  }
  catch {
    // cause 访问失败不应阻止聚合错误中的其他诊断释放调用帧。
  }
  try {
    if (error instanceof AggregateError) {
      for (const nested of error.errors) {
        materializeErrorStack(nested, seen)
      }
    }
  }
  catch {
    // 用户自定义 errors 访问器同样不能改变原始错误结果。
  }
}
