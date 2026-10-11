#import "ColorSchemeSession.h"
@class LynxView;

@interface ColorSchemeHost : NSObject <ColorSchemeDriver>
- (instancetype)initWithView:(LynxView *)view;
@end
