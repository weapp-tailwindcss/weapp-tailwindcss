/** 默认只保留星号；共享函数身份供原生适配器识别内置策略。 */
export function defaultJsPreserveClass(keyword: string) {
  return keyword === '*'
}
