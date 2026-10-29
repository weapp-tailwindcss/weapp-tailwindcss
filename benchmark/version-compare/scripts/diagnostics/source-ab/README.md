# 准确源码对照

本目录只用于诊断 run 40935438434 / job 123669625819 的 build peak RSS 首败。
正式样本的实际基线是 `0e9ceb82321d49d145bf63c4adf84c7a8639e0e9`。
独立对照轴固定为 `2dd3baec854c50f53b62c24d0aae6fe4259272fb` 与
`0637f78ed5c23a216be01a835f101074a373490f`，不是修改正式基线。

两侧分别 `git archive`，保留 archive SHA 与原锁字节；严格检查锁、workspace、
packageManager、demo manifest、配置相同，然后各自 frozen install。
准备副本中以唯一 TypeScript AST 锚点记录既有集合、实际 handler 输入/输出及任务数。
记录源码正文来自已缓存 CSS、loader 记录或当前 handler 字符串；不另读源码推导关系。

`assets/`、资源所有权、编译器加载守卫、自然 GC、完整资产和测量协议的来源为
`ae8387b884a8c6c9e595da53a9aa477e98de648b` 的 `compiler-ab`。
本轮移除旧实验的编译器/可选 peer 改造，只核对原锁批准的实际安装身份。
两个编译器上下文完整源码保持同侧相同，业务加载时逐次复核。

真实运行限定 Linux / Node 22.23.4，三轮交错新进程完整生产构建。
没有主动 GC、inspector 或正式预算变更。自然 GC 只观察主进程回调收到的事件。
归档可能物化 Webpack source 缓存，集合序列化也会分配内存；保存取证前后内存与耗时。
这些 RSS 数值仅用于解释阶段和工作量，不作为正式预算验收。
每个 handler 都完整排序、序列化候选，分配随调用数与候选数乘积增长。
`evidenceCostMs` 与 `memoryAfterEvidence` 覆盖正文/集合取证，不含最终 NDJSON 编码和写入；
后续阶段内存已包含此前 observer 的成本，不能通过减去取证耗时或内存推回正式样本。

每个 run 的 `compiler.ndjson` 保存完整类集、来源正文回执、handler 与任务证据。
同目录的 `compiler.ndjson-assets/bytes` 保存各正文的准确字节。
`output.json` 和 `emitted-assets/` 是 child 正常 close 后父控制器读取的最终产物。
有差异时必须审查正文语义，不能以 hash 不同推断某一侧正确。
跨编译器生成 chunk hash 不用于证明函数差异，候选与正文不能归一化后丢失原证据。
产品事件以实际 compilation 编号、child 标记和编译器身份隔离，逐调用 ID 配对输入/输出；
独有缓存来源、loader 与 handler 正文均从归档实读校验长度和 SHA，不以 phase 资产覆盖替代。
任务数表示已排队的 HTML/JS/CSS factory，调用记录表示实际执行的 HTML/JS transform 或 skip；
`processCachedTask` 命中缓存时不会执行 transform，因此任务数与 handler 调用数不要求相等。
CSS factory 只记数量，CSS 转换结果由阶段完整资产与最终输出审查，不声称记录 CSS handler 调用。

本目录与手动 workflow 只留在诊断分支，不合入根任务。
