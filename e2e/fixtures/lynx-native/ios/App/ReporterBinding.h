#import <Foundation/Foundation.h>
@class LynxView;
@class EvidenceStore;
@class ColorSchemeSession;

@interface ReporterBinding : NSObject
@property(nonatomic, readonly) EvidenceStore *store;
@property(nonatomic, readonly) LynxView *view;
@property(nonatomic, readonly) ColorSchemeSession *colorScheme;
- (instancetype)initWithStore:(EvidenceStore *)store;
- (void)attach:(LynxView *)view;
- (void)invalidate;
@end
