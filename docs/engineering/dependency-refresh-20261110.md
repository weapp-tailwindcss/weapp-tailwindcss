# 2026-11-10 main 依赖刷新

本轮基线为 `f41c09bd2afea60bde3239ccbd2b96dd96e96c88`。这是全仓盘点后的保守升级批次，未完成的框架迁移与平台验收继续作为阻塞，不能据此宣称全部依赖或安全问题已解决。

## 实施范围

- 盘点 109 份 tracked npm manifest（108 份含依赖）、2010 条声明、470 个 npm 包身份、9 份 pnpm 锁和 2 份 Cargo 锁；覆盖根、workspace、demo、Web/issue/style-injector、starter、7 个独立模板、历史 fixture 与 Rust。排除生成目录和 `submodules/tailwindcss-mangle`。
- 12 条声明或解析结果升级，829 条已是最新，313 条保留，856 条阻塞。分类是依赖声明维度，不是测试通过数；peer 的“最新”仅表示范围覆盖上游正式目标。
- `postcss-selector-parser` 曾从 7.1.7 升至 7.2.0；PR benchmark 在 MPX 与 uni-app Vite 两个独立 shard 均测得重复性能回归后，已恢复到 7.1.7。完整固定 v7 直接及传递链后，新 head 的 MPX benchmark 通过。Taro Vite benchmark 在 `lilconfig` 3.1.5 下 HMR 插件阶段 +11.43%、端到端 HMR 中位数 +11.49%；仅改直接声明不足以回退，pnpm 仍将 `postcss-load-config`、`cssnano` 等快照解析到 3.1.5。现增加 v3 传递解析 override 到已验证的 3.1.4，待准确锁闭包确认并新 head benchmark 复核。`tailwind-variants` 4.0.1 → 4.0.2 保留。普通依赖使用仓库 `scripts/update-packages.ts up -rL`，保留 catalog 关系。
- 7 个模板的 `weapp-tailwindcss` 声明统一为 `^5.7.3`，锁从 5.7.1 升至 5.7.3；在独立临时副本由 pnpm 生成锁，再逐个冻结安装。没有手写锁或共享可写 node_modules。
- 中文 change intent 覆盖受影响的 7 个公开包。没有修改模板生成协议或新增 API，不涉及 `create-weapp-vite` 联动。

## 证据与复查边界

- [逐依赖清单](dependency-refresh-20261110.inventory.tsv)、[结构化清单与锁身份](dependency-refresh-20261110.inventory.json)、[项目状态](dependency-refresh-20261110.projects.tsv)、[本轮 registry](dependency-refresh-20261110.registry.json)。身份包含准确基线 blob、前后 SHA256 和字节数；registry 保留请求时间、URL、服务端日期、engines 与 peer。
- 历史保留依据仅在 manifest 与 catalog 的 Git 对象均等于历史报告所绑定对象、有效声明也未变化时复用，每行保留来源。版本目标与风险来自本轮查询，不把旧测试当作本轮通过。
- [官方 UVM 逐项目输出](dependency-refresh-20261110.uvm.json)：固定 `@dcloudio/uvm@0.3.1`，在 11 个实际 npm 编译器消费者分别运行 `latest --manager manual`。正式配套为 Vue3 `3.0.0-5030420261029002`、Vue2 `2.0.2-5030420261028001`；仅查询，没有机械套用 npm latest 或自动安装编译器。HBuilderX 内置编译器单独验收，不计为第 12 个 npm 消费者。
- DCloud 成组迁移、框架/类型跨代迁移、多代 Vite 别名、历史 fixture、精确 Rust NAPI/OXC pin 按逐行原因和退出条件保留或阻塞。Vite 别名中的 registry 最新主版本仅供对照，不是将旧代兼容夹具升级到 Vite 8 的目标。
- Sass 暂留 1.107.1；1.108.1 的历史 Windows 风险需要独立复验。Rust 锁未修改，不能把 registry 查询或本机预检当作 cargo test/clippy/ABI 已通过。

## 安全与 peer

[本轮风险清单](dependency-refresh-20261110.risks.json)覆盖全部 9 份 pnpm 锁的 pnpm 内置 audit（JSON 输出）、根与 7 个已安装模板的 pnpm 内置 peers check（JSON 输出），保留原始输出摘要、消费者路径、命令、时间和 SHA256。历史 fixture 未安装，未伪造 peer 检查。

