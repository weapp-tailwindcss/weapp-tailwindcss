import type { LynxTemplatePluginApi } from '../css-variables'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** 只关联与宿主暴露类身份一致的构建器依赖；不把目标 SDK 当作宿主运行版本。 */
export async function installedEncoderVersion(root: string | undefined, template: LynxTemplatePluginApi) {
  try {
    if (!root) {
      throw new Error('构建器未提供项目根目录')
    }
    const project = createRequire(path.join(root, 'package.json'))
    const builder = createRequire(project.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
    const file = builder.resolve('@lynx-js/template-webpack-plugin/package.json')
    const metadata = JSON.parse(await readFile(file, 'utf8'))
    const entry = metadata.exports?.['.']?.import
    if (typeof entry !== 'string' || !entry.startsWith('./')) {
      throw new Error('模板包缺少明确的 ESM 导出')
    }
    const loaded = await import(pathToFileURL(path.resolve(path.dirname(file), entry)).href)
    if (loaded.LynxTemplatePlugin !== template) {
      throw new Error('已解析模板类与宿主暴露类身份不一致')
    }
    const encoderFile = createRequire(file).resolve('@lynx-js/tasm/package.json')
    const encoder = JSON.parse(await readFile(encoderFile, 'utf8'))
    if (encoder.name !== '@lynx-js/tasm' || typeof encoder.version !== 'string' || !encoder.version.trim()) {
      throw new Error('编码包版本元数据无效')
    }
    return { version: encoder.version as string, source: '@lynx-js/tasm：从已绑定模板构建器的依赖解析；未独立确认实际 encode hook 或执行二进制，不是宿主引擎版本。' }
  }
  catch (error) {
    return { source: `编码器版本未确认：${error instanceof Error ? error.message : String(error)}` }
  }
}

export function diagnosticVersions(options?: Record<string, string | boolean>, encoder?: { version?: string | undefined, source: string }) {
  const declared = (key: string) => typeof options?.[key] === 'string' ? options[key] as string : undefined
  return {
    versions: { encoder: encoder?.version ?? declared('encoderVersion') ?? 'unknown', engine: declared('engineVersion') ?? 'unknown', targetSdk: declared('targetSdkVersion') },
    versionEvidence: {
      encoder: encoder?.version ? encoder.source : [encoder?.source, declared('encoderVersion') ? '版本来自 compilerOptions 显式声明；未独立验证执行二进制。' : '编码器未提供可关联的版本证据。'].filter(Boolean).join(' '),
      engine: declared('engineVersion') ? 'compilerOptions 显式声明；宿主运行版本仍须设备验收。' : '构建不能推断宿主运行引擎版本；本轮未提供。',
    },
  }
}
