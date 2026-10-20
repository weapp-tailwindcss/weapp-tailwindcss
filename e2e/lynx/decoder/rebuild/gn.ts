/** 文件系统路径进入 GN 字符串时同时转义插值符号、引号与反斜杠。 */
export function gnString(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$')}"`
}
