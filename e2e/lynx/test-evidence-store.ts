import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

async function main() {
  const platform = process.argv[2]
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('Expected android or ios')
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-evidence-store-'))
  const fixtures = path.join(import.meta.dirname, 'fixtures', 'evidence-store')
  const hosts = path.resolve(import.meta.dirname, '..', 'fixtures', 'lynx-native')
  try {
    if (platform === 'android') {
      const source = path.join(hosts, 'android', 'app', 'src', 'main', 'java', 'com', 'weapptailwindcss', 'lynxcompat')
      for (const name of ['EvidenceStore', 'GeometryBounds', 'ColorSchemeSession']) {
        await execa('javac', ['-d', directory, path.join(source, `${name}.java`), path.join(fixtures, `${name}Test.java`)], { stdio: 'inherit' })
        await execa('java', ['-cp', directory, `com.weapptailwindcss.lynxcompat.${name}Test`, directory], { stdio: 'inherit' })
      }
    }
    else {
      const source = path.join(hosts, 'ios', 'App')
      const { stdout: sdk } = await execa('xcrun', ['--sdk', 'macosx', '--show-sdk-path'])
      for (const [name, test] of [['EvidenceStore', 'evidence-store'], ['ColorSchemeSession', 'color-scheme']]) {
        const executable = path.join(directory, `${test}-test`)
        await execa('xcrun', ['--sdk', 'macosx', 'clang', '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-isysroot', sdk.trim(), '-framework', 'Foundation', '-I', source, path.join(source, `${name}.m`), path.join(fixtures, `${test}.test.m`), '-o', executable], { stdio: 'inherit' })
        await execa(executable, [directory], { stdio: 'inherit' })
      }
    }
  }
  finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
