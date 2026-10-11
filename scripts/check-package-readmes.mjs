import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageGroups = ['packages', 'packages-runtime']
const legacyReadmeNames = ['README.en.md', 'README_en.md']

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function findPublishedPackages() {
  const packages = []

  for (const group of packageGroups) {
    const groupRoot = path.join(repositoryRoot, group)
    const entries = await readdir(groupRoot, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const packageRoot = path.join(groupRoot, entry.name)
      const manifestPath = path.join(packageRoot, 'package.json')
      if (!(await exists(manifestPath))) {
        continue
      }

      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (manifest.private === true) {
        continue
      }

      packages.push({
        manifest,
        name: manifest.name,
        packageRoot,
      })
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

function validateContent({ manifest, name, packageRoot }, english, chinese) {
  const errors = []
  const relativeRoot = path.relative(repositoryRoot, packageRoot)

  if (!english.startsWith(`# ${name}\n`)) {
    errors.push(`${relativeRoot}/README.md must start with "# ${name}"`)
  }
  if (!chinese.startsWith(`# ${name}\n`)) {
    errors.push(`${relativeRoot}/README.zh-CN.md must start with "# ${name}"`)
  }
  if (!english.includes('> English | [简体中文](./README.zh-CN.md)')) {
    errors.push(`${relativeRoot}/README.md must use the standard English language switch`)
  }
  if (!chinese.includes('> [English](./README.md) | 简体中文')) {
    errors.push(`${relativeRoot}/README.zh-CN.md must use the standard Chinese language switch`)
  }

  if (name === 'weapp-tailwindcss') {
    const nodeRequirement = manifest.engines?.node
    const unsupportedTailwindVersion = /Tailwind\s*CSS\s*(?:@|v)?[23]\b/i

    if (unsupportedTailwindVersion.test(english) || unsupportedTailwindVersion.test(chinese)) {
      errors.push(`${relativeRoot} READMEs must describe the current Tailwind CSS v4-only support boundary`)
    }
    if (nodeRequirement && (!english.includes(nodeRequirement) || !chinese.includes(nodeRequirement))) {
      errors.push(`${relativeRoot} READMEs must match package.json engines.node (${nodeRequirement})`)
    }
  }

  return errors
}

async function main() {
  const publishedPackages = await findPublishedPackages()
  const errors = []

  for (const packageInfo of publishedPackages) {
    const englishPath = path.join(packageInfo.packageRoot, 'README.md')
    const chinesePath = path.join(packageInfo.packageRoot, 'README.zh-CN.md')
    const relativeRoot = path.relative(repositoryRoot, packageInfo.packageRoot)

    if (!(await exists(englishPath))) {
      errors.push(`${relativeRoot}/README.md is missing`)
    }
    if (!(await exists(chinesePath))) {
      errors.push(`${relativeRoot}/README.zh-CN.md is missing`)
    }

    for (const legacyName of legacyReadmeNames) {
      if (await exists(path.join(packageInfo.packageRoot, legacyName))) {
        errors.push(`${relativeRoot}/${legacyName} uses a legacy locale filename`)
      }
    }

    if (await exists(englishPath) && await exists(chinesePath)) {
      const [english, chinese] = await Promise.all([
        readFile(englishPath, 'utf8'),
        readFile(chinesePath, 'utf8'),
      ])
      errors.push(...validateContent(packageInfo, english, chinese))
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Package README validation failed:\n- ${errors.join('\n- ')}\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write(`Validated bilingual READMEs for ${publishedPackages.length} published packages.\n`)
}

await main()
