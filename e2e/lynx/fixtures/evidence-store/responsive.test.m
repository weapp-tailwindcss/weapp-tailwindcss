#import "ResponsiveSession.h"

@interface TestResponsiveDriver : NSObject <ResponsiveDriver>
@property BOOL available, ignoreResize, failFlush;
@property double width, height, marker;
@property NSUInteger restores, remembers, flushes;
@property NSMutableArray<dispatch_block_t> *barriers, *main, *frames, *deadlines;
@end
@implementation TestResponsiveDriver
- (instancetype)init {
  self = [super init];
  if (self) { _available = YES; _width = 390; _height = 800; _marker = 768;
    _barriers = [NSMutableArray array]; _main = [NSMutableArray array]; _frames = [NSMutableArray array]; _deadlines = [NSMutableArray array]; }
  return self;
}
- (BOOL)valid { return self.available; }
- (void)remember { self.remembers++; }
- (void)resizeWidth:(double)width height:(double)height { if (!self.ignoreResize) { self.width = width; self.height = height; } }
- (void)restore { self.restores++; self.width = 390; self.height = 800; }
- (NSDictionary *)viewport { return @{@"width": @(self.width), @"height": @(self.height), @"measuredWidth": @(self.width), @"measuredHeight": @(self.height), @"pixelRatio": @2}; }
- (NSDictionary *)threshold { return @{@"left": @0, @"top": @0, @"right": @(self.marker), @"bottom": @1, @"width": @(self.marker), @"height": @1}; }
- (void)barrier:(dispatch_block_t)callback { [self.barriers addObject:[callback copy]]; }
- (void)flush { if (self.failFlush) @throw [NSException exceptionWithName:@"flush" reason:@"failed" userInfo:nil]; self.flushes++; }
- (void)frame:(dispatch_block_t)callback { [self.frames addObject:[callback copy]]; }
- (void)post:(dispatch_block_t)callback { [self.main addObject:[callback copy]]; }
- (void)later:(dispatch_block_t)callback { [self.deadlines addObject:[callback copy]]; }
- (void)run:(NSMutableArray<dispatch_block_t> *)queue { dispatch_block_t task = queue.firstObject; [queue removeObjectAtIndex:0]; task(); }
- (void)complete { [self run:self.barriers]; [self run:self.main]; if (self.frames.count) [self run:self.frames]; }
@end
static void check(BOOL condition, NSString *reason) { if (!condition) @throw [NSException exceptionWithName:@"assertion" reason:reason userInfo:nil]; }
int main(void) {
  @autoreleasepool {
    TestResponsiveDriver *driver = [TestResponsiveDriver new];
    ResponsiveSession *session = [[ResponsiveSession alloc] initWithRunId:@"run" driver:driver];
    NSMutableArray *receipts = [NSMutableArray array];
    void (^callback)(NSDictionary *) = ^(NSDictionary *receipt) { [receipts addObject:receipt ?: NSNull.null]; };
    [session captureRunId:@"wrong" requestId:@"responsive-1" phase:@"narrow" callback:callback];
    [session captureRunId:@"run" requestId:@"responsive-1" phase:@"wide" callback:callback];
    check(receipts.count == 2 && receipts[0] == NSNull.null && receipts[1] == NSNull.null && driver.remembers == 0, @"identity phase");
    [receipts removeAllObjects];
    [session captureRunId:@"run" requestId:@"responsive-1" phase:@"narrow" callback:callback];
    check(receipts.count == 0 && driver.width == 384, @"root changed before engine barrier");
    [driver run:driver.barriers]; check(receipts.count == 0 && driver.flushes == 0, @"return to main");
    [driver run:driver.main]; check(receipts.count == 0 && driver.flushes == 1, @"wait drawing frame");
    [driver run:driver.frames];
    check([receipts[0][@"viewport"][@"width"] doubleValue] == 384 && [receipts[0][@"threshold"][@"width"] doubleValue] == 768, @"actual measurements");
    [session captureRunId:@"run" requestId:@"responsive-1" phase:@"wide" callback:callback];
    check(receipts[1] == NSNull.null, @"duplicate request"); [receipts removeLastObject];
    [session captureRunId:@"run" requestId:@"responsive-2" phase:@"wide" callback:callback]; [driver complete];
    [session captureRunId:@"run" requestId:@"responsive-3" phase:@"narrowed" callback:callback]; [driver complete];
    [session captureRunId:@"run" requestId:@"responsive-4" phase:@"restored" callback:callback]; [driver complete];
    check(receipts.count == 4 && [receipts[1][@"viewport"][@"width"] doubleValue] == 960 && [receipts[2][@"viewport"][@"width"] doubleValue] == 384
      && [receipts[3][@"viewport"][@"width"] doubleValue] == 390 && driver.restores == 1 && driver.remembers == 1, @"narrow wide narrow original");
    for (NSString *fault in @[@"parent-only", @"adaptive-rem", @"timeout", @"flush", @"expired"]) {
      driver = [TestResponsiveDriver new]; session = [[ResponsiveSession alloc] initWithRunId:@"run" driver:driver]; [receipts removeAllObjects];
      driver.ignoreResize = [fault isEqual:@"parent-only"];
      [session captureRunId:@"run" requestId:@"responsive-1" phase:@"narrow" callback:callback];
      if ([fault isEqual:@"adaptive-rem"]) driver.marker = 1000;
      if ([fault isEqual:@"timeout"]) driver.deadlines[0]();
      driver.failFlush = [fault isEqual:@"flush"]; driver.available = ![fault isEqual:@"expired"];
      [driver complete];
      check(receipts.count == 1 && receipts[0] == NSNull.null, [@"reject once: " stringByAppendingString:fault]);
      driver.available = YES; driver.failFlush = NO; driver.ignoreResize = NO; driver.marker = 768;
      [session captureRunId:@"run" requestId:@"responsive-2" phase:@"restored" callback:callback]; [driver complete];
      check(receipts.count == 2 && receipts[1] != NSNull.null && driver.width == 390 && driver.restores == 1, @"failure restores");
    }
    driver = [TestResponsiveDriver new]; session = [[ResponsiveSession alloc] initWithRunId:@"run" driver:driver]; [receipts removeAllObjects];
    [session captureRunId:@"run" requestId:@"responsive-1" phase:@"narrow" callback:callback]; [session invalidate]; [driver complete];
    check(receipts.count == 1 && receipts[0] == NSNull.null && driver.width == 390 && driver.restores == 1, @"invalidate restore and reject late");
    puts("ResponsiveSession: real root, marker, barriers, frame, identity, deadlines and restore passed");
  }
  return 0;
}
