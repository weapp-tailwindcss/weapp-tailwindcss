import type { ProjectEntry } from '../e2e/shared.ts'
import type { CssArtifact, ModeResult, PluginHtmlMode, ProjectReport } from './taro-plugin-html-style-snapshots/report.ts'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash as createNodeHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getProjectCssSnapshotFiles } from '../e2e/projectCssSnapshots.ts'
import { E2E_PROJECTS } from '../e2e/projectEntries.ts'
import { collectCssSnapshots, normalizeCssTextSnapshot } from '../e2e/snapshotUtils.ts'
import { mergeScopedPluginHtmlReports, renderModeReadme, renderProjectReadme, renderRootReadme, verifyPluginHtmlReports } from './taro-plugin-html-style-snapshots/report.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const demoRoot = path.resolve(repoRoot, 'demo')
const snapshotRoot = path.resolve(repoRoot, 'e2e/__snapshots__/taro-plugin-html-style-output')

const TARO_PROJECTS = E2E_PROJECTS.filter(project => project.name.startsWith('taro-'))

function isTruthyEnv(name: string) {
  const value = process.env[name]
  return value === '1' || value === 'true'
}

function getSelectedProjects() {
  const only = process.env.WEAPP_TW_TARO_PLUGIN_HTML_PROJECTS
  if (!only) {
    return TARO_PROJECTS
  }
  const selected = new Set(only.split(',').map(item => item.trim()).filter(Boolean))
  return TARO_PROJECTS.filter(project => selected.has(project.name))
}

function toSafeArtifactName(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/[^\w.-]/g, '-'))
    .join('__') || 'output.wxss'
}

function countSelectors(css: string) {
  const matches = css.match(/[{}]/g)
  return matches ? matches.filter(item => item === '{').length : 0
}

function countMatches(css: string, pattern: RegExp) {
  return css.match(pattern)?.length ?? 0
}

function createHash(input: string) {
  return createNodeHash('sha256').update(input).digest('hex')
}

