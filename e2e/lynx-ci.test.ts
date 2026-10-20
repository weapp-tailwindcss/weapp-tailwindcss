import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import YAML from 'yaml'

async function androidJob() {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/lynx-native.yml', import.meta.url), 'utf8'))
  return workflow.jobs.android
}

it('显式 Lynx 回归入口的每条测试路径必须存在，防止 Vitest 静默过滤失效路径', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/lynx-native.yml', import.meta.url), 'utf8'))
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const commands: string[] = [scripts['e2e:lynx'], scripts['e2e:tailwind:contract']]
  for (const platform of ['android', 'ios']) {
    commands.push(...workflow.jobs[platform].steps.map((step: { run?: string }) => step.run ?? ''))
  }
  const references = [...new Set(commands.flatMap(command => command.match(/\be2e\/[a-z0-9-]+\.test\.ts\b/g) ?? []))]
  expect(references.length).toBeGreaterThan(0)
  for (const reference of references) {
    await expect(readFile(path.resolve(import.meta.dirname, '..', reference), 'utf8'), reference).resolves.toBeTruthy()
  }
})

it('Lynx Android 在启动前授予当前 runner KVM 权限，并在工具安装后检查加速', async () => {
  const { steps } = await androidJob()
  const index = steps.findIndex((step: { uses?: string }) => step.uses?.startsWith('reactivecircus/android-emulator-runner@'))
  expect(index).toBeGreaterThan(0)
  const preparation = steps.slice(0, index).map((step: { run?: string }) => step.run ?? '').join('\n')
  expect(preparation).toContain('sudo setfacl -m "u:$(id -un):rw" /dev/kvm')
  expect(preparation).toContain('test -r /dev/kvm && test -w /dev/kvm')
  expect(preparation).not.toMatch(/emulator["']?\s+-accel-check/)
  expect(steps[index].with['disable-linux-hw-accel']).toBe(false)
  expect(steps[index].with['pre-emulator-launch-script']).toContain('-accel-check')
})

it.skipIf(process.platform === 'win32')('Lynx 启动钩子支持包含中文和空格的 SDK 路径，传播加速失败', async () => {
  const { steps } = await androidJob()
  const step = steps.find((step: { uses?: string }) => step.uses?.startsWith('reactivecircus/android-emulator-runner@'))
  const script = step.with['pre-emulator-launch-script']
  expect(typeof script).toBe('string')
  const root = await mkdtemp(path.join(tmpdir(), 'Lynx SDK 中文 & space-'))
  try {
    const executable = path.join(root, 'emulator', 'emulator')
    await mkdir(path.dirname(executable))
    await writeFile(executable, '#!/bin/sh\n[ "$1" = "-accel-check" ] || exit 8\nexit "$ACCEL_EXIT"\n')
    await chmod(executable, 0o755)
    for (const code of [0, 7]) {
      const result = spawnSync('sh', ['-c', script], {
        env: { ...process.env, ANDROID_HOME: root, ACCEL_EXIT: String(code) },
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(code)
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('Lynx Android 原生失败必须阻断 CI，同时始终保存诊断产物', async () => {
  const job = await androidJob()
  expect(job['continue-on-error']).toBeFalsy()
  for (const step of job.steps) {
    expect(step['continue-on-error']).toBeFalsy()
  }
  const upload = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(upload.if).toBe('always()')
  expect(upload.with.path).toContain('e2e/.artifacts/lynx-')
})

it('Lynx iOS 在启动前以有界脚本锁定真实构建目标，准备失败也上传证据', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/lynx-native.yml', import.meta.url), 'utf8'))
  const job = workflow.jobs.ios
  const preparation = job.steps.find((step: { run?: string }) => step.run?.includes('simctl create'))
  expect(preparation.run.indexOf('simctl create')).toBeLessThan(preparation.run.indexOf('prepare-ios-target.ts'))
  // 构建目标保持 Shutdown，真实构建完成后的唯一 readiness 入口才可启动模拟器。
  const commands = job.steps.map((step: { run?: string }) => step.run ?? '').join('\n')
  expect(commands).not.toMatch(/simctl\s+(?:boot|bootstatus)\b/)
  const preparationIndex = job.steps.indexOf(preparation)
  const nativeRunIndex = job.steps.findIndex((step: { run?: string }) => step.run === 'pnpm e2e:lynx:ios')
  expect(preparationIndex).toBeLessThan(nativeRunIndex)
  expect(preparation.run).toContain('LYNX_IOS_BUILD_TARGET_FILE')
  expect(job['continue-on-error']).toBeFalsy()
  for (const step of job.steps) {
    expect(step['continue-on-error']).toBeFalsy()
  }
  const upload = job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(upload.if).toBe('always()')
  expect(upload.with.path).toMatch(/\$\{\{ runner\.temp \}\}\/lynx-ios-target\/\*\*/)
  expect(upload.with.path).toContain('e2e/.artifacts/lynx-*/**')
  expect(upload.with.name).toContain('github.run_attempt')
})

it.skipIf(process.platform === 'win32')('iOS create 即使输出非空 ID，失败也必须在准备和 boot 前退出', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/lynx-native.yml', import.meta.url), 'utf8'))
  const preparation = workflow.jobs.ios.steps.find((step: { run?: string }) => step.run?.includes('simctl create'))
  const root = await mkdtemp(path.join(tmpdir(), 'Lynx create failure-'))
  try {
    const executable = path.join(root, 'xcrun')
    await writeFile(executable, '#!/bin/sh\nprintf bogus-id\nexit 7\n')
    await chmod(executable, 0o755)
    const result = spawnSync('bash', ['-e', '-c', preparation.run], {
      env: { ...process.env, PATH: `${root}${path.delimiter}${process.env['PATH']}`, RUNNER_TEMP: root, GITHUB_ENV: path.join(root, 'github-env') },
      encoding: 'utf8',
      timeout: 5000,
    })
    expect(result.status).toBe(7)
    expect(result.stderr).toBe('')
  }
  finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
