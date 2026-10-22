---
status: partial
issue: https://github.com/weapp-tailwindcss/weapp-tailwindcss/pull/1314
baseline: 44ce882520940eb45463386fe50f6876944581e7
regressions:
  - e2e/react-native-http-archive.test.ts
  - e2e/react-native-http-archive-owner.test.ts
  - examples/react-native-expo/test/metro-config.test.ts
verification:
  - claim: 真实HTTP、压缩前调用快照、失败与收尾合同通过24项定向回归
    kind: integration
    status: passed
    sha: 44ce882520940eb45463386fe50f6876944581e7
    environment: macOS arm64、Node 24.18.0、pnpm 12.14.0、Vitest 5.0.4；包含本记录对应未提交实现，CI=1、快照更新none
    command: pnpm exec vitest run --config e2e/vitest.e2e.config.ts e2e/react-native-http-archive.test.ts e2e/react-native-http-archive-owner.test.ts --maxWorkers=1 --update=none
  - claim: 新观察器仍需在准确提交和新鲜预检后取得原生双端真实流量
    kind: native
    status: pending
    sha: 44ce882520940eb45463386fe50f6876944581e7
    environment: Android与iOS实际Expo/Metro会话，包含本记录对应待提交实现
    reason: 定向HTTP回归不是设备证据；旧ScrollView运行未包含观察器，不能继承其运行时成功
---

# RN Metro HTTP 调用原件观察

## 症状

既有阶段归档保存生成CSS、虚拟模块输入和实际runtime安装manifest，没有保存Metro对真实请求的响应调用正文。另行请求相同bundle也不能证明设备实际经过该响应。原`servedBundle:not-captured`必须保留。

## 根因与纠正

仅本仓库原生runner给Metro进程传入显式配置，示例组合原`enhanceMiddleware`和原Metro handler，原位观察`.bundle`请求，不改变URL、不主动获取bundle。普通示例不加载观察器。CJS入口供Expo配置直接加载，不安装额外转译钩子或修改生产包。

Expo的compression位于增强器外层，归档边界固定为`metro-response-before-content-encoding`。write/end按调用时编码复制字节，完整保留multipart，不解释其内部状态为bundle成功。实验证明：Node异步写出期间修改原Buffer，客户端可能收到修改后内容，调用快照仍是修改前字节。因此正文明确叫`attempted-application-writes`，不能叫线上字节或设备收到的实体。HEAD、204、304另标`bodySuppressed`，不制造已发送正文或缓存交付证明。

每请求保留本轮socket序号、URL、方法、响应头/状态、开始/结束、字节/hash及独立JSON。身份绑定run、target、invocation、源码提交和dirty状态、锁文件、观察器与Metro配置hash、Node及Expo→CLI→Metro实际解析链，不误取仓库另装的Metro0.83.7。

原write/end的this、参数、回调、返回值和同步异常保持；内部重入不双记。观察初始化、队列或记录数超限令归档失败，仍执行原handler。owner限制总写盘队列、同时在途请求和记录数，不按正文大小跳过原HTTP处理。

本轮token保护的control入口先停止接受新观察，再等已观察响应、原件流关闭和JSON写入，最后写index。`stoppedAcceptingAt`与最终`closedAt`分列。runner停Metro前用独立五秒预算等待ACK并重读原件；失败继续清理自有进程并保留诊断，不抵扣或扩大既有双帧/HMR预算。

## 验证

新增入口最初因缺实现模块失败；首轮分块用例还暴露Buffer异步发送与调用快照不等价，已固化为反例，没有修改原HTTP数据消除差异。最终24项回归覆盖真实分块、gzip、multipart内错误、HEAD/204/304、旧invocation、篡改、初始化失败、队列/记录数超限、原方法异常、aborted、内部重入、关闭后请求及配置组合。

示例13文件84项通过，包含观察器开启/关闭与共享扫描监听。定向TypeScript与ESLint检查通过。首次类型检查因从原生阶段导入版本/身份而拉入无关E2E依赖图，暴露既有别名和精确可选属性错误；观察器现在由runner传入版本，只依赖Node与execa，定向检查通过，不宣称全仓类型检查成功。

已重新执行`pnpm e2e:react-native:static:update`，差异仅`verifiedAt`；fixtureHash、原始CSS、manifest及声明不变。原阶段与HTTP合同另行执行，不更新快照。

## 适用边界

本片没有客户端身份认证、接收摘要、初始bundle执行回执、WebSocket/HMR delta或逐阶段交付关联。HTTP500、multipart内部错误、304或完成写出均不赋予实体语义成功；aborted只是可归档的观察终态。validator只核验结构与原件完整性。`device:unattributed`、`websocket/received/evaluated/phaseAttribution:not-captured`及既有`servedBundle:not-captured`全部保持，完整四端验收仍partial。

## 规则评估

使用现有独立证据、准确身份、资源归属与收尾要求，不新增AGENTS，不新增公开包发布intent。

Refs #1307, #1308, #1309
