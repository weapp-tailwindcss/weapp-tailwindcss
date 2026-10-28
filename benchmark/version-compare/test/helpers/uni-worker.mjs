/** 真实 Node worker fixture 遵循新增 bundle 协议；其他模式继续直接执行原体。 */
export function uniWorkerFixture(advanceStage = false) {
  return `
async function diagnosticBundle(source, run) {
  const uni = observer.uniInput;
  if (uni === undefined) return run();
  return uni.bundle(async () => {
    const output = { type: 'asset', source };
    const sets = () => ({ html: new Set(), js: new Set(), css: new Set(['fixture.wxss']) });
    uni.rawBundle({ 'fixture.wxss': output });
    uni.snapshot({ entries: [{ file: 'fixture.wxss', type: 'css', source, output }], processFiles: sets(), changedByType: sets(), runtimeAffectingChangedByType: sets(), linkedImpactsByEntry: new Map(), removedFiles: new Set(), hasOmittedKnownFiles: false }, { useIncrementalMode: true });
    return run();
  });
}
async function diagnosticCompilation(collections) {
  observer.uniInput?.completed({ metrics: {}, timingDetails: { 'entries.plan': 0, tasks: 0 } });
  ${advanceStage ? `if (observer.uniInput) fs.writeFileSync(path.join(JSON.parse(process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory, 'stage.json'), JSON.stringify({ type: 'rollback-write', round: 99 }));` : ''}
  return observer.compilation(collections);
}
`
}
