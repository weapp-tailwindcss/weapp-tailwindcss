import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collectEnv } from '../src/env'
import { benchPath, ensureDataDir, packageRoot } from '../src/paths'
import { SUBJECTS, type SubjectId } from '../src/subjects'
import type { CaseBench } from './bench-worker.mts'

interface SubjectBench {
  subjectId: SubjectId
  cases: CaseBench[]
}

function runWorker(subjectId: SubjectId) {
  const worker = fileURLToPath(new URL('./bench-worker.mts', import.meta.url))
  const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))

  return new Promise<SubjectBench>((resolve, reject) => {
    const nodeOptions = [process.env.NODE_OPTIONS, '--expose-gc'].filter(Boolean).join(' ')
    const child = spawn(
      process.execPath,
      ['--expose-gc', tsxCli, worker, `--subject=${subjectId}`],
      {
        cwd: packageRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions,
        },
      },
    )

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`worker ${subjectId} exited ${code}: ${stderr || stdout}`))
        return
      }
      const line = stdout.trim().split('\n').at(-1)
      if (!line) {
        reject(new Error(`worker ${subjectId} produced no JSON`))
        return
      }
      resolve(JSON.parse(line) as SubjectBench)
    })
  })
}

async function main() {
  const subjects: SubjectBench[] = []
  for (const subject of SUBJECTS) {
    console.log(`bench ${subject.id}`)
    subjects.push(await runWorker(subject.id))
  }

  ensureDataDir()
  writeFileSync(benchPath, `${JSON.stringify({ env: collectEnv(), subjects }, null, 2)}\n`)
  console.log(`bench written to ${benchPath}`)
}

await main()
