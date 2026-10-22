#import "ReporterBinding.h"
#import "EvidenceStore.h"
#import "ColorSchemeHost.h"
#import "ResponsiveHost.h"
#import <Lynx/LynxView.h>
#import <UIKit/UIKit.h>
#import <math.h>

@implementation ReporterBinding {
  __weak LynxView *_target;
  BOOL _closed;
  NSDictionary *_screenMetrics;
}
- (instancetype)initWithStore:(EvidenceStore *)store {
  self = [super init];
  if (self) _store = store;
  return self;
}
- (void)attach:(LynxView *)view screenSize:(CGSize)screenSize pixelRatio:(CGFloat)pixelRatio {
  if (_closed || _colorScheme != nil || view == nil || !isfinite(screenSize.width) || screenSize.width <= 0
      || !isfinite(screenSize.height) || screenSize.height <= 0 || !isfinite(pixelRatio) || pixelRatio <= 0) {
    @throw [NSException exceptionWithName:@"Binding" reason:@"Binding is single use" userInfo:nil];
  }
  _target = view;
  _screenMetrics = @{@"version": @1, @"source": @"lynx-native-screen-v1", @"width": @(screenSize.width),
    @"height": @(screenSize.height), @"pixelRatio": @(pixelRatio)};
  _colorScheme = [[ColorSchemeSession alloc] initWithRunId:_store.context[@"runId"]
    driver:[[ColorSchemeHost alloc] initWithView:view]];
  _responsive = [[ResponsiveSession alloc] initWithRunId:_store.context[@"runId"] driver:[[ResponsiveHost alloc] initWithView:view]];
}
- (LynxView *)view { return _closed ? nil : _target; }
- (NSDictionary *)screenMetrics {
  if (self.view == nil) return nil;
  UIScreen *screen = self.view.window.screen ?: UIScreen.mainScreen;
  if (fabs(screen.bounds.size.width - [_screenMetrics[@"width"] doubleValue]) > 0.01
      || fabs(screen.bounds.size.height - [_screenMetrics[@"height"] doubleValue]) > 0.01
      || fabs(screen.scale - [_screenMetrics[@"pixelRatio"] doubleValue]) > 0.01) return nil;
  return _screenMetrics;
}
- (void)invalidate {
  _closed = YES;
  [_colorScheme invalidate];
  [_responsive invalidate];
  _target = nil;
  _screenMetrics = nil;
}
@end
