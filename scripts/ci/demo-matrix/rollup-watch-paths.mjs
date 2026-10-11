import path from 'node:path'

// Chokidar 的注册键与原生事件路径可使用不同分隔符，测试按宿主文件身份定位条目。
export function getWatchPathEntry(entries, file) {
  const identity = path.resolve(file)
  for (const [key, value] of entries) {
    if (path.resolve(key) === identity) {
      return value
    }
  }
}
