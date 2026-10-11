import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createDoctorReport,
  formatDoctorReport,
  hasDoctorFailure,
} from '@/doctor'
import { WEAPP_TW_REQUIRED_NODE_VERSION_RANGE } from '@/constants'
import packageJson from '../package.json'

const TMP_PREFIX = 'weapp-tw-doctor'

async function createTempWorkspace() {
  return await mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writePackage(root: string, packageName: string, version: string) {
  await writeJson(path.join(root, 'node_modules', packageName, 'package.json'), {
    name: packageName,
    version,
  })
}

function findCheck(report: ReturnType<typeof createDoctorReport>, id: string) {
  const check = report.checks.find(item => item.id === id)
  if (!check) {
    throw new Error(`Missing doctor check: ${id}`)
  }
  return check
}

describe('createDoctorReport', () => {
  it('reports a healthy pnpm Tailwind v4 uni-app setup', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      packageManager: 'pnpm@11.5.0',
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
        '@tailwindcss/postcss': '^4.0.0',
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^4.0.0',
      },
    })
    await writeFile(path.join(root, 'postcss.config.js'), 'export default {}\n', 'utf8')
    await writeFile(path.join(root, 'vite.config.ts'), 'export default {}\n', 'utf8')
    await writePackage(root, 'tailwindcss', '4.1.0')
    await writePackage(root, 'weapp-tailwindcss', '4.12.0')

    const report = createDoctorReport({ cwd: root, nodeVersion: '22.18.0' })

    expect(report.detected.packageManager).toBe('pnpm@11.5.0')
    expect(report.detected.frameworks).toEqual(['uni-app'])
    expect(findCheck(report, 'tailwindcss').status).toBe('ok')
    expect(report.checks.find(item => item.id === 'tailwindcss-v4-postcss')).toBeUndefined()
    expect(report.checks.every(item => item.code && Array.isArray(item.evidence))).toBe(true)
    expect(hasDoctorFailure(report)).toBe(false)
  })

  it('does not warn merely because a Tailwind v4 project has a PostCSS config', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      dependencies: {
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^4.0.0',
      },
    })
    await writeFile(path.join(root, 'postcss.config.cjs'), 'module.exports = {}\n', 'utf8')
    await writePackage(root, 'tailwindcss', '4.0.0')

    const report = createDoctorReport({ cwd: root, nodeVersion: '22.18.0' })

    expect(report.checks.find(item => item.id === 'tailwindcss-generator-owner')).toBeUndefined()
    expect(hasDoctorFailure(report)).toBe(false)
    expect(hasDoctorFailure(report, true)).toBe(false)
  })

  it('warns when an official Tailwind generator is actually configured', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      dependencies: {
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^5.0.0',
        '@tailwindcss/postcss': '^4.0.0',
      },
    })
    await writeFile(
      path.join(root, 'postcss.config.mjs'),
      'import tailwindcss from "@tailwindcss/postcss"\nexport default { plugins: [tailwindcss()] }\n',
      'utf8',
    )
    await writePackage(root, 'tailwindcss', '4.3.3')
    await writePackage(root, 'weapp-tailwindcss', '5.4.2')

    const report = createDoctorReport({ cwd: root, nodeVersion: '22.18.0' })

    const check = findCheck(report, 'tailwindcss-generator-owner')
    expect(check.status).toBe('warn')
    expect(check.code).toBe('duplicate-tailwind-generator')
    expect(check.evidence).toEqual(['postcss.config.mjs'])
    expect(check.suggestion).toContain('移除')
  })

  it('ignores commented generator references and validates source and target semantics', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      dependencies: {
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^5.0.0',
      },
    })
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'app.css'), '@import "tailwindcss";\n', 'utf8')
    await writeFile(
      path.join(root, 'vite.config.ts'),
      `// import tailwindcss from '@tailwindcss/vite'\nexport default { appType: 'unknown', platform: 'web', generator: { target: 'browser' }, cssEntries: ['app.css'] }\n`,
      'utf8',
    )
    await writePackage(root, 'tailwindcss', '4.3.3')

    const report = createDoctorReport({ cwd: root, nodeVersion: '22.18.0' })

    expect(report.checks.find(item => item.id === 'tailwindcss-generator-owner')).toBeUndefined()
    expect(findCheck(report, 'tailwind-css-source')).toMatchObject({ code: 'missing-tailwind-source' })
    expect(findCheck(report, 'app-type')).toMatchObject({ status: 'error', code: 'invalid-app-type' })
    expect(findCheck(report, 'generator-target')).toMatchObject({ status: 'error', code: 'invalid-generator-target' })
  })

  it('checks configured CSS entries and their Tailwind import', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      dependencies: {
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^5.0.0',
      },
    })
    await writeFile(
      path.join(root, 'vite.config.ts'),
      'export default { plugins: [], cssEntries: ["src/missing.css", "src/plain.css"] }\n',
      'utf8',
    )
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src/plain.css'), '.button { color: red; }\n', 'utf8')

    const report = createDoctorReport({ cwd: root, nodeVersion: '22.18.0' })

    expect(findCheck(report, 'tailwind-css-entry')).toMatchObject({
      status: 'error',
      code: 'missing-css-entry',
    })
    expect(findCheck(report, 'tailwind-css-entry-import')).toMatchObject({
      status: 'warn',
      code: 'missing-tailwind-import',
    })
  })

  it('reports blocking errors outside a project root', async () => {
    const root = await createTempWorkspace()
    const report = createDoctorReport({ cwd: root, nodeVersion: '16.20.0' })

    expect(findCheck(report, 'package-json').status).toBe('error')
    expect(findCheck(report, 'node-version').status).toBe('error')
    expect(findCheck(report, 'tailwindcss').status).toBe('error')
    expect(hasDoctorFailure(report)).toBe(true)
    expect(formatDoctorReport(report)).toContain('weapp-tailwindcss doctor')
  })

  it('uses the published Node.js version range', async () => {
    const root = await createTempWorkspace()
    await writeJson(path.join(root, 'package.json'), {
      dependencies: {
        tailwindcss: '^4.0.0',
        'weapp-tailwindcss': '^4.0.0',
      },
    })

    expect(packageJson.engines.node).toBe(WEAPP_TW_REQUIRED_NODE_VERSION_RANGE)
    expect(findCheck(
      createDoctorReport({ cwd: root, nodeVersion: '20.19.0' }),
      'node-version',
    ).status).toBe('error')
    expect(findCheck(
      createDoctorReport({ cwd: root, nodeVersion: '22.17.0' }),
      'node-version',
    ).status).toBe('error')
    expect(findCheck(
      createDoctorReport({ cwd: root, nodeVersion: '22.18.0' }),
      'node-version',
    ).status).toBe('ok')
    expect(findCheck(
      createDoctorReport({ cwd: root, nodeVersion: '24.10.0' }),
      'node-version',
    ).status).toBe('error')
    expect(findCheck(
      createDoctorReport({ cwd: root, nodeVersion: '24.11.0' }),
      'node-version',
    ).status).toBe('ok')
  })
})
