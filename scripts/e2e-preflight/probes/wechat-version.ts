import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export function wechatVersionCandidates(cli: string, platform: NodeJS.Platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix
  const dir = api.dirname(cli)
  // 仅在指定 CLI 的安装边界读取官方应用元数据，不把 Electron 的 plist 版本当成 IDE 版本。
  return [
    api.resolve(dir, '..', 'Resources', 'app.asar.unpacked', 'package.json'),
    api.join(dir, 'resources', 'app.asar.unpacked', 'package.json'),
    api.join(dir, 'package.nw', 'package.json'),
    api.resolve(dir, '..', 'Resources', 'package.nw', 'package.json'),
  ]
}

export async function wechatVersion(cli: string) {
  const candidates = wechatVersionCandidates(await realpath(cli))
  for (const file of candidates) {
    try {
      const metadata = JSON.parse(await readFile(file, 'utf8'))
      if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+$/.test(metadata.version)
        && /微信|wechat/i.test(metadata.name ?? '')) {
        return { version: metadata.version, metadata: file }
      }
    }
    catch {}
  }
  throw new Error(`无法从指定微信 IDE 安装读取版本：${candidates.join(', ')}`)
}
