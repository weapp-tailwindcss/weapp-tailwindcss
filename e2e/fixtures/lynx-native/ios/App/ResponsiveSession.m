#import "ResponsiveSession.h"
#import <math.h>

@interface ResponsiveRequest : NSObject
@property(nonatomic, copy) NSString *requestId;
@property(nonatomic, copy) NSString *phase;
@property(nonatomic, copy) NSDictionary *requested;
@property(nonatomic, copy) void (^callback)(NSDictionary *);
@end
@implementation ResponsiveRequest
@end

@implementation ResponsiveSession {
  NSString *_runId;
  id<ResponsiveDriver> _driver;
  NSMutableSet *_seen;
  NSDictionary *_original;
  double _threshold;
  NSUInteger _next;
  ResponsiveRequest *_pending;
  BOOL _invalidated, _restored;
}
- (instancetype)initWithRunId:(NSString *)runId driver:(id<ResponsiveDriver>)driver {
  self = [super init];
  if (self) { _runId = [runId copy]; _driver = driver; _seen = [NSMutableSet set]; }
  return self;
}
- (BOOL)valid:(NSDictionary *)value fields:(NSArray *)fields {
  if (![value isKindOfClass:NSDictionary.class]) return NO;
  for (NSString *field in fields) {
    id number = value[field];
    if (![number isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)number) == CFBooleanGetTypeID()
        || !isfinite([number doubleValue]) || [number doubleValue] <= 0) return NO;
  }
  return YES;
}
- (void)captureRunId:(NSString *)runId requestId:(NSString *)requestId phase:(NSString *)phase callback:(void (^)(NSDictionary *))callback {
  BOOL restore = [phase isEqualToString:@"restored"];
  NSArray *phases = @[@"narrow", @"wide", @"narrowed"];
  NSPredicate *valid = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"responsive-[1-9][0-9]*"];
  if (_invalidated || _restored || ![_driver valid] || ![_runId isEqualToString:runId] || _pending != nil
      || ![requestId isKindOfClass:NSString.class] || ![valid evaluateWithObject:requestId] || [_seen containsObject:requestId]
      || (restore ? _original == nil : _next >= phases.count || ![phase isEqualToString:phases[_next]])) {
    callback(nil); return;
  }
  [_seen addObject:requestId];
  ResponsiveRequest *request = [ResponsiveRequest new];
  request.requestId = requestId; request.phase = phase; request.callback = callback;
  _pending = request;
  __weak typeof(self) weakSelf = self;
  [_driver later:^{ [weakSelf finish:request receipt:nil]; }];
  @try {
    if (_original == nil) {
      NSDictionary *viewport = [_driver viewport], *marker = [_driver threshold];
      if (![self valid:viewport fields:@[@"width", @"height", @"measuredWidth", @"measuredHeight", @"pixelRatio"]]
          || ![self valid:marker fields:@[@"width", @"height"]]) { [self finish:request receipt:nil]; return; }
      _original = @{@"width": viewport[@"width"], @"height": viewport[@"height"]};
      _threshold = [marker[@"width"] doubleValue];
      [_driver remember];
    }
    request.requested = @{@"width": restore ? _original[@"width"] : @(ceil(_threshold * ([phase isEqualToString:@"wide"] ? 1.25 : 0.5))), @"height": _original[@"height"]};
    if (restore) [_driver restore];
    else [_driver resizeWidth:[request.requested[@"width"] doubleValue] height:[request.requested[@"height"] doubleValue]];
    id<ResponsiveDriver> driver = _driver;
    [driver barrier:^{
      [driver post:^{
        ResponsiveSession *session = weakSelf;
        if (session == nil || session->_pending != request) return;
        @try {
          if (session->_invalidated || ![driver valid]) { [session finish:request receipt:nil]; return; }
          [driver flush];
          [driver frame:^{ [weakSelf complete:request]; }];
        } @catch (NSException *error) { [session finish:request receipt:nil]; }
      }];
    }];
  } @catch (NSException *error) { [self finish:request receipt:nil]; }
}
- (void)complete:(ResponsiveRequest *)request {
  if (_pending != request) return;
  @try {
    if (_invalidated || ![_driver valid]) { [self finish:request receipt:nil]; return; }
    NSDictionary *viewport = [_driver viewport], *marker = [_driver threshold];
    if (![self valid:viewport fields:@[@"width", @"height", @"measuredWidth", @"measuredHeight", @"pixelRatio"]]
        || ![self valid:marker fields:@[@"width", @"height"]]) { [self finish:request receipt:nil]; return; }
    double tolerance = 1.01 / [viewport[@"pixelRatio"] doubleValue];
    if (fabs([viewport[@"width"] doubleValue] - [request.requested[@"width"] doubleValue]) > tolerance
        || fabs([viewport[@"height"] doubleValue] - [request.requested[@"height"] doubleValue]) > tolerance
        || fabs([viewport[@"measuredWidth"] doubleValue] - [viewport[@"width"] doubleValue]) > tolerance
        || fabs([viewport[@"measuredHeight"] doubleValue] - [viewport[@"height"] doubleValue]) > tolerance
        || fabs([marker[@"width"] doubleValue] - _threshold) > tolerance) { [self finish:request receipt:nil]; return; }
    NSDictionary *receipt = @{@"runId": _runId, @"requestId": request.requestId, @"phase": request.phase,
      @"original": _original, @"requested": request.requested, @"viewport": viewport, @"threshold": marker};
    if ([request.phase isEqualToString:@"restored"]) _restored = YES; else _next++;
    [self finish:request receipt:receipt];
  } @catch (NSException *error) { [self finish:request receipt:nil]; }
}
- (void)invalidate {
  _invalidated = YES;
  if (_original != nil && !_restored && [_driver valid]) {
    @try { [_driver restore]; [_driver flush]; }
    @catch (NSException *error) { NSLog(@"Lynx viewport cleanup failed: %@", error); }
  }
  if (_pending != nil) [self finish:_pending receipt:nil];
}
- (void)finish:(ResponsiveRequest *)request receipt:(NSDictionary *)receipt {
  if (_pending != request) return;
  _pending = nil;
  request.callback(receipt);
}
@end
