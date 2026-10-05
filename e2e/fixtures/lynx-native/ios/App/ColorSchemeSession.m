#import "ColorSchemeSession.h"

@interface ColorSchemeRequest : NSObject
@property(nonatomic, copy) NSDictionary *receipt;
@property(nonatomic, copy) void (^callback)(NSDictionary *);
@end
@implementation ColorSchemeRequest
@end

@implementation ColorSchemeSession {
  NSString *_runId;
  id<ColorSchemeDriver> _driver;
  NSMutableSet<NSString *> *_seen;
  ColorSchemeRequest *_pending;
  NSDictionary *_current;
  BOOL _invalidated;
}

- (instancetype)initWithRunId:(NSString *)runId driver:(id<ColorSchemeDriver>)driver {
  self = [super init];
  if (self) {
    _runId = [runId copy];
    _driver = driver;
    _seen = [NSMutableSet set];
  }
  return self;
}

- (void)setRunId:(NSString *)runId requestId:(NSString *)requestId scheme:(NSString *)scheme
        callback:(void (^)(NSDictionary *))callback {
  if (_invalidated || ![_driver valid] || ![_runId isEqualToString:runId] || _pending != nil
      || requestId.length == 0 || [_seen containsObject:requestId]
      || !([scheme isEqualToString:@"light"] || [scheme isEqualToString:@"dark"])) {
    callback(nil);
    return;
  }
  [_seen addObject:requestId];
  _current = nil;
  ColorSchemeRequest *request = [ColorSchemeRequest new];
  request.receipt = @{ @"runId": runId, @"requestId": requestId, @"scheme": scheme };
  request.callback = callback;
  _pending = request;
  __weak typeof(self) weakSelf = self;
  [_driver later:^{ [weakSelf finish:request success:NO]; }];
  @try {
    [_driver update:scheme];
    id<ColorSchemeDriver> driver = _driver;
    [_driver barrier:^{
      [driver post:^{
        ColorSchemeSession *session = weakSelf;
        if (session == nil || session->_pending != request) return;
        if (session->_invalidated || ![driver valid]) {
          [session finish:request success:NO];
          return;
        }
        @try {
          [driver flush];
          [session finish:request success:YES];
        } @catch (NSException *error) {
          [session finish:request success:NO];
        }
      }];
    }];
  } @catch (NSException *error) {
    [self finish:request success:NO];
  }
}

- (BOOL)isCurrentRunId:(NSString *)runId requestId:(NSString *)requestId {
  return !_invalidated && [_driver valid] && _pending == nil
    && [_current[@"runId"] isEqualToString:runId] && [_current[@"requestId"] isEqualToString:requestId];
}

- (void)invalidate {
  _invalidated = YES;
  _current = nil;
  if (_pending != nil) [self finish:_pending success:NO];
}

- (void)finish:(ColorSchemeRequest *)request success:(BOOL)success {
  if (_pending != request) return;
  _pending = nil;
  _current = success ? request.receipt : nil;
  request.callback(_current);
}
@end
