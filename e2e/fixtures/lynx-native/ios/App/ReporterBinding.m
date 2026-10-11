#import "ReporterBinding.h"
#import "EvidenceStore.h"
#import "ColorSchemeHost.h"

@implementation ReporterBinding {
  __weak LynxView *_target;
  BOOL _closed;
}
- (instancetype)initWithStore:(EvidenceStore *)store {
  self = [super init];
  if (self) _store = store;
  return self;
}
- (void)attach:(LynxView *)view {
  if (_closed || _colorScheme != nil || view == nil) {
    @throw [NSException exceptionWithName:@"Binding" reason:@"Binding is single use" userInfo:nil];
  }
  _target = view;
  _colorScheme = [[ColorSchemeSession alloc] initWithRunId:_store.context[@"runId"]
    driver:[[ColorSchemeHost alloc] initWithView:view]];
}
- (LynxView *)view { return _closed ? nil : _target; }
- (void)invalidate {
  _closed = YES;
  [_colorScheme invalidate];
  _target = nil;
}
@end
