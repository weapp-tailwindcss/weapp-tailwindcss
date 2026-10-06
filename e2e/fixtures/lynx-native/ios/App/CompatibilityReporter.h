#import <Foundation/Foundation.h>
#import <Lynx/LynxModule.h>

@interface CompatibilityReporter : NSObject <LynxModule>
- (instancetype)initWithParam:(id)param;
@end
