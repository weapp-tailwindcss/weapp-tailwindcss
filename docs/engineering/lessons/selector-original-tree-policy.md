---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: f57ea921340c7002efbf472261c4374d5205e71a
regressions:
  - packages/postcss/test/selector-parent-chain.test.ts
  - packages/postcss/test/selectorParser.test.ts
  - packages/postcss/test/native/native-selector-rule.test.ts
---

# 选择器原树裁剪与展开所有权

## 症状

`.safe,:where(:is(.branch:-moz-any(:lang(ar))))` 经过直接规则转换和完整 PostCSS 管线后仍留下 `.branch:-moz-any(:lang(ar))`。嵌套 `:checked` 也会存活；间距替换还会先吞掉 `:not(:last-child:checked)`，掩盖其中原本应拒绝的伪类。

## 根因与纠正

selector-parser 的 walk 先回调再遍历后代。旧实现遇到 `:where` 就克隆、替换，随后策略仍修改旧的脱根后代，无法清理已生成的克隆。Rust arena 按同样游标行为实现，因此具有同一缺陷。父链类型还混淆了 Selector、Container 与 Root。

现在把原树分支裁剪与结构重写分开。第一阶段只执行原有伪元素、伪类、RTL 与否定条件裁剪，每个节点先确认父链实际终止于本轮 Root；删除 `:not` 后，旧后代不能再影响保留的主体。第二阶段保留原来的前序转义、组合器、间距及 where 展开，包括单分支通配符补偿和多分支类名补偿。声明归一仍在重写后执行一次。

uni-app x 原有多分支 where 拒绝资格必须在其后代裁剪前确定，包含 nested is/where 展开。否则先删除 `.before:before` 可能把原多分支降为一支，意外放行。Rust 资格预览复用原展开算法，只读取新增克隆结果，再回收预览节点，不占用正式重写的 arena 节点额度。上下文、缓存与资格判断不跨规则共享。

最初的后序展开原型虽然修复新回归，却改变既有 `child\:` 精确转义断言，因此已弃用并保留失败日志，没有修改该断言或更新快照。

## 验证

在本任务独立依赖工作树、Node24.22.1/pnpm12.15.0、基线加本地改动下：

- 原实现新增 JS 回归先得到4项失败、7项对照通过；Rust 新裁剪用例失败，3项对照通过。
- `cargo test --manifest-path packages/postcss/native/Cargo.toml --locked`：19项通过。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --config vitest.native.config.ts --update=none --coverage.enabled=false`：7文件131项通过。新输入直接调用真实 binding，明确要求非 null；覆盖完整 handler、持有的已删除 rule 与声明状态、原始平台资格及原有种子差分。
- `CI=1 pnpm --filter @weapp-tailwindcss/postcss exec vitest run --update=none --coverage.enabled=false`：165文件1916项通过，3项既有跳过。没有更新任何快照。
- 后续原始单分支通配符的闭包值类型修正，再以四文件76项回归确认；六个 TypeScript 文件显式 lint、Rust clippy 与修改文件的 rustfmt 检查通过。完整 cargo fmt 检查另外报告两个未修改文件 `lib.rs` 与 `value.rs` 的既有格式差异，未批量改写。
- PostCSS ESM/CJS 与声明构建通过，保留既有 mixed-exports 警告；包构建仍使用原有 noCheck，不能代替严格检查。原 `pnpm --filter @weapp-tailwindcss/scripts exec tsc --noEmit --pretty false` 从42降为37条诊断，整体仍失败，没有更改 flags、检查范围或排除项。
- `pnpm agents:check` 为71条规则、0错误；`pnpm release status` 确认 PostCSS、主包及八个平台包的固定组 intent，未执行发布；`git diff --check` 通过。

首轮 ABI 仍输出旧结果，原因是本地 `build:native` 只更新本包二进制，而加载器优先使用已存在的平台包。实际解析路径与两份二进制的哈希、直接输出均已核对。随后按已有 native CI 的当前宿主 target 构建、metadata 与 stageBinding 流程定向暂存，校验 sourceDigest 和内容哈希后再执行上述原生测试；没有修改生产加载顺序或用回退掩盖差异。

## 适用边界

这是已有平台策略在克隆之前完成的生命周期修复，不是新增选择器语法或降低拒绝范围。原生显式回退、UTF-16、128层解析边界和100000节点额度保持既有契约。只验证本机 macOS arm64 真实 ABI，其他目标仍需对应 CI；不提交生成二进制或元数据。

本次没有性能收益证据，没有改动 demo、预算或全端预检，也不清除正式 RSS、宿主事件或当前 PR 验收阻塞。

## 规则评估

不新增 AGENTS 条目。现有生命周期、根因回归和真实 ABI 要求足够；分发验证必须确认实际加载的产物，单个构建命令成功不能代表该产物已被消费。
