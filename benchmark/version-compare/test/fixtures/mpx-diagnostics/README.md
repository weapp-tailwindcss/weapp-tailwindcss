# Mpx 诊断源码 fixture

两个文本文件来自 `packages/weapp-tailwindcss/src/tailwindcss/v4-engine/generator/native-session.ts` 的准确源码：

- `baseline-native.txt`：`fdc3d5856c8dd4b9dbb6417e1206cb9b3cf3d417`。
- `current-native.txt`：`ab1aa7d59e6fa22e1208e15453f2217bed3cfb40`。

测试将实际源码进行 AST 插桩、移除运行时导入后编译执行，注入生成会话工厂；分别验证旧版同步关闭与新版异步关闭的真实返回语义、复用及替换。这些 fixture 不参与产品构建，不要求 CI checkout 包含历史 Git 对象。
