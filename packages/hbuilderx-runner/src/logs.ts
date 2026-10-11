import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { HBuilderXIssue } from './types'

const PROJECT_NOT_UNI_APP_RE = /不是\s*uni-app\s*项目|not\s+a\s+uni-app\s+project/i
const PROJECT_TYPE_UNSUPPORTED_RE = /项目类型为([^，]+)，暂不支持|是\s+([^，\s][^，]*)项目，暂不支持|project\s+type.+unsupported/i
const PROJECT_TARGET_UNSUPPORTED_RE = /不支持运行到\s*(鸿蒙|Harmony)|(?:Harmony|OpenHarmony).+(?:target|platform).+unsupported/i
const CONFIG_LOAD_FAILED_RE = /failed to load config|error when starting dev server|Failed to resolve entry for package/i
const CLI_NOT_FOUND_RE = /未找到\s*HBuilderX\s*CLI|HBUILDERX_CLI_PATH|command not found|ENOENT/i
const CLI_INSTANCE_MISMATCH_RE = /当前运行的cli与正在运行的HBuilderX不匹配|cli.+(?:does not match|mismatch).+HBuilderX|try.+HBuilderX.+(?:cli|MacOS)/i
const CLI_HOST_AMBIGUOUS_RE = /multiple running hbuilderx|多个.+HBuilderX.+运行|listhost.+--\s*host|--host.+listhost/i
const ANDROID_TOOLCHAIN_MISSING_RE = /adb(?:\.exe)?(?:\s*[:：].*)?(?:not found|ENOENT|不是内部或外部命令)|Android SDK|platform-tools/i
const IOS_TOOLCHAIN_MISSING_RE = /xcrun|xcode-select|xcodebuild|simctl|DEVELOPER_DIR|iOS 模拟器|Xcode/i
const HARMONY_TOOLCHAIN_MISSING_RES = [
  /hdc(?:\.exe)?(?:\s+(?:list\s+targets|target\s+list))?\s*(?:[:：]\s*)?(?:failed|not found|ENOENT|command not found)/i,
  /未找到\s*(?:DevEco|鸿蒙)[^\r\n]*(?:SDK|工具链)/i,
  /DevEco Studio[^\r\n]*(?:not found|未安装)/i,
  /HDC_PATH/i,
]
const HARMONY_BUILD_FAILED_RE = /Failed to resolve OhmUrl|ArkTS Compiler Error|运行包制作失败|hvigor ERROR/i
const IMPORTANT_LOG_RE = /\b(?:fatal|error)\b|失败|已停止运行/i
const importantLogsByBuffer = new WeakMap<string[], string[]>()

export function createLogBuffer(maxChunks = 160) {
  const logs: string[] = []
  const importantLogs: string[] = []
  const importantLogSet = new Set<string>()
  importantLogsByBuffer.set(logs, importantLogs)
  return {
    logs,
    push(chunk: Buffer | string) {
      const text = chunk.toString()
      logs.push(text)
      if (logs.length > maxChunks) {
        logs.splice(0, logs.length - maxChunks)
      }
      for (const item of text.split(/\r?\n/)) {
        if (!IMPORTANT_LOG_RE.test(item)) {
          continue
        }
        const line = item.trim()
        if (!line || importantLogSet.has(line)) {
          continue
        }
        importantLogSet.add(line)
        importantLogs.push(line)
        if (importantLogs.length > 24) {
          importantLogSet.delete(importantLogs.pop()!)
        }
      }
    },
    text() {
      return formatRecentLogs(logs)
    },
  }
}

export function collectProcessOutput(child: ChildProcess, maxChunks = 160) {
  const buffer = createLogBuffer(maxChunks)
  // 每条流独立解码，避免 Windows 管道等分块边界截断 UTF-8 字符。
  child.stdout?.setEncoding('utf8').on('data', chunk => buffer.push(chunk))
  child.stderr?.setEncoding('utf8').on('data', chunk => buffer.push(chunk))
  return buffer.logs
}

