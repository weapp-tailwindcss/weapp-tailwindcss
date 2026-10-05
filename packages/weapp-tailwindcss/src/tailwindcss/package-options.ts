/** 公共包解析配置由本包维护，第三方工具的其他声明不进入消费者类型图。 */
export interface PackageResolvingOptions {
  paths?: string[]
  /** 包解析使用的路径语义，默认由当前平台决定。 */
  platform?: 'posix' | 'win32' | 'auto'
}
