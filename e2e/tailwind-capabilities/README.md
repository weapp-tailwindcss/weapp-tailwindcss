# Tailwind CSS 4 四端能力验证

此入口把能力范围、支持预期、生成结果、转换产物和真实运行效果关联起来。只有对应层级的本轮证据才能证明通过。“生成成功”不能证明原生支持，“截图存在”不能证明样式正确。

固定基线是仓库解析的 Tailwind **4.3.3**：1,205 个 utility 条目（890 static、315 functional）、88 个 variant、23,286 个默认补全候选，另有 34 个 kind/root 未出现在默认补全中。任意值域按语法分支、边界和组合覆盖，无法穷举全部字符串。注册表新增、删除或类型变化由合同测试报告差异，升级时显式审查基线。

## 支持矩阵及证据边界

| 目标 | 本轮 runner 的判定方式 | 不可代替的证据 |
| --- | --- | --- |
| 普通 Web × Chromium / Firefox / WebKit | 独立语义夹具、计算样式、几何、交互前后恢复、渐变及阴影像素；默认 utility 另以隔离参考夹具验证 | 各引擎实际浏览器版本、逐例测量和 PNG |
| Expo Web × 三引擎 | 同一 RN 语义夹具经 Expo Web 实际渲染 | 各引擎宿主截图及参考节点；不能用普通 Web 结果代证 |
| React Native × Android / iOS | 独立 View / Text 参考、样式、几何、像素及动态阶段 | manifest、bundle、实际双端测量和逐阶段宿主 PNG |
| Lynx × Android / iOS | 生成、生产 encoder 解码、独立几何/像素 oracle 及宿主取证 | run context、bundle hash、逐候选和宿主原始证据 |
| 微信 IDE | 受保护的已有 IDE 连接、独立 inline 参考、节点样式/尺寸及动态恢复 | 实际 IDE 运行、测量与截图 |
| 其他登记小程序平台 | 复用现有多平台构建和样式产物矩阵 | 只证明构建及样式产物，不代表设备运行 |

RN 的已审查限制位于 `examples/react-native-expo/src/compatibility/protocol.ts`；Lynx 位于 `e2e/lynx/expectations.ts`。这些是预先声明的合同，不能根据新失败自动扩大。尚无可靠语义夹具的注册能力必须继续列为未执行。Lynx 宿主尚不能独立触发 hover；active 不能代证 hover，group 也不能代证 peer。

## 入口

所有命令从仓库根目录执行。本地环境按 [多端手册](../LOCAL-MULTI-PLATFORM-E2E.md) 完成：

```sh
pnpm e2e:preflight prepare --extended
# 在当前会话完成 computer use，保存真实工具输出和截图。
pnpm e2e:preflight verify --report <本轮-report.json>
pnpm e2e:tailwind --preflight-report <本轮-report.json>
```

环境不通过立即停止全面调度。协议单测不依赖设备：

```sh
pnpm e2e:tailwind:contract
pnpm e2e:tailwind --list
```

可用 `--target web-firefox,weapp` 选择目标，用 `--case <正则>` 定位候选/夹具；空匹配报错。原生子 runner 仍完成自己的完整宿主取证，再按案例选择统一报告，不通过过滤降低其证据门槛。每个引擎复用一个后台浏览器，各子 runner 清理自己创建的 context。普通 CI 使用受限的 `e2e:tailwind:web:ci --engine chromium|firefox|webkit`，已经接入 PR 必需门禁和版本 PR 审批链；不能用此入口绕过本地预检。

## 清单和报告

