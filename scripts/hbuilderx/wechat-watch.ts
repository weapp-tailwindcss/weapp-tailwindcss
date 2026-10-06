import { rm } from 'node:fs/promises'
import process from 'node:process'
import { spawnCommand } from '../../packages/hbuilderx-runner/src/process'
import { waitForCompiler } from './compiler-lifecycle'
import { createWechatCompilerPlan } from './wechat-compiler'

/** 只运行编译器的持续 watch；已有微信 IDE 由 scripts/wechat 的调用方管理。 */
export async function watchWechatWithHBuilderXCompiler(projectRoot: string) {
  const plan = await createWechatCompilerPlan(projectRoot)
  process.stdout.write(`[hbuilderx-compiler] version=${plan.version} compiler=${plan.compilerVersion} node=${plan.nodeVersion}\n`)
  process.stdout.write(`[hbuilderx-compiler] entry=${plan.args[1]} input=${plan.projectRoot} output=${plan.outputDir}\n`)
  await rm(plan.outputDir, { recursive: true, force: true })
  await waitForCompiler(spawnCommand(plan))
}
