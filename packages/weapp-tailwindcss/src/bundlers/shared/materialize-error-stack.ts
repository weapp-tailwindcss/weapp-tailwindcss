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
    if (error instanceof AggregateError) {
      for (const nested of error.errors) {
        materializeErrorStack(nested, seen)
      }
    }
  }
  catch {
    // 用户自定义 cause/errors 访问器同样不能改变原始错误结果。
  }
}
