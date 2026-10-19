Lynx 4.0.1 CocoaPods 源码测试夹具，保留上游 Apache-2.0 许可证。仅用于验证源码指纹及四处同步返回值回移，不编入应用。

上游修复：https://github.com/lynx-family/lynx/commit/334ce5c4f388cea6d87f4d9fbab7a98c738f520c

升级到包含该修复的 Lynx 版本后，连同受管 Podfile 的回移入口一起移除。适用边界见 [复盘](../../../../docs/engineering/lessons/lynx-xcode-source-compatibility.md)。

`Lynx.podspec.json.gz` 是 CocoaPods CDN 的 [4.0.1 原始 Podspec](https://cdn.cocoapods.org/Specs/0/4/6/Lynx/4.0.1/Lynx.podspec.json)，保留 Apache-2.0 来源；gzip 使用固定时间戳。解压后 SHA-256 为 `3a7cbc6a32e99f1b23e732f52d720a87e5665f3b5fa8b8a5768d21438b4762df`，由 CocoaPods 解析文件得到 checksum `ccabb2322b26f64a8d9ce4b8d7ae9871cda6c441`。

诊断运行 [39233837439](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39233837439) 在 CocoaPods 1.17.0 的 `post_install` 阶段失败：`Pod::PodTarget` 没有 `native_target`。现在从 `installer.target_installation_results.pod_target_installation_results` 绑定当前解析对象，再核对唯一的实际 `PBXNativeTarget` 及当前 Pods 工程。回归使用真实 CocoaPods、Podspec 和 PBX 对象，拒绝缺失、重复、别名、跨工程及错误类型；保存后重读工程，检查版本宏且保留原 getter、完整 spec 语义与 source 校验。

验证：`ruby e2e/lynx/podfile.test.rb` 已分别在 CocoaPods 1.16.2 和 1.17.0/core 1.17.0/Xcodeproj 1.28.1 通过（Ruby 2.6.10）；同一 1.17.0 环境加载修复前 Podfile 会复现原异常。`ruby e2e/lynx/source-patch.test.rb`、`ruby e2e/lynx/build-metadata.test.rb` 同时通过，后者编译原始 getter 验证无宏为 1.4.0、有宏为 4.0.1。

诊断运行 [39240820531](https://github.com/weapp-tailwindcss/weapp-tailwindcss/actions/runs/39240820531) 的 iOS 在 Podfile 安装阶段被原始文件 SHA-1 校验阻断，未进入设备运行。CDN 的完整 JSON 语义与原夹具相等，但空白/转义使原始文本校验变化。新增 `Lynx.cdn-2026-10-19.podspec.json.gz` 保留这次真实 CDN 字节，解压 SHA-256 为 `8599a4df7ac29438f6e00aca8f031fc771f0f2bc13a53618dfed33d434807412`，CocoaPods checksum 为 `1a461f83f48104309f7e2031dabf3af84b181807`。

生产边界现在对完整 `Pod::Specification#to_hash` 深排对象键，保留全部属性、数组顺序和值类型，经 `JSON.generate` 后固定 SHA-256 `490dcea9b6a2fb6efeff6210679e9bef9f028dc298e56f2f0c5cdc86b6128be4`；不能使用遗漏 subspec 的 `attributes_hash`。两份原始 fixture 分别固定字节身份，再经真实 CocoaPods/PBX 对象验证格式等价、许可/新字段/subspec 顺序篡改拒绝；下载来源、版本、getter 源码及唯一目标边界继续独立校验。原始 checksum 仅记录下载文本，不能代替完整语义身份。
