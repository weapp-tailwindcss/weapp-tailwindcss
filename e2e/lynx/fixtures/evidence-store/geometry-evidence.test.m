#import "GeometryEvidence.h"
#import "EvidenceStore.h"
#import <math.h>

static void check(BOOL condition, NSString *reason) {
  if (!condition) @throw [NSException exceptionWithName:@"GeometryEvidenceTest" reason:reason userInfo:nil];
}

static NSString *run(int number) {
  return [NSString stringWithFormat:@"00000000-0000-4000-8000-%012d", number];
}

static NSDictionary *rectAt(int index) {
  int left = index * 10 - 20, top = index * 20 - 30;
  return @{@"left": @(left), @"right": @(left + 32), @"top": @(top), @"bottom": @(top + 24), @"width": @32, @"height": @24};
}

static NSDictionary *rect(void) { return rectAt(0); }

static NSData *png(void) {
  return [[NSData alloc] initWithBase64EncodedString:@"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4xkAAAAASUVORK5CYII=" options:0];
}

static EvidenceStore *store(NSURL *root, int number) {
  NSError *error = nil;
  NSData *bundle = [@"actual geometry bundle" dataUsingEncoding:NSUTF8StringEncoding];
  EvidenceStore *result = [[EvidenceStore alloc] initWithRoot:root runId:run(number) bundle:bundle
    expectedSHA:[EvidenceStore sha256:bundle] error:&error];
  check(result != nil && error == nil, @"Create exclusive native geometry store");
  return result;
}

static NSURL *directory(NSURL *root, int number) {
  return [root URLByAppendingPathComponent:run(number)];
}

static NSURL *artifact(NSURL *root, int number, NSString *name) {
  return [[directory(root, number) URLByAppendingPathComponent:@"artifacts"] URLByAppendingPathComponent:name];
}