function normalizeReportText(input: string) {
  return `${input.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

async function removeDir(target: string) {
  await fs.rm(target, { recursive: true, force: true })
}

async function runCommand(project: ProjectEntry, mode: PluginHtmlMode) {
  const cwd = path.resolve(demoRoot, project.name)
  const start = Date.now()
  const env = {
    ...process.env,
    TARO_BUILD_STRICT: '1',
    WEAPP_TW_TARO_PLUGIN_HTML: mode === 'with-plugin-html' ? '1' : '0',
  }

  return await new Promise<ModeResult>((resolve) => {
    const child = spawn('pnpm', ['run', 'build:weapp'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => chunks.push(Buffer.from(chunk)))
    child.on('error', (error) => {
      resolve({
        mode,
        status: 'failed',
        command: 'pnpm run build:weapp',
        durationMs: Date.now() - start,
        artifacts: [],
        error: error.message,
      })
    })
    child.on('close', (code, signal) => {
      const output = Buffer.concat(chunks).toString('utf8')
      resolve({
        mode,
        status: code === 0 ? 'passed' : 'failed',
        command: 'pnpm run build:weapp',
        durationMs: Date.now() - start,
        artifacts: [],
        error: code === 0
          ? undefined
          : normalizeReportText(output).slice(-4000) || `exit ${signal ?? code}`,
      })
    })
  })
}

async function collectProjectArtifacts(project: ProjectEntry, mode: PluginHtmlMode, outputRoot: string) {
  const projectRoot = path.resolve(demoRoot, project.name)
  const modeRoot = path.join(outputRoot, project.name, mode)
  const artifactRoot = path.join(modeRoot, 'artifacts')
  await removeDir(modeRoot)
  await fs.mkdir(artifactRoot, { recursive: true })

  const artifacts: CssArtifact[] = []
  for (const cssEntry of getProjectCssSnapshotFiles(project)) {
    const snapshots = await collectCssSnapshots(projectRoot, cssEntry.cssFile, {
      rootSnapshotName: cssEntry.snapshotName,
    })
    for (const snapshot of snapshots) {
      const normalized = `${normalizeCssTextSnapshot(snapshot.content).trimEnd()}\n`
      const artifactName = toSafeArtifactName(snapshot.fileName)
      const artifactPath = path.join(artifactRoot, artifactName)
      await fs.writeFile(artifactPath, normalized, 'utf8')
      artifacts.push({
        fileName: snapshot.fileName,
        artifact: path.relative(modeRoot, artifactPath).replace(/\\/g, '/'),
        bytes: Buffer.byteLength(normalized),
        lines: normalized.split('\n').length - 1,
        selectors: countSelectors(normalized),
        hasTaroSelector: /\btaro-|\.taro\b|taro-[\w-]+/.test(normalized),
        hasWeappEscapedArbitrarySelector: /_[abcpqsl]\b|_b[^{}]+_B/.test(normalized),
        h5AliasSelectors: countMatches(normalized, /\.h5-[\w-]+/g),
        rawHtmlTagSelectors: countMatches(normalized, /(?:^|[\s>+~,])(li|img|input|textarea|video|i|div)(?=[\s.#:[>{,+~])/gm),
        cursorDeclarations: countMatches(normalized, /\bcursor\s*:/g),
        sha256: createHash(normalized),
      })
    }
  }
  return artifacts
}

function compareModes(withResult: ModeResult, withoutResult: ModeResult) {
  const withByFile = new Map(withResult.artifacts.map(item => [item.fileName, item]))
  const withoutByFile = new Map(withoutResult.artifacts.map(item => [item.fileName, item]))
  const allFiles = [...new Set([...withByFile.keys(), ...withoutByFile.keys()])].sort()
  const changedFiles: string[] = []
  const onlyWithPluginHtml: string[] = []
  const onlyWithoutPluginHtml: string[] = []

  for (const file of allFiles) {
    const withArtifact = withByFile.get(file)
    const withoutArtifact = withoutByFile.get(file)
    if (!withArtifact) {
      onlyWithoutPluginHtml.push(file)
      continue
    }
    if (!withoutArtifact) {
      onlyWithPluginHtml.push(file)
      continue
    }
    if (withArtifact.sha256 !== withoutArtifact.sha256) {
      changedFiles.push(file)
    }
  }

  return {
    sameArtifactCount: withResult.artifacts.length === withoutResult.artifacts.length,
    sameHashes: changedFiles.length === 0 && onlyWithPluginHtml.length === 0 && onlyWithoutPluginHtml.length === 0,
    changedFiles,
    onlyWithPluginHtml,
    onlyWithoutPluginHtml,
  }
}

async function writeProjectReport(report: ProjectReport, outputRoot: string) {
  const projectRoot = path.join(outputRoot, report.project)
  for (const mode of report.modes) {
    await fs.mkdir(path.join(projectRoot, mode.mode), { recursive: true })
    await fs.writeFile(path.join(projectRoot, mode.mode, 'README.md'), renderModeReadme(report.project, mode), 'utf8')
  }
  await fs.writeFile(path.join(projectRoot, 'README.md'), renderProjectReadme(report), 'utf8')
}

async function processProject(project: ProjectEntry, outputRoot: string) {
  const projectRoot = path.resolve(demoRoot, project.name)
  await removeDir(path.join(projectRoot, 'dist'))
  const withResult = await runCommand(project, 'with-plugin-html')
  if (withResult.status === 'passed') {
    withResult.artifacts = await collectProjectArtifacts(project, 'with-plugin-html', outputRoot)
  }

  await removeDir(path.join(projectRoot, 'dist'))
  const withoutResult = await runCommand(project, 'without-plugin-html')
  if (withoutResult.status === 'passed') {
    withoutResult.artifacts = await collectProjectArtifacts(project, 'without-plugin-html', outputRoot)
  }

  const report: ProjectReport = {
    project: project.name,
    cssFiles: getProjectCssSnapshotFiles(project).map(item => item.cssFile),
    modes: [withResult, withoutResult],
    comparison: compareModes(withResult, withoutResult),
  }
  await writeProjectReport(report, outputRoot)
  return report
}

async function main() {
  const projects = getSelectedProjects()
  if (projects.length === 0) {
    throw new Error('No Taro projects selected')
  }
  const verify = isTruthyEnv('WEAPP_TW_VERIFY_TARO_PLUGIN_HTML_SNAPSHOTS')
  const scoped = projects.length !== TARO_PROJECTS.length || isTruthyEnv('WEAPP_TW_KEEP_TARO_PLUGIN_HTML_SNAPSHOTS')
  const baselinePath = path.join(snapshotRoot, 'report.json')
  const baseline: ProjectReport[] = verify || scoped
    ? JSON.parse(await fs.readFile(baselinePath, 'utf8'))
    : []
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-plugin-html-'))
  try {
    const reports: ProjectReport[] = []
    for (const project of projects) {
      process.stdout.write(`[taro-plugin-html] ${project.name}\n`)
      reports.push(await processProject(project, stagingRoot))
    }
    const failed = reports.flatMap(report => report.modes.filter(mode => mode.status === 'failed').map(mode => `${report.project}:${mode.mode}`))
    if (failed.length > 0) {
      throw new Error(`Taro plugin-html style snapshots failed: ${failed.join(', ')}`)
    }
    if (verify) {
      verifyPluginHtmlReports(baseline, reports)
      for (const report of reports) {
        for (const mode of report.modes) {
          for (const artifact of mode.artifacts) {
            const relative = path.join(report.project, mode.mode, artifact.artifact)
            const actual = await fs.readFile(path.join(stagingRoot, relative))
            const expected = await fs.readFile(path.join(snapshotRoot, relative))
            if (!actual.equals(expected)) {
              throw new Error(`plugin-html 产物内容不一致：${relative}`)
            }
          }
        }
      }
      process.stdout.write(`[taro-plugin-html] 只读复验通过：${reports.length} 个项目\n`)
      return
    }
    if (!scoped) {
      await removeDir(snapshotRoot)
    }
    await fs.mkdir(snapshotRoot, { recursive: true })
    for (const report of reports) {
      const target = path.join(snapshotRoot, report.project)
      await removeDir(target)
      await fs.cp(path.join(stagingRoot, report.project), target, { recursive: true })
    }
    const complete = scoped ? mergeScopedPluginHtmlReports(baseline, reports) : reports
    await fs.writeFile(baselinePath, `${JSON.stringify(complete, null, 2)}\n`, 'utf8')
    await fs.writeFile(path.join(snapshotRoot, 'README.md'), renderRootReadme(complete), 'utf8')
  }
  finally {
    await removeDir(stagingRoot)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
