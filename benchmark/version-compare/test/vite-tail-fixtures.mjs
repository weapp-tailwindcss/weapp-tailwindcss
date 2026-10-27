export const cssSource = `export function createViteCssFinalizerOutputPlugin(context) {
  return { name: 'css-finalizer', generateBundle: { order: 'post', async handler(options, bundle) {
    context.receivedThis = this;
    context.order.push('css');
    if (Object.hasOwn(context, 'fail')) throw context.fail;
    if (context.immediate) return context.immediate;
    await context.transform(bundle);
    return context.result;
  } } };
}`

export const viteSource = `async function resolveConfig(value) { return value; }
export async function build(inlineConfig = {}) {
  const config = await resolveConfig(inlineConfig, 'build');
  return config;
}
export function buildReporterPlugin(config) {
  return { name: 'vite:reporter', async writeBundle(options, output) {
    config.order.push('reporter');
    await config.report(output);
    return output;
  } };
}`

export const rollupSource = `function catchUnfinishedHookActions(driver, operation) { return operation(); }
async function writeOutputFile(chunk, options) { options.order.push('write:' + chunk.fileName); }
class Bundle { constructor(options, unset, input, driver, graph) { this.graph = graph; } generate() { return this.graph.generate(); } }
async function getOutputOptionsAndPluginDriver(raw, driver) { return { options: raw, outputPluginDriver: driver, unsetOptions: new Set() }; }
function createOutput(generated) { return generated; }
export async function handleGenerateWrite(isWrite, inputOptions, unsetInputOptions, rawOutputOptions, graph) {
  const { options: outputOptions, outputPluginDriver, unsetOptions } = await getOutputOptionsAndPluginDriver(rawOutputOptions, graph.pluginDriver);
  return catchUnfinishedHookActions(outputPluginDriver, async () => {
    const bundle = new Bundle(outputOptions, unsetOptions, inputOptions, outputPluginDriver, graph);
    const generated = await bundle.generate(isWrite);
    if (isWrite) {
      await Promise.all(Object.values(generated).map(chunk => graph.fileOperationQueue.run(() => writeOutputFile(chunk, outputOptions))));
      await outputPluginDriver.hookParallel('writeBundle', [outputOptions, generated]);
    }
    return createOutput(generated);
  });
}
export async function rollupInternal(graph) {
  const result = {
    closed: false,
    async close() {
      if (result.closed) return;
      result.closed = true;
      await graph.pluginDriver.hookParallel('closeBundle', []);
    },
    write(options) { return handleGenerateWrite(true, {}, new Set(), options, graph); }
  };
  return result;
}`
