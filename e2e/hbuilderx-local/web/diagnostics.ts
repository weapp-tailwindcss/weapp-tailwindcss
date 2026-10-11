import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

/** 在隔离的 Windows CI 中保留超时现场，必须早于进程和项目清理。 */
export async function captureHBuilderXFailure(artifactRoot: string) {
  if (process.platform !== 'win32' || process.env['GITHUB_ACTIONS'] !== 'true') {
    return
  }
  await promisify(execFile)('pwsh', [
    '-NoProfile',
    '-File',
    path.resolve(__dirname, '../../../scripts/ci/issue-hbuilderx-diagnostics.ps1'),
  ], {
    timeout: 30_000,
    env: { ...process.env, E2E_HBUILDERX_DIAGNOSTIC_DIR: path.join(artifactRoot, 'native') },
  }).catch(error => console.error('HBuilderX 失败现场采集异常', error.message))
}
