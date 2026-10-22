import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'

/** 原生构建产物不能进入 CocoaPods 的源码扫描树，也不作为运行时证据归档。 */
export async function withIosBuildScratch<T>(project: string, evidence: Record<string, unknown>, save: () => Promise<void>, run: (derivedData: string) => Promise<T>, remove = (directory: string) => rm(directory, { recursive: true, force: true })) {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'weapp-tailwindcss-ios-build-'))
  const scratch = { directory, derivedData: path.join(directory, 'DerivedData'), status: 'active' }
  evidence['scratch'] = scratch
  return runWithCleanup(async () => {
    await save()
    const relative = path.relative(await realpath(project), await realpath(directory))
    if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      throw new Error('iOS 临时构建目录必须位于工程源码树之外')
    }
    return run(scratch.derivedData)
  }, () => runWithCleanup(async () => {
    try {
      await remove(directory)
      scratch.status = 'removed'
    }
    catch (error) {
      scratch.status = 'cleanup-failed'
      throw Object.assign(new Error(`iOS 本轮构建临时目录清理失败：${directory}`), { cause: error })
    }
  }, save))
}
