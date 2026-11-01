import type { IosRuntimeCommand } from './ios-runtime'
import path from 'node:path'

type IosAbi = 'arm64' | 'x86_64'

interface BinaryArchitecture {
  location: 'built' | 'installed'
  name: string
  path: string
  sha256: string
  stdout: string
  abi?: IosAbi
}

export interface IosApplicationArchitecture {
  source: 'installed-app-single-slice'
  files: BinaryArchitecture[]
  abi?: IosAbi
}

function singleAbi(stdout: string): IosAbi {
  const value = stdout.trim()
  if (value !== 'arm64' && value !== 'x86_64') {
    throw new Error(`iOS 应用 ABI 需要唯一受支持的 slice，不能由宿主或 uname 推断：${stdout}`)
  }
  return value
}

/** 同一轮 built/installed 主程序及顶层 dylib 必须提供一致的单 slice 证据。 */
export async function collectIosApplicationArchitecture(
  evidence: IosApplicationArchitecture,
  options: { application: string, container: string, executable: string, hashes: Record<string, string>, project: string },
  execute: IosRuntimeCommand,
  save: () => Promise<void>,
) {
  const names = Object.keys(options.hashes).filter(name => name === options.executable || name.endsWith('.dylib')).sort()
  for (const location of ['built', 'installed'] as const) {
    for (const name of names) {
      const file = path.join(location === 'built' ? options.application : options.container, name)
      const stdout = await execute('xcrun', ['lipo', '-archs', file], options.project)
      const entry: BinaryArchitecture = { location, name, path: file, sha256: options.hashes[name]!, stdout }
      evidence.files.push(entry)
      // 解析失败也保留原始输出，不能只留下派生结论。
      await save()
      entry.abi = singleAbi(stdout)
      if (evidence.abi !== undefined && evidence.abi !== entry.abi) {
        throw new Error('iOS 本轮主程序、dylib 或安装副本的 ABI 不一致')
      }
      evidence.abi = entry.abi
    }
  }
  await save()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 只消费启动门禁完成后、本轮绑定应用的架构回执，不把其它进程的架构写入报告。 */
export function iosApplicationAbi(source: string, device: string, bundleId: string): IosAbi {
  const receipt: unknown = JSON.parse(source)
  const fail = () => new Error('iOS 应用 ABI 回执缺失、未完成或身份不一致')
  if (!isRecord(receipt)) {
    throw fail()
  }
  const { provider, stage, application, container, executable, scratch, launch, binarySha256: hashes, applicationArchitecture: architecture } = receipt
  if (provider !== 'expo-prebuild-xcodebuild-simctl' || stage !== 'launch-request-completed'
    || receipt['device'] !== device || receipt['bundleId'] !== bundleId || 'failure' in receipt
    || typeof application !== 'string' || !path.isAbsolute(application) || typeof container !== 'string' || !path.isAbsolute(container)
    || typeof executable !== 'string' || !executable || path.basename(executable) !== executable
    || !isRecord(scratch) || scratch['status'] !== 'removed'
    || !isRecord(launch) || launch['device'] !== device || launch['bundleId'] !== bundleId
    || typeof launch['pid'] !== 'number' || !Number.isSafeInteger(launch['pid']) || launch['pid'] <= 0
    || !isRecord(hashes) || !isRecord(architecture)) {
    throw fail()
  }
  const { source: origin, files, abi: declaredAbi } = architecture
  if (origin !== 'installed-app-single-slice' || !Array.isArray(files)) {
    throw fail()
  }
  const abi = singleAbi(typeof declaredAbi === 'string' ? declaredAbi : '')
  const names = Object.keys(hashes).filter(name => name === executable || name.endsWith('.dylib')).sort()
  if (!names.includes(executable) || files.length !== names.length * 2) {
    throw fail()
  }
  const seen = new Set<string>()
  for (const entry of files) {
    if (!isRecord(entry)) {
      throw fail()
    }
    const { location, name, sha256, stdout, abi: fileAbi, path: file } = entry
    if ((location !== 'built' && location !== 'installed')
      || typeof name !== 'string' || !names.includes(name) || path.basename(name) !== name
      || typeof sha256 !== 'string' || !/^[a-f\d]{64}$/.test(sha256) || hashes[name] !== sha256
      || typeof stdout !== 'string' || singleAbi(stdout) !== abi || fileAbi !== abi
      || file !== path.join(location === 'built' ? application : container, name)) {
      throw fail()
    }
    const key = `${location}:${name}`
    if (seen.has(key)) {
      throw fail()
    }
    seen.add(key)
  }
  return abi
}

/** 真正的启动完成门禁失败时，不读取或覆盖应用环境。 */
export async function awaitIosApplicationEnvironment<T>(
  launchCompletion: Promise<T>,
  environment: { abi?: string },
  readReceipt: () => Promise<string>,
  device: string,
  bundleId: string,
): Promise<T> {
  const result = await launchCompletion
  const abi = iosApplicationAbi(await readReceipt(), device, bundleId)
  environment.abi = abi
  return result
}
