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
