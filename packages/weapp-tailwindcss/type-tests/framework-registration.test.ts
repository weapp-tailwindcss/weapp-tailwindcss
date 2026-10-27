import type { ViteFrameworkName } from '../src/bundlers/framework-selector'
import type { ViteFrameworkBranchContext } from '../src/bundlers/vite/shared/create-framework-plugins'

declare function expectType<T>(value: T): void
declare const branch: ViteFrameworkBranchContext

// 共享组装只消费能力与诊断名称，新增测试框架不要求修改生产身份联合类型。
const diagnosticName: ViteFrameworkBranchContext['frameworkName'] = 'capability-fixture'
expectType<string>(diagnosticName)

// @ts-expect-error 诊断名称在单个活动实例内保持不变。
branch.frameworkName = 'changed-fixture'

// @ts-expect-error 公开入口仍只支持已登记的生产框架。
expectType<ViteFrameworkName>(diagnosticName)
