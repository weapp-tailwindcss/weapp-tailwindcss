#import "MediaGateEvidence.h"
#import "EvidenceStore.h"
#import <math.h>

@implementation MediaGateEvidence {
  EvidenceStore *_store;
}

- (instancetype)initWithStore:(EvidenceStore *)store {
  self = [super init];
  if (self) _store = store;
  return self;
}

- (BOOL)validRect:(NSDictionary *)rect {
  NSArray *fields = @[@"left", @"top", @"right", @"bottom", @"width", @"height"];
  if (![rect isKindOfClass:NSDictionary.class] || rect.count != fields.count) return NO;
  for (NSString *field in fields) {
    id value = rect[field];
    if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()
        || !isfinite([value doubleValue])) return NO;
  }
  double width = [rect[@"width"] doubleValue], height = [rect[@"height"] doubleValue];
  return width > 0 && height > 0
    && fabs([rect[@"right"] doubleValue] - [rect[@"left"] doubleValue] - width) <= 0.01
    && fabs([rect[@"bottom"] doubleValue] - [rect[@"top"] doubleValue] - height) <= 0.01;
}

- (NSDictionary *)captureRunId:(NSString *)runId sdkVersion:(MediaGateVersionBlock)sdkVersion
                      measure:(MediaGateMeasureBlock)measure capture:(MediaGateCaptureBlock)capture error:(NSError **)error {
  if (![_store checkRun:runId error:error]) return nil;
  if (!NSThread.isMainThread || sdkVersion == nil || measure == nil || capture == nil) {
    [_store reject:@"Native media capture requires main thread and native drivers" error:error];
    return nil;
  }
  @try {
    NSString *version = sdkVersion();
    NSPredicate *valid = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[0-9]+\\.[0-9]+\\.[0-9]+"];
    if (![version isKindOfClass:NSString.class] || ![valid evaluateWithObject:version]) {
      [_store reject:@"Native Lynx SDK did not provide a valid version" error:error];
      return nil;
    }
    NSArray *ids = @[@"base", @"control", @"unguarded", @"min-width", @"hover-hover", @"hover-none"];
    NSMutableArray *probes = [NSMutableArray array], *artifacts = [NSMutableArray array];
    for (NSString *identifier in ids) {
      NSDictionary *probe = measure([@"media-hover-v1-" stringByAppendingString:identifier]);
      NSDictionary *container = measure([@"container-media-hover-v1-" stringByAppendingString:identifier]);
      if (![self validRect:probe] || ![self validRect:container]) {
        [_store reject:[@"Missing native media geometry: " stringByAppendingString:identifier] error:error];
        return nil;
      }
      [probes addObject:@{@"id": identifier, @"probe": [probe copy], @"container": [container copy]}];
    }
    for (NSString *identifier in ids) {
      NSData *image = capture([@"container-media-hover-v1-" stringByAppendingString:identifier]);
      if (![image isKindOfClass:NSData.class] || image.length == 0) {
        [_store reject:@"Native media container capture failed" error:error];
        return nil;
      }
      NSString *name = [NSString stringWithFormat:@"media-hover-v1-%@.png", identifier];
      NSDictionary *receipt = [_store saveArtifact:name runId:runId data:image error:error];
      if (receipt == nil) return nil;
      [artifacts addObject:receipt];
    }
    NSDictionary *mediaGate = @{@"limitationId": @"lynx4.0.1-media-hover-unknown-v1", @"runId": _store.context[@"runId"],
      @"bundleSha256": _store.context[@"bundleSha256"], @"sdkVersion": version, @"probes": [probes copy]};
    NSDictionary *receipt = [_store saveMediaGate:mediaGate runId:runId error:error];
    if (receipt == nil) return nil;
    [artifacts addObject:receipt];
    return @{@"mediaGate": mediaGate, @"artifacts": [artifacts copy]};
  }
  @catch (NSException *exception) {
    [_store reject:[NSString stringWithFormat:@"Native media capture raised: %@", exception.reason] error:error];
    return nil;
  }
}
@end
