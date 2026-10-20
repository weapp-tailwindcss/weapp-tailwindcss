#import "ResponsiveHost.h"
#import <Lynx/LynxView.h>
#import <Lynx/LynxUI.h>
#import <QuartzCore/QuartzCore.h>

@implementation ResponsiveHost {
  __weak LynxView *_view;
  CGRect _originalFrame;
  UIViewAutoresizing _autoresizing;
  CGFloat _preferredWidth, _preferredHeight;
  LynxViewSizeMode _widthMode, _heightMode;
  BOOL _remembered;
}
- (instancetype)initWithView:(LynxView *)view { self = [super init]; if (self) _view = view; return self; }
- (BOOL)valid { return _view != nil && [_view getThreadStrategyForRender] == LynxThreadStrategyForRenderAllOnUI; }
- (void)remember {
  if (_remembered) @throw [NSException exceptionWithName:@"Viewport" reason:@"Viewport already remembered" userInfo:nil];
  _originalFrame = _view.frame; _autoresizing = _view.autoresizingMask;
  _preferredWidth = _view.preferredLayoutWidth; _preferredHeight = _view.preferredLayoutHeight;
  _widthMode = _view.layoutWidthMode; _heightMode = _view.layoutHeightMode;
  _remembered = YES;
}
- (void)resizeWidth:(double)width height:(double)height {
  _view.autoresizingMask = UIViewAutoresizingNone;
  _view.layoutWidthMode = LynxViewSizeModeExact; _view.layoutHeightMode = LynxViewSizeModeExact;
  _view.frame = CGRectMake(_originalFrame.origin.x, _originalFrame.origin.y, width, height);
  // 修改真实根 frame，并显式更新引擎 viewport；screenMetrics 不替代该调用。
  [_view updateViewportWithPreferredLayoutWidth:width preferredLayoutHeight:height needLayout:YES];
  [_view layoutIfNeeded];
}
- (void)restore {
  _view.frame = _originalFrame;
  _view.autoresizingMask = _autoresizing;
  _view.layoutWidthMode = _widthMode; _view.layoutHeightMode = _heightMode;
  [_view updateViewportWithPreferredLayoutWidth:_preferredWidth preferredLayoutHeight:_preferredHeight needLayout:YES];
  [_view layoutIfNeeded];
}
- (NSDictionary *)viewport {
  return @{@"width": @(_view.bounds.size.width), @"height": @(_view.bounds.size.height),
    @"measuredWidth": @(_view.frame.size.width), @"measuredHeight": @(_view.frame.size.height), @"pixelRatio": @(_view.window.screen.scale)};
}
- (NSDictionary *)threshold {
  LynxUI *ui = [_view uiWithIdSelector:@"responsive-threshold"];
  if (ui == nil || ui.view == nil) return nil;
  CGRect rect = [ui getBoundingClientRectToScreen];
  return @{@"left": @(CGRectGetMinX(rect)), @"top": @(CGRectGetMinY(rect)), @"right": @(CGRectGetMaxX(rect)),
    @"bottom": @(CGRectGetMaxY(rect)), @"width": @(CGRectGetWidth(rect)), @"height": @(CGRectGetHeight(rect))};
}
- (void)barrier:(dispatch_block_t)callback { [_view runOnTasmThread:callback]; }
- (void)flush { [_view syncFlush]; }
- (void)frame:(dispatch_block_t)callback {
  [CATransaction begin];
  [CATransaction setCompletionBlock:^{ dispatch_async(dispatch_get_main_queue(), callback); }];
  [_view.layer setNeedsDisplay];
  [CATransaction commit];
}
- (void)post:(dispatch_block_t)callback { dispatch_async(dispatch_get_main_queue(), callback); }
- (void)later:(dispatch_block_t)callback { dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1600 * NSEC_PER_MSEC), dispatch_get_main_queue(), callback); }
@end
