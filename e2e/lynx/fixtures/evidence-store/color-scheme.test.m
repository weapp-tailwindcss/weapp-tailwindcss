#import "ColorSchemeSession.h"

@interface TestSchemeDriver : NSObject <ColorSchemeDriver>
@property BOOL available;
@property BOOL failFlush;
@property NSUInteger updates;
@property NSUInteger flushes;
@property NSMutableArray<dispatch_block_t> *barriers;
@property NSMutableArray<dispatch_block_t> *main;
@property NSMutableArray<dispatch_block_t> *deadlines;
@end
@implementation TestSchemeDriver
- (instancetype)init {
  self = [super init];
  if (self) {
    _available = YES;
    _barriers = [NSMutableArray array];
    _main = [NSMutableArray array];
    _deadlines = [NSMutableArray array];
  }
  return self;
}
- (BOOL)valid { return self.available; }
- (void)update:(NSString *)scheme { (void)scheme; self.updates++; }
- (void)barrier:(dispatch_block_t)callback { [self.barriers addObject:[callback copy]]; }
- (void)flush {
  if (self.failFlush) @throw [NSException exceptionWithName:@"flush" reason:@"failed" userInfo:nil];
  self.flushes++;
}
- (void)post:(dispatch_block_t)callback { [self.main addObject:[callback copy]]; }
- (void)later:(dispatch_block_t)callback { [self.deadlines addObject:[callback copy]]; }
- (void)complete:(NSUInteger)index {
  self.barriers[index]();
  dispatch_block_t task = self.main.firstObject;
  [self.main removeObjectAtIndex:0];
  task();
}
@end

static void check(BOOL condition, NSString *reason) {
  if (!condition) @throw [NSException exceptionWithName:@"assertion" reason:reason userInfo:nil];
}

int main(void) {
  @autoreleasepool {
    TestSchemeDriver *driver = [TestSchemeDriver new];
    ColorSchemeSession *session = [[ColorSchemeSession alloc] initWithRunId:@"run" driver:driver];
    NSMutableArray *receipts = [NSMutableArray array];
    void (^callback)(NSDictionary *) = ^(NSDictionary *receipt) { [receipts addObject:receipt ?: NSNull.null]; };
    [session setRunId:@"run" requestId:@"one" scheme:@"light" callback:callback];
    check(receipts.count == 0 && ![session isCurrentRunId:@"run" requestId:@"one"], @"must await engine");
    [session setRunId:@"run" requestId:@"busy" scheme:@"dark" callback:callback];
    check(receipts[0] == NSNull.null && driver.updates == 1, @"busy must not mutate");
    [receipts removeAllObjects];
    driver.barriers[0]();
    check(receipts.count == 0 && driver.flushes == 0, @"barrier must return to main");
    driver.main[0]();
    [driver.main removeAllObjects];
    check([receipts[0][@"requestId"] isEqual:@"one"] && driver.flushes == 1, @"flush then acknowledge identity");
    check([session isCurrentRunId:@"run" requestId:@"one"] && ![session isCurrentRunId:@"other" requestId:@"one"], @"capture binding");
    [session setRunId:@"run" requestId:@"same" scheme:@"light" callback:callback];
    check(receipts.count == 1 && ![session isCurrentRunId:@"run" requestId:@"one"], @"same scheme needs barrier");
    [driver complete:1];
    [session setRunId:@"run" requestId:@"late" scheme:@"dark" callback:callback];
    driver.deadlines[2]();
    check(receipts.count == 3 && receipts[2] == NSNull.null, @"timeout rejects");
    [session setRunId:@"run" requestId:@"restore" scheme:@"light" callback:callback];
    [driver complete:2];
    check(receipts.count == 3 && driver.flushes == 2, @"late barrier cannot acknowledge or flush next request");
    [driver complete:3];
    driver.deadlines[2]();
    check(receipts.count == 4 && [session isCurrentRunId:@"run" requestId:@"restore"], @"restore survives late deadline");
    NSUInteger updates = driver.updates;
    [session setRunId:@"other" requestId:@"foreign" scheme:@"dark" callback:callback];
    [session setRunId:@"run" requestId:@"restore" scheme:@"dark" callback:callback];
    [session setRunId:@"run" requestId:@"invalid" scheme:@"system" callback:callback];
    check(driver.updates == updates && receipts[4] == NSNull.null && receipts[5] == NSNull.null && receipts[6] == NSNull.null, @"invalid identities do not mutate");
    [session setRunId:@"run" requestId:@"destroy" scheme:@"dark" callback:callback];
    [session invalidate];
    [driver complete:4];
    check(receipts.count == 8 && receipts[7] == NSNull.null && ![session isCurrentRunId:@"run" requestId:@"restore"], @"destroy invalidates pending");
    session = [[ColorSchemeSession alloc] initWithRunId:@"new" driver:driver];
    [session setRunId:@"new" requestId:@"replaced" scheme:@"light" callback:callback];
    driver.available = NO;
    [driver complete:5];
    check(receipts.count == 9 && receipts[8] == NSNull.null, @"replaced view rejects before flush");
    driver.available = YES;
    driver.failFlush = YES;
    [session setRunId:@"new" requestId:@"flush-error" scheme:@"dark" callback:callback];
    [driver complete:6];
    check(receipts.count == 10 && receipts[9] == NSNull.null, @"flush failure is missing evidence");
    puts("ColorSchemeSession: barriers, deadlines, restore, identity and view lifecycle passed");
  }
  return 0;
}
