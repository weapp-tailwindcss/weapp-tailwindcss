import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const [directory, runId, invocationId] = process.argv.slice(2)
if (process.argv.length !== 5 || !directory || !path.isAbsolute(directory) || !runId?.trim() || !invocationId?.trim()) {
  throw new Error('用法：runtime-static-cli <本轮绝对证据目录> <runId> <invocationId>')
}

// 生成前核对父进程已创建的本轮身份，不能向任意目录发布 static 输入。
// eslint-disable-next-line antfu/no-top-level-await
const identity = JSON.parse(await readFile(path.join(directory, 'runtime-session.json'), 'utf8'))
if (identity?.version !== 1
  || identity.producer !== 'react-native'
  || identity.target !== 'react-native-ios'
  || identity.runId !== runId
  || identity.invocationId !== invocationId) {
  throw new Error('React Native static 子进程与本轮 iOS 运行时身份不符')
}

// 同步 Tailwind 编译留在受管子进程内，父进程可在总期限到达后终止整棵进程树。
// eslint-disable-next-line antfu/no-top-level-await
const { prepareRuntimeStaticEvidence } = await import('./runtime-static')
// eslint-disable-next-line antfu/no-top-level-await
await prepareRuntimeStaticEvidence(directory)
