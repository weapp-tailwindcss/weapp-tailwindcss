# 多端发布认证

发布认证只对当前 commit、tree、`pnpm-lock.yaml`、coverage registry/catalog 和声明的工具链版本负责，不宣称对未来依赖或未声明环境永久正确。

## Hosted CI

PR 使用 `Multiplatform Coverage Gate`，nightly 使用 `E2E Coverage Nightly`。两个 workflow 都生成 `coverage-report.v3`，报告必须绑定当前 SHA 和 lockfile；required cell 缺失、`blocked`、`not-run`、失败或过期都会使对应 job 失败。

当前可在 GitHub hosted runner 上执行 Linux、macOS、Windows、浏览器、静态构建、Android/iOS simulator、React Native Web 和静态 Lynx 检查。没有 self-hosted runner 时，不把微信 DevTools、HBuilderX、Harmony 或真机结果降级为通过。

## 本地设备/IDE

设备和 IDE 链路在具备工具链的机器上执行：

```bash
pnpm e2e:runner:health -- --mode=local --platform=android
pnpm e2e:runner:health -- --mode=local --platform=ios
pnpm e2e:runner:health -- --mode=local --platform=harmony
pnpm e2e:local:full-report --profile full
```

报告必须包含真实设备、系统、ABI、viewport、截图/日志/产物及 SHA-256。工具缺失时记录为 `blocked`，不能复用历史报告或写成 `not-applicable`。

## Release gate

只有显式执行 `publish` 或 `publish-unpublished` 时，release workflow 才下载与 `$GITHUB_SHA` 相同的 `coverage-certificate-$GITHUB_SHA` artifact，然后执行：

```bash
pnpm e2e:coverage:release-gate --report <coverage-report.json>
```

validator 会重新计算 summary，检查 registry/catalog/toolchain identity、required layer、artifact checksum 和 cosign 签名元数据。显式发布模式没有同 SHA 的认证 artifact、没有 local-required 证据或签名校验失败时，`repo release ci` 不会执行。默认 `auto` 和 `prepare` 模式跳过该门禁，可正常创建 release PR。

认证 artifact 必须来自仓库变量 `RELEASE_CERTIFICATE_RUN_ID` 指定的已完成成功 workflow run。Release 不会自动选择 nightly run：hosted nightly 当前只上传诊断 artifact，且在发布启动时可能仍处于运行状态，自动选择会造成竞态并可能把诊断报告误当认证证书。生成本地/自托管认证报告后，应将上传该 artifact 的 workflow run ID 写入 `RELEASE_CERTIFICATE_RUN_ID`，并确保其 head SHA 等于发布 commit。

GitHub branch protection 应将 `Multiplatform Coverage Gate` 和 `Release Certificate Gate` 设为 required check，并通过受保护 Environment 配置审批。self-hosted runner 尚未配置前，发布认证会保持阻断，这是预期行为。