根审计为 low 20、moderate 96、high 86、critical 4，尚未安全清零。critical 来自 Taro 链中的 swiper（GHSA-hmx5-qpq5-p643，修复 >=12.1.2）、decompress（GHSA-mp2f-45pm-3cg9 / GHSA-hrh2-vp3x-79xf，当前无修复版本）和 tar（GHSA-23hp-3jrh-7fpw，修复 >=7.5.19）。根直接 tar 已为 7.5.22，不能因此抹去框架内旧 tar。需要上游框架升级或有消费者证据的替换，不能以跨主版本 override 强制放行。

根、Taro 和 uni-app 模板仍有 peer 不匹配；Mpx、HBuilderX、weapp-vite 模板 peer 检查通过。HBuilderX 模板 audit 为 0，其他项目风险详见附件。审计非零已记录，不修改 CI 的风险政策来掩盖结果。

## 本地验证

| 验证 | 本轮结果 |
| --- | --- |
| Node / pnpm | Node 24.22.2 / pnpm 12.18.0 |
| 根与 7 个模板 `pnpm install --frozen-lockfile` | 全部通过 |
| 受影响依赖闭包 Turbo build | 19 项构建通过 |
| 定向 Vitest，禁止更新快照 | 230 文件通过，2787 用例通过，6 跳过 |
| 首次定向测试 | 缺少新 worktree 的 dist；完成依赖闭包构建后原命令重跑通过，无源码补丁 |
| 扩展环境 prepare / 当前会话 computer use / verify | 源码升级前报告 `06b70baa-4781-47d9-849b-9de15200f13c` 通过；源码变化后已失效，不能放行最终全面验收 |
| 最终全面验收、模板 static/HMR/IDE、多端与 Rust/native | 待新的同源预检与工作流，当前不得视作通过 |
| PR CI | 提交后跟进准确 head，失败继续修复；不合并、不发布 |

定向测试命令：

```sh
CI=1 pnpm exec vitest run --project=@weapp-tailwindcss/css-compat --project=@weapp-tailwindcss/postcss --project=@weapp-tailwindcss/postcss-calc --project=tailwindcss-config --project=@weapp-tailwindcss/typography --project=@weapp-tailwindcss/ui --project=@weapp-tailwindcss/variants --update=none --bail=1
```

生成 static 基线和正式复验尚未执行，没有自动接受快照。后续结果追加到本报告并在 PR 中区分通过、失败、跳过和环境阻塞。

## PR 性能回归跟进

PR #1345 首轮 head `7520c6da1983192d47b6d17581686c429fa77ee5` 的 [Benchmark](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/42785108934) 在 MPX 与 uni-app Vite 确认 HMR RSS 回归，uni-app Vite 反向顺序复测仍增加约 6%–7%。MPX 另有构建和插件耗时回归。没有放宽阈值或更新性能基线。

`258cb0af0a525ce62f4c069b2f3bb5ad04f234ea` 只恢复了 `^7.1.7` 范围，pnpm 实际仍锁定 7.2.0；该轮 MPX 再次失败不能证明回退解析器无效。`88d52ae419817f72bec40958393daeee3b93f7c6` 精确固定四个 workspace importer 及 css-compat 的 specificity peer 为 7.1.7，但 MPX 的传递依赖闭包仍使用 7.2.0，该轮 MPX HMR 常驻 RSS 为 2057 MB，基线为 1689 MB，Taro Vite 另有插件阶段回归。

后续把 v7 传递链一并固定为 7.1.7，保留 v6 历史兼容链；pnpm 生成的根锁不再包含 7.2.0。这样才完整恢复被测 demo 的旧解析器闭包，不把直接依赖 pin 当作消费者实际解析已恢复。精确 pin 和 override 的退出条件是新版本通过同样的 CSS 热路径与 HMR RSS 独立复测。完整回退后的结果仍待新 head 验证，暂不宣称已锁定全部性能根因。

本地冻结安装、`pnpm agents:check`、`git diff --check` 和 `pnpm release status` 通过。iOS 首轮分别在 RN 截图与 Lynx 模拟器安装阶段超时，仍需新 head 完整运行结果，不能计为原生验收通过。
