import type { HBuilderXCommandResult } from '../../packages/hbuilderx-runner/src'
import type { MiniProgramCase } from './cases'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { HBuilderXCommandError } from '../../packages/hbuilderx-runner/src'
import { createHBuilderXProjectAlias } from '../../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../../scripts/hbuilderx-project-lifecycle'
import { EnvironmentBlockedError } from '../tailwind-capabilities/environment-block'
import { assertMiniProgramOutput } from './mini-output'
import { assertOutputOwnership } from './output-ownership'
import { createLocalHBuilderXRunner, hbuilderxTimeoutMs } from './process'

const environmentKinds = new Set(['cli-not-found', 'cli-instance-mismatch', 'cli-host-ambiguous', 'timeout'])

function commandFailure(error: unknown): never {
  if (error instanceof HBuilderXCommandError && (environmentKinds.has(error.result.issue.kind) || error.cleanupError)) {
    throw new EnvironmentBlockedError(`HBuilderX 环境故障：${error.result.issue.kind}`, { cause: error })
  }
  throw error
}

function confirmCommand(result: HBuilderXCommandResult) {
  if (result.exit.code !== 0 || result.exit.signal || result.issue.kind !== 'unknown') {
    commandFailure(new HBuilderXCommandError(`HBuilderX 命令失败：${result.issue.message}`, result))
  }
  return result
}

/** 仅在完整产物合同和关闭确认完成后交付同一实际输出根及宿主证据。 */
export async function compileMiniProgramWithHBuilderX(item: MiniProgramCase, root = path.resolve(import.meta.dirname, '../..')) {
  const projectRoot = path.resolve(root, item.projectDir)
  // 先验证全部候选，避免删除一个目录后才发现另一个越界。
  const outputs = await Promise.all([...new Set(item.outputDirCandidates ?? [item.outputDir])].map(output => assertOutputOwnership(projectRoot, path.resolve(projectRoot, output))))
  await Promise.all(outputs.map(output => rm(output, { recursive: true, force: true })))
  const hbuilderx = await createLocalHBuilderXRunner(projectRoot, { WEAPP_TW_HMR_TIMING: '1' }).catch((error: unknown) => {
    throw new EnvironmentBlockedError('HBuilderX 实例身份未确认', { cause: error })
  })
  if (!hbuilderx.resolution.isRunning || !hbuilderx.resolution.host?.trim() || !hbuilderx.resolution.version?.trim()) {
    throw new EnvironmentBlockedError('HBuilderX 实例缺少本次host或实际版本身份')
  }
  const alias = await createHBuilderXProjectAlias(projectRoot)
  const commands: HBuilderXCommandResult[] = []
  const run = async (args: string[]) => {
    try {
      const result = await hbuilderx.run({ args, cwd: projectRoot, timeoutMs: hbuilderxTimeoutMs, allowFailure: false })
      commands.push(result)
      return confirmCommand(result)
    }
    catch (error) {
      commandFailure(error)
    }
  }
  const output = await withHBuilderXProjectCleanup(alias, async () => {
    await run(['project', 'open', '--path', alias.projectPath])
    await run(['launch', item.platform, '--project', alias.projectName, '--compile', 'true'])
    return assertMiniProgramOutput(item, root)
  }, async () => {
    try {
      await run(['project', 'close', '--path', alias.projectPath])
    }
    catch (error) {
      throw new EnvironmentBlockedError(`HBuilderX 项目关闭未确认：${alias.projectPath}`, { cause: error })
    }
  })
  return { ...output, provider: 'hbuilderx-mini' as const, resolution: { ...hbuilderx.resolution }, commands, versions: { hbuilderx: hbuilderx.resolution.version } }
}
