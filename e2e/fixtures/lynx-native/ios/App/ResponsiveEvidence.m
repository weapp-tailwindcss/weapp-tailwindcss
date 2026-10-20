#import "ResponsiveEvidence.h"
#import "EvidenceStore.h"
#import <math.h>

@implementation ResponsiveEvidence {
  EvidenceStore *_store;
}
- (instancetype)initWithStore:(EvidenceStore *)store { self = [super init]; if (self) _store = store; return self; }
- (BOOL)validRect:(NSDictionary *)rect {
  NSArray *fields = @[@"left", @"top", @"right", @"bottom", @"width", @"height"];
  if (![rect isKindOfClass:NSDictionary.class] || rect.count != fields.count) return NO;
  for (NSString *field in fields) {
    id value = rect[field];
    if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID() || !isfinite([value doubleValue])) return NO;
  }
  return [rect[@"width"] doubleValue] > 0 && [rect[@"height"] doubleValue] > 0
    && fabs([rect[@"right"] doubleValue] - [rect[@"left"] doubleValue] - [rect[@"width"] doubleValue]) < 0.01
    && fabs([rect[@"bottom"] doubleValue] - [rect[@"top"] doubleValue] - [rect[@"height"] doubleValue]) < 0.01;
}
- (NSDictionary *)captureReceipt:(NSDictionary *)receipt measure:(GeometryMeasureBlock)measure capture:(GeometryCaptureBlock)capture error:(NSError **)error {
  NSString *runId = receipt[@"runId"], *phase = receipt[@"phase"];
  if (![_store checkRun:runId error:error]) return nil;
  if (!NSThread.isMainThread || measure == nil || capture == nil) { [_store reject:@"Invalid responsive capture thread or host" error:error]; return nil; }
  @try {
    NSArray *fields = @[@"probe", @"control", @"probeContainer", @"controlContainer"];
    NSArray *nodes = @[@"probe-variant-responsive", @"control-variant-responsive", @"probe-container-variant-responsive", @"control-container-variant-responsive"];
    NSMutableDictionary *geometry = [NSMutableDictionary dictionary];
    for (NSUInteger index = 0; index < fields.count; index++) {
      NSDictionary *rect = measure(nodes[index]);
      if (![self validRect:rect]) { [_store reject:@"Missing or invalid responsive geometry" error:error]; return nil; }
      geometry[fields[index]] = [rect copy];
    }
    NSMutableDictionary *frame = [receipt mutableCopy];
    frame[@"geometry"] = [geometry copy];
    NSMutableArray *artifacts = [NSMutableArray array];
    for (NSUInteger index = 0; index < 2; index++) {
      NSString *name = [NSString stringWithFormat:@"variant-responsive-%@-%@.png", phase, fields[index]];
      NSDictionary *saved = [_store saveArtifact:name runId:runId data:capture(nodes[index + 2]) error:error];
      if (saved == nil) return nil;
      [artifacts addObject:saved];
    }
    NSDictionary *saved = [_store saveResponsive:phase runId:runId frame:frame error:error];
    if (saved == nil) return nil;
    [artifacts addObject:saved];
    return @{@"frame": [frame copy], @"artifacts": [artifacts copy]};
  } @catch (NSException *exception) {
    [_store reject:[NSString stringWithFormat:@"Responsive native capture raised: %@", exception.reason] error:error];
    return nil;
  }
}
@end
