/** 真实 Node fixture 复用最小生成协议，不降低生产证据的必需操作。 */
export function viteOperationFixture(observer = 'observer') {
  return `
if (JSON.parse(process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).mode === 'inputs' && process.moduleLoadList.includes('NativeModule inspector')) throw new Error('inputs loaded inspector');
const diagnosticOps = ${observer}.operations;
const diagnosticSource = { css: '.flex { display: flex; }', base: process.cwd(), dependencies: [] };
const diagnosticSession = diagnosticOps.sync('native.create', { source: diagnosticSource }, () => ({}));
await diagnosticOps.async('engine.compile', { source: diagnosticSource, css: diagnosticSource.css }, async () => ({}));
async function diagnosticGenerate(candidates = store.values()) {
  return diagnosticOps.async('generator.generate', { source: diagnosticSource, options: { candidates } }, async () => {
    const css = await diagnosticOps.async('native.generate', { source: diagnosticSource, sessionId: diagnosticOps.identity(diagnosticSession), request: { candidates } }, async () => {
      return { css: diagnosticOps.sync('engine.build', { source: diagnosticSource, candidates }, () => diagnosticSource.css) };
    });
    return { css: css.css, rawCss: css.css, classSet: candidates };
  });
}
`
}