export function classifyHBuilderXOutput(output: string): HBuilderXIssue {
  if (CLI_INSTANCE_MISMATCH_RE.test(output)) {
    return {
      kind: 'cli-instance-mismatch',
      message: '当前 HBuilderX CLI 与目标运行实例不匹配。',
      hint: '请使用与目标 stable/alpha 实例对应的 CLI，并通过 listhost 与 --host 绑定运行实例。',
    }
  }
  if (CLI_HOST_AMBIGUOUS_RE.test(output)) {
    return {
      kind: 'cli-host-ambiguous',
      message: '检测到多个可用的 HBuilderX 运行实例。',
      hint: '请设置 HBUILDERX_HOST，或在 runner options 中显式传入 host。',
    }
  }
  if (ANDROID_TOOLCHAIN_MISSING_RE.test(output)) {
    return {
      kind: 'android-toolchain-missing',
      message: '当前环境缺少 Android 运行所需工具链。',
      hint: '请安装 Android SDK platform-tools，并确认 adb 可用；需要指定设备时设置 E2E_HBUILDERX_ANDROID_DEVICE_ID。',
    }
  }
  if (IOS_TOOLCHAIN_MISSING_RE.test(output)) {
    return {
      kind: 'ios-toolchain-missing',
      message: '当前环境缺少 iOS 模拟器或 Xcode 工具链。',
      hint: '请安装完整 Xcode，确认 xcrun simctl/xcodebuild 可用，并完成 Xcode 首次启动组件安装。',
    }
  }
  if (HARMONY_TOOLCHAIN_MISSING_RES.some(pattern => pattern.test(output))) {
    return {
      kind: 'harmony-toolchain-missing',
      message: '当前环境缺少 Harmony 运行所需工具链。',
      hint: '请安装 DevEco Studio，或设置 HDC_PATH/E2E_HBUILDERX_HARMONY_HDC_PATH 指向 hdc。',
    }
  }
  if (HARMONY_BUILD_FAILED_RE.test(output)) {
    return {
      kind: 'harmony-build-failed',
      message: 'HBuilderX 的 Harmony 工程构建失败。',
      hint: '请查看保留的首个 ArkTS/hvigor 错误；这类错误发生在 HBuilderX 已生成 Harmony 工程之后。',
    }
  }
  if (CLI_NOT_FOUND_RE.test(output)) {
    return {
      kind: 'cli-not-found',
      message: '未找到 HBuilderX CLI。',
      hint: '请启动/安装 HBuilderX，或设置 HBUILDERX_CLI_PATH 指向 HBuilderX CLI。',
    }
  }
  if (PROJECT_NOT_UNI_APP_RE.test(output)) {
    return {
      kind: 'project-not-uni-app',
      message: 'HBuilderX 将当前目录识别为非 uni-app 项目。',
      hint: '请确认传入的是 HBuilderX 可识别的项目根目录，并检查 manifest.json、pages.json 与导入状态。',
    }
  }
  const unsupportedTarget = output.match(PROJECT_TARGET_UNSUPPORTED_RE)
  if (unsupportedTarget) {
    return {
      kind: 'project-type-unsupported',
      message: `HBuilderX 不支持当前运行目标${unsupportedTarget[1] ? `：${unsupportedTarget[1]}` : ''}。`,
      hint: '请升级到支持该项目目标的 HBuilderX channel，并确认项目路径与导入记录一致。',
    }
  }
  const unsupported = output.match(PROJECT_TYPE_UNSUPPORTED_RE)
  if (unsupported) {
    const projectType = unsupported[1] ?? unsupported[2]
    return {
      kind: 'project-type-unsupported',
      message: `HBuilderX 不支持当前项目类型${projectType ? `：${projectType.trim()}` : ''}。`,
      hint: '请确认项目已按目标平台导入，必要时先 close/open 项目后再 launch。',
    }
  }
  if (CONFIG_LOAD_FAILED_RE.test(output)) {
    return {
      kind: 'config-load-failed',
      message: 'HBuilderX/Vite 配置加载失败。',
      hint: '请先构建 workspace 依赖并检查 vite.config.ts 中的包入口。输出日志里通常包含具体 import。',
    }
  }
  return {
    kind: 'unknown',
    message: 'HBuilderX 命令失败，未匹配到已知分类。',
  }
}

export function createTimeoutIssue(): HBuilderXIssue {
  return {
    kind: 'timeout',
    message: 'HBuilderX 命令在限定时间内没有结束。',
    hint: '请检查 HBuilderX 是否卡在项目导入、设备选择、运行基座安装或平台编译阶段；最近日志通常包含停住的位置。',
  }
}

export function formatRecentLogs(logs: string[], maxLength = 6000) {
  const output = logs.join('')
  const recent = output.length > maxLength ? output.slice(-maxLength) : output
  const importantLogs = importantLogsByBuffer.get(logs) ?? []
  const important = importantLogs.filter(line => !recent.includes(line))
  return important.length > 0
    ? `关键错误：\n${important.join('\n')}\n\n最近日志：\n${recent}`
    : recent
}
