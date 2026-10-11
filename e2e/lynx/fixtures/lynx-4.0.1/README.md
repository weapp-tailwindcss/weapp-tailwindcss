Lynx 4.0.1 CocoaPods 源码测试夹具，保留上游 Apache-2.0 许可证。仅用于验证源码指纹及四处同步返回值回移，不编入应用。

上游修复：https://github.com/lynx-family/lynx/commit/334ce5c4f388cea6d87f4d9fbab7a98c738f520c

升级到包含该修复的 Lynx 版本后，连同受管 Podfile 的回移入口一起移除。适用边界见 [复盘](../../../../docs/engineering/lessons/lynx-xcode-source-compatibility.md)。
