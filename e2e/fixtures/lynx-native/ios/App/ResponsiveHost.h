#import "ResponsiveSession.h"
@class LynxView;
@interface ResponsiveHost : NSObject <ResponsiveDriver>
- (instancetype)initWithView:(LynxView *)view;
@end
