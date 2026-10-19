Lynx 4.0.1 CocoaPods 源码测试夹具，保留上游 Apache-2.0 许可证。仅用于验证源码指纹及四处同步返回值回移，不编入应用。

上游修复：https://github.com/lynx-family/lynx/commit/334ce5c4f388cea6d87f4d9fbab7a98c738f520c

升级到包含该修复的 Lynx 版本后，连同受管 Podfile 的回移入口一起移除。适用边界见 [复盘](../../../../docs/engineering/lessons/lynx-xcode-source-compatibility.md)。

`Lynx.podspec.json.gz` 是 CocoaPods CDN 的 [4.0.1 原始 Podspec](https://cdn.cocoapods.org/Specs/0/4/6/Lynx/4.0.1/Lynx.podspec.json)，保留 Apache-2.0 来源；gzip 使用固定时间戳。解压后 SHA-256 为 `3a7cbc6a32e99f1b23e732f52d720a87e5665f3b5fa8b8a5768d21438b4762df`，由 CocoaPods 解析文件得到 checksum `ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441`。

诊断运行 [39233837439](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39233837439) 在 CocoaPods 1.17.0 的 `post_install` 阶段失败：`Pod::PodTarget` 没有 `native_target`。现在从 `installer.target_installation_results.pod_target_installation_results` 绑定当前解析对象，再核对唯一的实际 `PBXNativeTarget` 及当前 Pods 工程。回归使用真实 CocoaPods、Podspec 和 PBX 对象，拒绝缺失、重复、别名、跨工程及错误类型；保存后重读工程，检查版本宏且保留原 getter、spec/source/checksum 校验。

验证：`ruby e2e/lynx/podfile.test.rb` 已分别在 CocoaPods 1.16.2 和 1.17.0/core 1.17.0/Xcodeproj 1.28.1 通过（Ruby 2.6.10）；同一 1.17.0 环境加载修复前 Podfile 会复现原异常。`ruby e2e/lynx/source-patch.test.rb`、`ruby e2e/lynx/build-metadata.test.rb` 同时通过，后者编译原始 getter 验证无宏为 1.4.0、有宏为 4.0.1。
