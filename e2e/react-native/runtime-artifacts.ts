import type { StageBinding } from '../tailwind-capabilities/stage-receipt'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { producerStageBinding } from '../tailwind-capabilities/stage-receipt'

export type RuntimeSessionIdentity = Pick<StageBinding, 'version' | 'runId' | 'target' | 'producer' | 'invocationId'>

/** 独立执行生成自己的调用身份；统一调度必须消费父进程指定的同次调用。 */
export function runtimeArtifactIdentity(producer: 'react-native' | 'expo-web', target: string, runId: string): RuntimeSessionIdentity {
  const binding = producerStageBinding(producer)
  if (binding && (binding.target !== target || binding.runId !== runId)) {
    throw new Error('运行时证据与本次调度身份不符')
  }
  return { version: 1, producer, target, runId, invocationId: binding?.invocationId ?? randomUUID() }
}

/** 先验证独立启动身份再复制，缺 report 的失败日志也能保留；不赋予运行时通过。 */
export async function archiveRuntimeDiagnostics(source: string, destination: string, expected: RuntimeSessionIdentity) {
  const identity = JSON.parse(await fs.readFile(path.join(source, 'runtime-session.json'), 'utf8')) as RuntimeSessionIdentity
  if (!identity || Object.entries(expected).some(([key, value]) => identity[key as keyof RuntimeSessionIdentity] !== value)) {
    throw new Error('运行时诊断不属于本次调用')
  }
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true })
}

/** Metro 运行期间不向 workspace 写证据，避免日志和截图触发额外刷新。 */
export async function createRuntimeArtifacts(destination: string, identity: RuntimeSessionIdentity) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-evidence-'))
  try {
    await fs.writeFile(path.join(directory, 'runtime-session.json'), `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx' })
  }
  catch (error) {
    return runWithCleanup(() => Promise.reject(error), () => fs.rm(directory, { recursive: true, force: true }))
  }
  return {
    directory,
    async publish() {
      await fs.rm(destination, { recursive: true, force: true })
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.cp(directory, destination, { recursive: true, preserveTimestamps: true })
      // 归档成功后才清除临时证据，复制失败时保留诊断材料。
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}
