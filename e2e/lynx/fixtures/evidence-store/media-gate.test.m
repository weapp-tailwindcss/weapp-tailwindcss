#import "MediaGateEvidence.h"
#import "EvidenceStore.h"
#import <math.h>

static void check(BOOL condition, NSString *reason) {
  if (!condition) @throw [NSException exceptionWithName:@"MediaGateTest" reason:reason userInfo:nil];
}
static NSString *run(int number) { return [NSString stringWithFormat:@"00000000-0000-4000-8000-%012d", number]; }
static NSArray *ids(void) { return @[@"base", @"control", @"unguarded", @"min-width", @"hover-hover", @"hover-none"]; }
static NSDictionary *rect(NSString *node) {
  BOOL container = [node hasPrefix:@"container-"];
  int width = container ? 64 : [node hasSuffix:@"-unguarded"] || [node hasSuffix:@"-min-width"] ? 32 : 16;
  int height = container ? 64 : 16;
  return @{@"left": @2, @"top": @3, @"right": @(2 + width), @"bottom": @(3 + height), @"width": @(width), @"height": @(height)};
}
static NSData *png(void) { return [@"actual native PNG" dataUsingEncoding:NSUTF8StringEncoding]; }
static EvidenceStore *store(NSURL *root, int number) {
  NSData *bundle = [@"media SDK bundle" dataUsingEncoding:NSUTF8StringEncoding];
  return [[EvidenceStore alloc] initWithRoot:root runId:run(number) bundle:bundle expectedSHA:[EvidenceStore sha256:bundle] error:NULL];
}
static NSURL *artifact(NSURL *root, int number, NSString *name) {
  return [[[root URLByAppendingPathComponent:run(number)] URLByAppendingPathComponent:@"artifacts"] URLByAppendingPathComponent:name];
}
static void cannotPublish(EvidenceStore *value, int number) {
  check(![value publishReport:@{} runId:run(number) error:NULL], @"Failed media capture rejects report");
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    check(argc == 2, @"Expected owned temporary directory");
    NSURL *root = [[NSURL fileURLWithPath:@(argv[1]) isDirectory:YES] URLByAppendingPathComponent:@"ios-media"];
    MediaGateVersionBlock version = ^NSString *{ return @"4.0.1"; };
    MediaGateMeasureBlock measure = ^NSDictionary *(NSString *node) { return rect(node); };
    MediaGateCaptureBlock capture = ^NSData *(NSString *node) { (void)node; return png(); };
    EvidenceStore *successful = store(root, 1);
    check(successful != nil, @"Create exclusive media store");
    MediaGateEvidence *subject = [[MediaGateEvidence alloc] initWithStore:successful];
    __block int versions = 0;
    NSMutableArray *measured = [NSMutableArray array], *captured = [NSMutableArray array];
    NSDictionary *result = [subject captureRunId:run(1) sdkVersion:^NSString *{ versions++; return @"4.0.1"; }
      measure:^NSDictionary *(NSString *node) { [measured addObject:node]; return rect(node); }
      capture:^NSData *(NSString *node) { [captured addObject:node]; return png(); } error:NULL];
    check(result != nil && versions == 1 && measured.count == 12 && captured.count == 6, @"Read real SDK and twelve native nodes once on UI thread");
    for (NSUInteger index = 0; index < ids().count; index++) {
      check([measured containsObject:[@"media-hover-v1-" stringByAppendingString:ids()[index]]], @"Fixed target identity");
      check([captured[index] isEqual:[@"container-media-hover-v1-" stringByAppendingString:ids()[index]]], @"Fixed composed capture identity");
    }
    check([result[@"artifacts"] count] == 7, @"Six PNGs and native-only sidecar receipts");
    for (NSDictionary *receipt in result[@"artifacts"]) {
      NSData *bytes = [NSData dataWithContentsOfURL:artifact(root, 1, receipt[@"name"])];
      check([receipt[@"runId"] isEqual:run(1)] && [receipt[@"sha256"] isEqual:[EvidenceStore sha256:bytes]]
        && [receipt[@"byteLength"] unsignedIntegerValue] == bytes.length && bytes.length > 0, @"Receipt binds native atomic bytes");
    }
    NSDictionary *sidecar = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:artifact(root, 1, @"media-hover-v1.native.json")] options:0 error:NULL];
    check([sidecar isEqual:@{@"version": @1, @"source": @"lynx-native-media-gate-v1", @"context": successful.context,
      @"mediaGate": result[@"mediaGate"]}], @"Exact native sidecar schema and same context/payload");
    check([result[@"mediaGate"][@"sdkVersion"] isEqual:@"4.0.1"], @"Native SDK version is retained");
    check([successful publishReport:@{} runId:run(1) error:NULL], @"Complete media capture can publish");

    int number = 10;
    for (int missing = 0; missing < 18; missing++) {
      EvidenceStore *value = store(root, number);
      MediaGateEvidence *evidence = [[MediaGateEvidence alloc] initWithStore:value];
      __block int nodes = 0, frames = 0;
      check([evidence captureRunId:run(number) sdkVersion:version measure:^NSDictionary *(NSString *node) {
        return nodes++ == missing ? nil : rect(node);
      } capture:^NSData *(NSString *node) { (void)node; return frames++ + 12 == missing ? nil : png(); } error:NULL] == nil, @"Any missing node or frame rejects capture");
      cannotPublish(value, number++);
    }
    for (id invalid in @[NSNull.null, @"", @"forged\"version"]) {
      EvidenceStore *value = store(root, number);
      MediaGateEvidence *evidence = [[MediaGateEvidence alloc] initWithStore:value];
      check([evidence captureRunId:run(number) sdkVersion:^NSString *{ return invalid == NSNull.null ? nil : invalid; }
        measure:measure capture:capture error:NULL] == nil, @"Missing or malformed native SDK version rejects capture");
      cannotPublish(value, number++);
    }
    for (id bad in @[@YES, @"16", @(NAN), @(INFINITY), @0]) {
      EvidenceStore *value = store(root, number);
      MediaGateEvidence *evidence = [[MediaGateEvidence alloc] initWithStore:value];
      check([evidence captureRunId:run(number) sdkVersion:version measure:^NSDictionary *(NSString *node) {
        NSMutableDictionary *value = [rect(node) mutableCopy]; value[@"width"] = bad; return value;
      } capture:capture error:NULL] == nil, @"Boolean, nonnumeric, nonfinite or empty geometry fails");
      cannotPublish(value, number++);
    }
    EvidenceStore *stale = store(root, number);
    MediaGateEvidence *staleEvidence = [[MediaGateEvidence alloc] initWithStore:stale];
    __block int untouched = 0;
    check([staleEvidence captureRunId:run(1) sdkVersion:^NSString *{ untouched++; return @"4.0.1"; }
      measure:measure capture:capture error:NULL] == nil && untouched == 0, @"Reject old run before accessing SDK");
    cannotPublish(stale, number++);
    EvidenceStore *background = store(root, number);
    MediaGateEvidence *backgroundEvidence = [[MediaGateEvidence alloc] initWithStore:background];
    dispatch_semaphore_t completed = dispatch_semaphore_create(0);
    __block NSDictionary *backgroundResult = @{};
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
      backgroundResult = [backgroundEvidence captureRunId:background.context[@"runId"] sdkVersion:version measure:measure capture:capture error:NULL];
      dispatch_semaphore_signal(completed);
    });
    check(dispatch_semaphore_wait(completed, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) == 0 && backgroundResult == nil, @"Media capture requires native main thread");
    cannotPublish(background, number++);
    for (int failure = 0; failure < 2; failure++) {
      EvidenceStore *value = store(root, number);
      MediaGateEvidence *evidence = [[MediaGateEvidence alloc] initWithStore:value];
      NSURL *target = failure ? artifact(root, number, @"media-hover-v1.native.json") : [artifact(root, number, @"unused") URLByDeletingLastPathComponent];
      if (!failure) check([NSFileManager.defaultManager removeItemAtURL:target error:NULL], @"Remove owned artifact directory");
      check([png() writeToURL:target options:NSDataWritingWithoutOverwriting error:NULL], @"Inject actual filesystem failure");
      check([evidence captureRunId:run(number) sdkVersion:version measure:measure capture:capture error:NULL] == nil, @"PNG or sidecar write failure rejects all evidence");
      cannotPublish(value, number++);
    }
    EvidenceStore *duplicate = store(root, number);
    MediaGateEvidence *duplicateEvidence = [[MediaGateEvidence alloc] initWithStore:duplicate];
    check([duplicateEvidence captureRunId:run(number) sdkVersion:version measure:measure capture:capture error:NULL] != nil, @"First capture accepted");
    check([duplicateEvidence captureRunId:run(number) sdkVersion:version measure:measure capture:capture error:NULL] == nil, @"Duplicate frames rejected");
    cannotPublish(duplicate, number++);
    EvidenceStore *forged = store(root, number);
    check([forged saveArtifact:@"media-hover-v1.native.json" runId:run(number) data:png() error:NULL] == nil, @"JS PNG channel cannot create native sidecar");
    cannotPublish(forged, number);
    puts("iOS media gate: native SDK, twelve node reads, seven receipts and failure isolation passed");
  }
  return 0;
}
