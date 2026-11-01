---
status: verified
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1323
baseline: b423fd4b9de5fe888e6ac536330dc11629f061b1
regressions:
  - packages/postcss/test/external-source-map-cache.test.ts
---

# 自动外部映射不能只按 CSS 与配置缓存结果

## 症状

相同 CSS 和处理选项再次进入同一个 handler 时，即使 sourceMappingURL 指向的 map 文件已经更新、新建或删除，也可能返回上轮映射。生成 CSS 的字节可能相同，因此只检查 CSS 无法发现来源和 sourcesContent 已经陈旧。

## 根因与纠正

完整结果缓存先于 PostCSS Input 构造命中。JSON 处理选项指纹覆盖静态 prev 内容，却无法覆盖自动发现的外部 map 文件。PostCSS 8.5.32 在 map 未关闭、prev 未明确关闭或提供有效值时，按最后一个原始文本 sourceMappingURL 标记自动读取文件；缺失文件也属于会随磁盘状态变化的输入。

新增准入只识别可能发生自动外部读取的输入，并旁路完整结果缓存的读写，不执行额外 fs/stat/hash，也不复制上游的路径权限策略。Processor、Pipeline 和 ProcessOptions 仍按原契约复用。普通文本先用标记检测保持原命中路径不做准备；候选文本须考虑仓库行注释规范化，因为 `// # sourceMappingURL=...` 会成为有效块注释。检测遵循上游的最后文本标记语义，包括 CSS 字符串内标记，不以更严格的 AST 注释分类漏掉上游实际读取的内容。

map:false、prev:false 和有效显式 prev 保留确定性缓存；固定 inline data map 也由原 CSS 字节完整标识。map:true、空对象和空 prev 字符串仍允许自动发现。无 from 时也不提前判定无外部输入，因为 unsafeMap:true 仍可允许实际读取；最终权限与路径始终由 PostCSS 判断。

Root 同样采用保守准入，覆盖确定性保护把输入转为字符串后重新解析的分支。普通已解析 Root 的 Input.map 本来已有快照；重新 parse 会读入新映射并使快照失效。复用同一个既有 Input 不意味着它应该自动重读磁盘，不能把这个原生区别写成缓存缺陷。

## 验证

独立依赖的 Node 24 / PostCSS 8.5.32 中，修复前8项真实回归失败、5项控制通过，覆盖缺省、true、空 map、空 prev、显式 external 配置的同路径内容更新、行注释以及文件创建/删除。首次较小基线4红5控制保留；扩展基线同步把 sourcesContent 断言从唯一列表改为包含当前来源，因为 annotation:false 的原生映射还可包含输入 CSS，这个未触发的夹具假设不计产品红。

修复后的17项新回归额外覆盖最后 inline/external 标记、字符串内标记、无 from 的 unsafeMap，以及新解析 Root 来源身份；同时比较本轮完整 map JSON 与 fresh handler。默认无引用、inline、显式 prev、map:false、prev:false 仍命中结果缓存，自动外部读取继续复用真实 Processor。相邻缓存、准备、Root/Input 和处理回调回归使用原断言，正常运行禁止更新快照。

初次显式 lint 的两处全局 Buffer 提示已改为 node:buffer 导入；新增严格夹具识别测试把缺省 map 写成显式 undefined，已改为真正省略该字段，不改变原 exactOptionalPropertyTypes。初始日志保留，均不计为产品红。

## 适用边界

本次仅修正自动外部 previous map 的完整结果缓存准入，不改变解析、路径信任或原生 map 生成，也不在 PostCSS 之外额外读取 map 文件，不证明完整作者阶段、wholeCSS 保护或最终 source map 所有权。严格 noEmit 仍须保留既有两处 protected markDirty 失败；包内 noCheck 构建不是严格验收。定向本地通过不替代当前 head CI、真实 iOS、正式性能或全面测试，原浏览器超时首因仍未知。

## 规则评估

沿用现有缓存身份、跨平台临时路径、真实缺陷回归与独立依赖规则，不新增 AGENTS。外部自动加载的状态不能只用配置字符串或已存在文件判定准入。
