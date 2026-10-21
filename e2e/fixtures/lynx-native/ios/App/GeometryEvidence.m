#import "GeometryEvidence.h"
#import "EvidenceStore.h"
#import <math.h>

@implementation GeometryEvidence {
  EvidenceStore *_store;
  NSDictionary *_screenMetrics;
}

- (instancetype)initWithStore:(EvidenceStore *)store {
  return [self initWithStore:store screenMetrics:nil];
}

- (instancetype)initWithStore:(EvidenceStore *)store screenMetrics:(NSDictionary *)screenMetrics {
  self = [super init];
  if (self) { _store = store; _screenMetrics = [screenMetrics copy]; }
  return self;
}

- (BOOL)validScreen {
  id version = _screenMetrics[@"version"];
  if (![version isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)version) == CFBooleanGetTypeID()
      || ![version isEqual:@1] || ![_screenMetrics[@"source"] isEqual:@"lynx-native-screen-v1"]) return NO;
  for (NSString *field in @[@"width", @"height", @"pixelRatio"]) {
    id value = _screenMetrics[field];
    if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()
        || !isfinite([value doubleValue]) || [value doubleValue] <= 0) return NO;
  }
  return YES;
}

- (BOOL)validRect:(NSDictionary *)rect {
  NSArray *fields = @[@"left", @"right", @"top", @"bottom", @"width", @"height"];
  if (![rect isKindOfClass:NSDictionary.class] || rect.count != fields.count) return NO;
  for (NSString *field in fields) {
    id value = rect[field];
    if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()
        || !isfinite([value doubleValue])) return NO;
  }
  double width = [rect[@"width"] doubleValue], height = [rect[@"height"] doubleValue];
  double horizontal = [rect[@"right"] doubleValue] - [rect[@"left"] doubleValue];
  double vertical = [rect[@"bottom"] doubleValue] - [rect[@"top"] doubleValue];
  return width > 0 && height > 0 && isfinite(horizontal) && isfinite(vertical)
    && fabs(horizontal - width) <= 0.01 && fabs(vertical - height) <= 0.01;
}

- (NSDictionary *)captureRunId:(NSString *)runId identifier:(NSString *)identifier
                      measure:(GeometryMeasureBlock)measure capture:(GeometryCaptureBlock)capture error:(NSError **)error {
  if (![_store checkRun:runId error:error]) return nil;
  NSPredicate *valid = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[a-z0-9]+(-[a-z0-9]+)*"];
  if (!NSThread.isMainThread || ![identifier isKindOfClass:NSString.class] || ![valid evaluateWithObject:identifier]
      || measure == nil || capture == nil) {
    [_store reject:@"Invalid native geometry request or thread" error:error];
    return nil;
  }
  @try {
    if ((_screenMetrics != nil || [identifier isEqual:@"sizing-fixed"]) && ![self validScreen]) {
      [_store reject:@"Missing or invalid native screen metrics" error:error];
      return nil;
    }
    NSArray *keys = @[@"probe", @"control", @"probeContainer", @"controlContainer", @"probeChild", @"controlChild"];
    NSArray *nodes = @[[NSString stringWithFormat:@"probe-%@", identifier], [NSString stringWithFormat:@"control-%@", identifier],
      [NSString stringWithFormat:@"probe-container-%@", identifier], [NSString stringWithFormat:@"control-container-%@", identifier],
      [NSString stringWithFormat:@"probe-child-%@-a", identifier], [NSString stringWithFormat:@"probe-child-control-%@-a", identifier]];
    NSMutableDictionary *geometry = [NSMutableDictionary dictionary];
    for (NSUInteger index = 0; index < keys.count; index++) {
      NSDictionary *rect = measure(nodes[index]);
      if (![self validRect:rect]) {
        [_store reject:[NSString stringWithFormat:@"Missing or invalid native geometry node: %@", nodes[index]] error:error];
        return nil;
      }
      geometry[keys[index]] = [rect copy];
    }
    NSMutableArray *artifacts = [NSMutableArray array];
    for (NSUInteger index = 0; index < 2; index++) {
      NSData *image = capture(nodes[index + 2]);
      if (![image isKindOfClass:NSData.class] || image.length == 0) {
        [_store reject:@"Native geometry container capture failed" error:error];
        return nil;
      }
      NSString *name = [NSString stringWithFormat:@"%@-geometry-%@.png", identifier, keys[index]];
      NSDictionary *receipt = [_store saveArtifact:name runId:runId data:image error:error];
      if (receipt == nil) return nil;
      [artifacts addObject:receipt];
    }
    NSDictionary *receipt = [_store saveGeometry:identifier runId:runId geometry:geometry screenMetrics:_screenMetrics error:error];
    if (receipt == nil) return nil;
    [artifacts addObject:receipt];
    NSMutableDictionary *result = [@{@"geometry": [geometry copy], @"artifacts": [artifacts copy]} mutableCopy];
    if (_screenMetrics != nil) result[@"screenMetrics"] = _screenMetrics;
    return result;
  }
  @catch (NSException *exception) {
    [_store reject:[NSString stringWithFormat:@"Native geometry capture raised: %@", exception.reason] error:error];
    return nil;
  }
}
@end
