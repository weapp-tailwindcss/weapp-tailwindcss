#import "ColorSchemeHost.h"
#import <Lynx/LynxView.h>

@implementation ColorSchemeHost {
  __weak LynxView *_view;
}
- (instancetype)initWithView:(LynxView *)view {
  self = [super init];
  if (self) _view = view;
  return self;
}
- (BOOL)valid {
  return _view != nil && [_view getThreadStrategyForRender] == LynxThreadStrategyForRenderAllOnUI;
}
- (void)update:(NSString *)scheme {
  [_view updateColorScheme:[scheme isEqualToString:@"dark"] ? LynxColorSchemeDark : LynxColorSchemeLight];
}
- (void)barrier:(dispatch_block_t)callback { [_view runOnTasmThread:callback]; }
- (void)flush { [_view syncFlush]; }
- (void)post:(dispatch_block_t)callback { dispatch_async(dispatch_get_main_queue(), callback); }
- (void)later:(dispatch_block_t)callback {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1200 * NSEC_PER_MSEC), dispatch_get_main_queue(), callback);
}
@end