- 共享包：`tools/tailwindcss-test-catalog`，合并旧 118 个兼容案例及 361 个 parity 候选，保留旧 ID 与独立候选子 ID。
- 注册表：`inventory/tailwind-4.3.3.json`；functional 值域、任意语法和补全遗漏项另行覆盖。
- `static`：每批 256 个唯一候选，保存 raw CSS、WXSS、RN manifest、Lynx 解码 CSS、诊断与审计。生成合同比较完整声明、选择器及媒体/容器条件，并核对主题变量、动画帧和 property 注册。每个候选另有三端独立转换结果；没有已审查转换 oracle 的项目保持未执行，异常保持失败，不由产物存在推导支持。已审查的 `weapp-literal-preservation-v1` 覆盖默认补全中的 490 项，其余 22,796 项仍有转换 oracle 缺口；另行覆盖的语法样本单独计数。转换审计不能直接判成运行时支持。
- `authoring`：18 个指令/配置夹具及 11 个真实扫描语法夹具，分别创建隔离目录；扫描候选只存在于各自源码，完整参考检查声明、条件和依赖。29 例另有隔离的浏览器语义参考；扫描后的 DOM 消费不等同于执行 JSX/Vue 条件分支。
- Web 子目录 `framework-source`：18 个真实 React JSX / Vue SFC 案例，执行条件、数组、对象、模板、映射、merge、cva、variants 和动态插值负例；四版源码分别刷新并验证 A→B→A 分支、精确类名、独立宽度、节点和页面身份。候选只由唯一源码扫描，不能由 inline source 补齐。
- Web 子目录 `context`：7 类上下文变体、27 个状态，原生触摸/鼠标、禁用脚本、表单编辑/提交/失焦及恢复；与普通状态夹具合计为 80/88 个 variant 提供夹具。其余 8 类保留在 [缺口清单](web-context/remaining-variants.md)，有夹具不等于各引擎实际通过。
- Web 子目录 `hmr`：同一真实 Vite 服务连续新增、替换、删除类名及最终刷新，检查每轮保存标识、计算样式、源码 update 消息、服务身份与页面是否被整刷。
- `e2e/.artifacts/tailwind/<run-id>/index.json` 和 `index.md`：本轮调度结果。各目标保留 v2 报告、原始证据和覆盖缺口；原生报告归档到本轮 `native` 目录，不引用下次会被覆盖的共享目录。
- `mini-builds`：逐个登记的小程序项目复用完整构建、样式、模板及分包断言，立即归档本轮 bundle，写入逐案例 v2 报告。旧矩阵中只有登记信息、执行空命令的条目保留未执行；不能以 package.json 冒充样式产物。此层级不贡献设备运行覆盖。

v2 报告绑定源码、锁文件、工具版本、catalog、夹具及预期 hash。每个案例声明支持状态、验证层级、具体预期值和允许误差；验收重新检查原始文件 hash、字节数、归属和时间。错误样式、缺属性、缺运行时证据、擅改支持预期、缺案例、旧版本、旧截图、目标浏览器不符均拒绝。报告还读取实际 Vite、平台适配器、生产 encoder/serializer、独立 decoder 与 CSS defines 版本。旧 v1 报告保留历史展示，不能贡献本轮通过覆盖。

RN 的构建指令须回放实际归档 manifest 并匹配独立预期；运行时使用 probe、显式 reference 和无效果 control 三个节点，避免宿主同时忽略属性造成相等误报。预检拒绝也会生成调度索引，全部目标保留“阻塞、未尝试”。

微信像素使用同屏独立 inline 参考，并保存原始带色彩配置的截图、规范化截图和视口信息。ICC 转换的 RGB 量化允许一级误差，alpha 精确匹配；probe 与 reference 的采样必须完全一致。样式值仍精确匹配预先声明的配置。

状态为通过、失败、阻塞、未执行；已知平台限制必须有明确原因和对应负向证据才能通过负向合同。完整验收还需查看全部注册能力的运行时覆盖，不能把已编写夹具全部通过描述成“全部 Tailwind 写法有效”。

## 维护及基线

新增能力先补独立预期和失败回归，再修复负责的生成、转换或运行时模块。Web / 微信语义夹具使用 `pnpm e2e:tailwind:static:update`，包括上下文及 React/Vue 四版源码的 CSS；RN / Lynx 示例分别使用 `pnpm e2e:react-native:static:update`、`pnpm e2e:lynx:static:update`。审查差异后使用 `CI=1` 和 `--update=none` 回归。其他示例遵循各自 static 更新入口。生成基线改变源码身份后，全面运行需重新 prepare。

根因及验收边界见 [验证记录](../../docs/engineering/lessons/tailwind-capability-evidence.md)。该记录保留未完成范围，实际支持结果以本轮逐例报告为准。

本轮仅覆盖仓库维护的扩展与配置场景，第三方插件的任意实现必须另行登记。
