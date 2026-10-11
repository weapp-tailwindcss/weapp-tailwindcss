import { mkdir } from 'node:fs/promises'
import path from 'node:path'

export async function watchRoots(watch, directories, options) {
  // Chokidar 3 对不存在的 glob 根重复递减就绪计数；先创建根，确保 ready 对应完整扫描。
  await Promise.all(directories.map(directory => mkdir(directory, { recursive: true })))
  // Gulp glob 使用正斜杠；只在进入 glob API 时转换文件系统路径。
  const configuredIgnored = options?.ignored
  const ignored = typeof configuredIgnored === 'function'
    ? configuredIgnored
    : file => configuredIgnored instanceof RegExp && configuredIgnored.test(String(file))
  const watchOptions = {
    ...options,
    // 原子保存先创建隐藏临时文件；跨平台过滤隐藏路径，避免临时文件冒泡为源码变更。
    ignored: (file, stats) => /(?:^|[/\\])\./.test(String(file)) || ignored(file, stats),
  }
  return watch(directories.map(directory => `${directory.split(path.sep).join('/')}/**/*`), watchOptions)
}
