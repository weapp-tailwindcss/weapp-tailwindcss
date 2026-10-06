#import "EvidenceStore.h"

static void check(BOOL value, NSString *message) {
  if (!value) @throw [NSException exceptionWithName:@"EvidenceTest" reason:message userInfo:nil];
}

static NSString *run(int number) {
  return [NSString stringWithFormat:@"00000000-0000-4000-8000-%012d", number];
}

static EvidenceStore *store(NSURL *root, int number, NSData *bundle) {
  NSError *error = nil;
  EvidenceStore *result = [[EvidenceStore alloc] initWithRoot:root runId:run(number) bundle:bundle
    expectedSHA:[EvidenceStore sha256:bundle] error:&error];
  check(result != nil && error == nil, @"Create evidence run");
  return result;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    check(argc == 2, @"Expected owned temporary directory");
    NSURL *root = [[NSURL fileURLWithPath:@(argv[1]) isDirectory:YES] URLByAppendingPathComponent:@"ios"];
    NSData *bundle = [@"actual bundle" dataUsingEncoding:NSUTF8StringEncoding];
    NSData *image = [@"actual PNG bytes" dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    EvidenceStore *successful = store(root, 1, bundle);
    NSDictionary *receipt = [successful saveArtifact:@"case-probe.png" runId:run(1) data:image error:&error];
    check([receipt[@"runId"] isEqual:run(1)] && [receipt[@"name"] isEqual:@"case-probe.png"], @"Receipt identity");
    check([receipt[@"sha256"] isEqual:[EvidenceStore sha256:image]] && [receipt[@"byteLength"] unsignedIntegerValue] == image.length, @"Receipt bytes");
    NSURL *directory = [root URLByAppendingPathComponent:run(1)];
    NSURL *file = [[directory URLByAppendingPathComponent:@"artifacts"] URLByAppendingPathComponent:@"case-probe.png"];
    check([[NSData dataWithContentsOfURL:file] isEqual:image], @"Actual disk write");
    check([successful publishReport:@{@"results": @[]} runId:run(1) error:&error], @"Publish report");
    NSDictionary *report = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:[directory URLByAppendingPathComponent:@"report.json"]] options:0 error:&error];
    check([report[@"evidence"][@"artifacts"] isEqual:@[receipt]], @"Native manifest binds written receipt");
    check(![successful publishReport:@{} runId:run(1) error:&error], @"Reject repeated publication");
    error = nil;
    check([[EvidenceStore alloc] initWithRoot:root runId:run(1) bundle:bundle expectedSHA:[EvidenceStore sha256:bundle] error:&error] == nil, @"Reject reused run");
    error = nil;
    check([[EvidenceStore alloc] initWithRoot:root runId:run(2) bundle:bundle expectedSHA:[EvidenceStore sha256:image] error:&error] == nil, @"Hash actual bundle");
    error = nil;
    check([[EvidenceStore alloc] initWithRoot:root runId:@"../outside" bundle:bundle expectedSHA:[EvidenceStore sha256:bundle] error:&error] == nil, @"Reject invalid run ID");

    EvidenceStore *broken = store(root, 3, bundle);
    NSURL *brokenDirectory = [root URLByAppendingPathComponent:run(3)];
    NSURL *artifacts = [brokenDirectory URLByAppendingPathComponent:@"artifacts"];
    error = nil;
    check([NSFileManager.defaultManager removeItemAtURL:artifacts error:&error] && [image writeToURL:artifacts options:0 error:&error], @"Inject actual filesystem failure");
    check([broken saveArtifact:@"case-probe.png" runId:run(3) data:image error:&error] == nil, @"Failed write has no receipt");
    check(![broken publishReport:@{} runId:run(3) error:&error], @"Failed run cannot publish");
    check(![NSFileManager.defaultManager fileExistsAtPath:[brokenDirectory URLByAppendingPathComponent:@"report.json"].path], @"No failed report published");

    EvidenceStore *stale = store(root, 4, bundle);
    check([stale saveArtifact:@"case-probe.png" runId:run(1) data:image error:&error] == nil, @"Reject stale callback");
    check(![stale publishReport:@{} runId:run(4) error:&error], @"Stale run cannot publish");
    EvidenceStore *duplicate = store(root, 5, bundle);
    check([duplicate saveArtifact:@"case-probe.png" runId:run(5) data:image error:&error] != nil, @"First frame accepted");
    check([duplicate saveArtifact:@"case-probe.png" runId:run(5) data:image error:&error] == nil, @"Reject duplicate frame");
    check(![duplicate publishReport:@{} runId:run(5) error:&error], @"Duplicate cannot publish");
    EvidenceStore *invalid = store(root, 6, bundle);
    check([invalid saveArtifact:@"C:\\escape.png" runId:run(6) data:image error:&error] == nil, @"Reject invalid name");
    check(![invalid publishReport:@{} runId:run(6) error:&error], @"Invalid name cannot publish");
    EvidenceStore *invalidData = store(root, 7, bundle);
    check([invalidData saveArtifact:@"case-probe.png" runId:run(7) data:nil error:&error] == nil, @"Reject missing bytes");
    check(![invalidData publishReport:@{} runId:run(7) error:&error], @"Invalid bytes cannot publish");
    NSLog(@"iOS evidence storage: actual writes, failures, identity and publication passed");
  }
  return 0;
}
