import { spawnSync, spawn } from 'node:child_process'

function resolveEmulatorBinary() {
  const candidates = [
    process.env.ANDROID_HOME && `${process.env.ANDROID_HOME}/emulator/emulator`,
    process.env.ANDROID_SDK_ROOT && `${process.env.ANDROID_SDK_ROOT}/emulator/emulator`,
    'emulator',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-list-avds'], { encoding: 'utf8' })
    if (probe.status === 0) {
      return { binary: candidate, avds: probe.stdout.trim().split('\n').filter(Boolean) }
    }
  }

  return null
}

const resolved = resolveEmulatorBinary()

if (!resolved) {
  console.error('Android Emulator not found. Check ANDROID_HOME / ANDROID_SDK_ROOT or add emulator to PATH.')
  process.exit(1)
}

const preferredAvd = process.env.ANDROID_AVD_NAME || resolved.avds[0]

if (!preferredAvd) {
  console.error('No Android AVD found. Create one in Android Studio Device Manager first.')
  process.exit(1)
}

console.log(`Starting Android emulator: ${preferredAvd}`)
console.log('Tip: override with ANDROID_AVD_NAME=<name> pnpm start:android:emulator')

const child = spawn(resolved.binary, ['@' + preferredAvd], {
  detached: true,
  stdio: 'ignore',
})

child.unref()