static void cannotPublish(EvidenceStore *value, NSURL *root, int number) {
  NSError *error = nil;
  check(![value publishReport:@{} runId:run(number) error:&error], @"Failed capture poisons report publication");
  check(![NSFileManager.defaultManager fileExistsAtPath:[directory(root, number) URLByAppendingPathComponent:@"report.json"].path], @"No report for failed native capture");
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    check(argc == 2, @"Expected owned temporary directory");
    NSURL *root = [[NSURL fileURLWithPath:@(argv[1]) isDirectory:YES] URLByAppendingPathComponent:@"ios-geometry"];
    GeometryMeasureBlock measure = ^NSDictionary *(NSString *node) { (void)node; return rect(); };
    GeometryCaptureBlock capture = ^NSData *(NSString *node) { (void)node; return png(); };
    NSError *error = nil;
    EvidenceStore *successful = store(root, 1);
    GeometryEvidence *evidence = [[GeometryEvidence alloc] initWithStore:successful];
    NSMutableArray *measured = [NSMutableArray array], *captured = [NSMutableArray array];
    NSDictionary *result = [evidence captureRunId:run(1) identifier:@"flex-row" measure:^NSDictionary *(NSString *node) {
      NSDictionary *value = rectAt((int)measured.count); [measured addObject:node]; return value;
    } capture:^NSData *(NSString *node) { [captured addObject:node]; return png(); } error:&error];
    check(result != nil && error == nil, @"Native geometry capture succeeds");
    check([measured isEqual:@[@"probe-flex-row", @"control-flex-row", @"probe-container-flex-row", @"control-container-flex-row", @"probe-child-flex-row-a", @"probe-child-control-flex-row-a"]], @"Measure exactly six host-owned nodes");
    check([captured isEqual:@[@"probe-container-flex-row", @"control-container-flex-row"]], @"Capture both stable native containers");
    NSArray *geometryKeys = @[@"probe", @"control", @"probeContainer", @"controlContainer", @"probeChild", @"controlChild"];
    check([NSSet setWithArray:[result[@"geometry"] allKeys]].count == 6, @"Return complete geometry");
    for (NSUInteger index = 0; index < geometryKeys.count; index++) {
      check([result[@"geometry"][geometryKeys[index]] isEqual:rectAt((int)index)], @"Each distinct native rectangle keeps its node identity");
    }
    NSArray *receipts = result[@"artifacts"];
    check(receipts.count == 3, @"Return both frame receipts and sidecar receipt");
    for (NSDictionary *receipt in receipts) {
      NSData *bytes = [NSData dataWithContentsOfURL:artifact(root, 1, receipt[@"name"])];
      check([receipt[@"runId"] isEqual:run(1)] && [receipt[@"sha256"] isEqual:[EvidenceStore sha256:bytes]]
        && [receipt[@"byteLength"] unsignedIntegerValue] == bytes.length && bytes.length > 0, @"Every receipt hashes actual native disk bytes");
    }
    NSDictionary *sidecar = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:artifact(root, 1, @"flex-row-geometry.json")] options:0 error:&error];
    check([sidecar isEqual:@{@"version": @1, @"source": @"lynx-native-host-geometry-v1", @"runId": run(1),
      @"bundleSha256": successful.context[@"bundleSha256"], @"id": @"flex-row", @"platform": @"ios", @"geometry": result[@"geometry"]}], @"Sidecar has exact schema and native context");
    check([successful publishReport:@{@"results": @[result]} runId:run(1) error:&error], @"Publish only after complete capture");
    NSDictionary *report = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:[directory(root, 1) URLByAppendingPathComponent:@"report.json"]] options:0 error:&error];
    check([report[@"evidence"][@"artifacts"] isEqual:receipts], @"Manifest binds all three native receipts");
    check([evidence captureRunId:run(1) identifier:@"other" measure:measure capture:capture error:&error] == nil, @"Published run rejects further geometry");

    NSArray *ids = @[@"../outside", @"flex--row", @"flex-", @"Flex-row", @"", NSNull.null];
    int number = 10;
    for (id identifier in ids) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      check([subject captureRunId:run(number) identifier:identifier measure:measure capture:capture error:&error] == nil, @"Reject invalid case identity");
      cannotPublish(value, root, number++);
    }
    for (int missing = 0; missing < 6; missing++) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      __block int calls = 0, frames = 0;
      check([subject captureRunId:run(number) identifier:@"case" measure:^NSDictionary *(NSString *node) {
        (void)node; return calls++ == missing ? nil : rect();
      } capture:^NSData *(NSString *node) { (void)node; frames++; return png(); } error:&error] == nil, @"Any missing native node fails capture");
      check(frames == 0, @"Missing geometry never captures frames");
      cannotPublish(value, root, number++);
    }
    NSMutableArray *invalid = [NSMutableArray arrayWithObjects:NSNull.null, @{}, nil];
    NSArray *fields = @[@"left", @"top", @"width", @"height"];
    for (NSString *field in fields) {
      for (id bad in @[@"10", @YES, @(NAN), @(INFINITY)]) {
        NSMutableDictionary *value = [rect() mutableCopy]; value[field] = bad; [invalid addObject:value];
      }
    }
    for (id bad in @[@0, @-1, @31]) {
      NSMutableDictionary *value = [rect() mutableCopy]; value[@"width"] = bad; [invalid addObject:value];
    }
    NSMutableDictionary *extra = [rect() mutableCopy]; extra[@"x"] = @10; [invalid addObject:extra];
    for (id invalidRect in invalid) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      check([subject captureRunId:run(number) identifier:@"case" measure:^NSDictionary *(NSString *node) {
        (void)node; return invalidRect;
      } capture:capture error:&error] == nil, @"Reject nonfinite, boolean, incomplete or inconsistent native rectangles");
      cannotPublish(value, root, number++);
    }
    for (int failedFrame = 0; failedFrame < 2; failedFrame++) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      __block int frames = 0;
      check([subject captureRunId:run(number) identifier:@"case" measure:measure capture:^NSData *(NSString *node) {
        (void)node; return frames++ == failedFrame ? nil : png();
      } error:&error] == nil, @"Either missing native frame fails complete evidence");
      check(![NSFileManager.defaultManager fileExistsAtPath:artifact(root, number, @"case-geometry.json").path], @"Do not write a sidecar after missing frame");
      cannotPublish(value, root, number++);
    }
    for (id invalidImage in @[NSData.data, NSNull.null]) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      check([subject captureRunId:run(number) identifier:@"case" measure:measure capture:^NSData *(NSString *node) {
        (void)node; return invalidImage;
      } error:&error] == nil, @"Empty or non-byte native frames are missing evidence");
      cannotPublish(value, root, number++);
    }
    for (int missingBlock = 0; missingBlock < 2; missingBlock++) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      check([subject captureRunId:run(number) identifier:@"case" measure:missingBlock ? nil : measure
        capture:missingBlock ? capture : nil error:&error] == nil, @"Missing native measurement or capture driver fails closed");
      cannotPublish(value, root, number++);
    }
    for (int failingMeasure = 0; failingMeasure < 2; failingMeasure++) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      check([subject captureRunId:run(number) identifier:@"case" measure:^NSDictionary *(NSString *node) {
        (void)node; if (failingMeasure) @throw [NSException exceptionWithName:@"measure" reason:@"failed" userInfo:nil]; return rect();
      } capture:^NSData *(NSString *node) {
        (void)node; @throw [NSException exceptionWithName:@"capture" reason:@"failed" userInfo:nil];
      } error:&error] == nil, @"Native exceptions fail closed");
      cannotPublish(value, root, number++);
    }

    EvidenceStore *stale = store(root, number);
    GeometryEvidence *staleEvidence = [[GeometryEvidence alloc] initWithStore:stale];
    __block int callbacks = 0;
    check([staleEvidence captureRunId:run(1) identifier:@"case" measure:^NSDictionary *(NSString *node) {
      (void)node; callbacks++; return rect();
    } capture:capture error:&error] == nil && callbacks == 0, @"Stale run never reads current native view");
    cannotPublish(stale, root, number++);

    EvidenceStore *background = store(root, number);
    GeometryEvidence *backgroundEvidence = [[GeometryEvidence alloc] initWithStore:background];
    dispatch_semaphore_t completed = dispatch_semaphore_create(0);
    __block NSDictionary *backgroundResult = @{};
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
      backgroundResult = [backgroundEvidence captureRunId:background.context[@"runId"] identifier:@"case" measure:measure capture:capture error:NULL];
      dispatch_semaphore_signal(completed);
    });
    check(dispatch_semaphore_wait(completed, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) == 0 && backgroundResult == nil, @"Geometry capture must remain on main thread");
    cannotPublish(background, root, number++);

    for (int sidecarFailure = 0; sidecarFailure < 2; sidecarFailure++) {
      EvidenceStore *value = store(root, number);
      GeometryEvidence *subject = [[GeometryEvidence alloc] initWithStore:value];
      NSURL *target = sidecarFailure ? artifact(root, number, @"case-geometry.json") : [directory(root, number) URLByAppendingPathComponent:@"artifacts"];
      if (!sidecarFailure) check([NSFileManager.defaultManager removeItemAtURL:target error:&error], @"Remove owned test artifact directory");
      check([png() writeToURL:target options:NSDataWritingWithoutOverwriting error:&error], @"Inject actual filesystem failure");
      check([subject captureRunId:run(number) identifier:@"case" measure:measure capture:capture error:&error] == nil, @"PNG or sidecar write failure has no accepted result");
      cannotPublish(value, root, number++);
    }
    EvidenceStore *duplicate = store(root, number);
    GeometryEvidence *duplicateEvidence = [[GeometryEvidence alloc] initWithStore:duplicate];
    check([duplicateEvidence captureRunId:run(number) identifier:@"case" measure:measure capture:capture error:&error] != nil, @"First case capture succeeds");
    check([duplicateEvidence captureRunId:run(number) identifier:@"case" measure:measure capture:capture error:&error] == nil, @"Reject duplicate native case frames");
    cannotPublish(duplicate, root, number++);
    EvidenceStore *forged = store(root, number);
    check([forged saveArtifact:@"case-geometry.json" runId:run(number) data:png() error:&error] == nil, @"JS artifact route cannot write geometry JSON");
    cannotPublish(forged, root, number++);
    puts("GeometryEvidence: native nodes, receipts, sidecar identity, actual writes and failure isolation passed");
  }
  return 0;
}
