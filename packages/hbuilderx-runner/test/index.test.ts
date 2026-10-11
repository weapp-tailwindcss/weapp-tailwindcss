import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  classifyHBuilderXOutput,
  createHBuilderXRunner,
  createLaunchArgs,
  createLogBuffer,
  extractHBuilderXExecutableFromProcessOutput,
  extractHBuilderXExecutablesFromProcessOutput,
  getDefaultHBuilderXCliCandidates,
  inferHBuilderXChannel,
  parseHBuilderXHosts,
  parseHBuilderXVersion,
  parseHdcTargets,
  parseIosSimulatorDevices,
  resolveHBuilderXCli,
  resolveIosSimulatorDeviceId,
  runCommand,
  selectHBuilderXCliCandidatesForChannel,
  selectPreferredIosSimulatorDevice,
} from '../src'

describe('hbuilderx-runner', () => {
  it('exposes named source exports through the Node tsx loader', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..')
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      'import { assertAndroidToolchain } from "./packages/hbuilderx-runner/src/index.ts"; console.log(typeof assertAndroidToolchain)',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('function')
  })

  it('classifies common HBuilderX project recognition failures', () => {
    expect(classifyHBuilderXOutput('当前运行的cli与正在运行的HBuilderX不匹配，请尝试另一个 cli').kind).toBe('cli-instance-mismatch')
    expect(classifyHBuilderXOutput('There are currently multiple running hbuilderx. Use listhost and --host.').kind).toBe('cli-host-ambiguous')
    expect(classifyHBuilderXOutput('项目 /demo 不是 uni-app 项目，暂不支持').kind).toBe('project-not-uni-app')
    expect(classifyHBuilderXOutput('项目 /demo 项目类型为Web，暂不支持').kind).toBe('project-type-unsupported')
    expect(classifyHBuilderXOutput('项目 /demo 是 uni-app x 项目，暂不支持')).toMatchObject({
      kind: 'project-type-unsupported',
      message: 'HBuilderX 不支持当前项目类型：uni-app x。',
    })
    expect(classifyHBuilderXOutput('项目 /demo 不支持运行到鸿蒙')).toMatchObject({
      kind: 'project-type-unsupported',
      message: 'HBuilderX 不支持当前运行目标：鸿蒙。',
    })
    expect(classifyHBuilderXOutput('failed to load config from vite.config.ts\nFailed to resolve entry for package "@x/y"').kind).toBe('config-load-failed')
    expect(classifyHBuilderXOutput('adb: command not found').kind).toBe('android-toolchain-missing')
    expect(classifyHBuilderXOutput('xcrun: error: unable to find utility "simctl"').kind).toBe('ios-toolchain-missing')
    expect(classifyHBuilderXOutput('hdc list targets failed').kind).toBe('harmony-toolchain-missing')
  })

  it('parses connected Harmony targets without accepting an empty sentinel', () => {
    expect(parseHdcTargets('127.0.0.1:5559\nemulator-1\n')).toEqual([
      '127.0.0.1:5559',
      'emulator-1',
    ])
    expect(parseHdcTargets('\n[Empty]\n')).toEqual([])
  })

  it('parses available iOS simulators from simctl JSON', () => {
    const output = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
          { isAvailable: true, name: 'iPhone 16 Pro', state: 'Booted', udid: 'booted-device' },
          { isAvailable: false, name: 'Unavailable', state: 'Shutdown', udid: 'unavailable-device' },
        ],
      },
    })
    expect(parseIosSimulatorDevices(`simctl warning\n${output}\ntrailing diagnostic`)).toEqual([
      { name: 'iPhone 16 Pro', state: 'Booted', udid: 'booted-device' },
    ])
    expect(parseIosSimulatorDevices('not json')).toEqual([])
  })

  it('uses an explicitly configured iOS simulator without probing Xcode', () => {
    expect(resolveIosSimulatorDeviceId({
      E2E_HBUILDERX_IOS_DEVICE_ID: 'configured-device',
    } as NodeJS.ProcessEnv)).toBe('configured-device')
  })

  it('prefers a recently booted iPhone over an uninitialized simulator', () => {
    expect(selectPreferredIosSimulatorDevice([
      { name: 'iPhone 17 Pro', state: 'Shutdown', udid: 'new-device' },
      { lastBootedAt: '2026-07-22T15:56:44Z', name: 'iPhone 16 Pro', state: 'Shutdown', udid: 'recent-device' },
      { lastBootedAt: '2026-07-21T15:56:44Z', name: 'iPad Pro', state: 'Shutdown', udid: 'older-device' },
    ])?.udid).toBe('recent-device')
  })

  it('keeps a bounded recent log buffer', () => {
    const buffer = createLogBuffer(2)
    buffer.push('ERROR: first fatal\n')
    buffer.push('second')
    buffer.push('third')
    expect(buffer.logs).toEqual(['second', 'third'])
    expect(buffer.text()).toContain('ERROR: first fatal')
    expect(buffer.text()).toContain('secondthird')
  })

  it('keeps the first compiler error when later errors exceed the important-log limit', () => {
    const buffer = createLogBuffer(2)
    buffer.push('ArkTS Compiler ERROR: first actionable failure\n')
    for (let index = 0; index < 30; index++) {
      buffer.push(`hvigor ERROR: follow-up failure ${index}\n`)
    }

    expect(buffer.text()).toContain('ArkTS Compiler ERROR: first actionable failure')
    expect(buffer.text()).toContain('hvigor ERROR: follow-up failure 29')
  })

  it('classifies Harmony compiler failures separately from a missing toolchain', () => {
    expect(classifyHBuilderXOutput([
      'ArkTS Compiler Error',
      'Failed to resolve OhmUrl for "vue"',
      '运行包制作失败',
    ].join('\n'))).toMatchObject({
      kind: 'harmony-build-failed',
    })
    expect(classifyHBuilderXOutput('DevEco Studio not found')).toMatchObject({
      kind: 'harmony-toolchain-missing',
    })
  })

  it('resolves HBuilderX CLI from explicit candidates', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hbuilderx-runner-'))
    const cli = path.join(dir, process.platform === 'win32' ? 'cli.cmd' : 'cli')
    await writeFile(cli, '', 'utf8')
    await expect(resolveHBuilderXCli([path.join(dir, 'missing'), cli])).resolves.toBe(cli)
  })

  it('orders stable and Alpha default installations by channel', () => {
    expect(getDefaultHBuilderXCliCandidates({}, 'auto', 'darwin')).toEqual([
      '/Applications/HBuilderX.app/Contents/MacOS/cli',
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli',
    ])
    expect(getDefaultHBuilderXCliCandidates({}, 'alpha', 'darwin')).toEqual([
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli',
    ])
    expect(getDefaultHBuilderXCliCandidates({}, 'stable', 'win32')).toEqual([])
    const running = [
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli',
      '/opt/custom/cli',
      '/Applications/HBuilderX.app/Contents/MacOS/cli',
    ]
    expect(selectHBuilderXCliCandidatesForChannel(running, 'auto')).toEqual([
      '/Applications/HBuilderX.app/Contents/MacOS/cli',
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli',
      '/opt/custom/cli',
    ])
    expect(selectHBuilderXCliCandidatesForChannel(running, 'alpha')).toEqual([
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli',
    ])
  })

  it('lets an explicit CLI path override channel discovery', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hbuilderx-explicit-'))
    const cli = path.join(dir, 'custom-cli')
    await writeFile(cli, '', 'utf8')
    await expect(resolveHBuilderXCli({
      channel: 'alpha',
      env: { HBUILDERX_CLI_PATH: cli } as NodeJS.ProcessEnv,
    })).resolves.toBe(cli)
  })

  it('extracts HBuilderX executables from process listings', () => {
    expect(extractHBuilderXExecutableFromProcessOutput(
      '123 ?? 0:01.23 /Applications/HBuilderX.app/Contents/MacOS/HBuilderX --type=renderer',
      'darwin',
    )).toBe('/Applications/HBuilderX.app/Contents/MacOS/HBuilderX')
    expect(extractHBuilderXExecutableFromProcessOutput(
      '123 ?? 0:01.23 /Applications/HBuilderX Alpha.app/Contents/MacOS/HBuilderX --type=renderer',
      'darwin',
    )).toBe('/Applications/HBuilderX Alpha.app/Contents/MacOS/HBuilderX')
    expect(extractHBuilderXExecutableFromProcessOutput(
      'Node,DESKTOP,123,C:\\Program Files\\HBuilderX\\HBuilderX.exe',
      'win32',
    )).toBe('C:\\Program Files\\HBuilderX\\HBuilderX.exe')

    expect(extractHBuilderXExecutablesFromProcessOutput([
      '/Applications/HBuilderX.app/Contents/MacOS/HBuilderX',
      '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/node/node worker.js',
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/HBuilderX --type=renderer',
    ].join('\n'), 'darwin')).toEqual([
      '/Applications/HBuilderX.app/Contents/MacOS/HBuilderX',
      '/Applications/HBuilderX-Alpha.app/Contents/MacOS/HBuilderX',
    ])
    expect(inferHBuilderXChannel('/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli')).toBe('alpha')
  })

  it('parses HBuilderX hosts and ANSI-colored versions', () => {
    expect(parseHBuilderXHosts('\nHBuilderX\nHBuilderX-Alpha\nHBuilderX\n')).toEqual([
      'HBuilderX',
      'HBuilderX-Alpha',
    ])
    expect(parseHBuilderXVersion('\u001B[1;32m5.22.2026072503-alpha\u001B[0m')).toBe('5.22.2026072503-alpha')
  })

  it('binds stable and Alpha runners to their own native CLI and host', async () => {
    if (process.platform === 'win32') {
      return
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'hbuilderx-runners-'))
    const script = [
      '#!/bin/sh',
      'printf "%s\\n" "$*" >> "$HBUILDERX_FAKE_LOG"',
      'case "$1" in',
      '  open) exit 0 ;;',
      '  listhost) printf "%s\\n" "$HBUILDERX_FAKE_HOST" ;;',
      '  version) printf "%s\\n" "$HBUILDERX_FAKE_VERSION" ;;',
      '  *) printf "ok\\n" ;;',
      'esac',
    ].join('\n')
    const createFakeCli = async (appName: string) => {
      const cli = path.join(dir, `${appName}.app`, 'Contents', 'MacOS', 'cli')
      await mkdir(path.dirname(cli), { recursive: true })
      await writeFile(cli, script, 'utf8')
      await chmod(cli, 0o755)
      return cli
    }
    const stableCli = await createFakeCli('HBuilderX')
    const alphaCli = await createFakeCli('HBuilderX-Alpha')
    const stableLog = path.join(dir, 'stable.log')
    const alphaLog = path.join(dir, 'alpha.log')

    const stable = await createHBuilderXRunner({
      hbuilderxCliPath: stableCli,
      cwd: dir,
      env: {
        HBUILDERX_FAKE_HOST: 'stable-host',
        HBUILDERX_FAKE_LOG: stableLog,
        HBUILDERX_FAKE_VERSION: '5.15.2026070915',
      },
    })
    const alpha = await createHBuilderXRunner({
      hbuilderxCliPath: alphaCli,
      cwd: dir,
      env: {
        HBUILDERX_FAKE_HOST: 'alpha-host',
        HBUILDERX_FAKE_LOG: alphaLog,
        HBUILDERX_FAKE_VERSION: '5.22.2026072503-alpha',
      },
    })
    await stable.run({ args: ['project', 'list'] })
    await alpha.run({ args: ['project', 'list'] })

    expect(stable.resolution).toMatchObject({ channel: 'stable', host: 'stable-host', version: '5.15.2026070915' })
    expect(alpha.resolution).toMatchObject({ channel: 'alpha', host: 'alpha-host', version: '5.22.2026072503-alpha' })
    expect(await readFile(stableLog, 'utf8')).toContain('project list --host stable-host')
    expect(await readFile(alphaLog, 'utf8')).toContain('project list --host alpha-host')
    expect(await readFile(stableLog, 'utf8')).not.toContain('alpha-host')
    expect(await readFile(alphaLog, 'utf8')).not.toContain('stable-host')
  })

  it('rejects a CLI mismatch even when HBuilderX exits successfully', async () => {
    if (process.platform === 'win32') {
      return
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'hbuilderx-mismatch-'))
    const cli = path.join(dir, 'HBuilderX.app', 'Contents', 'MacOS', 'cli')
    await mkdir(path.dirname(cli), { recursive: true })
    await writeFile(cli, [
      '#!/bin/sh',
      'printf "当前运行的cli与正在运行的HBuilderX不匹配，请尝试 Alpha cli\\n"',
      'exit 0',
    ].join('\n'), 'utf8')
    await chmod(cli, 0o755)

    await expect(createHBuilderXRunner({
      hbuilderxCliPath: cli,
      cwd: dir,
      timeoutMs: 1000,
    })).rejects.toMatchObject({
      result: {
        issue: {
          kind: 'cli-instance-mismatch',
        },
      },
    })
  })

  it('creates launch args with compile and runtime log flags', () => {
    expect(createLaunchArgs({
      cwd: '/demo/project',
      platform: 'mp-weixin',
      compile: false,
      runtimeLog: true,
    })).toEqual([
      'exec',
      'hbuilderx',
      'launch',
      'mp-weixin',
      '--project',
      path.resolve('/demo/project'),
      '--compile',
      'false',
      '--runtime-log',
      'true',
    ])
  })

  it('turns command timeout into a classified command error', async () => {
    await expect(runCommand({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      cwd: process.cwd(),
      timeoutMs: 100,
    })).rejects.toMatchObject({
      name: 'HBuilderXCommandError',
      result: {
        issue: {
          kind: 'timeout',
        },
      },
    })
  })

  it('includes classified output when commands fail', async () => {
    await expect(runCommand({
      command: process.execPath,
      args: ['-e', 'console.error("项目 /demo 不是 uni-app 项目，暂不支持"); process.exit(1)'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    })).rejects.toMatchObject({
      result: {
        issue: {
          kind: 'project-not-uni-app',
        },
      },
    })
  })
})
