#import <Foundation/Foundation.h>
#import <Lynx/LynxModule.h>

@class LynxView;
@class EvidenceStore;

@interface CompatibilityReporter : NSObject <LynxModule>
+ (void)setEvidenceStore:(EvidenceStore *)store;
+ (void)setLynxView:(LynxView *)lynxView;
@end
