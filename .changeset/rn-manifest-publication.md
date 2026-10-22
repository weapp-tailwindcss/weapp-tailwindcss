---
"@weapp-tailwindcss/react-native": patch
---

将 Metro 的 manifest、虚拟模块与 ready 标记绑定到同一不可变发布快照和实际 JSON 字节摘要。全部文件发布成功后才切换内存状态，启动占位文件失败不污染旧入口；刷新失败和摘要错配明确传递给读取者。

运行时先完成 manifest 副本、发布身份与宿主 StyleSheet 注册，再原子安装。注册失败保留旧缓存和 important 元数据，独立实例不再污染默认实例。提供 getPublication() 读取安装身份；手工匿名安装清除旧身份，宿主注册器保留独立可变副本。

宿主读取发布快照时支持取消文件读取及轮询等待，取消后拒绝交付旧快照；默认读取与截止时间保持不变。兼容 React Native consumer 的 AbortSignal 全局声明，不依赖 throwIfAborted 方法，保留原始取消原因及旧信号的 AbortError 回退。
